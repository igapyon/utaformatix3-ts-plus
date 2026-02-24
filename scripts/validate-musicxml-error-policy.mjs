#!/usr/bin/env node
import { convertMusicXmlToVsqxWithReport } from "../src/converters/musicXmlToVsqx.ts";

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

try {
  const invalid = "<score-partwise><broken></score-partwise>";
  const invalidReport = convertMusicXmlToVsqxWithReport(invalid);
  assert(invalidReport.vsqx === null, "Expected null vsqx for invalid MusicXML");
  assert(
    invalidReport.issues.some((issue) => issue.code === "MUSICXML_PARSE_FAILED" && issue.level === "error"),
    `Expected MUSICXML_PARSE_FAILED error, got ${JSON.stringify(invalidReport.issues)}`,
  );

  const noNoteMusicXml = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list>
    <score-part id="P1">
      <part-name>Track 1</part-name>
    </score-part>
  </part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>480</divisions>
        <key><fifths>0</fifths></key>
        <time><beats>4</beats><beat-type>4</beat-type></time>
        <clef><sign>G</sign><line>2</line></clef>
      </attributes>
      <direction placement="above">
        <direction-type>
          <metronome>
            <beat-unit>quarter</beat-unit>
            <per-minute>120</per-minute>
          </metronome>
        </direction-type>
        <sound tempo="120"/>
      </direction>
      <note><rest/><duration>1920</duration><type>whole</type></note>
    </measure>
  </part>
</score-partwise>`;

  const warningReport = convertMusicXmlToVsqxWithReport(noNoteMusicXml, {
    musicXml: { defaultLyric: "あ" },
  });
  assert(typeof warningReport.vsqx === "string" && warningReport.vsqx.length > 0, "Expected VSQX output");
  assert(
    warningReport.issues.some((issue) => issue.code === "TRACK_HAS_NO_NOTES"),
    `Expected TRACK_HAS_NO_NOTES warning, got ${JSON.stringify(warningReport.issues)}`,
  );

  console.log("MusicXML error policy validation OK");
  console.log(
    `invalidIssues=${JSON.stringify(invalidReport.issues)} warningIssues=${JSON.stringify(warningReport.issues)}`,
  );
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`MusicXML error policy validation failed: ${message}`);
  process.exit(2);
}
