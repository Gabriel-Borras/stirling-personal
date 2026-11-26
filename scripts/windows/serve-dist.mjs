import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST_DIR = path.resolve(__dirname, "../../frontend/dist");
const HOST = "127.0.0.1";
const PORT = Number(process.env.STIRLING_PORT) || 4175;
const BACKEND_HOST = process.env.STIRLING_BACKEND_HOST || "127.0.0.1";
const BACKEND_PORT = Number(process.env.STIRLING_BACKEND_PORT) || 8080;

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".htm": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".mjs": "application/javascript; charset=utf-8",
  ".cjs": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".ico": "image/x-icon",
  ".wasm": "application/wasm",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".toml": "application/toml; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".properties": "text/plain; charset=utf-8",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
  ".eot": "application/vnd.ms-fontobject",
  ".pdf": "application/pdf",
  ".bcmap": "application/octet-stream",
  ".pfb": "application/octet-stream",
};

function getMimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return MIME_TYPES[ext] || "application/octet-stream";
}

function sendJson(res, statusCode, payload) {
  if (res.headersSent) {
    res.end();
    return;
  }
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    "Cache-Control": "no-store",
  });
  res.end(body);
}

const OFFLINE_GET_FALLBACKS = {
  "/api/v1/info/status": { status: "UP" },
  "/api/v1/config/app-config": {
    enableLogin: false,
    isAdmin: false,
    enableAnalytics: false,
    languages: ["es-ES", "en-GB", "en-US"],
    defaultLocale: "es-ES",
  },
  "/api/v1/config/public-config": {
    enableLogin: false,
    languages: ["es-ES", "en-GB", "en-US"],
    defaultLocale: "es-ES",
  },
  "/api/v1/auth/me": {
    user: { username: "local", email: "", roles: ["ROLE_USER"] },
  },
  "/api/v1/team/my": [],
  "/api/v1/policies": [],
  "/api/v1/policies/runs": [],
  "/api/v1/notifications": { notifications: [], unreadCount: 0 },
  "/api/v1/config/endpoints-availability": {},
  "/api/v1/config/endpoints-enabled": {},
  "/api/v1/config/endpoint-enabled": true,
  "/api/v1/config/group-enabled": true,
  "/api/v1/config/login-disclaimer": { enabled: false },
  "/api/v1/ui-data/footer-info": {},
  "/api/v1/proprietary/ui-data/login": {
    enabled: false,
    enableLogin: false,
    loginMethod: "form",
  },
  "/api/v1/proprietary/ui-data/account": {
    username: "local",
    email: "",
    roles: ["ROLE_USER"],
  },
  "/api/v1/admin/license-info": {
    licenseType: "FREE",
    valid: true,
    maxUsers: 5,
  },
};

function getOfflineFallback(pathname) {
  if (Object.prototype.hasOwnProperty.call(OFFLINE_GET_FALLBACKS, pathname)) {
    return OFFLINE_GET_FALLBACKS[pathname];
  }
  if (pathname.startsWith("/api/v1/proprietary/")) {
    return {};
  }
  return undefined;
}

function proxyToBackend(req, res) {
  const headers = { ...req.headers, host: `${BACKEND_HOST}:${BACKEND_PORT}` };
  const proxyReq = http.request(
    {
      hostname: BACKEND_HOST,
      port: BACKEND_PORT,
      path: req.url,
      method: req.method,
      headers,
    },
    (proxyRes) => {
      res.writeHead(proxyRes.statusCode || 502, proxyRes.headers);
      proxyRes.pipe(res);
    },
  );

  proxyReq.on("error", () => {
    if (req.method === "GET") {
      const pathname = new URL(req.url || "/", "http://127.0.0.1").pathname;
      const fallback = getOfflineFallback(pathname);
      if (fallback !== undefined) {
        sendJson(res, 200, fallback);
        return;
      }
    }
    sendJson(res, 503, {
      error: "Backend unavailable",
      message: `Stirling-PDF backend is not reachable at http://${BACKEND_HOST}:${BACKEND_PORT}`,
    });
  });

  req.pipe(proxyReq);
}

function serveFile(req, res, filePath) {
  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Not Found");
      return;
    }

    const headers = {
      "Content-Type": getMimeType(filePath),
      "Content-Length": stats.size,
      "Cache-Control": filePath.endsWith(".html") ? "no-cache" : "public, max-age=3600",
    };

    res.writeHead(200, headers);
    if (req.method === "HEAD") {
      res.end();
      return;
    }

    const stream = fs.createReadStream(filePath);
    stream.on("error", () => {
      if (!res.headersSent) {
        res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
      }
      res.end("Internal Server Error");
    });
    stream.pipe(res);
  });
}

function resolveStaticPath(pathname) {
  let decoded;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return null;
  }

  const relativePath = decoded.replace(/^\/+/, "");
  const resolved = path.resolve(DIST_DIR, relativePath);
  const distPrefix = DIST_DIR.endsWith(path.sep) ? DIST_DIR : `${DIST_DIR}${path.sep}`;
  if (resolved !== DIST_DIR && !resolved.startsWith(distPrefix)) {
    return null;
  }
  return resolved;
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url || "/", `http://${HOST}:${PORT}`);

  if (url.pathname === "/api" || url.pathname.startsWith("/api/")) {
    proxyToBackend(req, res);
    return;
  }

  if (req.method !== "GET" && req.method !== "HEAD") {
    res.writeHead(405, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Method Not Allowed");
    return;
  }

  const targetPath = resolveStaticPath(url.pathname);
  if (!targetPath) {
    res.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Bad Request");
    return;
  }

  fs.stat(targetPath, (err, stats) => {
    if (!err && stats.isFile()) {
      serveFile(req, res, targetPath);
      return;
    }

    if (!err && stats.isDirectory()) {
      const nestedIndex = path.join(targetPath, "index.html");
      if (fs.existsSync(nestedIndex)) {
        serveFile(req, res, nestedIndex);
        return;
      }
    }

    if (!path.extname(url.pathname)) {
      serveFile(req, res, path.join(DIST_DIR, "index.html"));
      return;
    }

    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Not Found");
  });
});

server.listen(PORT, HOST, () => {
  console.log(`Stirling-PDF static server listening on http://${HOST}:${PORT}`);
});

function shutdown() {
  server.close(() => process.exit(0));
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
