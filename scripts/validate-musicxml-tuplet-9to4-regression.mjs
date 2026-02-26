#!/usr/bin/env node
import { generateMusicXmlFromProject } from "../src/musicxml/ProjectToMusicXml.ts";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function buildProject() {
  const notes = Array.from({ length: 18 }, (_, i) => ({
    id: i,
    key: 69,
    lyric: "ら",
    tickOn: i * 53,
    tickOff: i * 53 + 53,
  }));

  return {
    format: "VSQX",
    inputFiles: [],
    name: "tuplet-9to4-regression",
    tracks: [
      {
        id: 0,
        name: "Track 1",
        notes,
      },
    ],
    timeSignatures: [{ measurePosition: 0, numerator: 2, denominator: 4 }],
    tempos: [{ tickPosition: 0, bpm: 120 }],
    ppq: 480,
    measurePrefix: 0,
    importWarnings: [],
    japaneseLyricsType: "Unknown",
  };
}

try {
  const xml = generateMusicXmlFromProject(buildProject());
  const measure = xml.match(/<part id="P1">[\s\S]*?<measure number="1">([\s\S]*?)<\/measure>/)?.[1] ?? "";
  const noteBlocks = Array.from(measure.matchAll(/<note>([\s\S]*?)<\/note>/g)).map((m) => m[1]);
  const pitched = noteBlocks.filter((block) => !/<rest(\s|\/|>)/.test(block));
  const timeModRegex =
    /<time-modification>\s*<actual-notes>9<\/actual-notes>\s*<normal-notes>4<\/normal-notes>\s*<\/time-modification>/;

  assert(pitched.length === 18, `Expected 18 pitched notes, got ${pitched.length}`);
  assert(
    pitched.every((block) => /<type>16th<\/type>/.test(block)),
    "Expected all 53-tick pitched notes to have <type>16th</type>.",
  );
  assert(
    pitched.every((block) => timeModRegex.test(block)),
    "Expected all 53-tick pitched notes to have time-modification 9:4.",
  );
  assert(
    pitched.every((block) => /<stem>(up|down)<\/stem>/.test(block)),
    "Expected all 53-tick pitched notes to have explicit stem.",
  );

  console.log("MusicXML tuplet 9:4 regression validation OK");
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`MusicXML tuplet 9:4 regression validation failed: ${message}`);
  process.exit(1);
}
