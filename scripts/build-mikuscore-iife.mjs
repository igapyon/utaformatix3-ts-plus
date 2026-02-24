#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

const outFile = resolve("dist/utaformatix3-ts-plus.mikuscore.iife.js");
mkdirSync(dirname(outFile), { recursive: true });

const banner = [
  "/*",
  " * utaformatix3-ts-plus mikuscore bundle (IIFE)",
  " * Global: UtaFormatix3TsPlusMikuscore",
  " * Optional hooks:",
  " *   globalThis.__utaformatix3TsPlusMikuscoreHooks = { normalizeImportedMusicXmlText(xml) }",
  " */",
].join("\n");

execFileSync(
  "npx",
  [
    "--yes",
    "esbuild",
    "src/index.ts",
    "--bundle",
    "--platform=browser",
    "--format=iife",
    "--global-name=UtaFormatix3TsPlusMikuscore",
    "--target=es2020",
    `--banner:js=${banner}`,
    `--outfile=${outFile}`,
  ],
  { stdio: "inherit" },
);

process.stdout.write(`Built ${outFile}\n`);
