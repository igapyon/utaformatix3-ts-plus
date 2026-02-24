#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parseVsqx } from "../upstream/utaformatix3-ts/dist-lib/utaformatix3-ts.esm.js";
import { convertMusicXmlToVsqx } from "../src/converters/musicXmlToVsqx.ts";

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function main() {
  const [, , inputArg, defaultLyricArg] = process.argv;
  const inputPath = resolve(inputArg ?? "upstream/mikuscore/src/samples/musicxml/sample1.musicxml");
  const defaultLyric = defaultLyricArg ?? "あ";

  const xml = await readFile(inputPath, "utf8");
  const vsqx = convertMusicXmlToVsqx(xml, { musicXml: { defaultLyric } });
  const project = parseVsqx(vsqx, { defaultLyric });

  const headNotes = project.tracks
    .flatMap((track) => track.notes)
    .filter((note) => note.tickOn < 3000);

  const b4 = headNotes.find((note) => note.key === 71);
  const b5 = headNotes.find((note) => note.key === 83);
  assert(b4 != null, "Expected opening B4 (key=71) note in converted VSQX.");
  assert(b5 != null, "Expected opening B5 (key=83) note in converted VSQX.");
  assert(
    b4.tickOn === b5.tickOn,
    `Expected opening B4/B5 to start together, got tickOn B4=${b4.tickOn}, B5=${b5.tickOn}.`,
  );

  console.log(
    `MusicXML opening chord onset validation OK: B4/B5 tickOn=${b4.tickOn}, tickOff=${b4.tickOff}/${b5.tickOff}`,
  );
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`MusicXML opening chord onset validation failed: ${message}`);
  process.exit(1);
});
