#!/usr/bin/env node
import { convertVsqxToMusicXmlWithReport } from "../src/converters/vsqxToMusicXml.ts";

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

try {
  const invalid = "<not-vsqx/>";
  const invalidReport = convertVsqxToMusicXmlWithReport(invalid);
  assert(invalidReport.musicXml === null, "Expected null musicXml for invalid VSQX");
  assert(
    invalidReport.issues.some((issue) => issue.code === "VSQX_PARSE_FAILED" && issue.level === "error"),
    `Expected VSQX_PARSE_FAILED error, got ${JSON.stringify(invalidReport.issues)}`,
  );

  const minimalNoNotes = `<?xml version="1.0" encoding="UTF-8"?>
<vsq3 xmlns="http://www.yamaha.co.jp/vocaloid/schema/vsq3/">
  <vender><![CDATA[Yamaha corporation]]></vender>
  <version><![CDATA[3.0.0.0]]></version>
  <vVoiceTable><vVoice><vBS>0</vBS><vPC>0</vPC><compID><![CDATA[TEST]]></compID><vVoiceName><![CDATA[Test]]></vVoiceName><vVoiceParam><bre>0</bre><bri>0</bri><cle>0</cle><gen>0</gen><ope>0</ope></vVoiceParam></vVoice></vVoiceTable>
  <mixer><masterUnit><outDev>0</outDev><retLevel>0</retLevel><vol>0</vol></masterUnit><vsUnit><vsTrackNo>0</vsTrackNo><inGain>0</inGain><sendLevel>-898</sendLevel><sendEnable>0</sendEnable><mute>0</mute><solo>0</solo><pan>64</pan><vol>0</vol></vsUnit></mixer>
  <masterTrack><seqName><![CDATA[Test]]></seqName><comment><![CDATA[]]></comment><resolution>480</resolution><preMeasure>0</preMeasure><timeSig><posMes>0</posMes><nume>4</nume><denomi>4</denomi></timeSig><tempo><posTick>0</posTick><bpm>12000</bpm></tempo></masterTrack>
  <vsTrack><vsTrackNo>0</vsTrackNo><trackName><![CDATA[Track 1]]></trackName><comment><![CDATA[]]></comment><musicalPart><posTick>0</posTick><playTime>480</playTime><partName><![CDATA[Part 1]]></partName><comment><![CDATA[]]></comment><stylePlugin><stylePluginID><![CDATA[ACA9C502-A04B-42b5-B2EB-5CEA36D16FCE]]></stylePluginID><stylePluginName><![CDATA[VOCALOID2 Compatible Style]]></stylePluginName><version><![CDATA[3.0.0.1]]></version></stylePlugin><partStyle><attr id="accent">50</attr></partStyle><singer><posTick>0</posTick><vBS>0</vBS><vPC>0</vPC></singer></musicalPart></vsTrack>
</vsq3>`;

  const warningReport = convertVsqxToMusicXmlWithReport(minimalNoNotes);
  assert(typeof warningReport.musicXml === "string" && warningReport.musicXml.length > 0, "Expected MusicXML output");
  assert(
    warningReport.issues.some((issue) => issue.code === "TRACK_HAS_NO_NOTES"),
    `Expected TRACK_HAS_NO_NOTES warning, got ${JSON.stringify(warningReport.issues)}`,
  );

  const minimalNoTempoNoTimesig = `<?xml version="1.0" encoding="UTF-8"?>
<vsq3 xmlns="http://www.yamaha.co.jp/vocaloid/schema/vsq3/">
  <vender><![CDATA[Yamaha corporation]]></vender>
  <version><![CDATA[3.0.0.0]]></version>
  <vVoiceTable><vVoice><vBS>0</vBS><vPC>0</vPC><compID><![CDATA[TEST]]></compID><vVoiceName><![CDATA[Test]]></vVoiceName><vVoiceParam><bre>0</bre><bri>0</bri><cle>0</cle><gen>0</gen><ope>0</ope></vVoiceParam></vVoice></vVoiceTable>
  <mixer><masterUnit><outDev>0</outDev><retLevel>0</retLevel><vol>0</vol></masterUnit><vsUnit><vsTrackNo>0</vsTrackNo><inGain>0</inGain><sendLevel>-898</sendLevel><sendEnable>0</sendEnable><mute>0</mute><solo>0</solo><pan>64</pan><vol>0</vol></vsUnit></mixer>
  <masterTrack><seqName><![CDATA[Test]]></seqName><comment><![CDATA[]]></comment><resolution>480</resolution><preMeasure>0</preMeasure></masterTrack>
  <vsTrack><vsTrackNo>0</vsTrackNo><trackName><![CDATA[Track 1]]></trackName><comment><![CDATA[]]></comment><musicalPart><posTick>0</posTick><playTime>480</playTime><partName><![CDATA[Part 1]]></partName><comment><![CDATA[]]></comment><stylePlugin><stylePluginID><![CDATA[ACA9C502-A04B-42b5-B2EB-5CEA36D16FCE]]></stylePluginID><stylePluginName><![CDATA[VOCALOID2 Compatible Style]]></stylePluginName><version><![CDATA[3.0.0.1]]></version></stylePlugin><partStyle><attr id="accent">50</attr></partStyle><singer><posTick>0</posTick><vBS>0</vBS><vPC>0</vPC></singer></musicalPart></vsTrack>
</vsq3>`;
  const parserWarningReport = convertVsqxToMusicXmlWithReport(minimalNoTempoNoTimesig);
  assert(
    parserWarningReport.issues.some((issue) => issue.code === "VSQX_IMPORT_WARNING"),
    `Expected VSQX_IMPORT_WARNING, got ${JSON.stringify(parserWarningReport.issues)}`,
  );

  console.log("VSQX error policy validation OK");
  console.log(
    `invalidIssues=${JSON.stringify(invalidReport.issues)} warningIssues=${JSON.stringify(warningReport.issues)} parserWarningIssues=${JSON.stringify(parserWarningReport.issues)}`,
  );
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`VSQX error policy validation failed: ${message}`);
  process.exit(2);
}
