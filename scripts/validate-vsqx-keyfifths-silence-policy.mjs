#!/usr/bin/env node
import { convertMusicXmlToVsqx } from "../src/converters/musicXmlToVsqx.ts";
import { convertVsqxToMusicXml } from "../src/converters/vsqxToMusicXml.ts";

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function buildInputMusicXml() {
  return (
    '<?xml version="1.0" encoding="UTF-8"?>' +
    '<score-partwise version="4.0">' +
    '<part-list>' +
    '<score-part id="P1"><part-name>Lead</part-name></score-part>' +
    '<score-part id="P2"><part-name>Harmony</part-name></score-part>' +
    "</part-list>" +
    '<part id="P1">' +
    '<measure number="1">' +
    "<attributes><divisions>480</divisions><key><fifths>0</fifths></key><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes>" +
    "<note><pitch><step>C</step><octave>4</octave></pitch><duration>1920</duration><voice>1</voice><type>whole</type></note>" +
    "</measure>" +
    '<measure number="2">' +
    "<note><rest/><duration>1920</duration><voice>1</voice><type>whole</type></note>" +
    "</measure>" +
    '<measure number="3">' +
    "<note><pitch><step>F</step><alter>1</alter><octave>4</octave></pitch><duration>1920</duration><voice>1</voice><type>whole</type></note>" +
    "</measure>" +
    "</part>" +
    '<part id="P2">' +
    '<measure number="1">' +
    "<attributes><divisions>480</divisions><key><fifths>0</fifths></key><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes>" +
    "<note><pitch><step>E</step><octave>4</octave></pitch><duration>1920</duration><voice>1</voice><type>whole</type></note>" +
    "</measure>" +
    '<measure number="2">' +
    "<note><rest/><duration>1920</duration><voice>1</voice><type>whole</type></note>" +
    "</measure>" +
    '<measure number="3">' +
    "<note><pitch><step>C</step><alter>1</alter><octave>4</octave></pitch><duration>1920</duration><voice>1</voice><type>whole</type></note>" +
    "</measure>" +
    "</part>" +
    "</score-partwise>"
  );
}

function extractPartMeasureBodies(xml) {
  const partMatches = [...xml.matchAll(/<part id="P\d+">([\s\S]*?)<\/part>/g)];
  return partMatches.map((partMatch) =>
    [...partMatch[1].matchAll(/<measure number="(\d+)">([\s\S]*?)<\/measure>/g)].map((m) => ({
      number: Number(m[1]),
      body: m[2],
    })),
  );
}

try {
  const sourceXml = buildInputMusicXml();
  const vsqx = convertMusicXmlToVsqx(sourceXml, { musicXml: { defaultLyric: "あ" } });
  const roundtripXml = convertVsqxToMusicXml(vsqx, { defaultLyric: "あ" });
  const parts = extractPartMeasureBodies(roundtripXml);

  assert(parts.length >= 2, `Expected at least 2 parts, got ${parts.length}`);
  const targetMeasure = 2;
  for (const [partIndex, measures] of parts.entries()) {
    const m = measures.find((it) => it.number === targetMeasure);
    assert(m, `Missing measure ${targetMeasure} in part ${partIndex + 1}`);
    assert(
      !m.body.includes("<key><fifths>"),
      `Expected no key change in all-silent measure ${targetMeasure} (part ${partIndex + 1})`,
    );
  }

  console.log("VSQX keyFifths silence policy validation OK");
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`VSQX keyFifths silence policy validation failed: ${message}`);
  process.exit(2);
}
