#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { parseVsqx } from '../upstream/utaformatix3-ts/dist-lib/utaformatix3-ts.esm.js';
import { generateMusicXmlFromProject } from '../src/musicxml/ProjectToMusicXml.ts';

function usage() {
  console.error('Usage: node scripts/quick-convert-vsqx-to-musicxml.mjs <input.vsqx> <output.musicxml> [defaultLyric]');
}

const [, , inputArg, outputArg, defaultLyricArg] = process.argv;
if (!inputArg || !outputArg) {
  usage();
  process.exit(1);
}

const inputPath = resolve(inputArg);
const outputPath = resolve(outputArg);
const defaultLyric = defaultLyricArg ?? 'あ';

try {
  const inputText = await readFile(inputPath, 'utf8');
  const project = parseVsqx(inputText, { defaultLyric });
  const xml = generateMusicXmlFromProject(project);
  await writeFile(outputPath, xml, 'utf8');
  console.log(`Converted: ${inputPath} -> ${outputPath}`);
  console.log(`Tracks: ${project.tracks.length}`);
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Convert failed: ${message}`);
  process.exit(2);
}
