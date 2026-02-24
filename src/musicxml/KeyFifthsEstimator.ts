type NoteLike = {
  key: number;
  tickOn: number;
  tickOff: number;
};

type MeasureLike = {
  startTick: number;
  lengthTick: number;
};

const SHARP_ORDER = ["F", "C", "G", "D", "A", "E", "B"] as const;
const FLAT_ORDER = ["B", "E", "A", "D", "G", "C", "F"] as const;
const PITCH_CANDIDATES: ReadonlyArray<{ step: string; alter: number }> = [
  { step: "C", alter: 0 },
  { step: "C", alter: 1 },
  { step: "D", alter: 0 },
  { step: "D", alter: 1 },
  { step: "E", alter: 0 },
  { step: "F", alter: 0 },
  { step: "F", alter: 1 },
  { step: "G", alter: 0 },
  { step: "G", alter: 1 },
  { step: "A", alter: 0 },
  { step: "A", alter: 1 },
  { step: "B", alter: 0 },
];

function clampFifths(value: number): number {
  return Math.max(-7, Math.min(7, Math.trunc(value)));
}

function defaultAlterFromFifths(step: string, fifths: number): number {
  const clamped = clampFifths(fifths);
  if (clamped > 0 && SHARP_ORDER.slice(0, clamped).includes(step as (typeof SHARP_ORDER)[number])) return 1;
  if (clamped < 0 && FLAT_ORDER.slice(0, -clamped).includes(step as (typeof FLAT_ORDER)[number])) return -1;
  return 0;
}

function toPitch(key: number): { step: string; alter: number } {
  const pitchClass = ((Math.trunc(key) % 12) + 12) % 12;
  return PITCH_CANDIDATES[pitchClass];
}

type MeasureNote = {
  key: number;
  duration: number;
};

function collectMeasureNotes(notes: ReadonlyArray<NoteLike>, measure: MeasureLike): MeasureNote[] {
  return notes
    .map((note) => ({
      key: note.key,
      duration: Math.max(
        0,
        Math.min(note.tickOff, measure.startTick + measure.lengthTick) - Math.max(note.tickOn, measure.startTick),
      ),
    }))
    .filter((it) => it.duration > 0);
}

function scoreMeasureNotesForFifths(inMeasure: ReadonlyArray<MeasureNote>, fifths: number): number {
  let penalty = 0;
  for (const item of inMeasure) {
    const pitch = toPitch(item.key);
    const keyAlter = defaultAlterFromFifths(pitch.step, fifths);
    penalty += Math.abs(pitch.alter - keyAlter) * item.duration;
  }
  return penalty;
}

export function estimateTrackKeyFifths(notes: ReadonlyArray<Pick<NoteLike, "key">>): number {
  if (notes.length === 0) return 0;
  let best = 0;
  let bestPenalty = Number.POSITIVE_INFINITY;
  for (let fifths = -7; fifths <= 7; fifths += 1) {
    let penalty = 0;
    for (const note of notes) {
      const pitch = toPitch(note.key);
      const keyAlter = defaultAlterFromFifths(pitch.step, fifths);
      penalty += Math.abs(pitch.alter - keyAlter);
    }
    if (penalty < bestPenalty) {
      bestPenalty = penalty;
      best = fifths;
    }
  }
  return clampFifths(best);
}

export function estimateMeasureKeyFifths(
  notes: ReadonlyArray<NoteLike>,
  measure: MeasureLike,
  fallbackFifths: number,
): number {
  const inMeasure = collectMeasureNotes(notes, measure);
  if (inMeasure.length === 0) return clampFifths(fallbackFifths);

  let best = clampFifths(fallbackFifths);
  let bestPenalty = Number.POSITIVE_INFINITY;
  for (let fifths = -7; fifths <= 7; fifths += 1) {
    const penalty = scoreMeasureNotesForFifths(inMeasure, fifths);
    const distancePenalty = Math.abs(fifths - fallbackFifths) * 0.01;
    const score = penalty + distancePenalty;
    if (score < bestPenalty) {
      bestPenalty = score;
      best = fifths;
    }
  }
  return clampFifths(best);
}

export function estimateMeasureKeyFifthsSequence(
  notes: ReadonlyArray<NoteLike>,
  measures: ReadonlyArray<MeasureLike>,
  fallbackFifths: number,
): number[] {
  const sequence: number[] = [];
  let previous = clampFifths(fallbackFifths);
  for (const measure of measures) {
    const inMeasure = collectMeasureNotes(notes, measure);
    if (inMeasure.length === 0) {
      sequence.push(previous);
      continue;
    }

    let best = previous;
    let bestScore = Number.POSITIVE_INFINITY;
    let bestFitScore = Number.POSITIVE_INFINITY;
    for (let fifths = -7; fifths <= 7; fifths += 1) {
      const fitScore = scoreMeasureNotesForFifths(inMeasure, fifths);
      const continuityPenalty = Math.abs(fifths - previous) * 0.25;
      const baselinePenalty = Math.abs(fifths - fallbackFifths) * 0.02;
      const score = fitScore + continuityPenalty + baselinePenalty;
      if (score < bestScore) {
        bestScore = score;
        bestFitScore = fitScore;
        best = fifths;
      }
    }

    if (best !== previous) {
      const previousFitScore = scoreMeasureNotesForFifths(inMeasure, previous);
      const totalDuration = inMeasure.reduce((acc, it) => acc + it.duration, 0);
      const requiredImprovement = Math.max(360, totalDuration * 0.25);
      const improvement = previousFitScore - bestFitScore;
      if (improvement <= requiredImprovement) {
        best = previous;
      }
    }
    previous = clampFifths(best);
    sequence.push(previous);
  }
  return sequence;
}
