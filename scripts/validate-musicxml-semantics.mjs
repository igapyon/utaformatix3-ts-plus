#!/usr/bin/env node
import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { parseVsqx } from "../upstream/utaformatix3-ts/dist-lib/utaformatix3-ts.esm.js";
import { convertMusicXmlToVsqx } from "../src/converters/musicXmlToVsqx.ts";
import { getMusicXmlAdapter } from "../src/musicxml/index.ts";

function usage() {
  console.error("Usage: node scripts/validate-musicxml-semantics.mjs [fixturesRoot] [defaultLyric]");
}

function normalizeLyric(value, defaultLyric) {
  return String(value && value.length > 0 ? value : defaultLyric);
}

function normalizeNotes(project, defaultLyric) {
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

function normalizeTempos(project) {
  return [...project.tempos]
    .map((tempo) => ({
      tickPosition: tempo.tickPosition,
      bpm: tempo.bpm,
    }))
    .sort((a, b) => a.tickPosition - b.tickPosition || a.bpm - b.bpm);
}

function normalizeTimeSignatures(project) {
  return [...project.timeSignatures]
    .map((ts) => ({
      measurePosition: ts.measurePosition,
      numerator: ts.numerator,
      denominator: ts.denominator,
    }))
    .sort(
      (a, b) =>
        a.measurePosition - b.measurePosition ||
        a.numerator - b.numerator ||
        a.denominator - b.denominator,
    );
}

function diffSection(label, expected, actual) {
  return JSON.stringify(expected) === JSON.stringify(actual) ? null : `${label} mismatch`;
}

async function collectFixtureInputs(fixturesRoot) {
  const entries = await readdir(fixturesRoot, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => resolve(fixturesRoot, entry.name, "input.musicxml"))
    .sort();
}

async function validateOne(inputPath, defaultLyric) {
  const inputText = await readFile(inputPath, "utf8");
  const sourceProject = getMusicXmlAdapter().parse(inputText, { defaultLyric });
  const vsqx = convertMusicXmlToVsqx(inputText, {
    musicXml: { defaultLyric },
  });
  const parsedProject = parseVsqx(vsqx, { defaultLyric });

  const failures = [];
  const noteDiff = diffSection(
    "notes",
    normalizeNotes(sourceProject, defaultLyric),
    normalizeNotes(parsedProject, defaultLyric),
  );
  if (noteDiff) failures.push(noteDiff);

  const tempoDiff = diffSection("tempos", normalizeTempos(sourceProject), normalizeTempos(parsedProject));
  if (tempoDiff) failures.push(tempoDiff);

  const timeSigDiff = diffSection(
    "timeSignatures",
    normalizeTimeSignatures(sourceProject),
    normalizeTimeSignatures(parsedProject),
  );
  if (timeSigDiff) failures.push(timeSigDiff);

  return failures;
}

const [, , fixturesRootArg, defaultLyricArg] = process.argv;
if (fixturesRootArg === "--help" || fixturesRootArg === "-h") {
  usage();
  process.exit(0);
}

const fixturesRoot = resolve(fixturesRootArg ?? "tests/fixtures/musicxml");
const defaultLyric = defaultLyricArg ?? "あ";

try {
  const inputs = await collectFixtureInputs(fixturesRoot);
  if (inputs.length === 0) {
    throw new Error(`No fixture directories found under: ${fixturesRoot}`);
  }

  let failCount = 0;
  for (const inputPath of inputs) {
    const failures = await validateOne(inputPath, defaultLyric);
    if (failures.length === 0) {
      console.log(`OK: ${inputPath}`);
      continue;
    }
    failCount += 1;
    console.error(`NG: ${inputPath}`);
    for (const failure of failures) {
      console.error(`  ${failure}`);
    }
  }

  if (failCount > 0) {
    console.error(`Semantic validation failed for ${failCount} fixture(s).`);
    process.exit(2);
  }
  console.log(`Semantic validation completed. ${inputs.length} fixture(s) passed.`);
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Semantic validation setup failed: ${message}`);
  process.exit(1);
}
