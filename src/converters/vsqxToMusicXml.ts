import { parseVsqx } from "../../upstream/utaformatix3-ts/dist-lib/utaformatix3-ts.esm.js";
import type { ImportWarning } from "../../upstream/utaformatix3-ts/src/core/model/ImportWarning";
import type { Note } from "../../upstream/utaformatix3-ts/src/core/model/Note";
import type { Project } from "../../upstream/utaformatix3-ts/src/core/model/Project";
import type { TimeSignature } from "../../upstream/utaformatix3-ts/src/core/model/TimeSignature";
import { getMusicXmlAdapter } from "../musicxml/index.ts";
import type { MusicXmlWriteOptions } from "../musicxml/index.ts";
import { estimateMeasureKeyFifthsSequence, estimateTrackKeyFifths } from "../musicxml/KeyFifthsEstimator.ts";

export type VsqxToMusicXmlOptions = {
  defaultLyric?: string;
  musicXml?: MusicXmlWriteOptions;
};

export type VsqxToMusicXmlIssueLevel = "warning" | "error";
export type VsqxToMusicXmlIssueCode =
  | "VSQX_PARSE_FAILED"
  | "MUSICXML_WRITE_FAILED"
  | "VSQX_IMPORT_WARNING"
  | "PROJECT_HAS_NO_TRACKS"
  | "TRACK_HAS_NO_NOTES"
  | "PROJECT_HAS_NO_TEMPOS"
  | "PROJECT_HAS_NO_TIMESIGNATURES";

export type VsqxToMusicXmlIssue = {
  level: VsqxToMusicXmlIssueLevel;
  code: VsqxToMusicXmlIssueCode;
  message: string;
};

export type VsqxToMusicXmlReport = {
  musicXml: string | null;
  issues: VsqxToMusicXmlIssue[];
};

type MeasureBoundary = {
  index: number;
  startTick: number;
  lengthTick: number;
};

function ticksPerMeasure(ppq: number, ts: TimeSignature): number {
  return Math.round((ppq * 4 * ts.numerator) / ts.denominator);
}

function sortTimeSignatures(project: Project): TimeSignature[] {
  const sorted = [...project.timeSignatures]
    .filter((ts) => ts.numerator > 0 && ts.denominator > 0)
    .sort((a, b) => a.measurePosition - b.measurePosition);
  if (sorted.length === 0 || sorted[0].measurePosition !== 0) {
    sorted.unshift({ measurePosition: 0, numerator: 4, denominator: 4 });
  }
  return sorted;
}

function getMeasureTimeSignature(index: number, list: TimeSignature[]): TimeSignature {
  let active = list[0];
  for (const ts of list) {
    if (ts.measurePosition <= index) active = ts;
    else break;
  }
  return active;
}

function buildMeasures(project: Project, maxTick: number): MeasureBoundary[] {
  const ppq = project.ppq > 0 ? project.ppq : 480;
  const tsList = sortTimeSignatures(project);
  const measures: MeasureBoundary[] = [];
  let startTick = 0;
  let index = 0;
  const hardLimit = 10000;
  while (startTick <= maxTick && index < hardLimit) {
    const ts = getMeasureTimeSignature(index, tsList);
    const lengthTick = Math.max(1, ticksPerMeasure(ppq, ts));
    measures.push({ index, startTick, lengthTick });
    startTick += lengthTick;
    index += 1;
  }
  if (measures.length === 0) {
    measures.push({ index: 0, startTick: 0, lengthTick: Math.max(1, ticksPerMeasure(ppq, tsList[0])) });
  }
  return measures;
}

function estimateTrackKeyFifthsByMeasure(trackNotes: Note[], measures: MeasureBoundary[], trackFifths: number): number[] {
  return estimateMeasureKeyFifthsSequence(trackNotes, measures, trackFifths);
}

function enrichProjectWithEstimatedMusicXmlKeyFifths(project: Project): Project {
  const maxNoteTick = Math.max(0, ...project.tracks.flatMap((track) => track.notes.map((note) => note.tickOff)));
  const measures = buildMeasures(project, maxNoteTick);
  const keyFifthsByTrack = project.tracks.map((track) => estimateTrackKeyFifths(track.notes));
  const keyFifthsByMeasure = project.tracks.map((track, index) =>
    estimateTrackKeyFifthsByMeasure(track.notes, measures, keyFifthsByTrack[index] ?? 0),
  );
  const extrasBase = project.extras && typeof project.extras === "object" ? project.extras : {};
  const extrasRecord = extrasBase as Record<string, unknown>;
  const musicxmlBase =
    extrasRecord.musicxml && typeof extrasRecord.musicxml === "object"
      ? (extrasRecord.musicxml as Record<string, unknown>)
      : {};
  return {
    ...project,
    extras: {
      ...extrasRecord,
      musicxml: {
        ...musicxmlBase,
        keyFifthsByTrack,
        keyFifthsByMeasure,
        keyFifthsSource: "estimated-from-vsqx-notes",
      },
    },
  };
}

function collectProjectWarnings(project: Project): VsqxToMusicXmlIssue[] {
  const issues: VsqxToMusicXmlIssue[] = [];
  for (const warning of project.importWarnings ?? []) {
    issues.push({
      level: "warning",
      code: "VSQX_IMPORT_WARNING",
      message: formatImportWarningMessage(warning),
    });
  }
  if (project.tracks.length === 0) {
    issues.push({
      level: "warning",
      code: "PROJECT_HAS_NO_TRACKS",
      message: "Project has no tracks. A fallback empty part will be generated.",
    });
  }
  for (const [index, track] of project.tracks.entries()) {
    if (track.notes.length === 0) {
      issues.push({
        level: "warning",
        code: "TRACK_HAS_NO_NOTES",
        message: `Track[${index}] has no notes.`,
      });
    }
  }
  if (project.tempos.length === 0) {
    issues.push({
      level: "warning",
      code: "PROJECT_HAS_NO_TEMPOS",
      message: "Project has no tempos. A default tempo stream may be assumed by downstream tools.",
    });
  }
  if (project.timeSignatures.length === 0) {
    issues.push({
      level: "warning",
      code: "PROJECT_HAS_NO_TIMESIGNATURES",
      message: "Project has no time signatures. 4/4 fallback will be used.",
    });
  }
  return issues;
}

function formatImportWarningMessage(warning: ImportWarning): string {
  switch (warning.kind) {
    case "TempoNotFound":
      return "Tempo not found in VSQX. Default tempo was applied by parser.";
    case "TempoIgnoredInFile":
      return `Tempo in file '${warning.fileName}' was ignored: tick=${warning.tempo.tickPosition}, bpm=${warning.tempo.bpm}`;
    case "TempoIgnoredInTrack":
      return `Tempo in track '${warning.track.name}' was ignored: tick=${warning.tempo.tickPosition}, bpm=${warning.tempo.bpm}`;
    case "TempoIgnoredInPreMeasure":
      return `Tempo in pre-measure was ignored: tick=${warning.tempo.tickPosition}, bpm=${warning.tempo.bpm}`;
    case "DefaultTempoFixed":
      return `Invalid default tempo was fixed by parser: originalBpm=${warning.originalBpm}`;
    case "TimeSignatureNotFound":
      return "Time signature not found in VSQX. Default 4/4 was applied by parser.";
    case "TimeSignatureIgnoredInTrack":
      return `Time signature in track '${warning.track.name}' was ignored: measure=${warning.timeSignature.measurePosition}, ${warning.timeSignature.numerator}/${warning.timeSignature.denominator}`;
    case "TimeSignatureIgnoredInPreMeasure":
      return `Time signature in pre-measure was ignored: measure=${warning.timeSignature.measurePosition}, ${warning.timeSignature.numerator}/${warning.timeSignature.denominator}`;
    case "IncompatibleFormatSerializationVersion":
      return `Incompatible serialization version: data=${warning.dataVersion}, expected=${warning.currentVersion}`;
    default:
      return `VSQX import warning: ${(warning as { kind?: string }).kind ?? "Unknown"}`;
  }
}

export function convertVsqxToMusicXmlWithReport(vsqxText: string, options?: VsqxToMusicXmlOptions): VsqxToMusicXmlReport {
  const issues: VsqxToMusicXmlIssue[] = [];
  let parsed: Project;
  try {
    parsed = parseVsqx(vsqxText, {
      defaultLyric: options?.defaultLyric ?? "あ",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    issues.push({
      level: "error",
      code: "VSQX_PARSE_FAILED",
      message,
    });
    return { musicXml: null, issues };
  }

  issues.push(...collectProjectWarnings(parsed));
  const project = enrichProjectWithEstimatedMusicXmlKeyFifths(parsed);
  try {
    const musicXml = getMusicXmlAdapter().write(project, options?.musicXml);
    return { musicXml, issues };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    issues.push({
      level: "error",
      code: "MUSICXML_WRITE_FAILED",
      message,
    });
    return { musicXml: null, issues };
  }
}

export function convertVsqxToMusicXml(vsqxText: string, options?: VsqxToMusicXmlOptions): string {
  const report = convertVsqxToMusicXmlWithReport(vsqxText, options);
  if (report.musicXml != null) return report.musicXml;
  const firstError = report.issues.find((issue) => issue.level === "error");
  throw new Error(firstError?.message ?? "VSQX to MusicXML conversion failed.");
}
