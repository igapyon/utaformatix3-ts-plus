#!/usr/bin/env node
import { spawn } from "node:child_process";

const commands = [
  ["node", ["scripts/validate-vsqx-error-policy.mjs"]],
  ["node", ["scripts/validate-vsqx-fixtures.mjs"]],
  ["node", ["scripts/validate-vsqx-golden.mjs", "check"]],
  ["node", ["scripts/validate-vsqx-semantics.mjs"]],
  ["node", ["scripts/validate-musicxml-error-policy.mjs"]],
  ["node", ["scripts/validate-musicxml-unsupported-notation-policy.mjs"]],
  ["node", ["scripts/validate-musicxml-unsupported-notation-extras.mjs"]],
  ["node", ["scripts/validate-mikuscore-adapter-hooks.mjs"]],
  ["node", ["scripts/validate-musicxml-golden.mjs", "check"]],
  ["node", ["scripts/validate-musicxml-semantics.mjs"]],
  ["node", ["scripts/validate-vsqx-roundtrip-diff.mjs", "upstream/utaformatix3-ts/tests/fixtures/vsqx", "あ", "check"]],
  ["node", ["scripts/validate-musicxml-roundtrip-diff.mjs", "tests/fixtures/musicxml", "あ", "check"]],
];

function runOne(cmd, args) {
  return new Promise((resolve) => {
    const label = [cmd, ...args].join(" ");
    process.stdout.write(`\n>>> ${label}\n`);
    const child = spawn(cmd, args, { stdio: "inherit" });
    child.on("close", (code) => {
      resolve({ label, code: code ?? 1 });
    });
  });
}

let failed = 0;
for (const [cmd, args] of commands) {
  // eslint-disable-next-line no-await-in-loop
  const result = await runOne(cmd, args);
  if (result.code !== 0) {
    failed += 1;
    process.stderr.write(`FAILED: ${result.label} (code=${result.code})\n`);
  }
}

if (failed > 0) {
  process.stderr.write(`\ncheck-all failed: ${failed} command(s)\n`);
  process.exit(2);
}

process.stdout.write("\ncheck-all passed\n");
