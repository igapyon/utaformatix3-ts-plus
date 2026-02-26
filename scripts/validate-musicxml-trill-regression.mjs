#!/usr/bin/env node
import { convertMusicXmlToVsqxWithReport } from "../src/converters/musicXmlToVsqx.ts";
import { convertVsqxToMusicXml } from "../src/converters/vsqxToMusicXml.ts";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const withTrill = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>Track 1</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes><divisions>480</divisions><time><beats>4</beats><beat-type>4</beat-type></time></attributes>
      <note>
        <pitch><step>E</step><octave>4</octave></pitch>
        <duration>480</duration>
        <notations>
          <ornaments><trill-mark/><wavy-line type="start" number="1"/></ornaments>
        </notations>
      </note>
      <note>
        <pitch><step>F</step><octave>4</octave></pitch>
        <duration>480</duration>
      </note>
    </measure>
  </part>
</score-partwise>`;

try {
  const report = convertMusicXmlToVsqxWithReport(withTrill);
  assert(typeof report.vsqx === "string" && report.vsqx.length > 0, "Expected VSQX output");
  assert(
    report.issues.every((issue) => !issue.message.toLowerCase().includes("ornament")),
    `Did not expect ornament unsupported warning, got ${JSON.stringify(report.issues)}`,
  );

  const roundtripXml = convertVsqxToMusicXml(report.vsqx, { defaultLyric: "ら" });
  const trillCount = (roundtripXml.match(/<trill-mark(\s|>|\/)/g) ?? []).length;
  assert(trillCount >= 1, `Expected trill-mark preservation, got ${trillCount}`);

  console.log(`MusicXML trill regression validation OK: trillCount=${trillCount}`);
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`MusicXML trill regression validation failed: ${message}`);
  process.exit(2);
}

