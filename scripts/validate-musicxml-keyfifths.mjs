#!/usr/bin/env node
import { generateMusicXmlFromProject } from '../src/musicxml/ProjectToMusicXml.ts';

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function extractFifthsPerPart(xml) {
  const parts = [...xml.matchAll(/<part id="P\d+">([\s\S]*?)<\/part>/g)];
  return parts.map((match) => {
    const partXml = match[1];
    return [...partXml.matchAll(/<fifths>(-?\d+)<\/fifths>/g)].map((it) => Number(it[1]));
  });
}

const baseProject = {
  format: 'vsqx',
  inputFiles: [],
  name: 'keyfifths-smoke',
  tracks: [
    {
      id: 0,
      name: 'Track 1',
      notes: [
        { id: 1, key: 60, tickOn: 0, tickOff: 480, lyric: 'a' },
        { id: 3, key: 62, tickOn: 1920, tickOff: 2400, lyric: 'a' },
      ],
    },
    {
      id: 1,
      name: 'Track 2',
      notes: [
        { id: 2, key: 64, tickOn: 0, tickOff: 480, lyric: 'a' },
        { id: 4, key: 65, tickOn: 1920, tickOff: 2400, lyric: 'a' },
      ],
    },
  ],
  timeSignatures: [{ measurePosition: 0, numerator: 4, denominator: 4 }],
  tempos: [{ tickPosition: 0, bpm: 120 }],
  ppq: 480,
  measurePrefix: 0,
  importWarnings: [],
  japaneseLyricsType: 'Unknown',
  extras: {
    keyFifthsByTrack: [3, -2],
    keyFifthsByMeasure: [[3, 4], [-2, -3]],
    musicxml: {
      keyFifths: 1,
    },
  },
};

try {
  const xmlFromExtras = generateMusicXmlFromProject(baseProject);
  const fromExtras = extractFifthsPerPart(xmlFromExtras);
  assert(
    fromExtras[0][0] === 3 && fromExtras[0][1] === 4 && fromExtras[1][0] === -2 && fromExtras[1][1] === -3,
    `Expected extras per-measure [[3,4],[-2,-3]], got ${JSON.stringify(fromExtras)}`,
  );

  const xmlNoExtras = generateMusicXmlFromProject(baseProject, { preferProjectExtras: false });
  const noExtras = extractFifthsPerPart(xmlNoExtras);
  assert(
    JSON.stringify(noExtras) !== JSON.stringify(fromExtras),
    `Expected extras to be ignored, got ${JSON.stringify(noExtras)}`,
  );
  assert(
    noExtras.flat().every((it) => typeof it === 'number' && it >= -7 && it <= 7),
    `Expected estimated fifths in [-7,7], got ${JSON.stringify(noExtras)}`,
  );

  const xmlGlobal = generateMusicXmlFromProject(baseProject, { keyFifths: -5 });
  const global = extractFifthsPerPart(xmlGlobal);
  assert(
    global[0].every((it) => it === -5) && global[1].every((it) => it === -5),
    `Expected global all -5, got ${JSON.stringify(global)}`,
  );

  const xmlPerTrack = generateMusicXmlFromProject(baseProject, { keyFifths: [2, -4] });
  const perTrack = extractFifthsPerPart(xmlPerTrack);
  assert(
    perTrack[0].every((it) => it === 2) && perTrack[1].every((it) => it === -4),
    `Expected per-track [2,-4], got ${JSON.stringify(perTrack)}`,
  );

  const xmlPerMeasure = generateMusicXmlFromProject(baseProject, {
    keyFifthsByMeasure: [[1, 2], [-1, -2]],
  });
  const perMeasure = extractFifthsPerPart(xmlPerMeasure);
  assert(
    perMeasure[0][0] === 1 && perMeasure[0][1] === 2 && perMeasure[1][0] === -1 && perMeasure[1][1] === -2,
    `Expected per-measure [[1,2],[-1,-2]], got ${JSON.stringify(perMeasure)}`,
  );

  const modulationProject = {
    ...baseProject,
    extras: {},
    tracks: [
      {
        id: 0,
        name: 'Mod Track',
        notes: [
          { id: 11, key: 60, tickOn: 0, tickOff: 480, lyric: 'a' },
          { id: 12, key: 64, tickOn: 480, tickOff: 960, lyric: 'a' },
          { id: 13, key: 67, tickOn: 960, tickOff: 1440, lyric: 'a' },
          { id: 14, key: 66, tickOn: 1920, tickOff: 2400, lyric: 'a' },
          { id: 15, key: 68, tickOn: 2400, tickOff: 2880, lyric: 'a' },
          { id: 16, key: 70, tickOn: 2880, tickOff: 3360, lyric: 'a' },
        ],
      },
    ],
  };
  const xmlModulation = generateMusicXmlFromProject(modulationProject, {
    estimateKeyFifthsByMeasure: true,
    preferProjectExtras: false,
  });
  const modulation = extractFifthsPerPart(xmlModulation);
  assert(
    modulation[0].length >= 2 && modulation[0][0] !== modulation[0][1],
    `Expected measure-level modulation estimate, got ${JSON.stringify(modulation)}`,
  );

  const sparseAccidentalProject = {
    ...baseProject,
    extras: {},
    tracks: [
      {
        id: 0,
        name: 'Sparse Mod Track',
        notes: [
          { id: 101, key: 60, tickOn: 0, tickOff: 480, lyric: 'a' },
          { id: 102, key: 64, tickOn: 480, tickOff: 960, lyric: 'a' },
          { id: 103, key: 67, tickOn: 960, tickOff: 1440, lyric: 'a' },
          { id: 104, key: 66, tickOn: 1920, tickOff: 2040, lyric: 'a' },
        ],
      },
    ],
  };
  const xmlSparseAccidental = generateMusicXmlFromProject(sparseAccidentalProject, {
    estimateKeyFifthsByMeasure: true,
    preferProjectExtras: false,
  });
  const sparse = extractFifthsPerPart(xmlSparseAccidental);
  assert(
    sparse[0].length === 1 || (sparse[0].length >= 2 && sparse[0][0] === sparse[0][1]),
    `Expected sparse accidental to keep previous key, got ${JSON.stringify(sparse)}`,
  );

  console.log('KeyFifths validation OK');
  console.log(
    `extras=${JSON.stringify(fromExtras)} noExtras=${JSON.stringify(noExtras)} global=${JSON.stringify(global)} perTrack=${JSON.stringify(perTrack)} perMeasure=${JSON.stringify(perMeasure)} modulation=${JSON.stringify(modulation)} sparse=${JSON.stringify(sparse)}`,
  );
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`KeyFifths validation failed: ${message}`);
  process.exit(2);
}
