#!/usr/bin/env node
import { convertMusicXmlToVsqxWithReport } from "../src/converters/musicXmlToVsqx.ts";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const withSlur = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>Track 1</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes><divisions>480</divisions><time><beats>4</beats><beat-type>4</beat-type></time></attributes>
      <note>
        <pitch><step>C</step><octave>4</octave></pitch>
        <duration>480</duration>
        <notations><slur type="start"/></notations>
      </note>
      <note>
        <pitch><step>D</step><octave>4</octave></pitch>
        <duration>480</duration>
        <notations><slur type="stop"/></notations>
      </note>
    </measure>
  </part>
</score-partwise>`;

try {
  const report = convertMusicXmlToVsqxWithReport(withSlur);
  assert(typeof report.vsqx === "string" && report.vsqx.length > 0, "Expected VSQX output");
  assert(
    report.issues.some((issue) => issue.code === "MUSICXML_UNSUPPORTED_NOTATION"),
    `Expected MUSICXML_UNSUPPORTED_NOTATION, got ${JSON.stringify(report.issues)}`,
  );
  const extras = report.retainedExtras;
  const musicxml = extras && typeof extras.musicxml === "object" ? extras.musicxml : null;
  const unsupported = musicxml && typeof musicxml.unsupportedNotations === "object" ? musicxml.unsupportedNotations : null;
  assert(unsupported != null, `Expected retained unsupportedNotations extras, got ${JSON.stringify(extras)}`);
  assert(unsupported.slurCount >= 1, `Expected slurCount >= 1, got ${JSON.stringify(unsupported)}`);
  console.log("MusicXML unsupported notation policy validation OK");
  console.log(`issues=${JSON.stringify(report.issues)} unsupported=${JSON.stringify(unsupported)}`);
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`MusicXML unsupported notation policy validation failed: ${message}`);
  process.exit(2);
}
