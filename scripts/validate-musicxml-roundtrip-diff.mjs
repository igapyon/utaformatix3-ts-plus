#!/usr/bin/env node
import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { parseMusicXml } from "../upstream/utaformatix3-ts/dist-lib/utaformatix3-ts.esm.js";
import { convertMusicXmlToVsqx } from "../src/converters/musicXmlToVsqx.ts";
import { convertVsqxToMusicXml } from "../src/converters/vsqxToMusicXml.ts";

function usage() {
  console.error("Usage: node scripts/validate-musicxml-roundtrip-diff.mjs [fixturesRoot] [defaultLyric] [mode]");
  console.error("  mode: report | check (default: report)");
}

function normalizeLyric(value, defaultLyric) {
  return String(value && value.length > 0 ? value : defaultLyric);
}

function normalizeNotes(project, defaultLyric) {
  return project.tracks.map((track, trackIndex) => ({
    trackIndex,
    notes: [...track.notes]
      .map((note) => ({
        tickOn: note.tickOn,
        tickOff: note.tickOff,
        key: note.key,
        lyric: normalizeLyric(note.lyric, defaultLyric),
      }))
      .sort(
        (a, b) =>
          a.tickOn - b.tickOn ||
          a.tickOff - b.tickOff ||
          a.key - b.key ||
          a.lyric.localeCompare(b.lyric),
      ),
  }));
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

function firstDiffIndex(a, b) {
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i += 1) {
    if (a[i] !== b[i]) return i;
  }
  return a.length === b.length ? -1 : len;
}

function summarizeSeverities(entries) {
  return entries.reduce(
    (acc, entry) => {
      acc[entry.severity] += 1;
      return acc;
    },
    { fatal: 0, important: 0, tolerable: 0 },
  );
}

function collectDiffs(sourceProject, roundtripProject, defaultLyric) {
  const failures = [];
  if (sourceProject.tracks.length !== roundtripProject.tracks.length) {
    failures.push({
      code: "TRACK_COUNT_MISMATCH",
      severity: "fatal",
      message: `trackCount: ${sourceProject.tracks.length} != ${roundtripProject.tracks.length}`,
    });
  }
  if (JSON.stringify(normalizeNotes(sourceProject, defaultLyric)) !== JSON.stringify(normalizeNotes(roundtripProject, defaultLyric))) {
    failures.push({
      code: "NOTES_MISMATCH",
      severity: "fatal",
      message: "notes mismatch",
    });
  }
  if (JSON.stringify(normalizeTempos(sourceProject)) !== JSON.stringify(normalizeTempos(roundtripProject))) {
    failures.push({
      code: "TEMPOS_MISMATCH",
      severity: "important",
      message: "tempos mismatch",
    });
  }
  if (JSON.stringify(normalizeTimeSignatures(sourceProject)) !== JSON.stringify(normalizeTimeSignatures(roundtripProject))) {
    failures.push({
      code: "TIMESIGNATURES_MISMATCH",
      severity: "important",
      message: "timeSignatures mismatch",
    });
  }
  return failures;
}

async function collectFixtureInputs(fixturesRoot) {
  const entries = await readdir(fixturesRoot, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => resolve(fixturesRoot, entry.name, "input.musicxml"))
    .sort();
}

const [, , fixturesRootArg, defaultLyricArg, modeArg] = process.argv;
if (fixturesRootArg === "--help" || fixturesRootArg === "-h") {
  usage();
  process.exit(0);
}

const fixturesRoot = resolve(fixturesRootArg ?? "tests/fixtures/musicxml");
const defaultLyric = defaultLyricArg ?? "あ";
const mode = modeArg ?? "report";
if (mode !== "report" && mode !== "check") {
  usage();
  process.exit(1);
}

try {
  const inputs = await collectFixtureInputs(fixturesRoot);
  if (inputs.length === 0) {
    throw new Error(`No fixture directories found under: ${fixturesRoot}`);
  }

  let diffCount = 0;
  let severitySummary = { fatal: 0, important: 0, tolerable: 0 };
  for (const inputPath of inputs) {
    const inputText = await readFile(inputPath, "utf8");
    const sourceProject = parseMusicXml(inputText, { defaultLyric });
    const vsqx = convertMusicXmlToVsqx(inputText, { musicXml: { defaultLyric } });
    const roundtripMusicXml = convertVsqxToMusicXml(vsqx, { defaultLyric });
    const roundtripProject = parseMusicXml(roundtripMusicXml, { defaultLyric });

    const failures = collectDiffs(sourceProject, roundtripProject, defaultLyric);
    const textDiff = firstDiffIndex(inputText, roundtripMusicXml);
    if (failures.length === 0) {
      console.log(`OK: ${inputPath} textDiffIndex=${textDiff}`);
      continue;
    }
    diffCount += 1;
    const localSummary = summarizeSeverities(failures);
    severitySummary = {
      fatal: severitySummary.fatal + localSummary.fatal,
      important: severitySummary.important + localSummary.important,
      tolerable: severitySummary.tolerable + localSummary.tolerable,
    };
    console.error(`DIFF: ${inputPath} textDiffIndex=${textDiff}`);
    for (const failure of failures) {
      console.error(`  [${failure.severity}] ${failure.code}: ${failure.message}`);
    }
  }

  if (mode === "check" && (severitySummary.fatal > 0 || severitySummary.important > 0)) {
    console.error(
      `Roundtrip check failed for ${diffCount} fixture(s). fatal=${severitySummary.fatal} important=${severitySummary.important}`,
    );
    process.exit(2);
  }
  console.log(
    `Roundtrip ${mode} completed. fixtures=${inputs.length} semanticDiffs=${diffCount} fatal=${severitySummary.fatal} important=${severitySummary.important} tolerable=${severitySummary.tolerable}`,
  );
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Roundtrip ${mode} failed: ${message}`);
  process.exit(1);
}
