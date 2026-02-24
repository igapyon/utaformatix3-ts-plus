#!/usr/bin/env node
import { convertMusicXmlToVsqxWithReport } from "../src/converters/musicXmlToVsqx.ts";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const xmlWithOrnamentsAndArticulations = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>Track 1</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes><divisions>480</divisions><time><beats>4</beats><beat-type>4</beat-type></time></attributes>
      <note>
        <pitch><step>E</step><octave>4</octave></pitch>
        <duration>480</duration>
        <notations>
          <articulations><staccato/></articulations>
          <ornaments><trill-mark/></ornaments>
        </notations>
      </note>
    </measure>
  </part>
</score-partwise>`;

const xmlWithoutUnsupportedNotation = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>Track 1</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes><divisions>480</divisions><time><beats>4</beats><beat-type>4</beat-type></time></attributes>
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>480</duration></note>
    </measure>
  </part>
</score-partwise>`;

try {
  const reportWithUnsupported = convertMusicXmlToVsqxWithReport(xmlWithOrnamentsAndArticulations);
  assert(
    reportWithUnsupported.issues.filter((i) => i.code === "MUSICXML_UNSUPPORTED_NOTATION").length >= 2,
    `Expected unsupported notation warnings, got ${JSON.stringify(reportWithUnsupported.issues)}`,
  );
  const unsupported =
    reportWithUnsupported.retainedExtras &&
    typeof reportWithUnsupported.retainedExtras.musicxml === "object" &&
    reportWithUnsupported.retainedExtras.musicxml &&
    typeof reportWithUnsupported.retainedExtras.musicxml.unsupportedNotations === "object"
      ? reportWithUnsupported.retainedExtras.musicxml.unsupportedNotations
      : null;
  assert(unsupported != null, "Expected unsupportedNotations in retainedExtras");
  assert(unsupported.ornamentsCount >= 1, `Expected ornamentsCount >= 1, got ${JSON.stringify(unsupported)}`);
  assert(
    unsupported.articulationsCount >= 1,
    `Expected articulationsCount >= 1, got ${JSON.stringify(unsupported)}`,
  );

  const reportWithoutUnsupported = convertMusicXmlToVsqxWithReport(xmlWithoutUnsupportedNotation);
  assert(
    reportWithoutUnsupported.issues.every((i) => i.code !== "MUSICXML_UNSUPPORTED_NOTATION"),
    `Did not expect unsupported notation warnings, got ${JSON.stringify(reportWithoutUnsupported.issues)}`,
  );
  const noUnsupported =
    reportWithoutUnsupported.retainedExtras &&
    typeof reportWithoutUnsupported.retainedExtras.musicxml === "object" &&
    reportWithoutUnsupported.retainedExtras.musicxml &&
    reportWithoutUnsupported.retainedExtras.musicxml.unsupportedNotations;
  assert(noUnsupported == null, `Expected unsupportedNotations to be absent, got ${JSON.stringify(noUnsupported)}`);

  console.log("MusicXML unsupported notation extras validation OK");
  console.log(
    `withUnsupported=${JSON.stringify(unsupported)} withoutUnsupportedIssues=${JSON.stringify(reportWithoutUnsupported.issues)}`,
  );
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`MusicXML unsupported notation extras validation failed: ${message}`);
  process.exit(2);
}
