import { constants } from "node:fs";
import {
  access,
  cp,
  mkdir,
  readFile,
  readdir,
  stat,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export async function createApp(name: string, cwd = process.cwd()): Promise<void> {
  const target = path.resolve(cwd, name);
  const repoRoot = findRepoRoot();
  const template = path.join(repoRoot, "templates", "app");

  try {
    await access(target, constants.F_OK);
    throw new Error(`Target already exists: ${target}`);
  } catch (error) {
    if (!isMissing(error)) {
      throw error;
    }
  }

  await cp(template, target, {
    recursive: true,
    filter: (source) =>
      !source.includes(`${path.sep}node_modules${path.sep}`) &&
      !source.endsWith(`${path.sep}dist`),
  });

  const packageName = sanitize(name);
  const moduleName = `app.local/${packageName}`;

  await replacePlaceholders(target, {
    __APP_NAME__: packageName,
    __MODULE__: moduleName,
  });

  await copyCore(repoRoot, target);
  await copyCLI(repoRoot, target);
  await copyServerFramework(repoRoot, target);

  process.stdout.write(`Created ${packageName} at ${target}\n`);
  process.stdout.write(`Next:\n  cd ${name}\n  pnpm install\n  pnpm dev\n`);
}

async function copyCore(repoRoot: string, target: string): Promise<void> {
  const destination = path.join(target, "packages", "aether");
  await mkdir(destination, { recursive: true });
  await cp(path.join(repoRoot, "packages", "core", "dist"), path.join(destination, "dist"), {
    recursive: true,
  });
  await cp(
    path.join(repoRoot, "packages", "core", "package.json"),
    path.join(destination, "package.json"),
  );
}

async function copyCLI(repoRoot: string, target: string): Promise<void> {
  const destination = path.join(target, "packages", "cli");
  await mkdir(destination, { recursive: true });
  await cp(path.join(repoRoot, "packages", "cli", "dist"), path.join(destination, "dist"), {
    recursive: true,
  });
  await cp(
    path.join(repoRoot, "packages", "cli", "package.json"),
    path.join(destination, "package.json"),
  );
}

async function copyServerFramework(
  repoRoot: string,
  target: string,
): Promise<void> {
  await cp(
    path.join(repoRoot, "server", "aether"),
    path.join(target, "server", "aether"),
    {
      recursive: true,
      filter: (source) => !source.endsWith("_test.go"),
    },
  );
}

async function replacePlaceholders(
  directory: string,
  replacements: Record<string, string>,
): Promise<void> {
  const entries = await readdir(directory, { withFileTypes: true });

  for (const entry of entries) {
    const file = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      if (entry.name === "node_modules") {
        continue;
      }

      await replacePlaceholders(file, replacements);
      continue;
    }

    if (!entry.isFile()) {
      continue;
    }

    const info = await stat(file);

    if (info.size > 1_000_000) {
      continue;
    }

    const buffer = await readFile(file);

    if (buffer.includes(0)) {
      continue;
    }

    let content = buffer.toString("utf8");
    let changed = false;

    for (const [placeholder, value] of Object.entries(replacements)) {
      if (content.includes(placeholder)) {
        content = content.split(placeholder).join(value);
        changed = true;
      }
    }

    if (changed) {
      await writeFile(file, content);
    }
  }
}

function findRepoRoot(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(here, "..", "..", "..");
}

function sanitize(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-_]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function isMissing(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "ENOENT"
  );
}
