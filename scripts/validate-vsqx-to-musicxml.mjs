#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { parseVsqx, parseMusicXml } from '../upstream/utaformatix3-ts/dist-lib/utaformatix3-ts.esm.js';
import { generateMusicXmlFromProject } from '../src/musicxml/ProjectToMusicXml.ts';

function usage() {
  console.error('Usage: node scripts/validate-vsqx-to-musicxml.mjs <input.vsqx> [defaultLyric]');
}

const [, , inputArg, defaultLyricArg] = process.argv;
if (!inputArg) {
  usage();
  process.exit(1);
}

const inputPath = resolve(inputArg);
const defaultLyric = defaultLyricArg ?? 'あ';

try {
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

  console.log(`Validation OK: ${inputPath}`);
  console.log(`Tracks: ${sourceProject.tracks.length} -> ${parsedProject.tracks.length}`);
  console.log(`Notes: ${sourceNoteCount} -> ${parsedNoteCount}`);
  console.log(`Tempos: ${sourceTempoCount} -> ${parsedTempoCount}`);
  console.log(`TimeSignatures: ${sourceTimeSigCount} -> ${parsedTimeSigCount}`);
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Validation failed: ${message}`);
  process.exit(2);
}
