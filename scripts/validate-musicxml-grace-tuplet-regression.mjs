#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { convertMusicXmlToVsqxWithReport } from "../src/converters/musicXmlToVsqx.ts";
import { convertVsqxToMusicXml } from "../src/converters/vsqxToMusicXml.ts";
import { getMusicXmlAdapter } from "../src/musicxml/index.ts";

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

function multisetDiffCount(expected, actual) {
  const countByKey = (notes) => {
    const map = new Map();
    for (const note of notes) {
      const key = `${note.tickOn}\t${note.tickOff}\t${note.key}\t${note.lyric}`;
      map.set(key, (map.get(key) ?? 0) + 1);
    }
    return map;
  };
  const expectedMap = countByKey(expected);
  const actualMap = countByKey(actual);
  let missing = 0;
  let extra = 0;
  for (const [k, v] of expectedMap) {
    const delta = v - (actualMap.get(k) ?? 0);
    if (delta > 0) missing += delta;
  }
  for (const [k, v] of actualMap) {
    const delta = v - (expectedMap.get(k) ?? 0);
    if (delta > 0) extra += delta;
  }
  return { missing, extra };
}

async function main() {
  const [, , inputArg, defaultLyricArg] = process.argv;
  const inputPath = resolve(
    inputArg ?? "tests/fixtures/musicxml-regression/grace_tuplet_regression_01/input.musicxml",
  );
  const defaultLyric = defaultLyricArg ?? "ら";

  const sourceXml = await readFile(inputPath, "utf8");
  const report = convertMusicXmlToVsqxWithReport(sourceXml, {
    musicXml: { defaultLyric },
  });
  assert(report.vsqx != null, "VSQX conversion failed.");

  const roundtripXml = convertVsqxToMusicXml(report.vsqx, { defaultLyric });
  const graceCount = (roundtripXml.match(/<grace(\s|>|\/)/g) ?? []).length;
  assert(graceCount >= 2, `Expected grace note preservation (>=2), got ${graceCount}`);
  const tripletCount = (
    roundtripXml.match(
      /<time-modification>\s*<actual-notes>3<\/actual-notes>\s*<normal-notes>2<\/normal-notes>\s*<\/time-modification>/g,
    ) ?? []
  ).length;
  assert(tripletCount >= 1, "Expected triplet time-modification (3:2) in roundtrip MusicXML.");

  const sourceProject = getMusicXmlAdapter().parse(sourceXml, { defaultLyric });
  const roundtripProject = getMusicXmlAdapter().parse(roundtripXml, { defaultLyric });
  const diff = multisetDiffCount(flattenNotes(sourceProject, defaultLyric), flattenNotes(roundtripProject, defaultLyric));
  assert(
    diff.missing === 0 && diff.extra === 0,
    `Expected sounding-note multiset stable. missing=${diff.missing}, extra=${diff.extra}`,
  );

  console.log(
    `MusicXML grace+tuplet regression validation OK: graceCount=${graceCount} tripletTimeMods=${tripletCount}`,
  );
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`MusicXML grace+tuplet regression validation failed: ${message}`);
  process.exit(1);
});
