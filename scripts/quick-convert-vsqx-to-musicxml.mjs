#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { parseVsqx } from '../upstream/utaformatix3-ts/dist-lib/utaformatix3-ts.esm.js';
import { generateMusicXmlFromProject } from '../src/musicxml/ProjectToMusicXml.ts';

function usage() {
  console.error(
    'Usage: node scripts/quick-convert-vsqx-to-musicxml.mjs <input.vsqx> <output.musicxml> [defaultLyric] [keyFifths]',
  );
  console.error('  keyFifths: e.g. "0" or "0,-2,3" (per-track)');
}

function parseKeyFifthsArg(raw) {
  if (!raw) return undefined;
  const text = String(raw).trim();
  if (text.length === 0) return undefined;
  if (!text.includes(',')) {
    const value = Number(text);
    if (!Number.isFinite(value)) throw new Error(`Invalid keyFifths: ${raw}`);
    return Math.trunc(value);
  }
  const list = text
    .split(',')
    .map((part) => Number(part.trim()))
    .map((value) => {
      if (!Number.isFinite(value)) throw new Error(`Invalid keyFifths list: ${raw}`);
      return Math.trunc(value);
    });
  return list;
}

const [, , inputArg, outputArg, defaultLyricArg, keyFifthsArg] = process.argv;
if (!inputArg || !outputArg) {
  usage();
  process.exit(1);
}

const inputPath = resolve(inputArg);
const outputPath = resolve(outputArg);
const defaultLyric = defaultLyricArg ?? 'あ';
const keyFifths = parseKeyFifthsArg(keyFifthsArg);

try {
  const inputText = await readFile(inputPath, 'utf8');
  const project = parseVsqx(inputText, { defaultLyric });
  const xml = generateMusicXmlFromProject(project, {
    keyFifths,
  });
  await writeFile(outputPath, xml, 'utf8');
  console.log(`Converted: ${inputPath} -> ${outputPath}`);
  console.log(`Tracks: ${project.tracks.length}`);
  if (keyFifths !== undefined) {
    console.log(`keyFifths: ${Array.isArray(keyFifths) ? keyFifths.join(',') : keyFifths}`);
  }
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Convert failed: ${message}`);
  process.exit(2);
}
