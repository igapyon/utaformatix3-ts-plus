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

function normalizeMeasureNotes(project, measureIndex1Based, defaultLyric) {
  const measureStart = (measureIndex1Based - 1) * 1920;
  const measureEnd = measureStart + 1920;
  return project.tracks
    .flatMap((track) =>
      track.notes
        .filter((note) => note.tickOn >= measureStart && note.tickOn < measureEnd)
        .map((note) => ({
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

function toCountMap(notes) {
  const counts = new Map();
  for (const note of notes) {
    const key = `${note.tickOn}\t${note.tickOff}\t${note.key}\t${note.lyric}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

function diffCounts(expectedNotes, actualNotes) {
  const expected = toCountMap(expectedNotes);
  const actual = toCountMap(actualNotes);
  let missing = 0;
  let extra = 0;
  for (const [key, value] of expected.entries()) {
    const delta = value - (actual.get(key) ?? 0);
    if (delta > 0) missing += delta;
  }
  for (const [key, value] of actual.entries()) {
    const delta = value - (expected.get(key) ?? 0);
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
  const measureIndex = 5;

  const sourceXml = await readFile(inputPath, "utf8");
  const sourceProject = getMusicXmlAdapter().parse(sourceXml, { defaultLyric });
  const vsqx = convertMusicXmlToVsqx(sourceXml, { musicXml: { defaultLyric } });
  const roundtripXml = convertVsqxToMusicXml(vsqx, { defaultLyric });
  const roundtripProject = getMusicXmlAdapter().parse(roundtripXml, { defaultLyric });

  const sourceNotes = normalizeMeasureNotes(sourceProject, measureIndex, defaultLyric);
  const roundtripNotes = normalizeMeasureNotes(roundtripProject, measureIndex, defaultLyric);
  const diff = diffCounts(sourceNotes, roundtripNotes);

  assert(sourceNotes.length > 0, "Fixture has no notes in measure 5.");
  assert(
    diff.missing === 0 && diff.extra === 0,
    `Measure 5 notes changed after roundtrip: missing=${diff.missing}, extra=${diff.extra}`,
  );

  console.log(
    `MusicXML measure-5 two-parts regression validation OK: measure5Notes=${sourceNotes.length}, tracks=${sourceProject.tracks.length}->${roundtripProject.tracks.length}`,
  );
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`MusicXML measure-5 two-parts regression validation failed: ${message}`);
  process.exit(1);
});

