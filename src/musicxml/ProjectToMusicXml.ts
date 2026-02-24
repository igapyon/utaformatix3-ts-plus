import type { Note } from "../../upstream/utaformatix3-ts/src/core/model/Note";
import type { Project } from "../../upstream/utaformatix3-ts/src/core/model/Project";
import type { Tempo } from "../../upstream/utaformatix3-ts/src/core/model/Tempo";
import type { Track } from "../../upstream/utaformatix3-ts/src/core/model/Track";
import type { TimeSignature } from "../../upstream/utaformatix3-ts/src/core/model/TimeSignature";

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

const STEP_TABLE = ["C", "C", "D", "D", "E", "F", "F", "G", "G", "A", "A", "B"] as const;
const ALTER_TABLE = [0, 1, 0, 1, 0, 0, 1, 0, 1, 0, 1, 0] as const;

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

function noteTypeFromDuration(duration: number, divisions: number): { type: string; dots: number } | null {
  const candidates: Array<{ type: string; base: number }> = [
    { type: "whole", base: divisions * 4 },
    { type: "half", base: divisions * 2 },
    { type: "quarter", base: divisions },
    { type: "eighth", base: divisions / 2 },
    { type: "16th", base: divisions / 4 },
    { type: "32nd", base: divisions / 8 },
    { type: "64th", base: divisions / 16 },
  ];

  for (const candidate of candidates) {
    if (candidate.base <= 0) continue;
    if (duration === candidate.base) {
      return { type: candidate.type, dots: 0 };
    }
    if (duration * 2 === candidate.base * 3) {
      return { type: candidate.type, dots: 1 };
    }
    if (duration * 4 === candidate.base * 7) {
      return { type: candidate.type, dots: 2 };
    }
  }
  return null;
}

function toPitch(key: number): { step: string; alter: number; octave: number } {
  const normalized = ((Math.trunc(key) % 12) + 12) % 12;
  const octave = Math.floor(key / 12) - 1;
  return {
    step: STEP_TABLE[normalized],
    alter: ALTER_TABLE[normalized],
    octave,
  };
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

function renderAttributes(measure: Measure, divisions: number, clef: Clef): string {
  const ts = measure.timeSignature;
  return (
    `<attributes>` +
    `<divisions>${divisions}</divisions>` +
    `<key><fifths>0</fifths></key>` +
    `<time><beats>${ts.numerator}</beats><beat-type>${ts.denominator}</beat-type></time>` +
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

function renderRest(duration: number, voice: number): string {
  return `<note><rest/><duration>${duration}</duration><voice>${voice}</voice></note>`;
}

function renderNoteSegment(
  note: Note,
  startTick: number,
  endTick: number,
  divisions: number,
  voice: number,
  options?: { chord?: boolean; lyric?: boolean },
): string {
  const duration = Math.max(1, endTick - startTick);
  const pitch = toPitch(note.key);
  const noteType = noteTypeFromDuration(duration, divisions);
  const tieStart = endTick < note.tickOff;
  const tieStop = startTick > note.tickOn;
  const isFirstSegment = startTick === note.tickOn;
  const includeLyric = options?.lyric ?? true;
  const lyric = includeLyric && isFirstSegment ? escapeXml(normalizeText(note.lyric || "あ")) : "";
  const syllabic = isFirstSegment ? (tieStart ? "begin" : "single") : "";
  const isChordTone = options?.chord === true;

  return (
    `<note>` +
    `${isChordTone ? `<chord/>` : ""}` +
    `<pitch><step>${pitch.step}</step>${pitch.alter !== 0 ? `<alter>${pitch.alter}</alter>` : ""}<octave>${pitch.octave}</octave></pitch>` +
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
  clusters: NoteCluster[],
  measure: Measure,
  divisions: number,
  voiceNumber: number,
): string {
  const measureStart = measure.startTick;
  const measureEnd = measure.startTick + measure.lengthTick;
  let cursor = measureStart;
  let out = "";
  for (const cluster of clusters) {
    if (cluster.startTick > cursor) {
      out += renderRest(cluster.startTick - cursor, voiceNumber);
    }
    for (let i = 0; i < cluster.slices.length; i += 1) {
      const slice = cluster.slices[i];
      out += renderNoteSegment(slice.note, slice.startTick, slice.endTick, divisions, voiceNumber, {
        chord: i > 0,
        lyric: i === 0,
      });
    }
    cursor = Math.max(cursor, cluster.endTick);
  }
  if (cursor < measureEnd) {
    out += renderRest(measureEnd - cursor, voiceNumber);
  }
  return out;
}

function renderMeasureNotes(project: Project, trackNotes: Note[], measure: Measure): string {
  const divisions = project.ppq > 0 ? project.ppq : 480;
  const slices = sliceNotesForMeasure(trackNotes, measure);
  const lanes = assignVoices(toClusters(slices));
  if (lanes.length === 0) {
    return renderRest(measure.lengthTick, 1);
  }
  if (lanes.length === 1) {
    return renderVoiceLane(lanes[0], measure, divisions, 1);
  }

  let out = "";
  for (let i = 0; i < lanes.length; i += 1) {
    out += renderVoiceLane(lanes[i], measure, divisions, i + 1);
    if (i < lanes.length - 1) {
      out += `<backup><duration>${measure.lengthTick}</duration></backup>`;
    }
  }
  return out;
}

export function generateMusicXmlFromProject(project: Project): string {
  const ppq = project.ppq > 0 ? project.ppq : 480;
  const measureNumberBase = Math.max(0, Math.trunc(project.measurePrefix || 0)) + 1;
  const tempos = normalizeTempos(project.tempos);
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
  const maxTick = Math.max(maxNoteTick, maxTempoTick);
  const measures = buildMeasures(project, maxTick);
  const tsList = sortTimeSignatures(project);

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
      const notes = [...track.notes].sort((a, b) => a.tickOn - b.tickOn || a.tickOff - b.tickOff);
      const measuresXml = measures
        .map((measure) => {
          const hasTimeSigChange = tsList.some((ts) => ts.measurePosition === measure.index);
          const needsAttributes = measure.index === 0 || hasTimeSigChange;
          return (
            `<measure number="${measureNumberBase + measure.index}">` +
            `${needsAttributes ? renderAttributes(measure, ppq, clef) : ""}` +
            `${renderTempoDirections(measure, partTempos)}` +
            `${renderMeasureNotes(project, notes, measure)}` +
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
