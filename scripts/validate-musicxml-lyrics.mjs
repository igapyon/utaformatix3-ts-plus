#!/usr/bin/env node
import { generateMusicXmlFromProject } from "../src/musicxml/ProjectToMusicXml.ts";

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

const project = {
  format: "vsqx",
  inputFiles: [],
  name: "lyrics-syllabic-smoke",
  tracks: [
    {
      id: 0,
      name: "Track 1",
      notes: [
        { id: 1, key: 60, tickOn: 0, tickOff: 480, lyric: "la-" },
        { id: 2, key: 62, tickOn: 480, tickOff: 960, lyric: "-ri-" },
        { id: 3, key: 64, tickOn: 960, tickOff: 1440, lyric: "-a" },
        { id: 4, key: 65, tickOn: 1440, tickOff: 1920, lyric: "あ" },
      ],
    },
  ],
  timeSignatures: [{ measurePosition: 0, numerator: 4, denominator: 4 }],
  tempos: [{ tickPosition: 0, bpm: 120 }],
  ppq: 480,
  measurePrefix: 0,
  importWarnings: [],
  japaneseLyricsType: "RomajiCv",
};

try {
  const romajiXml = generateMusicXmlFromProject(project);
  const beginCount = (romajiXml.match(/<syllabic>begin<\/syllabic>/g) ?? []).length;
  const middleCount = (romajiXml.match(/<syllabic>middle<\/syllabic>/g) ?? []).length;
  const endCount = (romajiXml.match(/<syllabic>end<\/syllabic>/g) ?? []).length;
  const singleCount = (romajiXml.match(/<syllabic>single<\/syllabic>/g) ?? []).length;

  assert(beginCount >= 1, `Expected at least one begin syllabic, got ${beginCount}`);
  assert(middleCount >= 1, `Expected at least one middle syllabic, got ${middleCount}`);
  assert(endCount >= 1, `Expected at least one end syllabic, got ${endCount}`);
  assert(singleCount >= 1, `Expected at least one single syllabic, got ${singleCount}`);
  assert(!romajiXml.includes("<text>la-</text>"), "Expected trailing hyphen to be removed from lyric text");
  assert(!romajiXml.includes("<text>-ri-</text>"), "Expected surrounding hyphens to be removed from lyric text");
  assert(!romajiXml.includes("<text>-a</text>"), "Expected leading hyphen to be removed from lyric text");

  const kanaXml = generateMusicXmlFromProject({
    ...project,
    japaneseLyricsType: "KanaCv",
    tracks: [
      {
        id: 0,
        name: "Track 1",
        notes: [{ id: 11, key: 60, tickOn: 0, tickOff: 480, lyric: "あ-" }],
      },
    ],
  });
  assert(kanaXml.includes("<syllabic>single</syllabic>"), "Expected Kana lyrics to remain single syllabic");
  assert(kanaXml.includes("<text>あ-</text>"), "Expected Kana lyric text to preserve hyphen");

  console.log("Lyrics validation OK");
  console.log(`begin=${beginCount}, middle=${middleCount}, end=${endCount}, single=${singleCount}`);
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Lyrics validation failed: ${message}`);
  process.exit(2);
}
