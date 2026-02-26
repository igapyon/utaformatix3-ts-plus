#!/usr/bin/env node
import { convertMusicXmlToVsqxWithReport } from "../src/converters/musicXmlToVsqx.ts";
import { convertVsqxToMusicXml } from "../src/converters/vsqxToMusicXml.ts";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const sourceXml = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>Track 1</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes><divisions>480</divisions><time><beats>4</beats><beat-type>4</beat-type></time></attributes>
      <note>
        <grace slash="yes"/>
        <pitch><step>D</step><octave>5</octave></pitch>
        <voice>1</voice>
        <type>16th</type>
      </note>
      <note>
        <pitch><step>E</step><octave>5</octave></pitch>
        <duration>480</duration>
        <voice>1</voice>
        <type>quarter</type>
        <notations><ornaments><trill-mark/></ornaments></notations>
      </note>
    </measure>
  </part>
</score-partwise>`;

try {
  const previousBuffer = globalThis.Buffer;
  // Simulate browser runtime where Node Buffer is unavailable.
  // eslint-disable-next-line no-global-assign
  globalThis.Buffer = undefined;
  try {
    const report = convertMusicXmlToVsqxWithReport(sourceXml, { musicXml: { defaultLyric: "ら" } });
    assert(typeof report.vsqx === "string" && report.vsqx.length > 0, "Expected VSQX output in bufferless runtime.");
    assert(
      /utaformatix3-ts-plus:preservedNotations=/.test(report.vsqx),
      "Expected preservedNotations hint to be encoded without Buffer.",
    );

    const roundtripXml = convertVsqxToMusicXml(report.vsqx, { defaultLyric: "ら" });
    assert((roundtripXml.match(/<grace(\s|>|\/)/g) ?? []).length >= 1, "Expected grace to survive decode without Buffer.");
    assert(
      (roundtripXml.match(/<trill-mark(\s|>|\/)/g) ?? []).length >= 1,
      "Expected trill-mark to survive decode without Buffer.",
    );
  } finally {
    // eslint-disable-next-line no-global-assign
    globalThis.Buffer = previousBuffer;
  }

  console.log("Base64 bufferless runtime validation OK");
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Base64 bufferless runtime validation failed: ${message}`);
  process.exit(2);
}

