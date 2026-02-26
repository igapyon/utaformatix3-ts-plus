import type { Note } from "../../upstream/utaformatix3-ts/src/core/model/Note";
import type { Project } from "../../upstream/utaformatix3-ts/src/core/model/Project";
import type { Tempo } from "../../upstream/utaformatix3-ts/src/core/model/Tempo";
import type { Track } from "../../upstream/utaformatix3-ts/src/core/model/Track";
import type { TimeSignature } from "../../upstream/utaformatix3-ts/src/core/model/TimeSignature";
import type { MusicXmlWriteOptions } from "./MusicXmlAdapter.ts";
import { estimateMeasureKeyFifthsSequence, estimateTrackKeyFifths } from "./KeyFifthsEstimator.ts";

type Measure = {
  index: number;
  startTick: number;
  lengthTick: number;
  timeSignature: TimeSignature;
};

type NoteSlice = {
  note: Note;
  startTick: number;
  endTick: number;
};

type NoteCluster = {
  slices: NoteSlice[];
  startTick: number;
  endTick: number;
};

type Clef = {
  sign: "G" | "F";
  line: 2 | 4;
};
type StaffNumber = 1 | 2;
type StaffLayout = {
  useGrandStaff: boolean;
  staffByNoteId: Map<number, StaffNumber>;
};

type DurationSpec = {
  duration: number;
  type: string;
  dots: number;
};

type NoteTypeRenderSpec = {
  type: string;
  dots: number;
  timeModification?: {
    actualNotes: number;
    normalNotes: number;
  };
};

type AccidentalState = Map<string, number>;
type SpelledPitch = {
  step: string;
  alter: number;
  octave: number;
};
type SpellingContext = {
  accidentalState: AccidentalState;
  previousKey: number | null;
  keyFifths: number;
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

const PITCH_CANDIDATES: ReadonlyArray<ReadonlyArray<{ step: string; alter: number }>> = [
  [{ step: "C", alter: 0 }],
  [{ step: "C", alter: 1 }, { step: "D", alter: -1 }],
  [{ step: "D", alter: 0 }],
  [{ step: "D", alter: 1 }, { step: "E", alter: -1 }],
  [{ step: "E", alter: 0 }],
  [{ step: "F", alter: 0 }],
  [{ step: "F", alter: 1 }, { step: "G", alter: -1 }],
  [{ step: "G", alter: 0 }],
  [{ step: "G", alter: 1 }, { step: "A", alter: -1 }],
  [{ step: "A", alter: 0 }],
  [{ step: "A", alter: 1 }, { step: "B", alter: -1 }],
  [{ step: "B", alter: 0 }],
] as const;
const STEPS_IN_SHARP_ORDER = ["F", "C", "G", "D", "A", "E", "B"] as const;
const STEPS_IN_FLAT_ORDER = ["B", "E", "A", "D", "G", "C", "F"] as const;
const VIOLIN_TREBLE_LOWEST_KEY = 55; // G3
const STAFF_SPLIT_C4 = 60;
const STAFF_SPLIT_B3 = 59;
const UPPER_STAFF_HOLD_MIN = VIOLIN_TREBLE_LOWEST_KEY; // keep upper staff down to G3
const LOWER_STAFF_HOLD_MAX = 64; // E4

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function unwrapCdata(value: string): string {
  let current = String(value ?? "");
  const cdataPattern = /^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/;
  while (true) {
    const match = current.match(cdataPattern);
    if (!match) return current;
    current = match[1];
  }
}

function normalizeText(value: string): string {
  return unwrapCdata(String(value ?? ""));
}

function shouldInterpretHyphenAsSyllabic(japaneseLyricsType: string): boolean {
  return japaneseLyricsType === "RomajiCv" || japaneseLyricsType === "RomajiVcv";
}

function resolveLyricAndSyllabic(
  rawLyric: string,
  options?: { interpretHyphenAsSyllabic?: boolean },
): { lyric: string; syllabic: string } {
  const normalized = normalizeText(rawLyric).trim();
  if (!normalized) return { lyric: "", syllabic: "" };

  const useHyphenRule = options?.interpretHyphenAsSyllabic ?? false;
  if (!useHyphenRule) {
    return { lyric: normalized, syllabic: "single" };
  }

  const beginsWithHyphen = normalized.startsWith("-");
  const endsWithHyphen = normalized.endsWith("-");
  const text = normalized.replace(/^-+/, "").replace(/-+$/, "").trim();
  if (!text) return { lyric: "", syllabic: "" };

  if (beginsWithHyphen && endsWithHyphen) {
    return { lyric: text, syllabic: "middle" };
  }
  if (beginsWithHyphen) {
    return { lyric: text, syllabic: "end" };
  }
  if (endsWithHyphen) {
    return { lyric: text, syllabic: "begin" };
  }
  return { lyric: text, syllabic: "single" };
}

function buildDurationSpecs(divisions: number): DurationSpec[] {
  const candidates: Array<{ type: string; base: number }> = [
    { type: "whole", base: divisions * 4 },
    { type: "half", base: divisions * 2 },
    { type: "quarter", base: divisions },
    { type: "eighth", base: divisions / 2 },
    { type: "16th", base: divisions / 4 },
    { type: "32nd", base: divisions / 8 },
    { type: "64th", base: divisions / 16 },
    { type: "128th", base: divisions / 32 },
  ];

  const specs: DurationSpec[] = [];
  for (const candidate of candidates) {
    if (!(candidate.base > 0) || !Number.isInteger(candidate.base)) continue;
    specs.push({ duration: candidate.base, type: candidate.type, dots: 0 });
    if (Number.isInteger((candidate.base * 3) / 2)) {
      specs.push({ duration: (candidate.base * 3) / 2, type: candidate.type, dots: 1 });
    }
    if (Number.isInteger((candidate.base * 7) / 4)) {
      specs.push({ duration: (candidate.base * 7) / 4, type: candidate.type, dots: 2 });
    }
  }

  const dedup = new Map<string, DurationSpec>();
  for (const spec of specs) {
    const key = `${spec.duration}:${spec.type}:${spec.dots}`;
    if (!dedup.has(key)) dedup.set(key, spec);
  }
  return Array.from(dedup.values()).sort((a, b) => b.duration - a.duration);
}

function noteTypeFromDuration(duration: number, divisions: number): { type: string; dots: number } | null {
  const spec = buildDurationSpecs(divisions).find((it) => it.duration === duration);
  if (spec) return { type: spec.type, dots: spec.dots };
  return null;
}

function noteTypeFromTupletDuration(
  duration: number,
  divisions: number,
): { type: string; dots: 0; timeModification: { actualNotes: number; normalNotes: number } } | null {
  const bases: Array<{ type: string; base: number }> = [
    { type: "whole", base: divisions * 4 },
    { type: "half", base: divisions * 2 },
    { type: "quarter", base: divisions },
    { type: "eighth", base: divisions / 2 },
    { type: "16th", base: divisions / 4 },
    { type: "32nd", base: divisions / 8 },
    { type: "64th", base: divisions / 16 },
    { type: "128th", base: divisions / 32 },
  ];
  const tuplets: Array<{ actualNotes: number; normalNotes: number }> = [
    { actualNotes: 3, normalNotes: 2 },
    { actualNotes: 5, normalNotes: 4 },
    { actualNotes: 6, normalNotes: 4 },
    { actualNotes: 7, normalNotes: 4 },
    { actualNotes: 9, normalNotes: 4 },
    { actualNotes: 9, normalNotes: 8 },
  ];
  const normalizedDuration = Math.max(1, Math.trunc(duration));
  let best:
    | { type: string; dots: 0; timeModification: { actualNotes: number; normalNotes: number }; delta: number }
    | null = null;
  for (const base of bases) {
    if (!(base.base > 0) || !Number.isFinite(base.base)) continue;
    for (const tuplet of tuplets) {
      const tupletDuration = (base.base * tuplet.normalNotes) / tuplet.actualNotes;
      if (!Number.isFinite(tupletDuration) || tupletDuration <= 0) continue;
      const delta = Math.abs(tupletDuration - normalizedDuration);
      if (delta > 1) continue;
      const candidate = {
        type: base.type,
        dots: 0,
        timeModification: {
          actualNotes: tuplet.actualNotes,
          normalNotes: tuplet.normalNotes,
        },
        delta,
      };
      if (!best || candidate.delta < best.delta) {
        best = candidate;
      }
    }
  }
  if (!best) return null;
  return {
    type: best.type,
    dots: 0,
    timeModification: best.timeModification,
  };
}

function noteTypeRenderSpecFromDuration(duration: number, divisions: number): NoteTypeRenderSpec | null {
  const plain = noteTypeFromDuration(duration, divisions);
  if (plain) return plain;
  return noteTypeFromTupletDuration(duration, divisions);
}

function decomposeDuration(duration: number, divisions: number): DurationSpec[] | null {
  const specs = buildDurationSpecs(divisions);
  const memo = new Map<number, DurationSpec[] | null>();
  const maxParts = 16;

  const dfs = (remaining: number, depth: number): DurationSpec[] | null => {
    if (remaining === 0) return [];
    if (remaining < 0 || depth >= maxParts) return null;
    const cached = memo.get(remaining);
    if (cached !== undefined) return cached;

    for (const spec of specs) {
      if (spec.duration > remaining) continue;
      const tail = dfs(remaining - spec.duration, depth + 1);
      if (tail) {
        const result = [spec, ...tail];
        memo.set(remaining, result);
        return result;
      }
    }
    memo.set(remaining, null);
    return null;
  };

  return dfs(Math.max(0, Math.trunc(duration)), 0);
}

function toPitch(key: number): SpelledPitch {
  const normalized = ((Math.trunc(key) % 12) + 12) % 12;
  const octave = Math.floor(key / 12) - 1;
  const selected = PITCH_CANDIDATES[normalized][0];
  return {
    step: selected.step,
    alter: selected.alter,
    octave,
  };
}

function accidentalTextFromAlter(alter: number): string | null {
  if (!Number.isFinite(alter)) return null;
  const normalized = Math.trunc(alter);
  if (normalized === 2) return "double-sharp";
  if (normalized === 1) return "sharp";
  if (normalized === 0) return "natural";
  if (normalized === -1) return "flat";
  if (normalized === -2) return "double-flat";
  return null;
}

function pitchToMidiKey(pitch: SpelledPitch): number {
  const semitoneByStep: Record<string, number> = {
    C: 0,
    D: 2,
    E: 4,
    F: 5,
    G: 7,
    A: 9,
    B: 11,
  };
  const semitone = semitoneByStep[pitch.step] ?? 0;
  return (pitch.octave + 1) * 12 + semitone + Math.trunc(pitch.alter);
}

function stemTextForNote(pitch: SpelledPitch, noteType: NoteTypeRenderSpec | null): string | null {
  if (!noteType) return null;
  if (noteType.type === "whole") return null;
  const key = pitchToMidiKey(pitch);
  return key >= 71 ? "down" : "up";
}

function preservedNotationKey(tickOn: number, key: number): string {
  return `${Math.trunc(tickOn)}:${Math.trunc(key)}`;
}

function normalizeGraceType(value: string | undefined): string {
  const token = String(value ?? "").trim();
  const allowed = new Set(["whole", "half", "quarter", "eighth", "16th", "32nd", "64th", "128th"]);
  return allowed.has(token) ? token : "16th";
}

function renderGraceNotes(graces: PreservedGraceHint[] | undefined, voice: number, staff?: StaffNumber): string {
  if (!Array.isArray(graces) || graces.length === 0) return "";
  return graces
    .map((grace) => {
      const step = String(grace.step ?? "").trim();
      const octave = Number(grace.octave);
      if (!/^[A-G]$/.test(step) || !Number.isFinite(octave)) return "";
      const alter = Number(grace.alter ?? 0);
      const hasAlter = Number.isFinite(alter) && Math.trunc(alter) !== 0;
      const slash = grace.slash === true ? ` slash="yes"` : "";
      return (
        `<note>` +
        `<grace${slash}/>` +
        `<pitch><step>${step}</step>${hasAlter ? `<alter>${Math.trunc(alter)}</alter>` : ""}<octave>${Math.trunc(octave)}</octave></pitch>` +
        `<voice>${voice}</voice>` +
        `${staff ? `<staff>${staff}</staff>` : ""}` +
        `<type>${normalizeGraceType(grace.noteType)}</type>` +
        `</note>`
      );
    })
    .join("");
}

function pitchStateKey(pitch: SpelledPitch): string {
  return `${pitch.step}:${pitch.octave}`;
}

function clampFifths(value: number): number {
  return Math.max(-7, Math.min(7, Math.trunc(value)));
}

function defaultAlterFromFifths(step: string, fifths: number): number {
  const f = clampFifths(fifths);
  if (f > 0 && STEPS_IN_SHARP_ORDER.slice(0, f).includes(step as (typeof STEPS_IN_SHARP_ORDER)[number])) {
    return 1;
  }
  if (f < 0 && STEPS_IN_FLAT_ORDER.slice(0, -f).includes(step as (typeof STEPS_IN_FLAT_ORDER)[number])) {
    return -1;
  }
  return 0;
}

function getPreviousAlterForPitch(pitch: SpelledPitch, context: SpellingContext): number {
  const stateKey = pitchStateKey(pitch);
  const mapped = context.accidentalState.get(stateKey);
  if (mapped != null) return mapped;
  return defaultAlterFromFifths(pitch.step, context.keyFifths);
}

function toFiniteNumberOrUndefined(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  return value;
}

function parseFifthsByTrackValue(value: unknown, index: number): number | undefined {
  if (Array.isArray(value)) {
    return toFiniteNumberOrUndefined(value[index]);
  }
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return toFiniteNumberOrUndefined(record[String(index)]);
  }
  return undefined;
}

function parseFifthsByMeasureValue(value: unknown, trackIndex: number, measureIndex: number): number | undefined {
  if (Array.isArray(value)) {
    const trackValue = value[trackIndex];
    if (!Array.isArray(trackValue)) return undefined;
    return toFiniteNumberOrUndefined(trackValue[measureIndex]);
  }
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    const trackValue = record[String(trackIndex)];
    if (!Array.isArray(trackValue)) return undefined;
    return toFiniteNumberOrUndefined(trackValue[measureIndex]);
  }
  return undefined;
}

function resolveTrackFifthsFromExtras(project: Project, index: number): number | undefined {
  const extras = project.extras;
  if (!extras || typeof extras !== "object") return undefined;
  const root = extras as Record<string, unknown>;
  const musicxml = root.musicxml && typeof root.musicxml === "object" ? (root.musicxml as Record<string, unknown>) : null;

  const byTrackCandidates: unknown[] = [
    root.keyFifthsByTrack,
    musicxml?.keyFifthsByTrack,
  ];
  for (const candidate of byTrackCandidates) {
    const parsed = parseFifthsByTrackValue(candidate, index);
    if (parsed !== undefined) return parsed;
  }

  const globalCandidates: unknown[] = [
    root.keyFifths,
    musicxml?.keyFifths,
  ];
  for (const candidate of globalCandidates) {
    const parsed = toFiniteNumberOrUndefined(candidate);
    if (parsed !== undefined) return parsed;
  }
  return undefined;
}

function resolveMeasureFifthsFromExtras(project: Project, trackIndex: number, measureIndex: number): number | undefined {
  const extras = project.extras;
  if (!extras || typeof extras !== "object") return undefined;
  const root = extras as Record<string, unknown>;
  const musicxml = root.musicxml && typeof root.musicxml === "object" ? (root.musicxml as Record<string, unknown>) : null;
  const candidates: unknown[] = [
    root.keyFifthsByMeasure,
    musicxml?.keyFifthsByMeasure,
  ];
  for (const candidate of candidates) {
    const parsed = parseFifthsByMeasureValue(candidate, trackIndex, measureIndex);
    if (parsed !== undefined) return parsed;
  }
  return undefined;
}

function resolveTrackKeyFifths(
  project: Project,
  track: Track,
  index: number,
  options?: MusicXmlWriteOptions,
): number {
  const explicit = options?.keyFifths;
  if (typeof explicit === "number" && Number.isFinite(explicit)) {
    return clampFifths(explicit);
  }
  if (Array.isArray(explicit)) {
    const perTrack = toFiniteNumberOrUndefined(explicit[index]);
    if (perTrack !== undefined) return clampFifths(perTrack);
  }

  const preferProjectExtras = options?.preferProjectExtras ?? true;
  if (preferProjectExtras) {
    const fromExtras = resolveTrackFifthsFromExtras(project, index);
    if (fromExtras !== undefined) return clampFifths(fromExtras);
  }

  return clampFifths(estimateTrackKeyFifths(track.notes));
}

function resolveMeasureKeyFifths(
  project: Project,
  trackIndex: number,
  measureIndex: number,
  baseTrackFifths: number,
  estimatedByMeasure: number[] | null,
  options?: MusicXmlWriteOptions,
): number {
  const explicitTrackLevel = options?.keyFifths;
  if (explicitTrackLevel !== undefined) {
    return clampFifths(baseTrackFifths);
  }

  const explicitByMeasure = options?.keyFifthsByMeasure;
  const fromOptions = parseFifthsByMeasureValue(explicitByMeasure, trackIndex, measureIndex);
  if (fromOptions !== undefined) return clampFifths(fromOptions);

  const preferProjectExtras = options?.preferProjectExtras ?? true;
  if (preferProjectExtras) {
    const fromExtras = resolveMeasureFifthsFromExtras(project, trackIndex, measureIndex);
    if (fromExtras !== undefined) return clampFifths(fromExtras);
  }
  if (estimatedByMeasure) {
    const estimated = estimatedByMeasure[measureIndex];
    if (typeof estimated === "number" && Number.isFinite(estimated)) {
      return clampFifths(estimated);
    }
  }
  return clampFifths(baseTrackFifths);
}

function resolveNewSystemMeasureNumberSet(project: Project): Set<number> {
  const extras = project.extras;
  if (!extras || typeof extras !== "object") return new Set<number>();
  const root = extras as Record<string, unknown>;
  const musicxml = root.musicxml && typeof root.musicxml === "object" ? (root.musicxml as Record<string, unknown>) : null;
  const raw = musicxml?.newSystemMeasureNumbers;
  if (!Array.isArray(raw)) return new Set<number>();
  const values = raw
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value) && value > 0)
    .map((value) => Math.trunc(value));
  return new Set(values);
}

function choosePitchSpelling(key: number, context: SpellingContext): SpelledPitch {
  const normalized = ((Math.trunc(key) % 12) + 12) % 12;
  const octave = Math.floor(key / 12) - 1;
  const candidates = PITCH_CANDIDATES[normalized];
  if (candidates.length === 1) {
    return { step: candidates[0].step, alter: candidates[0].alter, octave };
  }

  const previousKey = context.previousKey;
  const scored = candidates.map((candidate, index) => {
    const pitch: SpelledPitch = { step: candidate.step, alter: candidate.alter, octave };
    const prevAlter = getPreviousAlterForPitch(pitch, context);
    const needsAccidental = prevAlter === candidate.alter ? 0 : 1;
    const keyAlter = defaultAlterFromFifths(candidate.step, context.keyFifths);
    const keyBias = Math.abs(candidate.alter - keyAlter) * 0.5;
    const directionBias =
      previousKey == null
        ? 0
        : key < previousKey
          ? candidate.alter < 0
            ? -0.25
            : 0
          : key > previousKey
            ? candidate.alter > 0
              ? -0.25
              : 0
            : 0;
    return {
      index,
      candidate,
      score: needsAccidental + keyBias + directionBias,
    };
  });

  scored.sort((a, b) => a.score - b.score || a.index - b.index);
  const selected = scored[0].candidate;
  return { step: selected.step, alter: selected.alter, octave };
}

function resolveAccidentalText(
  pitch: SpelledPitch,
  context: SpellingContext,
  suppress: boolean,
): string | null {
  const stateKey = pitchStateKey(pitch);
  const currentAlter = Math.trunc(pitch.alter);
  const prevAlter = getPreviousAlterForPitch(pitch, context);
  context.accidentalState.set(stateKey, currentAlter);
  if (suppress || currentAlter === prevAlter) return null;
  return accidentalTextFromAlter(currentAlter);
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

function ticksPerMeasure(ppq: number, ts: TimeSignature): number {
  return Math.round((ppq * 4 * ts.numerator) / ts.denominator);
}

function getMeasureTimeSignature(index: number, list: TimeSignature[]): TimeSignature {
  let active = list[0];
  for (const ts of list) {
    if (ts.measurePosition <= index) active = ts;
    else break;
  }
  return active;
}

function tickAtMeasurePosition(position: number, ppq: number, tsList: TimeSignature[]): number {
  const safePosition = Math.max(0, Math.trunc(position));
  let tick = 0;
  for (let index = 0; index < safePosition; index += 1) {
    tick += Math.max(1, ticksPerMeasure(ppq, getMeasureTimeSignature(index, tsList)));
  }
  return tick;
}

function normalizeTempos(projectTempos: Tempo[]): Tempo[] {
  const valid = projectTempos
    .filter((tempo) => Number.isFinite(tempo.tickPosition) && Number.isFinite(tempo.bpm) && tempo.bpm > 0)
    .map((tempo) => ({
      tickPosition: Math.max(0, Math.trunc(tempo.tickPosition)),
      bpm: tempo.bpm,
    }))
    .sort((a, b) => a.tickPosition - b.tickPosition);

  const merged: Tempo[] = [];
  for (const tempo of valid) {
    const last = merged[merged.length - 1];
    if (last && last.tickPosition === tempo.tickPosition) {
      last.bpm = tempo.bpm;
    } else {
      merged.push({ tickPosition: tempo.tickPosition, bpm: tempo.bpm });
    }
  }

  if (merged.length === 0) {
    return [{ tickPosition: 0, bpm: 120 }];
  }
  if (merged[0].tickPosition !== 0) {
    return [{ tickPosition: 0, bpm: merged[0].bpm }, ...merged];
  }
  return merged;
}

function buildMeasures(project: Project, maxTick: number): Measure[] {
  const ppq = project.ppq > 0 ? project.ppq : 480;
  const tsList = sortTimeSignatures(project);
  const firstMeasureActualTick = (() => {
    const extras = project.extras;
    if (!extras || typeof extras !== "object") return undefined;
    const root = extras as Record<string, unknown>;
    const musicxml = root.musicxml && typeof root.musicxml === "object" ? (root.musicxml as Record<string, unknown>) : null;
    const value = musicxml?.firstMeasureActualTick;
    if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
    const normalized = Math.max(1, Math.trunc(value));
    const nominal = Math.max(1, ticksPerMeasure(ppq, getMeasureTimeSignature(0, tsList)));
    if (normalized >= nominal) return undefined;
    return normalized;
  })();
  const measures: Measure[] = [];
  let startTick = 0;
  let index = 0;
  const hardLimit = 10000;
  while (startTick <= maxTick && index < hardLimit) {
    const ts = getMeasureTimeSignature(index, tsList);
    const nominalLength = Math.max(1, ticksPerMeasure(ppq, ts));
    const lengthTick = index === 0 && typeof firstMeasureActualTick === "number" ? firstMeasureActualTick : nominalLength;
    measures.push({ index, startTick, lengthTick, timeSignature: ts });
    startTick += lengthTick;
    index += 1;
  }
  if (measures.length === 0) {
    const ts = getMeasureTimeSignature(0, tsList);
    measures.push({ index: 0, startTick: 0, lengthTick: Math.max(1, ticksPerMeasure(ppq, ts)), timeSignature: ts });
  }
  return measures;
}

function chooseClef(track: Track): Clef {
  if (!track.notes.length) {
    return { sign: "G", line: 2 };
  }
  const keys = track.notes.map((note) => note.key).sort((a, b) => a - b);
  const minKey = keys[0] ?? 60;
  if (minKey >= VIOLIN_TREBLE_LOWEST_KEY) {
    return { sign: "G", line: 2 };
  }
  const median = keys[Math.floor(keys.length / 2)] ?? 60;
  if (median < 60) {
    return { sign: "F", line: 4 };
  }
  return { sign: "G", line: 2 };
}

function buildGrandStaffLayout(track: Track): StaffLayout {
  const sorted = [...track.notes].sort((a, b) => a.tickOn - b.tickOn || b.key - a.key || a.tickOff - b.tickOff);
  const keys = sorted.map((note) => note.key);
  const minKey = keys.length > 0 ? Math.min(...keys) : 60;
  const maxKey = keys.length > 0 ? Math.max(...keys) : 60;
  const useGrandStaff = minKey <= UPPER_STAFF_HOLD_MIN && maxKey >= LOWER_STAFF_HOLD_MAX;
  if (!useGrandStaff) {
    return { useGrandStaff: false, staffByNoteId: new Map() };
  }

  const byOnset = new Map<number, Note[]>();
  for (const note of sorted) {
    const bucket = byOnset.get(note.tickOn);
    if (bucket) bucket.push(note);
    else byOnset.set(note.tickOn, [note]);
  }
  const orderedOnsets = Array.from(byOnset.keys()).sort((a, b) => a - b);
  const staffByNoteId = new Map<number, StaffNumber>();
  let previousStaff: StaffNumber | null = null;

  for (const onset of orderedOnsets) {
    const cluster = (byOnset.get(onset) ?? []).sort((a, b) => b.key - a.key || a.tickOff - b.tickOff);
    if (cluster.length === 0) continue;
    const minClusterKey = Math.min(...cluster.map((note) => note.key));
    const maxClusterKey = Math.max(...cluster.map((note) => note.key));
    const isSplitCluster = maxClusterKey >= STAFF_SPLIT_C4 && minClusterKey <= STAFF_SPLIT_B3;

    let clusterStaff: StaffNumber;
    if (previousStaff === 1) {
      clusterStaff = maxClusterKey >= UPPER_STAFF_HOLD_MIN ? 1 : 2;
    } else if (previousStaff === 2) {
      clusterStaff = minClusterKey <= LOWER_STAFF_HOLD_MAX ? 2 : 1;
    } else {
      clusterStaff = maxClusterKey >= STAFF_SPLIT_C4 ? 1 : 2;
    }

    if (isSplitCluster) {
      let hasUpper = false;
      let hasLower = false;
      for (const note of cluster) {
        const staff: StaffNumber = note.key >= STAFF_SPLIT_C4 ? 1 : 2;
        staffByNoteId.set(note.id, staff);
        hasUpper = hasUpper || staff === 1;
        hasLower = hasLower || staff === 2;
      }
      if (previousStaff && ((previousStaff === 1 && hasUpper) || (previousStaff === 2 && hasLower))) {
        // Keep the current melodic direction when both staves are active.
      } else {
        previousStaff = hasUpper ? 1 : 2;
      }
      continue;
    }

    for (const note of cluster) {
      staffByNoteId.set(note.id, clusterStaff);
    }
    previousStaff = clusterStaff;
  }

  // If all notes ended up on a single staff, avoid forcing grand-staff output.
  const assignedStaves = new Set(staffByNoteId.values());
  if (!assignedStaves.has(1) || !assignedStaves.has(2)) {
    return { useGrandStaff: false, staffByNoteId: new Map() };
  }

  return { useGrandStaff: true, staffByNoteId };
}

function renderAttributes(
  measure: Measure,
  divisions: number,
  clef: Clef,
  keyFifths: number,
  includeTimeSignature: boolean,
  options?: { grandStaff?: boolean },
): string {
  const ts = measure.timeSignature;
  const useGrandStaff = options?.grandStaff === true;
  return (
    `<attributes>` +
    `<divisions>${divisions}</divisions>` +
    `<key><fifths>${clampFifths(keyFifths)}</fifths></key>` +
    `${includeTimeSignature ? `<time><beats>${ts.numerator}</beats><beat-type>${ts.denominator}</beat-type></time>` : ""}` +
    `${useGrandStaff ? `<staves>2</staves>` : ""}` +
    `${useGrandStaff
      ? `<clef number="1"><sign>G</sign><line>2</line></clef><clef number="2"><sign>F</sign><line>4</line></clef>`
      : `<clef><sign>${clef.sign}</sign><line>${clef.line}</line></clef>`}` +
    `</attributes>`
  );
}

function renderTempoDirections(measure: Measure, tempos: Project["tempos"]): string {
  const endTick = measure.startTick + measure.lengthTick;
  return tempos
    .filter((tempo) => tempo.tickPosition >= measure.startTick && tempo.tickPosition < endTick)
    .sort((a, b) => a.tickPosition - b.tickPosition)
    .map((tempo) => {
      const offset = tempo.tickPosition - measure.startTick;
      return (
        `<direction>` +
        `${offset > 0 ? `<offset>${offset}</offset>` : ""}` +
        `<direction-type><metronome><beat-unit>quarter</beat-unit><per-minute>${tempo.bpm}</per-minute></metronome></direction-type>` +
        `<sound tempo="${tempo.bpm}"/>` +
        `</direction>`
      );
    })
    .join("");
}

function renderRest(duration: number, voice: number, divisions: number, staff?: StaffNumber): string {
  const specs = decomposeDuration(duration, divisions);
  if (!specs || specs.length === 0) {
    return `<note><rest/><duration>${duration}</duration><voice>${voice}</voice>${staff ? `<staff>${staff}</staff>` : ""}</note>`;
  }
  return specs
    .map((spec) => {
      return (
        `<note>` +
        `<rest/>` +
        `<duration>${spec.duration}</duration>` +
        `<voice>${voice}</voice>` +
        `${staff ? `<staff>${staff}</staff>` : ""}` +
        `<type>${spec.type}</type>` +
        `${"<dot/>".repeat(spec.dots)}` +
        `</note>`
      );
    })
    .join("");
}

function renderSingleNote(
  pitch: SpelledPitch,
  duration: number,
  voice: number,
  noteType: NoteTypeRenderSpec | null,
  tieStart: boolean,
  tieStop: boolean,
  hasTrill: boolean,
  lyric: string,
  syllabic: string,
  accidentalText: string | null,
  options?: { chord?: boolean; lyric?: boolean; staff?: StaffNumber },
): string {
  const isChordTone = options?.chord === true;
  const stemText = stemTextForNote(pitch, noteType);
  const tiedNotations = `${tieStart ? `<tied type="start"/>` : ""}${tieStop ? `<tied type="stop"/>` : ""}`;
  const trillNotations = hasTrill ? `<ornaments><trill-mark/></ornaments>` : "";
  const notationsXml = tiedNotations || trillNotations ? `<notations>${tiedNotations}${trillNotations}</notations>` : "";

  return (
    `<note>` +
    `${isChordTone ? `<chord/>` : ""}` +
    `<pitch><step>${pitch.step}</step>${pitch.alter !== 0 ? `<alter>${pitch.alter}</alter>` : ""}<octave>${pitch.octave}</octave></pitch>` +
    `${accidentalText ? `<accidental>${accidentalText}</accidental>` : ""}` +
    `<duration>${duration}</duration>` +
    `<voice>${voice}</voice>` +
    `${options?.staff ? `<staff>${options.staff}</staff>` : ""}` +
    `${noteType
      ? `<type>${noteType.type}</type>${"<dot/>".repeat(noteType.dots)}${
          noteType.timeModification
            ? `<time-modification><actual-notes>${noteType.timeModification.actualNotes}</actual-notes><normal-notes>${noteType.timeModification.normalNotes}</normal-notes></time-modification>`
            : ""
        }`
      : ""}` +
    `${stemText ? `<stem>${stemText}</stem>` : ""}` +
    `${tieStart ? `<tie type="start"/>` : ""}` +
    `${tieStop ? `<tie type="stop"/>` : ""}` +
    `${notationsXml}` +
    `${lyric ? `<lyric>${syllabic ? `<syllabic>${syllabic}</syllabic>` : ""}<text>${lyric}</text></lyric>` : ""}` +
    `</note>`
  );
}

function renderNoteSegment(
  project: Project,
  note: Note,
  startTick: number,
  endTick: number,
  divisions: number,
  voice: number,
  spellingContext: SpellingContext,
  preservedDecoration: PreservedNotationHint | undefined,
  options?: { chord?: boolean; lyric?: boolean; staff?: StaffNumber },
): string {
  const duration = Math.max(1, endTick - startTick);
  const extTieStart = endTick < note.tickOff;
  const extTieStop = startTick > note.tickOn;
  const isFirstSegment = startTick === note.tickOn;
  const includeLyric = options?.lyric ?? true;
  const lyricToken =
    includeLyric && isFirstSegment
      ? resolveLyricAndSyllabic(note.lyric || "あ", {
          interpretHyphenAsSyllabic: shouldInterpretHyphenAsSyllabic(project.japaneseLyricsType),
        })
      : { lyric: "", syllabic: "" };
  const lyric = escapeXml(lyricToken.lyric);
  const syllabic = lyricToken.syllabic;
  const pitch = choosePitchSpelling(note.key, spellingContext);
  const accidentalText = resolveAccidentalText(pitch, spellingContext, extTieStop);
  spellingContext.previousKey = note.key;

  // Keep chord tones as a single note at the same onset.
  if (options?.chord) {
    return renderSingleNote(
      pitch,
      duration,
      voice,
      noteTypeRenderSpecFromDuration(duration, divisions),
      extTieStart,
      extTieStop,
      false,
      lyric,
      syllabic,
      accidentalText,
      options,
    );
  }

  const specs = decomposeDuration(duration, divisions);
  if (!specs || specs.length <= 1) {
    const hasTrill = Boolean(preservedDecoration?.trill) && startTick === note.tickOn;
    return renderSingleNote(
      pitch,
      duration,
      voice,
      noteTypeRenderSpecFromDuration(duration, divisions),
      extTieStart,
      extTieStop,
      hasTrill,
      lyric,
      syllabic,
      accidentalText,
      options,
    );
  }

  let out = "";
  for (let i = 0; i < specs.length; i += 1) {
    const spec = specs[i];
    const tieStop = extTieStop || i > 0;
    const tieStart = extTieStart || i < specs.length - 1;
    const lyricForPart = i === 0 ? lyric : "";
    const syllabicForPart = i === 0 ? syllabic : "";
    const accidentalForPart = i === 0 ? accidentalText : null;
    out += renderSingleNote(
      pitch,
      spec.duration,
      voice,
      { type: spec.type, dots: spec.dots },
      tieStart,
      tieStop,
      false,
      lyricForPart,
      syllabicForPart,
      accidentalForPart,
      options,
    );
  }
  return out;
}

function sliceNotesForMeasure(trackNotes: Note[], measure: Measure): NoteSlice[] {
  const measureStart = measure.startTick;
  const measureEnd = measure.startTick + measure.lengthTick;
  return trackNotes
    .map((note) => ({
      note,
      startTick: Math.max(note.tickOn, measureStart),
      endTick: Math.min(note.tickOff, measureEnd),
    }))
    .filter((slice) => slice.endTick > slice.startTick)
    .sort((a, b) => a.startTick - b.startTick || a.endTick - b.endTick);
}

function toClusters(slices: NoteSlice[]): NoteCluster[] {
  if (slices.length === 0) return [];
  const clusters: NoteCluster[] = [];
  let current: NoteCluster = {
    slices: [slices[0]],
    startTick: slices[0].startTick,
    endTick: slices[0].endTick,
  };
  for (let i = 1; i < slices.length; i += 1) {
    const slice = slices[i];
    if (slice.startTick === current.startTick) {
      current.slices.push(slice);
      current.endTick = Math.max(current.endTick, slice.endTick);
      continue;
    }
    clusters.push(current);
    current = {
      slices: [slice],
      startTick: slice.startTick,
      endTick: slice.endTick,
    };
  }
  clusters.push(current);
  return clusters;
}

function assignVoices(clusters: NoteCluster[]): NoteCluster[][] {
  const lanes: NoteCluster[][] = [];
  const laneEndTicks: number[] = [];

  for (const cluster of clusters) {
    let assigned = -1;
    for (let i = 0; i < lanes.length; i += 1) {
      if (cluster.startTick >= laneEndTicks[i]) {
        assigned = i;
        break;
      }
    }
    if (assigned < 0) {
      assigned = lanes.length;
      lanes.push([]);
      laneEndTicks.push(0);
    }
    lanes[assigned].push(cluster);
    laneEndTicks[assigned] = Math.max(laneEndTicks[assigned], cluster.endTick);
  }
  return lanes;
}

function renderVoiceLane(
  project: Project,
  clusters: NoteCluster[],
  measure: Measure,
  divisions: number,
  voiceNumber: number,
  keyFifths: number,
  preservedByKey: Map<string, PreservedNotationHint>,
  staff?: StaffNumber,
): string {
  const spellingContext: SpellingContext = {
    accidentalState: new Map(),
    previousKey: null,
    keyFifths,
  };
  const measureStart = measure.startTick;
  const measureEnd = measure.startTick + measure.lengthTick;
  let cursor = measureStart;
  let out = "";
  for (const cluster of clusters) {
    if (cluster.startTick > cursor) {
      out += renderRest(cluster.startTick - cursor, voiceNumber, divisions, staff);
    }
    for (let i = 0; i < cluster.slices.length; i += 1) {
      const slice = cluster.slices[i];
      const preserved =
        i === 0 && slice.startTick === slice.note.tickOn
          ? preservedByKey.get(preservedNotationKey(slice.note.tickOn, slice.note.key))
          : undefined;
      if (i === 0 && preserved?.graceBefore?.length) {
        out += renderGraceNotes(preserved.graceBefore, voiceNumber, staff);
      }
      out += renderNoteSegment(project, slice.note, slice.startTick, slice.endTick, divisions, voiceNumber, spellingContext, preserved, {
        chord: i > 0,
        lyric: i === 0,
        staff,
      });
    }
    cursor = Math.max(cursor, cluster.endTick);
  }
  if (cursor < measureEnd) {
    out += renderRest(measureEnd - cursor, voiceNumber, divisions, staff);
  }
  return out;
}

function renderMeasureNotesForStaff(
  project: Project,
  trackNotes: Note[],
  measure: Measure,
  keyFifths: number,
  voiceStart: number,
  preservedByKey: Map<string, PreservedNotationHint>,
  staff?: StaffNumber,
): string {
  const divisions = project.ppq > 0 ? project.ppq : 480;
  const slices = sliceNotesForMeasure(trackNotes, measure);
  const lanes = assignVoices(toClusters(slices));
  if (lanes.length === 0) {
    return renderRest(measure.lengthTick, voiceStart, divisions, staff);
  }
  if (lanes.length === 1) {
    return renderVoiceLane(project, lanes[0], measure, divisions, voiceStart, keyFifths, preservedByKey, staff);
  }

  let out = "";
  for (let i = 0; i < lanes.length; i += 1) {
    out += renderVoiceLane(project, lanes[i], measure, divisions, voiceStart + i, keyFifths, preservedByKey, staff);
    if (i < lanes.length - 1) {
      out += `<backup><duration>${measure.lengthTick}</duration></backup>`;
    }
  }
  return out;
}

function renderMeasureNotesWithKey(
  project: Project,
  trackNotes: Note[],
  measure: Measure,
  keyFifths: number,
  preservedByKey: Map<string, PreservedNotationHint>,
  layout?: StaffLayout,
): string {
  if (!layout?.useGrandStaff) {
    return renderMeasureNotesForStaff(project, trackNotes, measure, keyFifths, 1, preservedByKey);
  }
  const upper = trackNotes.filter((note) => layout.staffByNoteId.get(note.id) !== 2);
  const lower = trackNotes.filter((note) => layout.staffByNoteId.get(note.id) === 2);
  const upperXml = renderMeasureNotesForStaff(project, upper, measure, keyFifths, 1, preservedByKey, 1);
  const lowerXml = renderMeasureNotesForStaff(project, lower, measure, keyFifths, 10, preservedByKey, 2);
  return `${upperXml}<backup><duration>${measure.lengthTick}</duration></backup>${lowerXml}`;
}

function resolvePreservedNotationsByTrack(project: Project): Array<Map<string, PreservedNotationHint>> {
  const byTrack = project.tracks.map(() => new Map<string, PreservedNotationHint>());
  const extras = project.extras;
  if (!extras || typeof extras !== "object") return byTrack;
  const root = extras as Record<string, unknown>;
  const musicxml = root.musicxml && typeof root.musicxml === "object" ? (root.musicxml as Record<string, unknown>) : null;
  const raw = musicxml?.preservedNotations;
  if (!Array.isArray(raw)) return byTrack;

  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const row = entry as Record<string, unknown>;
    const track = Number(row.track);
    const tickOn = Number(row.tickOn);
    const key = Number(row.key);
    if (!Number.isFinite(track) || !Number.isFinite(tickOn) || !Number.isFinite(key)) continue;
    const trackIndex = Math.trunc(track);
    if (trackIndex < 0 || trackIndex >= byTrack.length) continue;
    const graceBefore = Array.isArray(row.graceBefore)
      ? (row.graceBefore.filter((g) => g && typeof g === "object") as PreservedGraceHint[])
      : undefined;
    const trill = row.trill === true;
    if (!graceBefore?.length && !trill) continue;
    byTrack[trackIndex].set(preservedNotationKey(tickOn, key), {
      track: trackIndex,
      tickOn: Math.trunc(tickOn),
      key: Math.trunc(key),
      ...(graceBefore?.length ? { graceBefore } : {}),
      ...(trill ? { trill: true } : {}),
    });
  }
  return byTrack;
}

function renderFinalBarline(isLastMeasure: boolean): string {
  if (!isLastMeasure) return "";
  return `<barline location="right"><bar-style>light-heavy</bar-style></barline>`;
}

export function generateMusicXmlFromProject(project: Project, options?: MusicXmlWriteOptions): string {
  const ppq = project.ppq > 0 ? project.ppq : 480;
  const measureNumberBase = Math.max(0, Math.trunc(project.measurePrefix || 0)) + 1;
  const tempos = normalizeTempos(project.tempos);
  const tsList = sortTimeSignatures(project);
  const tracks: Track[] =
    project.tracks.length > 0
      ? project.tracks
      : [
          {
            id: 0,
            name: "Track 1",
            notes: [],
          },
        ];
  const maxNoteTick = Math.max(
    0,
    ...tracks.flatMap((track) => track.notes.map((note) => note.tickOff)),
  );
  const maxTempoTick = Math.max(0, ...tempos.map((tempo) => tempo.tickPosition));
  const maxTimeSigTick = Math.max(
    0,
    ...tsList.map((ts) => tickAtMeasurePosition(ts.measurePosition, ppq, tsList)),
  );
  const maxTick = Math.max(maxNoteTick, maxTempoTick, maxTimeSigTick);
  const measures = buildMeasures(project, maxTick);
  const newSystemMeasureNumbers = resolveNewSystemMeasureNumberSet(project);
  const preservedByTrack = resolvePreservedNotationsByTrack(project);

  const partList = tracks
    .map((track, index) => {
      const partId = `P${index + 1}`;
      const partName = escapeXml(normalizeText(track.name || `Track ${index + 1}`));
      return `<score-part id="${partId}"><part-name>${partName}</part-name></score-part>`;
    })
    .join("");

  const parts = tracks
    .map((track, index) => {
      const partId = `P${index + 1}`;
      const partTempos = index === 0 ? tempos : [];
      const clef = chooseClef(track);
      const staffLayout = buildGrandStaffLayout(track);
      const trackKeyFifths = resolveTrackKeyFifths(project, track, index, options);
      const trackPreserved = preservedByTrack[index] ?? new Map<string, PreservedNotationHint>();
      const notes = [...track.notes].sort((a, b) => a.tickOn - b.tickOn || a.tickOff - b.tickOff);
      const estimatedByMeasure =
        options?.estimateKeyFifthsByMeasure
          ? estimateMeasureKeyFifthsSequence(notes, measures, trackKeyFifths)
          : null;
      const measuresXml = measures
        .map((measure, measureIndex) => {
          const keyFifths = resolveMeasureKeyFifths(
            project,
            index,
            measureIndex,
            trackKeyFifths,
            estimatedByMeasure,
            options,
          );
          const previousKeyFifths =
            measureIndex > 0
              ? resolveMeasureKeyFifths(
                  project,
                  index,
                  measureIndex - 1,
                  trackKeyFifths,
                  estimatedByMeasure,
                  options,
                )
              : keyFifths;
          const hasKeyChange = measureIndex === 0 || keyFifths !== previousKeyFifths;
          const hasTimeSigChange = tsList.some((ts) => ts.measurePosition === measure.index);
          const needsAttributes = measure.index === 0 || hasTimeSigChange || hasKeyChange;
          const isLastMeasure = measureIndex === measures.length - 1;
          const exportedMeasureNumber = measureNumberBase + measure.index;
          const includeNewSystemPrint = index === 0 && newSystemMeasureNumbers.has(exportedMeasureNumber);
          return (
            `<measure number="${exportedMeasureNumber}">` +
            `${includeNewSystemPrint ? `<print new-system="yes"/>` : ""}` +
            `${needsAttributes ? renderAttributes(measure, ppq, clef, keyFifths, measure.index === 0 || hasTimeSigChange, { grandStaff: staffLayout.useGrandStaff }) : ""}` +
            `${renderTempoDirections(measure, partTempos)}` +
            `${renderMeasureNotesWithKey(project, notes, measure, keyFifths, trackPreserved, staffLayout)}` +
            `${renderFinalBarline(isLastMeasure)}` +
            `</measure>`
          );
        })
        .join("");
      return `<part id="${partId}">${measuresXml}</part>`;
    })
    .join("");

  return (
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<score-partwise version="4.0">` +
    `<part-list>${partList}</part-list>` +
    `${parts}` +
    `</score-partwise>`
  );
}
