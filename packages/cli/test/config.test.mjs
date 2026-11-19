import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { loadConfig, parseFlags } from "../dist/config.js";

test("parseFlags separates positional arguments and flags", () => {
  const result = parseFlags([
    "dev",
    "--root",
    ".",
    "--port=4000",
    "--verbose",
  ]);

  assert.deepEqual(result.positionals, ["dev"]);
  assert.equal(result.flags.root, ".");
  assert.equal(result.flags.port, "4000");
  assert.equal(result.flags.verbose, true);
});

test("loadConfig merges file values with defaults", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "aether-config-"));

  try {
    await writeFile(
      path.join(directory, "aether.config.json"),
      JSON.stringify({
        name: "demo",
        clientEntry: "src/main.tsx",
        devPort: 3100,
      }),
    );

    const config = await loadConfig(directory);

    assert.equal(config.name, "demo");
    assert.equal(config.clientEntry, path.join(directory, "src/main.tsx"));
    assert.equal(config.clientIndex, path.join(directory, "client/index.html"));
    assert.equal(config.devPort, 3100);
    assert.equal(config.apiPort, 8080);
    assert.equal(config.outDir, path.join(directory, "server/assets/dist"));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
