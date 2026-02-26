#!/usr/bin/env node
import { generateMusicXmlFromProject } from "../src/musicxml/ProjectToMusicXml.ts";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function buildProject(key) {
  return {
    format: "vsqx",
    inputFiles: [],
    name: "clef-threshold-g3",
    tracks: [
      {
        id: 0,
        name: "Track 1",
        notes: [{ id: 0, key, tickOn: 0, tickOff: 480, lyric: "a" }],
      },
    ],
    timeSignatures: [{ measurePosition: 0, numerator: 4, denominator: 4 }],
    tempos: [{ tickPosition: 0, bpm: 120 }],
    ppq: 480,
    measurePrefix: 0,
    importWarnings: [],
    japaneseLyricsType: "Unknown",
    extras: {},
  };
}

try {
  const xmlG3 = generateMusicXmlFromProject(buildProject(55), { preferProjectExtras: false });
  assert(
    /<clef><sign>G<\/sign><line>2<\/line><\/clef>/.test(xmlG3),
    "Expected treble clef for minimum pitch G3 (key=55).",
  );

  const xmlF3 = generateMusicXmlFromProject(buildProject(53), { preferProjectExtras: false });
  assert(
    /<clef><sign>F<\/sign><line>4<\/line><\/clef>/.test(xmlF3),
    "Expected bass clef candidate below G3 threshold (key=53).",
  );

  console.log("MusicXML clef threshold (G3) validation OK");
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`MusicXML clef threshold (G3) validation failed: ${message}`);
  process.exit(2);
}

