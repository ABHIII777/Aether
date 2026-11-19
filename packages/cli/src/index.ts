#!/usr/bin/env node
import { build } from "./build.js";
import { loadConfig, parseFlags } from "./config.js";
import { createApp } from "./create.js";
import { startDev } from "./dev.js";

async function main(args: string[]): Promise<void> {
  const { positionals, flags } = parseFlags(args);
  const command = positionals[0];
  const root = typeof flags.root === "string" ? flags.root : process.cwd();

  if (!command || command === "help" || flags.help) {
    printHelp();
    return;
  }

  if (command === "create") {
    const name = positionals[1];

    if (!name) {
      throw new Error("Usage: aether create <name>");
    }

    await createApp(name, root);
    return;
  }

  if (command === "dev") {
    const config = await loadConfig(root);

    if (typeof flags.port === "string") {
      config.devPort = Number(flags.port);
    }

    if (typeof flags["api-port"] === "string") {
      config.apiPort = Number(flags["api-port"]);
    }

    await startDev(config);
    return;
  }

  if (command === "build") {
    const config = await loadConfig(root);
    await build(config);
    return;
  }

  throw new Error(`Unknown command: ${command}`);
}

function printHelp(): void {
  process.stdout.write(
    [
      "Aether",
      "",
      "Usage:",
      "  aether dev [--root .] [--port 3000] [--api-port 8080]",
      "  aether build [--root .]",
      "  aether create <name> [--root .]",
      "",
    ].join("\n"),
  );
}

main(process.argv.slice(2)).catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
