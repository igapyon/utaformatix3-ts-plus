#!/usr/bin/env node
import { generateMusicXmlFromProject } from "../src/musicxml/ProjectToMusicXml.ts";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function extractMeasureBodies(partXml) {
  return [...partXml.matchAll(/<measure number="(\d+)">([\s\S]*?)<\/measure>/g)].map((m) => ({
    number: Number(m[1]),
    body: m[2],
  }));
}

function firstPitchedStaff(measureBody) {
  const noteMatches = [...measureBody.matchAll(/<note>([\s\S]*?)<\/note>/g)].map((m) => m[1]);
  for (const note of noteMatches) {
    if (note.includes("<rest/>")) continue;
    const sm = note.match(/<staff>(\d+)<\/staff>/);
    if (sm) return Number(sm[1]);
  }
  return null;
}

try {
  const project = {
    format: "vsqx",
    inputFiles: [],
    name: "grandstaff-hysteresis-smoke",
    tracks: [
      {
        id: 0,
        name: "Track 1",
        notes: [
          { id: 1, key: 64, tickOn: 0, tickOff: 480, lyric: "a" }, // upper
          { id: 2, key: 58, tickOn: 1920, tickOff: 2400, lyric: "a" }, // keep upper (>= A3)
          { id: 3, key: 56, tickOn: 3840, tickOff: 4320, lyric: "a" }, // drop to lower
          { id: 4, key: 61, tickOn: 5760, tickOff: 6240, lyric: "a" }, // keep lower (<= D4)
          { id: 5, key: 63, tickOn: 7680, tickOff: 8160, lyric: "a" }, // back to upper
        ],
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

  const xml = generateMusicXmlFromProject(project, { preferProjectExtras: false });
  assert(xml.includes("<staves>2</staves>"), "Expected grand staff attributes (<staves>2</staves>).");
  assert(xml.includes('<clef number="1">') && xml.includes('<clef number="2">'), "Expected dual clef output.");

  const partMatch = xml.match(/<part id="P1">([\s\S]*?)<\/part>/);
  assert(partMatch, "Part P1 not found.");
  const measures = extractMeasureBodies(partMatch[1]);
  const actual = measures.slice(0, 5).map((m) => firstPitchedStaff(m.body));
  const expected = [1, 1, 2, 2, 1];
  assert(
    JSON.stringify(actual) === JSON.stringify(expected),
    `Expected hysteresis staff flow ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
  );

  console.log("MusicXML grand staff hysteresis validation OK");
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`MusicXML grand staff hysteresis validation failed: ${message}`);
  process.exit(2);
}
