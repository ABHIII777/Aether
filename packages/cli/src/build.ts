import { spawn } from "node:child_process";
import { copyFile, cp, mkdir, rm } from "node:fs/promises";
import path from "node:path";
import * as esbuild from "esbuild";
import { goInvocation, type AetherConfig } from "./config.js";

export async function build(config: AetherConfig): Promise<void> {
  await rm(config.outDir, { recursive: true, force: true });
  await mkdir(config.outDir, { recursive: true });

  await esbuild.build({
    entryPoints: [config.clientEntry],
    outdir: config.outDir,
    bundle: true,
    minify: true,
    format: "esm",
    platform: "browser",
    target: "es2022",
    sourcemap: false,
  });

  if (path.resolve(config.clientIndex) !== path.resolve(config.outDir, "index.html")) {
    await copyFile(config.clientIndex, path.join(config.outDir, "index.html"));
  }

  if (config.publicDir) {
    await cp(config.publicDir, config.outDir, {
      recursive: true,
      force: true,
    });
  }

  await mkdir(path.dirname(config.binary), { recursive: true });
  const go = goInvocation(config);
  await run("go", ["build", "-o", config.binary, go.target], go.cwd);

  process.stdout.write(`Built ${config.binary}\n`);
}

function run(command: string, args: string[], cwd: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      stdio: "inherit",
      env: process.env,
    });

    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`${command} exited with code ${code}`));
    });
  });
}
