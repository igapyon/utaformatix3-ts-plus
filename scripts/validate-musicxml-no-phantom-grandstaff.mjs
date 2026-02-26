#!/usr/bin/env node
import { generateMusicXmlFromProject } from "../src/musicxml/ProjectToMusicXml.ts";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

try {
  const noLowerProject = {
    format: "vsqx",
    inputFiles: [],
    name: "no-phantom-grandstaff-no-lower",
    tracks: [
      {
        id: 0,
        name: "Track 1",
        notes: [
          { id: 0, key: 64, tickOn: 0, tickOff: 480, lyric: "a" },
          { id: 1, key: 55, tickOn: 480, tickOff: 960, lyric: "a" }, // threshold tone; still upper by hysteresis
          { id: 2, key: 67, tickOn: 960, tickOff: 1440, lyric: "a" },
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

  const noUpperProject = {
    ...noLowerProject,
    name: "no-phantom-grandstaff-no-upper",
    tracks: [
      {
        id: 0,
        name: "Track 1",
        notes: [
          { id: 0, key: 52, tickOn: 0, tickOff: 480, lyric: "a" },
          { id: 1, key: 50, tickOn: 480, tickOff: 960, lyric: "a" },
          { id: 2, key: 53, tickOn: 960, tickOff: 1440, lyric: "a" },
        ],
      },
    ],
  };

  const xmlNoLower = generateMusicXmlFromProject(noLowerProject, { preferProjectExtras: false });
  assert(
    !xmlNoLower.includes("<staves>2</staves>"),
    "Did not expect grand staff when no note is assigned to lower staff.",
  );
  assert(!xmlNoLower.includes('<clef number="2">'), "Did not expect lower-staff clef when no lower-staff note exists.");

  const xmlNoUpper = generateMusicXmlFromProject(noUpperProject, { preferProjectExtras: false });
  assert(
    !xmlNoUpper.includes("<staves>2</staves>"),
    "Did not expect grand staff when no note is assigned to upper staff.",
  );
  assert(!xmlNoUpper.includes('<clef number="2">'), "Did not expect lower-staff paired clef in single-staff output.");

  console.log("MusicXML no-phantom-grandstaff validation OK");
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`MusicXML no-phantom-grandstaff validation failed: ${message}`);
  process.exit(2);
}
