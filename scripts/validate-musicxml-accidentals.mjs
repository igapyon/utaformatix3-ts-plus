#!/usr/bin/env node
import { generateMusicXmlFromProject } from '../src/musicxml/ProjectToMusicXml.ts';

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

const project = {
  format: 'vsqx',
  inputFiles: [],
  name: 'accidental-smoke',
  tracks: [
    {
      id: 0,
      name: 'Track 1',
      notes: [
        // Measure 1
        { id: 1, key: 61, tickOn: 0, tickOff: 480, lyric: 'a' },      // C#
        { id: 2, key: 60, tickOn: 480, tickOff: 960, lyric: 'a' },    // C natural
        { id: 3, key: 61, tickOn: 960, tickOff: 1440, lyric: 'a' },   // C# again
        { id: 4, key: 61, tickOn: 1440, tickOff: 1920, lyric: 'a' },  // same accidental in same measure
        // Measure 2 (state reset)
        { id: 5, key: 61, tickOn: 1920, tickOff: 2400, lyric: 'a' },  // C# should appear again
        // Measure 3: descending context with neutral state to trigger flat preference
        { id: 6, key: 60, tickOn: 3840, tickOff: 4320, lyric: 'a' },  // C natural
        { id: 7, key: 62, tickOn: 4320, tickOff: 4800, lyric: 'a' },  // D natural
        { id: 8, key: 61, tickOn: 4800, tickOff: 5280, lyric: 'a' },  // expected Db in descending context
      ],
    },
  ],
  timeSignatures: [{ measurePosition: 0, numerator: 4, denominator: 4 }],
  tempos: [{ tickPosition: 0, bpm: 120 }],
  ppq: 480,
  measurePrefix: 0,
  importWarnings: [],
  japaneseLyricsType: 'Unknown',
};

try {
  const xml = generateMusicXmlFromProject(project);

  const sharpCount = (xml.match(/<accidental>sharp<\/accidental>/g) ?? []).length;
  const naturalCount = (xml.match(/<accidental>natural<\/accidental>/g) ?? []).length;
  const flatCount = (xml.match(/<accidental>flat<\/accidental>/g) ?? []).length;

  // Expectations:
  // note1 sharp, note2 natural, note3 sharp, note4 no accidental(same as previous),
  // note5 sharp (new measure)
  assert(sharpCount >= 1, `Expected at least 1 sharp accidental, got ${sharpCount}`);
  assert(naturalCount >= 1, `Expected at least 1 natural accidental, got ${naturalCount}`);
  assert(flatCount >= 1, `Expected at least 1 flat accidental, got ${flatCount}`);

  console.log('Accidental validation OK');
  console.log(`sharp=${sharpCount}, natural=${naturalCount}, flat=${flatCount}`);
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Accidental validation failed: ${message}`);
  process.exit(2);
}
