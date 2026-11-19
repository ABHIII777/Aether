import { spawn, type ChildProcess } from "node:child_process";
import {
  createReadStream,
  existsSync,
  statSync,
  watch,
  type FSWatcher,
} from "node:fs";
import { mkdir, readFile, rm } from "node:fs/promises";
import {
  createServer,
  request as httpRequest,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import path from "node:path";
import * as esbuild from "esbuild";
import { goInvocation, type AetherConfig } from "./config.js";

type ReloadClient = ServerResponse<IncomingMessage>;

export async function startDev(config: AetherConfig): Promise<void> {
  const cacheDir = path.join(config.root, ".aether", "dev");
  await rm(cacheDir, { recursive: true, force: true });
  await mkdir(cacheDir, { recursive: true });

  const clients = new Set<ReloadClient>();

  const context = await esbuild.context({
    entryPoints: [config.clientEntry],
    outdir: cacheDir,
    bundle: true,
    format: "esm",
    platform: "browser",
    target: "es2022",
    sourcemap: false,
    plugins: [
      {
        name: "aether-live-reload",
        setup(build) {
          build.onEnd((result) => {
            if (result.errors.length > 0) {
              return;
            }

            for (const client of clients) {
              client.write("data: reload\n\n");
            }
          });
        },
      },
    ],
  });

  await context.rebuild();
  await context.watch();

  let apiServer = startAPIServer(config);
  let reloadTimer: NodeJS.Timeout | null = null;
  let watcher: FSWatcher | null = null;

  try {
    watcher = watch(config.serverDir, { recursive: true }, (_, file) => {
      if (!file || (!file.endsWith(".go") && !file.endsWith(".sql"))) {
        return;
      }

      if (reloadTimer) {
        clearTimeout(reloadTimer);
      }

      reloadTimer = setTimeout(() => {
        reloadTimer = null;
        apiServer.kill("SIGTERM");
        apiServer = startAPIServer(config);
      }, 250);
    });
  } catch {
    watcher = null;
  }

  const server = createServer((request, response) => {
    void handleRequest(config, cacheDir, clients, request, response);
  });

  server.listen(config.devPort, () => {
    process.stdout.write(
      `Aether dev server running at http://localhost:${config.devPort}\n`,
    );
  });

  const shutdown = () => {
    if (reloadTimer) {
      clearTimeout(reloadTimer);
    }

    watcher?.close();
    apiServer.kill("SIGTERM");
    server.close();

    for (const client of clients) {
      client.end();
    }

    void context.dispose();
  };

  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
}

async function handleRequest(
  config: AetherConfig,
  cacheDir: string,
  clients: Set<ReloadClient>,
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  const url = new URL(request.url ?? "/", "http://localhost");

  if (url.pathname === "/__aether_reload") {
    response.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });
    response.flushHeaders();
    clients.add(response);
    request.on("close", () => clients.delete(response));
    return;
  }

  if (url.pathname === "/api" || url.pathname.startsWith("/api/")) {
    proxyRequest(config, request, response);
    return;
  }

  const pathname = decodeURIComponent(url.pathname);
  const candidate = path.resolve(cacheDir, `.${pathname}`);

  if (isInside(cacheDir, candidate) && existsSync(candidate) && statSync(candidate).isFile()) {
    await serveFile(candidate, response);
    return;
  }

  if (config.publicDir) {
    const publicFile = path.resolve(config.publicDir, `.${pathname}`);

    if (
      isInside(config.publicDir, publicFile) &&
      existsSync(publicFile) &&
      statSync(publicFile).isFile()
    ) {
      await serveFile(publicFile, response);
      return;
    }
  }

  if (path.extname(pathname) !== "") {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Not found");
    return;
  }

  const html = await readFile(config.clientIndex, "utf8");
  const injected = html.replace(
    "</body>",
    '<script type="module">new EventSource("/__aether_reload").onmessage=()=>location.reload()</script></body>',
  );

  response.writeHead(200, {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-cache",
  });
  response.end(injected);
}

function proxyRequest(
  config: AetherConfig,
  request: IncomingMessage,
  response: ServerResponse,
): void {
  const proxy = httpRequest(
    {
      hostname: "127.0.0.1",
      port: config.apiPort,
      path: request.url,
      method: request.method,
      headers: {
        ...request.headers,
        host: `127.0.0.1:${config.apiPort}`,
      },
    },
    (upstream) => {
      response.writeHead(upstream.statusCode ?? 502, upstream.headers);
      upstream.pipe(response);
    },
  );

  proxy.on("error", () => {
    if (!response.headersSent) {
      response.writeHead(502, { "Content-Type": "application/json" });
    }

    response.end(
      JSON.stringify({
        error: {
          code: "api_unavailable",
          message: "API server is not running",
        },
      }),
    );
  });

  request.pipe(proxy);
}

function startAPIServer(config: AetherConfig): ChildProcess {
  const go = goInvocation(config);

  return spawn("go", ["run", go.target], {
    cwd: go.cwd,
    env: {
      ...process.env,
      PORT: String(config.apiPort),
    },
    stdio: "inherit",
  });
}

async function serveFile(
  file: string,
  response: ServerResponse,
): Promise<void> {
  response.writeHead(200, {
    "Content-Type": contentType(file),
  });
  createReadStream(file).pipe(response);
}

function contentType(file: string): string {
  const extension = path.extname(file).toLowerCase();
  const types: Record<string, string> = {
    ".css": "text/css; charset=utf-8",
    ".html": "text/html; charset=utf-8",
    ".ico": "image/x-icon",
    ".js": "text/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".map": "application/json; charset=utf-8",
    ".png": "image/png",
    ".svg": "image/svg+xml",
    ".txt": "text/plain; charset=utf-8",
    ".wasm": "application/wasm",
    ".woff": "font/woff",
    ".woff2": "font/woff2",
  };

  return types[extension] ?? "application/octet-stream";
}

function isInside(parent: string, child: string): boolean {
  const relative = path.relative(parent, child);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}
