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

type DurationSpec = {
  duration: number;
  type: string;
  dots: number;
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
  const measures: Measure[] = [];
  let startTick = 0;
  let index = 0;
  const hardLimit = 10000;
  while (startTick <= maxTick && index < hardLimit) {
    const ts = getMeasureTimeSignature(index, tsList);
    const lengthTick = Math.max(1, ticksPerMeasure(ppq, ts));
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
  const sorted = track.notes.map((note) => note.key).sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)] ?? 60;
  if (median < 60) {
    return { sign: "F", line: 4 };
  }
  return { sign: "G", line: 2 };
}

function renderAttributes(
  measure: Measure,
  divisions: number,
  clef: Clef,
  keyFifths: number,
  includeTimeSignature: boolean,
): string {
  const ts = measure.timeSignature;
  return (
    `<attributes>` +
    `<divisions>${divisions}</divisions>` +
    `<key><fifths>${clampFifths(keyFifths)}</fifths></key>` +
    `${includeTimeSignature ? `<time><beats>${ts.numerator}</beats><beat-type>${ts.denominator}</beat-type></time>` : ""}` +
    `<clef><sign>${clef.sign}</sign><line>${clef.line}</line></clef>` +
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

function renderRest(duration: number, voice: number, divisions: number): string {
  const specs = decomposeDuration(duration, divisions);
  if (!specs || specs.length === 0) {
    return `<note><rest/><duration>${duration}</duration><voice>${voice}</voice></note>`;
  }
  return specs
    .map((spec) => {
      return (
        `<note>` +
        `<rest/>` +
        `<duration>${spec.duration}</duration>` +
        `<voice>${voice}</voice>` +
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
  noteType: { type: string; dots: number } | null,
  tieStart: boolean,
  tieStop: boolean,
  lyric: string,
  syllabic: string,
  accidentalText: string | null,
  options?: { chord?: boolean; lyric?: boolean },
): string {
  const isChordTone = options?.chord === true;

  return (
    `<note>` +
    `${isChordTone ? `<chord/>` : ""}` +
    `<pitch><step>${pitch.step}</step>${pitch.alter !== 0 ? `<alter>${pitch.alter}</alter>` : ""}<octave>${pitch.octave}</octave></pitch>` +
    `${accidentalText ? `<accidental>${accidentalText}</accidental>` : ""}` +
    `<duration>${duration}</duration>` +
    `<voice>${voice}</voice>` +
    `${noteType ? `<type>${noteType.type}</type>${"<dot/>".repeat(noteType.dots)}` : ""}` +
    `${tieStart ? `<tie type="start"/>` : ""}` +
    `${tieStop ? `<tie type="stop"/>` : ""}` +
    `${tieStart || tieStop ? `<notations>${tieStart ? `<tied type="start"/>` : ""}${tieStop ? `<tied type="stop"/>` : ""}</notations>` : ""}` +
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
  options?: { chord?: boolean; lyric?: boolean },
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
      noteTypeFromDuration(duration, divisions),
      extTieStart,
      extTieStop,
      lyric,
      syllabic,
      accidentalText,
      options,
    );
  }

  const specs = decomposeDuration(duration, divisions);
  if (!specs || specs.length <= 1) {
    return renderSingleNote(
      pitch,
      duration,
      voice,
      noteTypeFromDuration(duration, divisions),
      extTieStart,
      extTieStop,
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
      out += renderRest(cluster.startTick - cursor, voiceNumber, divisions);
    }
    for (let i = 0; i < cluster.slices.length; i += 1) {
      const slice = cluster.slices[i];
      out += renderNoteSegment(project, slice.note, slice.startTick, slice.endTick, divisions, voiceNumber, spellingContext, {
        chord: i > 0,
        lyric: i === 0,
      });
    }
    cursor = Math.max(cursor, cluster.endTick);
  }
  if (cursor < measureEnd) {
    out += renderRest(measureEnd - cursor, voiceNumber, divisions);
  }
  return out;
}

function renderMeasureNotesWithKey(
  project: Project,
  trackNotes: Note[],
  measure: Measure,
  keyFifths: number,
): string {
  const divisions = project.ppq > 0 ? project.ppq : 480;
  const slices = sliceNotesForMeasure(trackNotes, measure);
  const lanes = assignVoices(toClusters(slices));
  if (lanes.length === 0) {
    return renderRest(measure.lengthTick, 1, divisions);
  }
  if (lanes.length === 1) {
    return renderVoiceLane(project, lanes[0], measure, divisions, 1, keyFifths);
  }

  let out = "";
  for (let i = 0; i < lanes.length; i += 1) {
    out += renderVoiceLane(project, lanes[i], measure, divisions, i + 1, keyFifths);
    if (i < lanes.length - 1) {
      out += `<backup><duration>${measure.lengthTick}</duration></backup>`;
    }
  }
  return out;
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
      const trackKeyFifths = resolveTrackKeyFifths(project, track, index, options);
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
          return (
            `<measure number="${measureNumberBase + measure.index}">` +
            `${needsAttributes ? renderAttributes(measure, ppq, clef, keyFifths, measure.index === 0 || hasTimeSigChange) : ""}` +
            `${renderTempoDirections(measure, partTempos)}` +
            `${renderMeasureNotesWithKey(project, notes, measure, keyFifths)}` +
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
