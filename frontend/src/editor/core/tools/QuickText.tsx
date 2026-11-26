import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useSyncExternalStore,
} from "react";
import { Alert, Group, Stack, Text } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { createToolFlow } from "@editor/components/tools/shared/createToolFlow";
import { alert } from "@editor/components/toast";
import { useAllFiles, useFileContext } from "@editor/contexts/FileContext";
import { useNavigation } from "@editor/contexts/NavigationContext";
import { useViewer } from "@editor/contexts/ViewerContext";
import { useRegisterViewerPageTool } from "@editor/contexts/viewer/ViewerPageTool";
import { useViewScopedFiles } from "@editor/hooks/tools/shared/useViewScopedFiles";
import { usePdfAccess } from "@editor/hooks/usePdfAccess";
import { downloadFile } from "@editor/services/downloadService";
import { createStirlingFilesAndStubs } from "@editor/services/fileStubHelpers";
import {
  getPdfAccess,
  signedPdfEditsBlocked,
} from "@editor/services/pdfAccessService";
import {
  assertFilesNotBlocked,
  policySourceIds,
} from "@editor/services/policyFileGuard";
import { QuickTextPageLayer } from "@editor/tools/quickText/QuickTextPageLayer";
import {
  QuickTextStore,
  setQuickTextSession,
} from "@editor/tools/quickText/QuickTextStore";
import { QuickTextToolbar } from "@editor/tools/quickText/QuickTextToolbar";
import {
  embedQuickTextIntoPdf,
  readPdfPageDimensions,
} from "@editor/tools/quickText/exportQuickTextPdf";
import { isStirlingFile } from "@editor/types/fileContext";
import type { BaseToolProps } from "@editor/types/tool";
import { Button } from "@editor/ui/Button";
import { Icon } from "@editor/ui/Icon";
import { isPdfFile } from "@editor/utils/fileUtils";

const QuickText = (_props: BaseToolProps) => {
  const { t } = useTranslation();
  const { setHasUnsavedChanges, setWorkbench } = useNavigation();
  const { files: allFiles } = useAllFiles();
  const { actions, selectors } = useFileContext();
  const { activeFileId, setActiveFileId, scrollActions } = useViewer();
  const scopedFiles = useViewScopedFiles();
  usePdfAccess(undefined);

  const editableFiles = useMemo(
    () =>
      scopedFiles.filter((file) => {
        const access = getPdfAccess(file);
        return !access?.encrypted && !signedPdfEditsBlocked(access);
      }),
    [scopedFiles],
  );

  const activeFile = useMemo(() => {
    const byId = activeFileId
      ? allFiles.find((f) => isStirlingFile(f) && f.fileId === activeFileId)
      : null;
    const candidate = byId ?? allFiles[0] ?? null;
    if (!candidate || !isPdfFile(candidate)) return null;
    const access = getPdfAccess(candidate);
    if (access?.encrypted || signedPdfEditsBlocked(access)) return null;
    return candidate;
  }, [allFiles, activeFileId]);

  const activeFileStableId =
    activeFile && isStirlingFile(activeFile) ? activeFile.fileId : null;

  const storeRef = useRef<QuickTextStore | null>(null);
  if (!storeRef.current) {
    storeRef.current = new QuickTextStore();
  }
  const store = storeRef.current;

  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot);

  // Switch to the PDF viewer as soon as an editable PDF is available.
  useEffect(() => {
    if (activeFile) {
      setWorkbench("viewer");
    }
  }, [activeFile, setWorkbench]);

  // Load PDF page dimensions when the active document changes so CSS font sizes match PDF points.
  const prevFileIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (prevFileIdRef.current !== activeFileStableId) {
      prevFileIdRef.current = activeFileStableId;
      store.reset();
    }
    if (!activeFile) return;

    let cancelled = false;
    void (async () => {
      try {
        const bytes = new Uint8Array(await activeFile.arrayBuffer());
        const dimensions = await readPdfPageDimensions(bytes);
        if (!cancelled) {
          store.setPageSizes(dimensions);
        }
      } catch {
        // Fallback width in QuickTextPageLayer is used if page dimensions cannot be read.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [activeFile, activeFileStableId, store]);

  useEffect(() => {
    setHasUnsavedChanges(snapshot.dirty);
    return () => {
      setHasUnsavedChanges(false);
    };
  }, [snapshot.dirty, setHasUnsavedChanges]);

  const saveToPdf = useCallback(
    async (download: boolean) => {
      if (!activeFile || !activeFileStableId) return;
      const nonEmptyBoxes = store.getNonEmptyBoxes();
      if (nonEmptyBoxes.length === 0) return;

      store.setSaving(true);
      store.setError(null);

      try {
        const parentStub = selectors.getStirlingFileStub(activeFileStableId);
        const policyIds = parentStub
          ? policySourceIds(parentStub)
          : [activeFileStableId];
        assertFilesNotBlocked(policyIds);

        const sourceBytes = new Uint8Array(await activeFile.arrayBuffer());
        const updatedBytes = await embedQuickTextIntoPdf(
          sourceBytes,
          nonEmptyBoxes,
        );
        const filename = activeFile.name || "edited.pdf";
        const editedFile = new File([new Uint8Array(updatedBytes)], filename, {
          type: "application/pdf",
        });

        let savedFile: File = editedFile;
        if (parentStub) {
          const { stirlingFiles, stubs } = await createStirlingFilesAndStubs(
            [editedFile],
            parentStub,
            "quickText",
          );
          await actions.consumeFiles(
            [activeFileStableId],
            stirlingFiles,
            stubs,
          );
          if (stubs[0]?.id) {
            setActiveFileId(stubs[0].id);
          }
          if (stirlingFiles[0]) {
            savedFile = stirlingFiles[0];
          }
        } else {
          const added = await actions.addFiles([editedFile], {
            selectFiles: true,
            derivedFromTool: true,
          });
          if (added[0]) {
            savedFile = added[0];
            setActiveFileId(added[0].fileId);
          }
        }

        store.reset();

        if (download) {
          await downloadFile({ data: savedFile, filename });
        }

        alert({
          title: t("quickText.savedTitle", "Text applied to PDF"),
          alertType: "success",
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        store.setError(message);
        alert({
          title: t("quickText.saveErrorTitle", "Could not save text to PDF"),
          body: message,
          alertType: "error",
        });
        throw err;
      } finally {
        store.setSaving(false);
      }
    },
    [
      activeFile,
      activeFileStableId,
      actions,
      selectors,
      setActiveFileId,
      store,
      t,
    ],
  );

  // Publish store & save actions to the ViewerPageTool layer and toolbar.
  useEffect(() => {
    setQuickTextSession(store, { save: saveToPdf });
    return () => {
      setQuickTextSession(null, null);
    };
  }, [store, saveToPdf]);

  // Global undo/redo & delete shortcuts when not typing in an input.
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const el = document.activeElement as HTMLElement | null;
      const isTyping =
        el?.tagName === "INPUT" ||
        el?.tagName === "TEXTAREA" ||
        el?.isContentEditable;
      if (isTyping) return;

      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
        event.preventDefault();
        if (event.shiftKey) {
          store.redo();
        } else {
          store.undo();
        }
      } else if (
        (event.ctrlKey || event.metaKey) &&
        event.key.toLowerCase() === "y"
      ) {
        event.preventDefault();
        store.redo();
      } else if (
        (event.key === "Delete" || event.key === "Backspace") &&
        store.getSnapshot().activeBoxId
      ) {
        event.preventDefault();
        const id = store.getSnapshot().activeBoxId;
        if (id) store.deleteBox(id);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [store]);

  const handleDiscard = useCallback(() => {
    store.reset();
  }, [store]);

  const handleSaveBeforeLeaving = useCallback(async () => {
    await saveToPdf(false);
  }, [saveToPdf]);

  useRegisterViewerPageTool(
    useMemo(
      () =>
        activeFileStableId
          ? {
              fileId: activeFileStableId,
              PageLayer: QuickTextPageLayer,
              Toolbar: QuickTextToolbar,
              onDiscard: handleDiscard,
              onSave: handleSaveBeforeLeaving,
            }
          : null,
      [activeFileStableId, handleDiscard, handleSaveBeforeLeaving],
    ),
  );

  const nonEmptyBoxes = snapshot.boxes.filter((b) => b.text.trim().length > 0);

  const steps =
    editableFiles.length === 0
      ? []
      : [
          {
            title: t("quickText.panel.title", "Quick Text"),
            isCollapsed: false,
            onCollapsedClick: undefined,
            content: (
              <Stack gap="sm">
                <Text size="sm" c="dimmed">
                  {t(
                    "quickText.panel.instructions",
                    "Click anywhere on the PDF page to place an inline text box and type directly. Use the floating toolbar above the box to adjust size, bold, italic, underline, color, or delete.",
                  )}
                </Text>

                {snapshot.error && (
                  <Alert color="red" variant="light">
                    {snapshot.error}
                  </Alert>
                )}

                {nonEmptyBoxes.length > 0 && (
                  <Stack gap={6}>
                    <Text size="xs" fw={600} c="dimmed">
                      {t(
                        "quickText.panel.placedBoxes",
                        "Placed text boxes ({{count}})",
                        {
                          count: nonEmptyBoxes.length,
                        },
                      )}
                    </Text>
                    {nonEmptyBoxes.map((box) => (
                      <Group
                        key={box.id}
                        justify="space-between"
                        wrap="nowrap"
                        gap="xs"
                        style={{
                          padding: "6px 8px",
                          borderRadius: 6,
                          border: `1px solid ${
                            snapshot.activeBoxId === box.id
                              ? "var(--c-primary)"
                              : "var(--c-border-subtle)"
                          }`,
                          background: "var(--c-surface)",
                          cursor: "pointer",
                        }}
                        onClick={() => {
                          store.selectBox(box.id);
                          scrollActions.scrollToPage(box.pageIndex + 1);
                        }}
                      >
                        <Text size="xs" truncate style={{ flex: 1 }}>
                          {t("quickText.panel.pagePrefix", "P{{page}}:", {
                            page: box.pageIndex + 1,
                          })}{" "}
                          {box.text}
                        </Text>
                        <Button
                          size="sm"
                          variant="tertiary"
                          accent="neutral"
                          aria-label={t(
                            "quickText.toolbar.delete",
                            "Delete text box",
                          )}
                          onClick={(e) => {
                            e.stopPropagation();
                            store.deleteBox(box.id);
                          }}
                        >
                          <Icon name="trash" size={14} />
                        </Button>
                      </Group>
                    ))}
                  </Stack>
                )}

                <Stack gap="xs" mt="xs">
                  <Button
                    variant="primary"
                    disabled={!snapshot.dirty || snapshot.saving}
                    onClick={() => void saveToPdf(false)}
                  >
                    <Icon name="save" size={15} />
                    {snapshot.saving
                      ? t("quickText.actions.saving", "Saving...")
                      : t("quickText.actions.apply", "Apply to PDF")}
                  </Button>
                  <Button
                    variant="secondary"
                    disabled={!snapshot.dirty || snapshot.saving}
                    onClick={() => void saveToPdf(true)}
                  >
                    <Icon name="download" size={15} />
                    {t("quickText.actions.saveAndDownload", "Save & Download")}
                  </Button>
                </Stack>
              </Stack>
            ),
          },
        ];

  return createToolFlow({
    files: {
      selectedFiles: editableFiles,
      isCollapsed: false,
    },
    steps,
    review: {
      isVisible: false,
      operation: {
        files: [],
        thumbnails: [],
        isGeneratingThumbnails: false,
        downloadUrl: null,
        downloadFilename: "",
        isLoading: false,
        status: "",
        errorMessage: null,
        progress: null,
        executeOperation: async () => {},
        resetResults: () => {},
        clearError: () => {},
        cancelOperation: () => {},
        undoOperation: async () => {},
      },
      title: "",
      onFileClick: () => {},
      onUndo: () => {},
    },
    forceStepNumbers: true,
  });
};

export default QuickText;
