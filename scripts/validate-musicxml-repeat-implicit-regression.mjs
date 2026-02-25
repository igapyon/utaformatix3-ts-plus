#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { getMusicXmlAdapter } from "../src/musicxml/index.ts";
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

function diffMultiset(expected, actual) {
  const toMap = (notes) => {
    const map = new Map();
    for (const n of notes) {
      const k = `${n.tickOn}\t${n.tickOff}\t${n.key}\t${n.lyric}`;
      map.set(k, (map.get(k) ?? 0) + 1);
    }
    return map;
  };
  const a = toMap(expected);
  const b = toMap(actual);
  let missing = 0;
  let extra = 0;
  for (const [k, v] of a) {
    const d = v - (b.get(k) ?? 0);
    if (d > 0) missing += d;
  }
  for (const [k, v] of b) {
    const d = v - (a.get(k) ?? 0);
    if (d > 0) extra += d;
  }
  return { missing, extra };
}

async function main() {
  const [, , inputArg, defaultLyricArg] = process.argv;
  const inputPath = resolve(
    inputArg ?? "tests/fixtures/musicxml-regression/repeat_implicit_x1_regression_01/input.musicxml",
  );
  const defaultLyric = defaultLyricArg ?? "ら";
  const sourceXml = await readFile(inputPath, "utf8");

  assert(/implicit=\"yes\"/.test(sourceXml), "Fixture must include implicit measure.");
  assert(/<repeat\s+direction=\"backward\"/.test(sourceXml), "Fixture must include backward repeat.");
  assert(/<repeat\s+direction=\"forward\"/.test(sourceXml), "Fixture must include forward repeat.");

  const sourceProject = getMusicXmlAdapter().parse(sourceXml, { defaultLyric });
  const vsqx = convertMusicXmlToVsqx(sourceXml, { musicXml: { defaultLyric } });
  const roundtripXml = convertVsqxToMusicXml(vsqx, { defaultLyric });
  const roundtripProject = getMusicXmlAdapter().parse(roundtripXml, { defaultLyric });

  const diff = diffMultiset(flattenNotes(sourceProject, defaultLyric), flattenNotes(roundtripProject, defaultLyric));
  assert(
    diff.missing === 0 && diff.extra === 0,
    `Repeat+implicit(X1) notes changed after roundtrip: missing=${diff.missing}, extra=${diff.extra}`,
  );

  console.log(
    `MusicXML repeat+implicit(X1) regression validation OK: notes=${sourceProject.tracks.flatMap((t) => t.notes).length}`,
  );
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`MusicXML repeat+implicit(X1) regression validation failed: ${message}`);
  process.exit(1);
});

