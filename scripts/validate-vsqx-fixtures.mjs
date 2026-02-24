#!/usr/bin/env node
import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { parseVsqx, parseMusicXml } from '../upstream/utaformatix3-ts/dist-lib/utaformatix3-ts.esm.js';
import { generateMusicXmlFromProject } from '../src/musicxml/ProjectToMusicXml.ts';

function usage() {
  console.error('Usage: node scripts/validate-vsqx-fixtures.mjs [fixturesRoot] [defaultLyric]');
}

async function collectFixtureInputs(fixturesRoot) {
  const entries = await readdir(fixturesRoot, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => resolve(fixturesRoot, entry.name, 'input.vsqx'))
    .sort();
}

async function validateOne(inputPath, defaultLyric) {
  const inputText = await readFile(inputPath, 'utf8');
  const sourceProject = parseVsqx(inputText, { defaultLyric });
  const musicXml = generateMusicXmlFromProject(sourceProject);
  const parsedProject = parseMusicXml(musicXml, { defaultLyric });

  const sourceNoteCount = sourceProject.tracks.reduce((sum, t) => sum + t.notes.length, 0);
  const parsedNoteCount = parsedProject.tracks.reduce((sum, t) => sum + t.notes.length, 0);
  const sourceTempoCount = sourceProject.tempos.length;
  const parsedTempoCount = parsedProject.tempos.length;
  const sourceTimeSigCount = sourceProject.timeSignatures.length;
  const parsedTimeSigCount = parsedProject.timeSignatures.length;

  return {
    inputPath,
    tracks: [sourceProject.tracks.length, parsedProject.tracks.length],
    notes: [sourceNoteCount, parsedNoteCount],
    tempos: [sourceTempoCount, parsedTempoCount],
    timeSignatures: [sourceTimeSigCount, parsedTimeSigCount],
  };
}

const [, , fixturesRootArg, defaultLyricArg] = process.argv;
if (fixturesRootArg === '--help' || fixturesRootArg === '-h') {
  usage();
  process.exit(0);
}

const fixturesRoot = resolve(
  fixturesRootArg ?? 'upstream/utaformatix3-ts/tests/fixtures/vsqx',
);
const defaultLyric = defaultLyricArg ?? 'あ';

try {
  const inputs = await collectFixtureInputs(fixturesRoot);
  if (inputs.length === 0) {
    throw new Error(`No fixture directories found under: ${fixturesRoot}`);
  }

  let failCount = 0;
  for (const inputPath of inputs) {
    try {
      const result = await validateOne(inputPath, defaultLyric);
      console.log(`OK: ${result.inputPath}`);
      console.log(`  Tracks: ${result.tracks[0]} -> ${result.tracks[1]}`);
      console.log(`  Notes: ${result.notes[0]} -> ${result.notes[1]}`);
      console.log(`  Tempos: ${result.tempos[0]} -> ${result.tempos[1]}`);
      console.log(
        `  TimeSignatures: ${result.timeSignatures[0]} -> ${result.timeSignatures[1]}`,
      );
    } catch (error) {
      failCount += 1;
      const message = error instanceof Error ? error.message : String(error);
      console.error(`NG: ${inputPath}`);
      console.error(`  ${message}`);
    }
  }

  if (failCount > 0) {
    console.error(`Validation failed for ${failCount} fixture(s).`);
    process.exit(2);
  }
  console.log(`Validation completed. ${inputs.length} fixture(s) passed.`);
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Validation setup failed: ${message}`);
  process.exit(1);
}
