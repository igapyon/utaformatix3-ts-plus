import { writeVsqx } from "../../upstream/utaformatix3-ts/dist-lib/utaformatix3-ts.esm.js";
import type { Project } from "../../upstream/utaformatix3-ts/src/core/model/Project";
import type { Tempo } from "../../upstream/utaformatix3-ts/src/core/model/Tempo";
import type { TimeSignature } from "../../upstream/utaformatix3-ts/src/core/model/TimeSignature";
import type { Track } from "../../upstream/utaformatix3-ts/src/core/model/Track";
import { getMusicXmlAdapter } from "../musicxml/index.ts";
import type { MusicXmlParseOptions } from "../musicxml/index.ts";

export type MusicXmlToVsqxOptions = {
  musicXml?: MusicXmlParseOptions;
};

export type MusicXmlToVsqxIssueLevel = "warning" | "error";
export type MusicXmlToVsqxIssueCode =
  | "MUSICXML_PARSE_FAILED"
  | "VSQX_WRITE_FAILED"
  | "MUSICXML_IMPORT_WARNING"
  | "MUSICXML_UNSUPPORTED_NOTATION"
  | "PROJECT_HAS_NO_TRACKS"
  | "TRACK_HAS_NO_NOTES"
  | "PROJECT_HAS_NO_TEMPOS"
  | "PROJECT_HAS_NO_TIMESIGNATURES";

export type MusicXmlToVsqxIssue = {
  level: MusicXmlToVsqxIssueLevel;
  code: MusicXmlToVsqxIssueCode;
  message: string;
};

export type MusicXmlToVsqxReport = {
  vsqx: string | null;
  issues: MusicXmlToVsqxIssue[];
  retainedExtras?: Record<string, unknown>;
};

type StaffSplitAnalysis = {
  declaredStaves: number;
  maxObservedStaff: number;
  noteStaffByIndex: number[];
};

function extractFirstTagValue(source: string, tag: string): string | null {
  const match = source.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`));
  return match ? match[1].trim() : null;
}

function extractTagBlocks(source: string, tag: string): string[] {
  return Array.from(source.matchAll(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, "g"))).map(
    (match) => match[1],
  );
}

function parseTieType(noteBlock: string): "start" | "stop" | null {
  const tieMatch = noteBlock.match(/<tie\b[^>]*\btype="([^"]+)"/);
  const tieType = tieMatch?.[1];
  if (tieType === "start" || tieType === "stop") return tieType;
  return null;
}

function parsePositiveIntOr(value: string | null, fallback: number): number {
  const parsed = Number(value ?? "");
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : fallback;
}

function analyzePartStaffSplit(partBlock: string): StaffSplitAnalysis {
  const measureBlocks = extractTagBlocks(partBlock, "measure");
  const stavesDeclaredInPart = Array.from(partBlock.matchAll(/<staves>(\d+)<\/staves>/g)).map((m) => Number(m[1]));
  const declaredStaves = stavesDeclaredInPart.length > 0 ? Math.max(...stavesDeclaredInPart) : 1;

  const noteStaffByIndex: number[] = [];
  let maxObservedStaff = 1;
  let isInsideTieNote = false;

  for (const measureBlock of measureBlocks) {
    const noteBlocks = extractTagBlocks(measureBlock, "note");
    for (const noteBlock of noteBlocks) {
      const durationText = extractFirstTagValue(noteBlock, "duration");
      if (durationText == null) {
        if (/<grace(\s|\/|>)/.test(noteBlock)) continue;
        continue;
      }
      if (/<rest(\s|\/|>)/.test(noteBlock)) continue;

      const staffNo = parsePositiveIntOr(extractFirstTagValue(noteBlock, "staff"), 1);
      maxObservedStaff = Math.max(maxObservedStaff, staffNo);

      if (!isInsideTieNote) {
        noteStaffByIndex.push(staffNo);
      }

      const tieType = parseTieType(noteBlock);
      if (tieType === "start") {
        isInsideTieNote = true;
      } else if (tieType === "stop") {
        isInsideTieNote = false;
      }
    }
  }

  return {
    declaredStaves,
    maxObservedStaff,
    noteStaffByIndex,
  };
}

function splitTracksByPartAndStaff(project: Project, musicXmlText: string): Project {
  const partBlocks = extractTagBlocks(musicXmlText, "part");
  if (partBlocks.length === 0 || partBlocks.length !== project.tracks.length) {
    return project;
  }

  const nextTracks: Track[] = [];
  let nextTrackId = 0;
  let hasSplit = false;

  for (let partIndex = 0; partIndex < project.tracks.length; partIndex += 1) {
    const sourceTrack = project.tracks[partIndex];
    const partBlock = partBlocks[partIndex] ?? "";
    const analysis = analyzePartStaffSplit(partBlock);
    const staffCount = Math.max(1, analysis.declaredStaves, analysis.maxObservedStaff);
    if (staffCount <= 1) {
      nextTracks.push({
        ...sourceTrack,
        id: nextTrackId,
        notes: sourceTrack.notes.map((note, noteIndex) => ({ ...note, id: noteIndex })),
      });
      nextTrackId += 1;
      continue;
    }

    hasSplit = true;
    const noteBuckets = Array.from({ length: staffCount }, () => [] as typeof sourceTrack.notes);
    for (let noteIndex = 0; noteIndex < sourceTrack.notes.length; noteIndex += 1) {
      const note = sourceTrack.notes[noteIndex];
      const staffNo = parsePositiveIntOr(String(analysis.noteStaffByIndex[noteIndex] ?? 1), 1);
      const bucketIndex = Math.min(staffCount, Math.max(1, staffNo)) - 1;
      noteBuckets[bucketIndex].push(note);
    }

    for (let staffIndex = 0; staffIndex < staffCount; staffIndex += 1) {
      const bucket = noteBuckets[staffIndex];
      const staffNo = staffIndex + 1;
      nextTracks.push({
        ...sourceTrack,
        id: nextTrackId,
        name: `${sourceTrack.name} (Staff ${staffNo})`,
        notes: bucket.map((note, noteIndex) => ({ ...note, id: noteIndex })),
      });
      nextTrackId += 1;
    }
  }

  if (!hasSplit) {
    return {
      ...project,
      tracks: nextTracks,
    };
  }

  return {
    ...project,
    tracks: nextTracks,
  };
}

function formatImportWarningMessage(warning: unknown): string {
  const maybeObject = warning as { kind?: unknown; message?: unknown };
  const kind = typeof maybeObject.kind === "string" ? maybeObject.kind : "Unknown";
  const message = typeof maybeObject.message === "string" ? maybeObject.message : "";
  return message ? `MusicXML import warning (${kind}): ${message}` : `MusicXML import warning: ${kind}`;
}

function collectProjectWarnings(project: Project): MusicXmlToVsqxIssue[] {
  const issues: MusicXmlToVsqxIssue[] = [];
  for (const warning of project.importWarnings ?? []) {
    issues.push({
      level: "warning",
      code: "MUSICXML_IMPORT_WARNING",
      message: formatImportWarningMessage(warning),
    });
  }
  if (project.tracks.length === 0) {
    issues.push({
      level: "warning",
      code: "PROJECT_HAS_NO_TRACKS",
      message: "Project has no tracks. VSQX writer will emit fallback track data.",
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
      message: "Project has no tempos. VSQX writer may fall back to a default tempo.",
    });
  }
  if (project.timeSignatures.length === 0) {
    issues.push({
      level: "warning",
      code: "PROJECT_HAS_NO_TIMESIGNATURES",
      message: "Project has no time signatures. VSQX writer may fall back to 4/4.",
    });
  }
  return issues;
}

function detectUnsupportedNotationIssues(xml: string): MusicXmlToVsqxIssue[] {
  const issues: MusicXmlToVsqxIssue[] = [];
  const hasSlur = /<slur(\s|>|\/)/i.test(xml);
  const hasOrnaments = /<ornaments(\s|>|\/)/i.test(xml);
  const hasArticulations = /<articulations(\s|>|\/)/i.test(xml);
  if (hasSlur) {
    issues.push({
      level: "warning",
      code: "MUSICXML_UNSUPPORTED_NOTATION",
      message: "MusicXML slur is not preserved in VSQX conversion.",
    });
  }
  if (hasOrnaments) {
    issues.push({
      level: "warning",
      code: "MUSICXML_UNSUPPORTED_NOTATION",
      message: "MusicXML ornaments are not preserved in VSQX conversion.",
    });
  }
  if (hasArticulations) {
    issues.push({
      level: "warning",
      code: "MUSICXML_UNSUPPORTED_NOTATION",
      message: "MusicXML articulations are not preserved in VSQX conversion.",
    });
  }
  return issues;
}

function detectUnsupportedNotationSummary(xml: string): Record<string, number> | null {
  const slurCount = (xml.match(/<slur(\s|>|\/)/gi) ?? []).length;
  const ornamentsCount = (xml.match(/<ornaments(\s|>|\/)/gi) ?? []).length;
  const articulationsCount = (xml.match(/<articulations(\s|>|\/)/gi) ?? []).length;
  const total = slurCount + ornamentsCount + articulationsCount;
  if (total === 0) return null;
  return {
    slurCount,
    ornamentsCount,
    articulationsCount,
    totalUnsupportedNotationCount: total,
  };
}

function enrichProjectExtrasWithUnsupportedNotation(
  project: Project,
  summary: Record<string, number> | null,
): Project {
  if (!summary) return project;
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
        unsupportedNotations: summary,
      },
    },
  };
}

function buildFallbackTrack(): Track {
  return {
    id: 0,
    name: "Track 1",
    notes: [],
  };
}

function buildFallbackTempo(): Tempo {
  return {
    tickPosition: 0,
    bpm: 120,
  };
}

function buildFallbackTimeSignature(): TimeSignature {
  return {
    measurePosition: 0,
    numerator: 4,
    denominator: 4,
  };
}

function normalizeProjectForVsqxExport(project: Project): Project {
  const tracks = project.tracks.length > 0 ? project.tracks : [buildFallbackTrack()];
  const tempos = project.tempos.length > 0 ? project.tempos : [buildFallbackTempo()];
  const timeSignatures =
    project.timeSignatures.length > 0 ? project.timeSignatures : [buildFallbackTimeSignature()];
  return {
    ...project,
    tracks,
    tempos,
    timeSignatures,
  };
}

export function convertMusicXmlToVsqxWithReport(
  musicXmlText: string,
  options?: MusicXmlToVsqxOptions,
): MusicXmlToVsqxReport {
  const issues: MusicXmlToVsqxIssue[] = [...detectUnsupportedNotationIssues(musicXmlText)];
  const unsupportedNotationSummary = detectUnsupportedNotationSummary(musicXmlText);
  let project: Project;
  try {
    project = getMusicXmlAdapter().parse(musicXmlText, options?.musicXml);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    issues.push({
      level: "error",
      code: "MUSICXML_PARSE_FAILED",
      message,
    });
    return { vsqx: null, issues, retainedExtras: undefined };
  }

  project = splitTracksByPartAndStaff(project, musicXmlText);
  issues.push(...collectProjectWarnings(project));
  const enriched = enrichProjectExtrasWithUnsupportedNotation(project, unsupportedNotationSummary);
  const normalized = normalizeProjectForVsqxExport(enriched);
  try {
    const result = writeVsqx(normalized);
    return { vsqx: result.content, issues, retainedExtras: result.retainedExtras };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    issues.push({
      level: "error",
      code: "VSQX_WRITE_FAILED",
      message,
    });
    return { vsqx: null, issues, retainedExtras: undefined };
  }
}

export function convertMusicXmlToVsqx(musicXmlText: string, options?: MusicXmlToVsqxOptions): string {
  const report = convertMusicXmlToVsqxWithReport(musicXmlText, options);
  if (report.vsqx != null) return report.vsqx;
  const firstError = report.issues.find((issue) => issue.level === "error");
  throw new Error(firstError?.message ?? "MusicXML to VSQX conversion failed.");
}
