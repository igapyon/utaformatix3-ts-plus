import { writeVsqx } from "../../upstream/utaformatix3-ts/dist-lib/utaformatix3-ts.esm.js";
import type { Project } from "../../upstream/utaformatix3-ts/src/core/model/Project";
import type { Tempo } from "../../upstream/utaformatix3-ts/src/core/model/Tempo";
import type { TimeSignature } from "../../upstream/utaformatix3-ts/src/core/model/TimeSignature";
import type { Track } from "../../upstream/utaformatix3-ts/src/core/model/Track";
import { getMusicXmlAdapter } from "../musicxml/index.ts";
import type { MusicXmlParseOptions } from "../musicxml/index.ts";
import { encodeUtf8ToBase64 } from "../utils/base64.ts";

export type MusicXmlToVsqxOptions = {
  musicXml?: MusicXmlParseOptions;
  splitPartStaves?: boolean;
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

type RawPitchedEvent = {
  key: number;
  tickOn: number;
  tickOff: number;
};

type PreservedGraceHint = {
  step: string;
  alter?: number;
  octave: number;
  slash?: boolean;
  noteType?: string;
};

type PreservedNotationHint = {
  track: number;
  tickOn: number;
  key: number;
  graceBefore?: PreservedGraceHint[];
  trill?: boolean;
};

type PreservedNotationsPayload = {
  version: 1;
  entries: PreservedNotationHint[];
};

function extractFirstMeasureActualTickFromProject(project: Project): number | undefined {
  const extras = project.extras;
  if (!extras || typeof extras !== "object") return undefined;
  const root = extras as Record<string, unknown>;
  const musicxml =
    root.musicxml && typeof root.musicxml === "object" ? (root.musicxml as Record<string, unknown>) : null;
  const value = musicxml?.firstMeasureActualTick;
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  const normalized = Math.max(1, Math.trunc(value));
  const ppq = Number.isFinite(project.ppq) && project.ppq > 0 ? Math.trunc(project.ppq) : 480;
  const activeTs = (() => {
    const sorted = [...(project.timeSignatures ?? [])]
      .filter((ts) => Number.isFinite(ts.measurePosition) && Number.isFinite(ts.numerator) && Number.isFinite(ts.denominator))
      .sort((a, b) => a.measurePosition - b.measurePosition);
    const atZero = sorted.filter((ts) => ts.measurePosition <= 0).pop();
    return atZero && atZero.numerator > 0 && atZero.denominator > 0
      ? atZero
      : { measurePosition: 0, numerator: 4, denominator: 4 };
  })();
  const nominal = Math.max(1, Math.round((ppq * 4 * activeTs.numerator) / activeTs.denominator));
  if (normalized >= nominal) return undefined;
  return normalized;
}

function extractNewSystemMeasuresFromProject(project: Project): number[] | undefined {
  const extras = project.extras;
  if (!extras || typeof extras !== "object") return undefined;
  const root = extras as Record<string, unknown>;
  const musicxml =
    root.musicxml && typeof root.musicxml === "object" ? (root.musicxml as Record<string, unknown>) : null;
  const raw = musicxml?.newSystemMeasureNumbers;
  if (!Array.isArray(raw)) return undefined;
  const values = raw
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value) && value > 0)
    .map((value) => Math.trunc(value));
  if (values.length === 0) return undefined;
  return [...new Set(values)].sort((a, b) => a - b);
}

function injectVsqxPickupHint(vsqxText: string, firstMeasureActualTick: number | undefined): string {
  if (!(typeof firstMeasureActualTick === "number" && Number.isFinite(firstMeasureActualTick) && firstMeasureActualTick > 0)) {
    return vsqxText;
  }
  const hint = `<!--utaformatix3-ts-plus:firstMeasureActualTick=${Math.trunc(firstMeasureActualTick)}-->`;
  if (/^<\?xml[^>]*\?>/.test(vsqxText)) {
    return vsqxText.replace(/^<\?xml[^>]*\?>/, (m) => `${m}\n${hint}`);
  }
  return `${hint}\n${vsqxText}`;
}

function injectVsqxNewSystemMeasuresHint(vsqxText: string, measureNumbers: number[] | undefined): string {
  if (!Array.isArray(measureNumbers) || measureNumbers.length === 0) return vsqxText;
  const encoded = measureNumbers.join(",");
  if (encoded.length === 0) return vsqxText;
  const hint = `<!--utaformatix3-ts-plus:newSystemMeasures=${encoded}-->`;
  if (/^<\?xml[^>]*\?>/.test(vsqxText)) {
    return vsqxText.replace(/^<\?xml[^>]*\?>/, (m) => `${m}\n${hint}`);
  }
  return `${hint}\n${vsqxText}`;
}

function injectVsqxPreservedNotationsHint(vsqxText: string, entries: PreservedNotationHint[]): string {
  if (!Array.isArray(entries) || entries.length === 0) return vsqxText;
  const payload: PreservedNotationsPayload = {
    version: 1,
    entries,
  };
  const encoded = encodeUtf8ToBase64(JSON.stringify(payload));
  const hint = `<!--utaformatix3-ts-plus:preservedNotations=${encoded}-->`;
  if (/^<\?xml[^>]*\?>/.test(vsqxText)) {
    return vsqxText.replace(/^<\?xml[^>]*\?>/, (m) => `${m}\n${hint}`);
  }
  return `${hint}\n${vsqxText}`;
}

function stepToSemitone(step: string): number {
  switch (step) {
    case "C":
      return 0;
    case "D":
      return 2;
    case "E":
      return 4;
    case "F":
      return 5;
    case "G":
      return 7;
    case "A":
      return 9;
    case "B":
      return 11;
    default:
      return 0;
  }
}

function parsePitchFromNoteBlock(noteBlock: string): { key: number; step: string; alter: number; octave: number } | null {
  const step = (noteBlock.match(/<step>([A-G])<\/step>/)?.[1] ?? "").trim();
  if (!step) return null;
  const octaveRaw = Number(noteBlock.match(/<octave>(-?\d+)<\/octave>/)?.[1] ?? "");
  if (!Number.isFinite(octaveRaw)) return null;
  const alterRaw = Number(noteBlock.match(/<alter>(-?\d+)<\/alter>/)?.[1] ?? "0");
  const alter = Number.isFinite(alterRaw) ? Math.trunc(alterRaw) : 0;
  const key = (octaveRaw + 1) * 12 + stepToSemitone(step) + alter;
  return { key, step, alter, octave: Math.trunc(octaveRaw) };
}

function parseGraceHint(noteBlock: string): PreservedGraceHint | null {
  const pitch = parsePitchFromNoteBlock(noteBlock);
  if (!pitch) return null;
  const graceAttr = noteBlock.match(/<grace\b([^>]*)\/?>/i)?.[1] ?? "";
  const slash = /\bslash="yes"/i.test(graceAttr);
  const noteType = noteBlock.match(/<type>([^<]+)<\/type>/)?.[1]?.trim() ?? "";
  return {
    step: pitch.step,
    ...(pitch.alter !== 0 ? { alter: pitch.alter } : {}),
    octave: pitch.octave,
    ...(slash ? { slash: true } : {}),
    ...(noteType.length > 0 ? { noteType } : {}),
  };
}

function extractPreservedNotationsFromPart(partBlock: string, ppq: number, trackIndex: number): PreservedNotationHint[] {
  const tokenRegex =
    /<attributes(?:\s[^>]*)?>[\s\S]*?<\/attributes>|<backup(?:\s[^>]*)?>[\s\S]*?<\/backup>|<forward(?:\s[^>]*)?>[\s\S]*?<\/forward>|<note>[\s\S]*?<\/note>/g;
  const tokens = Array.from(partBlock.matchAll(tokenRegex)).map((m) => m[0]);
  const entries: PreservedNotationHint[] = [];
  let divisions = 1;
  let cursorDiv = 0;
  let previousOnsetDiv = 0;
  let pendingGrace: PreservedGraceHint[] = [];

  for (const token of tokens) {
    if (token.startsWith("<attributes")) {
      const divRaw = Number(token.match(/<divisions>(\d+)<\/divisions>/)?.[1] ?? "");
      if (Number.isFinite(divRaw) && divRaw > 0) {
        divisions = divRaw;
      }
      continue;
    }
    if (token.startsWith("<backup")) {
      const durationRaw = Number(token.match(/<duration>(-?\d+)<\/duration>/)?.[1] ?? "");
      if (Number.isFinite(durationRaw)) {
        cursorDiv = Math.max(0, cursorDiv - durationRaw);
      }
      continue;
    }
    if (token.startsWith("<forward")) {
      const durationRaw = Number(token.match(/<duration>(-?\d+)<\/duration>/)?.[1] ?? "");
      if (Number.isFinite(durationRaw)) {
        cursorDiv += Math.max(0, durationRaw);
      }
      continue;
    }

    const noteBlock = token;
    const isGrace = /<grace(\s|\/|>)/.test(noteBlock);
    const isChord = /<chord(\s|\/|>)/.test(noteBlock);
    const isRest = /<rest(\s|\/|>)/.test(noteBlock);
    const durationRaw = Number(noteBlock.match(/<duration>(-?\d+)<\/duration>/)?.[1] ?? "");
    const durationDiv = Number.isFinite(durationRaw) ? Math.max(0, durationRaw) : 0;
    const onsetDiv = isChord ? previousOnsetDiv : cursorDiv;

    if (isGrace) {
      if (!isRest) {
        const graceHint = parseGraceHint(noteBlock);
        if (graceHint) pendingGrace.push(graceHint);
      }
      continue;
    }

    if (!isRest) {
      const pitch = parsePitchFromNoteBlock(noteBlock);
      if (pitch) {
        const tickOn = Math.round((onsetDiv * ppq) / divisions);
        const hasTrill = /<trill-mark(\s|\/|>)/i.test(noteBlock) || /<wavy-line\b[^>]*\btype="start"/i.test(noteBlock);
        const attachGrace = !isChord && pendingGrace.length > 0 ? pendingGrace : [];
        if (hasTrill || attachGrace.length > 0) {
          entries.push({
            track: trackIndex,
            tickOn,
            key: pitch.key,
            ...(attachGrace.length > 0 ? { graceBefore: attachGrace } : {}),
            ...(hasTrill ? { trill: true } : {}),
          });
        }
      }
    }

    if (!isChord) {
      pendingGrace = [];
      cursorDiv += durationDiv;
    }
    previousOnsetDiv = onsetDiv;
  }

  return entries;
}

function extractPreservedNotationsFromMusicXml(xml: string, ppq: number): PreservedNotationHint[] {
  const parts = extractTagBlocks(xml, "part");
  const entries: PreservedNotationHint[] = [];
  for (let trackIndex = 0; trackIndex < parts.length; trackIndex += 1) {
    entries.push(...extractPreservedNotationsFromPart(parts[trackIndex] ?? "", ppq, trackIndex));
  }
  return entries;
}

function extractPartPitchedEvents(partBlock: string, ppq: number): RawPitchedEvent[] {
  const tokenRegex =
    /<attributes(?:\s[^>]*)?>[\s\S]*?<\/attributes>|<backup(?:\s[^>]*)?>[\s\S]*?<\/backup>|<forward(?:\s[^>]*)?>[\s\S]*?<\/forward>|<note>[\s\S]*?<\/note>/g;
  const tokens = Array.from(partBlock.matchAll(tokenRegex)).map((m) => m[0]);
  const events: RawPitchedEvent[] = [];
  let divisions = 1;
  let cursorDiv = 0;
  let previousOnsetDiv = 0;

  for (const token of tokens) {
    if (token.startsWith("<attributes")) {
      const divRaw = Number(token.match(/<divisions>(\d+)<\/divisions>/)?.[1] ?? "");
      if (Number.isFinite(divRaw) && divRaw > 0) {
        divisions = divRaw;
      }
      continue;
    }
    if (token.startsWith("<backup")) {
      const durationRaw = Number(token.match(/<duration>(-?\d+)<\/duration>/)?.[1] ?? "");
      if (Number.isFinite(durationRaw)) {
        cursorDiv = Math.max(0, cursorDiv - durationRaw);
      }
      continue;
    }
    if (token.startsWith("<forward")) {
      const durationRaw = Number(token.match(/<duration>(-?\d+)<\/duration>/)?.[1] ?? "");
      if (Number.isFinite(durationRaw)) {
        cursorDiv += Math.max(0, durationRaw);
      }
      continue;
    }

    const noteBlock = token;
    if (/<grace(\s|\/|>)/.test(noteBlock)) continue;
    const durationRaw = Number(noteBlock.match(/<duration>(-?\d+)<\/duration>/)?.[1] ?? "");
    const durationDiv = Number.isFinite(durationRaw) ? Math.max(0, durationRaw) : 0;
    const isChord = /<chord(\s|\/|>)/.test(noteBlock);
    const isRest = /<rest(\s|\/|>)/.test(noteBlock);
    const onsetDiv = isChord ? previousOnsetDiv : cursorDiv;

    if (!isRest) {
    const step = (noteBlock.match(/<step>([A-G])<\/step>/)?.[1] ?? "").trim();
      if (step) {
        const octaveRaw = Number(noteBlock.match(/<octave>(-?\d+)<\/octave>/)?.[1] ?? "");
        if (Number.isFinite(octaveRaw)) {
          const alterRaw = Number(noteBlock.match(/<alter>(-?\d+)<\/alter>/)?.[1] ?? "0");
          const alter = Number.isFinite(alterRaw) ? alterRaw : 0;
          const key = (octaveRaw + 1) * 12 + stepToSemitone(step) + alter;
          const tickOn = Math.round((onsetDiv * ppq) / divisions);
          const tickOff = Math.round(((onsetDiv + durationDiv) * ppq) / divisions);
          events.push({ key, tickOn, tickOff });
        }
      }
    }

    previousOnsetDiv = onsetDiv;
    if (!isChord) {
      cursorDiv += durationDiv;
    }
  }
  return events;
}

function normalizeChordOnsetsFromSource(project: Project, musicXmlText: string): Project {
  const partBlocks = extractTagBlocks(musicXmlText, "part");
  if (partBlocks.length === 0 || partBlocks.length !== project.tracks.length) {
    return project;
  }

  const tracks = project.tracks.map((track, trackIndex) => {
    const ppq = Number.isFinite(project.ppq) && project.ppq > 0 ? Math.trunc(project.ppq) : 480;
    const events = extractPartPitchedEvents(partBlocks[trackIndex] ?? "", ppq);
    if (events.length === 0 || track.notes.length === 0) {
      return track;
    }

    const normalized = track.notes.map((note) => ({ ...note }));
    let eventIndex = 0;
    for (let noteIndex = 0; noteIndex < normalized.length; noteIndex += 1) {
      const note = normalized[noteIndex];
      let matched = -1;
      for (let i = eventIndex; i < events.length; i += 1) {
        if (events[i].key === note.key) {
          matched = i;
          break;
        }
      }
      if (matched < 0) continue;
      const event = events[matched];
      note.tickOn = event.tickOn;
      note.tickOff = Math.max(event.tickOn + 1, event.tickOff);
      eventIndex = matched + 1;
    }

    return {
      ...track,
      notes: normalized
        .sort((a, b) => a.tickOn - b.tickOn || a.tickOff - b.tickOff || a.key - b.key)
        .map((note, noteId) => ({ ...note, id: noteId })),
    };
  });

  return {
    ...project,
    tracks,
  };
}

function shouldNormalizeChordOnsets(project: Project): boolean {
  const extras = project.extras;
  if (!extras || typeof extras !== "object") return true;
  const root = extras as Record<string, unknown>;
  const musicxml =
    root.musicxml && typeof root.musicxml === "object" ? (root.musicxml as Record<string, unknown>) : null;
  const parser = typeof musicxml?.parser === "string" ? musicxml.parser : null;
  // plus parser already handles backup/forward/chord timeline and does not need legacy onset repair.
  return parser !== "plus";
}

function splitTrackIntoMonophonicLanes(track: Track): Track[] {
  const sortedNotes = [...track.notes].sort((a, b) => a.tickOn - b.tickOn || a.tickOff - b.tickOff || a.key - b.key);
  if (sortedNotes.length <= 1) {
    return [
      {
        ...track,
        notes: sortedNotes.map((note, noteIndex) => ({ ...note, id: noteIndex })),
      },
    ];
  }

  const laneEndTicks: number[] = [];
  const laneNotes: typeof sortedNotes[] = [];

  for (const note of sortedNotes) {
    let laneIndex = -1;
    for (let i = 0; i < laneEndTicks.length; i += 1) {
      if (laneEndTicks[i] <= note.tickOn) {
        laneIndex = i;
        break;
      }
    }
    if (laneIndex < 0) {
      laneIndex = laneEndTicks.length;
      laneEndTicks.push(note.tickOff);
      laneNotes.push([]);
    } else {
      laneEndTicks[laneIndex] = note.tickOff;
    }
    laneNotes[laneIndex].push(note);
  }

  if (laneNotes.length <= 1) {
    return [
      {
        ...track,
        notes: sortedNotes.map((note, noteIndex) => ({ ...note, id: noteIndex })),
      },
    ];
  }

  return laneNotes.map((notes, laneIndex) => ({
    ...track,
    name: `${track.name} [Lane ${laneIndex + 1}]`,
    notes: notes.map((note, noteIndex) => ({ ...note, id: noteIndex })),
  }));
}

function splitTracksIntoMonophonicLanes(project: Project): Project {
  const nextTracks: Track[] = [];
  for (const track of project.tracks) {
    const lanes = splitTrackIntoMonophonicLanes(track);
    for (const lane of lanes) {
      nextTracks.push({
        ...lane,
        id: nextTracks.length,
      });
    }
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
  const hasArticulations = /<articulations(\s|>|\/)/i.test(xml);
  if (hasSlur) {
    issues.push({
      level: "warning",
      code: "MUSICXML_UNSUPPORTED_NOTATION",
      message: "MusicXML slur is not preserved in VSQX conversion.",
    });
  }
  const hasUnsupportedOrnaments = /<(turn|mordent|inverted-mordent|schleifer|shake|tremolo)(\s|>|\/)/i.test(xml);
  if (hasUnsupportedOrnaments) {
    issues.push({
      level: "warning",
      code: "MUSICXML_UNSUPPORTED_NOTATION",
      message: "Some MusicXML ornaments are not preserved in VSQX conversion.",
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
  const ornamentsCount = (xml.match(/<(turn|mordent|inverted-mordent|schleifer|shake|tremolo)(\s|>|\/)/gi) ?? []).length;
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

  if (shouldNormalizeChordOnsets(project)) {
    project = normalizeChordOnsetsFromSource(project, musicXmlText);
  }
  if (options?.splitPartStaves === true) {
    project = splitTracksByPartAndStaff(project, musicXmlText);
  }
  if (options?.splitPartStaves !== true) {
    project = splitTracksIntoMonophonicLanes(project);
  }
  issues.push(...collectProjectWarnings(project));
  const enriched = enrichProjectExtrasWithUnsupportedNotation(project, unsupportedNotationSummary);
  const normalized = normalizeProjectForVsqxExport(enriched);
  const preservedNotations = extractPreservedNotationsFromMusicXml(
    musicXmlText,
    Number.isFinite(normalized.ppq) && normalized.ppq > 0 ? Math.trunc(normalized.ppq) : 480,
  );
  try {
    const result = writeVsqx(normalized);
    const firstMeasureActualTick = extractFirstMeasureActualTickFromProject(normalized);
    const newSystemMeasures = extractNewSystemMeasuresFromProject(normalized);
    const contentWithHint = injectVsqxPreservedNotationsHint(
      injectVsqxNewSystemMeasuresHint(
        injectVsqxPickupHint(result.content, firstMeasureActualTick),
        newSystemMeasures,
      ),
      preservedNotations,
    );
    return { vsqx: contentWithHint, issues, retainedExtras: result.retainedExtras };
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
