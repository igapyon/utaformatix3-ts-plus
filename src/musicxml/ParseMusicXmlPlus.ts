import type { Note } from "../../upstream/utaformatix3-ts/src/core/model/Note";
import type { Project } from "../../upstream/utaformatix3-ts/src/core/model/Project";
import type { Tempo } from "../../upstream/utaformatix3-ts/src/core/model/Tempo";
import type { TimeSignature } from "../../upstream/utaformatix3-ts/src/core/model/TimeSignature";
import type { Track } from "../../upstream/utaformatix3-ts/src/core/model/Track";
import type { MusicXmlParseOptions } from "./MusicXmlAdapter.ts";

const DEFAULT_PPQ = 480;

function extractFirstTagValue(source: string, tag: string): string | null {
  const match = source.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`));
  return match ? match[1].trim() : null;
}

function extractTagBlocks(source: string, tag: string): string[] {
  return Array.from(source.matchAll(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, "g"))).map(
    (m) => m[1],
  );
}

function decodeXml(text: string): string {
  return String(text ?? "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
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

function ticksPerMeasure(ppq: number, ts: TimeSignature): number {
  return Math.round((ppq * 4 * ts.numerator) / ts.denominator);
}

function parsePitchToKey(noteBlock: string): number {
  const step = (extractFirstTagValue(noteBlock, "step") ?? "").trim();
  const octave = Number(extractFirstTagValue(noteBlock, "octave") ?? "");
  const alter = Number(extractFirstTagValue(noteBlock, "alter") ?? "0");
  if (!step || !Number.isFinite(octave)) {
    throw new Error("MusicXML pitch not found");
  }
  const normalizedAlter = Number.isFinite(alter) ? alter : 0;
  return (octave + 1) * 12 + stepToSemitone(step) + normalizedAlter;
}

function parsePartIdOrder(xml: string): string[] {
  return Array.from(xml.matchAll(/<score-part\b[^>]*\bid="([^"]+)"/g)).map((m) => m[1]);
}

function parsePartNameMap(xml: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const match of xml.matchAll(/<score-part\b[^>]*\bid="([^"]+)"[^>]*>([\s\S]*?)<\/score-part>/g)) {
    const id = match[1];
    const body = match[2];
    const name = decodeXml(extractFirstTagValue(body, "part-name") ?? "").trim();
    if (name.length > 0) map.set(id, name);
  }
  return map;
}

function parsePartBlocks(xml: string): Array<{ id: string | null; body: string }> {
  return Array.from(xml.matchAll(/<part\b([^>]*)>([\s\S]*?)<\/part>/g)).map((m) => {
    const attr = m[1] ?? "";
    const id = attr.match(/\bid="([^"]+)"/)?.[1] ?? null;
    return { id, body: m[2] };
  });
}

function parseMasterTrack(firstPartBlock: string): {
  importTickRate: number;
  tempos: Tempo[];
  timeSignatures: TimeSignature[];
  measureBorders: number[];
  firstMeasureActualTick?: number;
} {
  const measureBlocks = extractTagBlocks(firstPartBlock, "measure");
  const firstMeasure = measureBlocks[0] ?? "";
  const divisions = Number(
    extractFirstTagValue(firstMeasure, "divisions") ?? extractFirstTagValue(firstPartBlock, "divisions") ?? `${DEFAULT_PPQ}`,
  );
  const normalizedDivisions = Number.isFinite(divisions) && divisions > 0 ? divisions : DEFAULT_PPQ;
  const importTickRate = DEFAULT_PPQ / normalizedDivisions;

  const timeSignatures: TimeSignature[] = [];
  const tempos: Tempo[] = [];
  const measureBorders: number[] = [0];
  let activeTs: TimeSignature = { measurePosition: 0, numerator: 4, denominator: 4 };
  let tick = 0;
  let firstMeasureActualTick: number | undefined;

  for (let measureIndex = 0; measureIndex < measureBlocks.length; measureIndex += 1) {
    const block = measureBlocks[measureIndex];
    const timeBlock = extractFirstTagValue(block, "time") ?? "";
    const beats = Number(extractFirstTagValue(timeBlock, "beats") ?? "");
    const beatType = Number(extractFirstTagValue(timeBlock, "beat-type") ?? "");
    if (Number.isFinite(beats) && beats > 0 && Number.isFinite(beatType) && beatType > 0) {
      activeTs = {
        measurePosition: measureIndex,
        numerator: Math.trunc(beats),
        denominator: Math.trunc(beatType),
      };
      timeSignatures.push(activeTs);
    }
    const tempoMatch = block.match(/<sound[^>]*tempo="([^"]+)"/);
    const tempoBpm = Number(tempoMatch?.[1] ?? "");
    if (Number.isFinite(tempoBpm) && tempoBpm > 0) {
      tempos.push({
        tickPosition: tick,
        bpm: tempoBpm,
      });
    }
    const nominalTick = ticksPerMeasure(DEFAULT_PPQ, activeTs);
    let lengthTick = nominalTick;
    if (measureIndex === 0) {
      const consumedDivisions = (() => {
        const tokenRegex =
          /<attributes(?:\s[^>]*)?>[\s\S]*?<\/attributes>|<backup(?:\s[^>]*)?>[\s\S]*?<\/backup>|<forward(?:\s[^>]*)?>[\s\S]*?<\/forward>|<note(?:\s[^>]*)?>[\s\S]*?<\/note>/g;
        const tokens = Array.from(block.matchAll(tokenRegex)).map((m) => m[0]);
        let localDivisions = normalizedDivisions;
        let cursor = 0;
        let previousOnset = 0;
        let maxCursor = 0;
        for (const token of tokens) {
          if (token.startsWith("<attributes")) {
            const divisionsRaw = Number(extractFirstTagValue(token, "divisions") ?? "");
            if (Number.isFinite(divisionsRaw) && divisionsRaw > 0) localDivisions = divisionsRaw;
            continue;
          }
          if (token.startsWith("<backup")) {
            const durationRaw = Number(extractFirstTagValue(token, "duration") ?? "");
            if (Number.isFinite(durationRaw)) cursor = Math.max(0, cursor - Math.max(0, durationRaw));
            continue;
          }
          if (token.startsWith("<forward")) {
            const durationRaw = Number(extractFirstTagValue(token, "duration") ?? "");
            if (Number.isFinite(durationRaw)) {
              cursor += Math.max(0, durationRaw);
              maxCursor = Math.max(maxCursor, cursor);
            }
            continue;
          }
          const noteBlock = token;
          if (/<grace(\s|\/|>)/.test(noteBlock)) continue;
          const durationRaw = Number(extractFirstTagValue(noteBlock, "duration") ?? "");
          const duration = Number.isFinite(durationRaw) ? Math.max(0, durationRaw) : 0;
          const isChord = /<chord(\s|\/|>)/.test(noteBlock);
          const onset = isChord ? previousOnset : cursor;
          const end = onset + duration;
          maxCursor = Math.max(maxCursor, end);
          previousOnset = onset;
          if (!isChord) cursor = end;
          if (!(localDivisions > 0)) localDivisions = normalizedDivisions;
        }
        return { maxCursor, divisions: localDivisions };
      })();
      if (consumedDivisions.maxCursor > 0 && consumedDivisions.maxCursor < normalizedDivisions * 4 * activeTs.numerator / activeTs.denominator) {
        const consumedTick = Math.round((consumedDivisions.maxCursor * DEFAULT_PPQ) / consumedDivisions.divisions);
        if (consumedTick > 0 && consumedTick < nominalTick) {
          lengthTick = consumedTick;
          firstMeasureActualTick = consumedTick;
        }
      }
    }
    tick += lengthTick;
    measureBorders.push(tick);
  }

  return {
    importTickRate,
    tempos: tempos.length > 0 ? tempos : [{ tickPosition: 0, bpm: 120 }],
    timeSignatures: timeSignatures.length > 0 ? timeSignatures : [{ measurePosition: 0, numerator: 4, denominator: 4 }],
    measureBorders,
    firstMeasureActualTick,
  };
}

function parseTieTypes(noteBlock: string): { start: boolean; stop: boolean } {
  const types = Array.from(noteBlock.matchAll(/<tie\b[^>]*\btype="([^"]+)"/g)).map((m) => m[1]);
  return {
    start: types.includes("start"),
    stop: types.includes("stop"),
  };
}

function parsePositiveInt(value: string | null, fallback: number): number {
  const n = Number(value ?? "");
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.trunc(n);
}

function parseTrackFromPart(
  partBlock: string,
  trackIndex: number,
  defaultLyric: string,
  masterTrack: ReturnType<typeof parseMasterTrack>,
  fallbackTrackName: string,
): Track {
  const measureBlocks = extractTagBlocks(partBlock, "measure");
  const notes: Note[] = [];
  const tieHeads = new Map<string, number>();
  let divisions = 1;
  let previousOnsetInMeasure = 0;

  for (let measureIndex = 0; measureIndex < measureBlocks.length; measureIndex += 1) {
    const measureBlock = measureBlocks[measureIndex];
    const measureStart = masterTrack.measureBorders[measureIndex] ?? 0;
    const tokenRegex =
      /<attributes(?:\s[^>]*)?>[\s\S]*?<\/attributes>|<backup(?:\s[^>]*)?>[\s\S]*?<\/backup>|<forward(?:\s[^>]*)?>[\s\S]*?<\/forward>|<note(?:\s[^>]*)?>[\s\S]*?<\/note>/g;
    const tokens = Array.from(measureBlock.matchAll(tokenRegex)).map((m) => m[0]);
    let cursor = measureStart;
    previousOnsetInMeasure = measureStart;

    for (const token of tokens) {
      if (token.startsWith("<attributes")) {
        const divisionsRaw = Number(extractFirstTagValue(token, "divisions") ?? "");
        if (Number.isFinite(divisionsRaw) && divisionsRaw > 0) {
          divisions = divisionsRaw;
        }
        continue;
      }
      if (token.startsWith("<backup")) {
        const durationRaw = Number(extractFirstTagValue(token, "duration") ?? "");
        const duration = Number.isFinite(durationRaw) ? Math.max(0, durationRaw) : 0;
        const delta = Math.round((duration * DEFAULT_PPQ) / divisions);
        cursor = Math.max(measureStart, cursor - delta);
        continue;
      }
      if (token.startsWith("<forward")) {
        const durationRaw = Number(extractFirstTagValue(token, "duration") ?? "");
        const duration = Number.isFinite(durationRaw) ? Math.max(0, durationRaw) : 0;
        const delta = Math.round((duration * DEFAULT_PPQ) / divisions);
        cursor += delta;
        continue;
      }

      const noteBlock = token;
      const durationText = extractFirstTagValue(noteBlock, "duration");
      if (durationText == null) {
        if (/<grace(\s|\/|>)/.test(noteBlock)) continue;
        throw new Error("MusicXML duration not found");
      }
      const durationRaw = Number(durationText);
      const durationDiv = Number.isFinite(durationRaw) ? Math.max(0, durationRaw) : 0;
      const durationTick = Math.round((durationDiv * DEFAULT_PPQ) / divisions);
      const isChord = /<chord(\s|\/|>)/.test(noteBlock);
      const isRest = /<rest(\s|\/|>)/.test(noteBlock);
      const voice = parsePositiveInt(extractFirstTagValue(noteBlock, "voice"), 1);
      const staff = parsePositiveInt(extractFirstTagValue(noteBlock, "staff"), 1);
      const onset = isChord ? previousOnsetInMeasure : cursor;

      if (!isRest) {
        const key = parsePitchToKey(noteBlock);
        const lyricText = extractFirstTagValue(extractFirstTagValue(noteBlock, "lyric") ?? "", "text");
        const lyric = decodeXml((lyricText ?? defaultLyric).trim() || defaultLyric);
        const tie = parseTieTypes(noteBlock);
        const tieKey = `${voice}:${staff}:${key}`;
        const existingIndex = tie.stop ? tieHeads.get(tieKey) : undefined;

        if (existingIndex != null) {
          const head = notes[existingIndex];
          notes[existingIndex] = {
            ...head,
            tickOff: Math.max(head.tickOff, onset + durationTick),
          };
          if (!tie.start) {
            tieHeads.delete(tieKey);
          }
        } else {
          notes.push({
            id: notes.length,
            key,
            lyric,
            tickOn: onset,
            tickOff: onset + durationTick,
          });
          if (tie.start) {
            tieHeads.set(tieKey, notes.length - 1);
          }
        }
      }

      previousOnsetInMeasure = onset;
      if (!isChord) {
        cursor += durationTick;
      }
    }
  }

  return {
    id: trackIndex,
    name: fallbackTrackName,
    notes: notes
      .sort((a, b) => a.tickOn - b.tickOn || a.tickOff - b.tickOff || a.key - b.key)
      .map((note, index) => ({ ...note, id: index })),
  };
}

export function parseMusicXmlPlus(text: string, options?: MusicXmlParseOptions): Project {
  const partBlocks = parsePartBlocks(text);
  if (partBlocks.length === 0) {
    throw new Error("MusicXML part not found");
  }

  const partNameMap = parsePartNameMap(text);
  const orderedPartIds = parsePartIdOrder(text);
  const master = parseMasterTrack(partBlocks[0].body);
  const defaultLyric = options?.defaultLyric ?? "あ";

  const tracks = partBlocks.map((part, index) => {
    const partId = part.id ?? orderedPartIds[index] ?? null;
    const fallbackName = partId && partNameMap.get(partId) ? partNameMap.get(partId)! : `Track ${index + 1}`;
    return parseTrackFromPart(part.body, index, defaultLyric, master, fallbackName);
  });

  return {
    format: "MusicXml",
    inputFiles: [],
    name: "musicxml",
    tracks,
    timeSignatures: master.timeSignatures,
    tempos: master.tempos,
    ppq: DEFAULT_PPQ,
    measurePrefix: 0,
    importWarnings: [],
    japaneseLyricsType: "Unknown",
    extras: {
      musicxml: {
        parser: "plus",
        ...(typeof master.firstMeasureActualTick === "number" ? { firstMeasureActualTick: master.firstMeasureActualTick } : {}),
        originalXml: text,
        preservedAt: new Date().toISOString(),
      },
    },
  };
}
