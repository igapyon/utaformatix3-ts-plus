#!/usr/bin/env node
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseVsqx } from '../upstream/utaformatix3-ts/dist-lib/utaformatix3-ts.esm.js';
import { generateMusicXmlFromProject } from '../src/musicxml/ProjectToMusicXml.ts';

function usage() {
  console.error(
    'Usage: node scripts/validate-vsqx-golden.mjs <mode> [fixturesRoot] [goldenRoot] [defaultLyric]',
  );
  console.error('  mode: check | update');
}

async function collectFixtureDirs(fixturesRoot) {
  const entries = await readdir(fixturesRoot, { withFileTypes: true });
  return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
}

function firstDiffIndex(a, b) {
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i += 1) {
    if (a[i] !== b[i]) return i;
  }
  return a.length === b.length ? -1 : len;
}

const [, , modeArg, fixturesRootArg, goldenRootArg, defaultLyricArg] = process.argv;
if (!modeArg || modeArg === '--help' || modeArg === '-h') {
  usage();
  process.exit(modeArg ? 0 : 1);
}
if (modeArg !== 'check' && modeArg !== 'update') {
  usage();
  process.exit(1);
}

const fixturesRoot = resolve(fixturesRootArg ?? 'upstream/utaformatix3-ts/tests/fixtures/vsqx');
const goldenRoot = resolve(goldenRootArg ?? 'tests/golden/vsqx');
const defaultLyric = defaultLyricArg ?? 'あ';

try {
  const fixtureNames = await collectFixtureDirs(fixturesRoot);
  if (fixtureNames.length === 0) {
    throw new Error(`No fixture directories found under: ${fixturesRoot}`);
  }

  await mkdir(goldenRoot, { recursive: true });

  let failCount = 0;
  for (const name of fixtureNames) {
    const inputPath = resolve(fixturesRoot, name, 'input.vsqx');
    const goldenPath = resolve(goldenRoot, `${name}.musicxml`);
    const inputText = await readFile(inputPath, 'utf8');
    const sourceProject = parseVsqx(inputText, { defaultLyric });
    const generatedXml = generateMusicXmlFromProject(sourceProject);

    if (modeArg === 'update') {
      await writeFile(goldenPath, generatedXml, 'utf8');
      console.log(`UPDATED: ${name}`);
      continue;
    }

    if (!existsSync(goldenPath)) {
      failCount += 1;
      console.error(`MISSING: ${name} (${goldenPath})`);
      continue;
    }

    const goldenXml = await readFile(goldenPath, 'utf8');
    if (generatedXml !== goldenXml) {
      failCount += 1;
      const idx = firstDiffIndex(generatedXml, goldenXml);
      console.error(`DIFF: ${name} (firstDiffIndex=${idx})`);
      continue;
    }
    console.log(`OK: ${name}`);
  }

  if (modeArg === 'check' && failCount > 0) {
    console.error(`Golden check failed for ${failCount} fixture(s).`);
    process.exit(2);
  }
  console.log(`Golden ${modeArg} completed for ${fixtureNames.length} fixture(s).`);
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Golden ${modeArg} failed: ${message}`);
  process.exit(1);
}
