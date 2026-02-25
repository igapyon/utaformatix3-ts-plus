#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parseVsqx } from "../upstream/utaformatix3-ts/dist-lib/utaformatix3-ts.esm.js";
import { convertMusicXmlToVsqx } from "../src/converters/musicXmlToVsqx.ts";
import { convertVsqxToMusicXml } from "../src/converters/vsqxToMusicXml.ts";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function normalizeLyric(value, defaultLyric) {
  return String(value && value.length > 0 ? value : defaultLyric);
}

function flattenNotes(project, defaultLyric) {
  return project.tracks
    .flatMap((track) =>
      track.notes.map((note) => ({
        tickOn: note.tickOn,
        tickOff: note.tickOff,
        key: note.key,
        lyric: normalizeLyric(note.lyric, defaultLyric),
      })),
    )
    .sort(
      (a, b) =>
        a.tickOn - b.tickOn ||
        a.tickOff - b.tickOff ||
        a.key - b.key ||
        a.lyric.localeCompare(b.lyric),
    );
}

function countByKey(notes) {
  const map = new Map();
  for (const note of notes) {
    const key = `${note.tickOn}\t${note.tickOff}\t${note.key}\t${note.lyric}`;
    map.set(key, (map.get(key) ?? 0) + 1);
  }
  return map;
}

function diffNoteMultiset(expected, actual) {
  const expectedCount = countByKey(expected);
  const actualCount = countByKey(actual);
  let missing = 0;
  let extra = 0;
  for (const [k, v] of expectedCount) {
    const delta = v - (actualCount.get(k) ?? 0);
    if (delta > 0) missing += delta;
  }
  for (const [k, v] of actualCount) {
    const delta = v - (expectedCount.get(k) ?? 0);
    if (delta > 0) extra += delta;
  }
  return { missing, extra };
}

async function main() {
  const [, , inputArg, defaultLyricArg] = process.argv;
  const inputPath = resolve(
    inputArg ?? "tests/fixtures/musicxml-regression/m5_two_parts_regression_01/input.musicxml",
  );
  const defaultLyric = defaultLyricArg ?? "ら";

  const inputMusicXml = await readFile(inputPath, "utf8");
  const vsqxA = convertMusicXmlToVsqx(inputMusicXml, { musicXml: { defaultLyric } });
  const roundtripMusicXml = convertVsqxToMusicXml(vsqxA, { defaultLyric });
  const vsqxB = convertMusicXmlToVsqx(roundtripMusicXml, { musicXml: { defaultLyric } });

  const parsedA = parseVsqx(vsqxA, { defaultLyric });
  const parsedB = parseVsqx(vsqxB, { defaultLyric });
  const notesA = flattenNotes(parsedA, defaultLyric);
  const notesB = flattenNotes(parsedB, defaultLyric);
  const diff = diffNoteMultiset(notesA, notesB);

  assert(
    diff.missing === 0 && diff.extra === 0,
    `Expected stable note multiset across re-import. missing=${diff.missing}, extra=${diff.extra}`,
  );

  console.log(
    `MusicXML plus-parser roundtrip validation OK: input=${inputPath}, notes=${notesA.length}, tracks=${parsedA.tracks.length}->${parsedB.tracks.length}`,
  );
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`MusicXML plus-parser roundtrip validation failed: ${message}`);
  process.exit(1);
});
