#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parseMusicXml, writeMusicXml } from "../upstream/utaformatix3-ts/dist-lib/utaformatix3-ts.esm.js";
import { convertMusicXmlToVsqx, convertVsqxToMusicXml } from "../src/index.ts";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const fixtureMusicXmlPath = resolve("tests/fixtures/musicxml/musicxml_direction_notations_01/input.musicxml");
const fixtureVsqxPath = resolve("upstream/utaformatix3-ts/tests/fixtures/vsqx/vsqx_tiny_ja_01/input.vsqx");

try {
  const musicXmlInput = await readFile(fixtureMusicXmlPath, "utf8");
  const vsqxInput = await readFile(fixtureVsqxPath, "utf8");

  let normalizeCallCount = 0;
  let parseCallCount = 0;
  let writeCallCount = 0;

  globalThis.__utaformatix3TsPlusMikuscoreHooks = {
    normalizeImportedMusicXmlText: (xml) => {
      normalizeCallCount += 1;
      return String(xml ?? "");
    },
    parseMusicXmlToProject: (xml, options) => {
      parseCallCount += 1;
      return parseMusicXml(xml, { defaultLyric: options?.defaultLyric });
    },
    writeProjectToMusicXml: (project, options) => {
      writeCallCount += 1;
      if (options?.mode === "preserve") {
        return writeMusicXml(project, { mode: "preserve" });
      }
      return writeMusicXml(project, { mode: "generate" });
    },
  };

  const vsqx = convertMusicXmlToVsqx(musicXmlInput, {
    musicXml: { defaultLyric: "あ" },
  });
  assert(typeof vsqx === "string" && vsqx.length > 0, "Expected VSQX output");

  const musicXml = convertVsqxToMusicXml(vsqxInput, {
    defaultLyric: "あ",
  });
  assert(typeof musicXml === "string" && musicXml.length > 0, "Expected MusicXML output");

  assert(parseCallCount > 0, `Expected parse hook call, got ${parseCallCount}`);
  assert(writeCallCount > 0, `Expected write hook call, got ${writeCallCount}`);
  assert(normalizeCallCount > 0, `Expected normalize hook call, got ${normalizeCallCount}`);

  console.log("Mikuscore adapter hooks validation OK");
  console.log(`normalizeCalls=${normalizeCallCount} parseCalls=${parseCallCount} writeCalls=${writeCallCount}`);
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Mikuscore adapter hooks validation failed: ${message}`);
  process.exit(2);
} finally {
  delete globalThis.__utaformatix3TsPlusMikuscoreHooks;
}
