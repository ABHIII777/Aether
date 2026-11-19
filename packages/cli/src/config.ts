import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";

export type AetherConfig = {
  root: string;
  name: string;
  clientEntry: string;
  clientIndex: string;
  publicDir: string | null;
  serverDir: string;
  devPort: number;
  apiPort: number;
  outDir: string;
  binary: string;
};

type ConfigInput = {
  name?: string;
  clientEntry?: string;
  clientIndex?: string;
  publicDir?: string | null;
  serverDir?: string;
  devPort?: number;
  apiPort?: number;
  outDir?: string;
  binary?: string;
};

const defaults: ConfigInput = {
  name: "aether-app",
  clientEntry: "client/main.tsx",
  clientIndex: "client/index.html",
  publicDir: null,
  serverDir: "server",
  devPort: 3000,
  apiPort: 8080,
  outDir: "server/assets/dist",
  binary: "bin/aether-app",
};

export function goInvocation(config: AetherConfig): {
  cwd: string;
  target: string;
} {
  if (existsSync(path.join(config.root, "go.mod"))) {
    const relative = path.relative(config.root, config.serverDir);
    const target =
      relative === ""
        ? "."
        : `./${relative.split(path.sep).join("/")}`;

    return { cwd: config.root, target };
  }

  return { cwd: config.serverDir, target: "." };
}

export async function loadConfig(root = process.cwd()): Promise<AetherConfig> {
  const absoluteRoot = path.resolve(root);
  const file = path.join(absoluteRoot, "aether.config.json");
  let input: ConfigInput = {};

  try {
    input = JSON.parse(await readFile(file, "utf8")) as ConfigInput;
  } catch (error) {
    if (!isMissingFile(error)) {
      throw error;
    }
  }

  const merged = { ...defaults, ...input };
  const name = String(merged.name ?? defaults.name);
  const publicDir = merged.publicDir
    ? path.resolve(absoluteRoot, merged.publicDir)
    : null;

  return {
    root: absoluteRoot,
    name,
    clientEntry: path.resolve(absoluteRoot, String(merged.clientEntry)),
    clientIndex: path.resolve(absoluteRoot, String(merged.clientIndex)),
    publicDir,
    serverDir: path.resolve(absoluteRoot, String(merged.serverDir)),
    devPort: Number(merged.devPort),
    apiPort: Number(merged.apiPort),
    outDir: path.resolve(absoluteRoot, String(merged.outDir)),
    binary: path.resolve(
      absoluteRoot,
      String(merged.binary).replace("__APP_NAME__", name),
    ),
  };
}

export function parseFlags(args: string[]): {
  positionals: string[];
  flags: Record<string, string | boolean>;
} {
  const positionals: string[] = [];
  const flags: Record<string, string | boolean> = {};

  for (let index = 0; index < args.length; index++) {
    const value = args[index]!;

    if (!value.startsWith("--")) {
      positionals.push(value);
      continue;
    }

    const [key, inline] = value.slice(2).split("=", 2);

    if (inline !== undefined) {
      flags[key!] = inline;
      continue;
    }

    const next = args[index + 1];

    if (next !== undefined && !next.startsWith("--")) {
      flags[key!] = next;
      index++;
    } else {
      flags[key!] = true;
    }
  }

  return { positionals, flags };
}

function isMissingFile(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "ENOENT"
  );
}
