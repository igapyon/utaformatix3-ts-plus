#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { getMusicXmlAdapter } from "../src/musicxml/index.ts";
import { convertMusicXmlToVsqx } from "../src/converters/musicXmlToVsqx.ts";
import { convertVsqxToMusicXml } from "../src/converters/vsqxToMusicXml.ts";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function extractFirstMeasureActualTick(project) {
  const extras = project.extras;
  if (!extras || typeof extras !== "object") return undefined;
  const root = extras;
  const musicxml = root.musicxml && typeof root.musicxml === "object" ? root.musicxml : null;
  const value = musicxml?.firstMeasureActualTick;
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return undefined;
  return Math.trunc(value);
}

function normalizeLyric(value, defaultLyric) {
  return String(value && value.length > 0 ? value : defaultLyric);
}

function normalizeNotesWithin(project, maxTickExclusive, defaultLyric) {
  return project.tracks
    .flatMap((track) =>
      track.notes
        .filter((note) => note.tickOn >= 0 && note.tickOn < maxTickExclusive)
        .map((note) => ({
          tickOn: note.tickOn,
          tickOff: note.tickOff,
          key: note.key,
          lyric: normalizeLyric(note.lyric, defaultLyric),
        })),
    )
    .sort(
      (a, b) =>
        a.tickOn - b.tickOn ||
        a.tickOff - b.tickOff ||
        a.key - b.key ||
        a.lyric.localeCompare(b.lyric),
    );
}

function countByKey(notes) {
  const counts = new Map();
  for (const note of notes) {
    const key = `${note.tickOn}\t${note.tickOff}\t${note.key}\t${note.lyric}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

function diffMultiset(expectedNotes, actualNotes) {
  const expected = countByKey(expectedNotes);
  const actual = countByKey(actualNotes);
  let missing = 0;
  let extra = 0;
  for (const [k, v] of expected) {
    const delta = v - (actual.get(k) ?? 0);
    if (delta > 0) missing += delta;
  }
  for (const [k, v] of actual) {
    const delta = v - (expected.get(k) ?? 0);
    if (delta > 0) extra += delta;
  }
  return { missing, extra };
}

function extractFirstMeasureConsumedTick(xmlText) {
  const partBody = xmlText.match(/<part\b[^>]*>([\s\S]*?)<\/part>/)?.[1] ?? "";
  const firstMeasure = partBody.match(/<measure\b[^>]*>([\s\S]*?)<\/measure>/)?.[1] ?? "";
  if (!firstMeasure) return null;

  const tokenRegex =
    /<attributes(?:\s[^>]*)?>[\s\S]*?<\/attributes>|<backup(?:\s[^>]*)?>[\s\S]*?<\/backup>|<forward(?:\s[^>]*)?>[\s\S]*?<\/forward>|<note(?:\s[^>]*)?>[\s\S]*?<\/note>/g;
  const tokens = Array.from(firstMeasure.matchAll(tokenRegex)).map((m) => m[0]);
  let divisions = 480;
  let cursorDiv = 0;
  let previousOnsetDiv = 0;
  let maxEndDiv = 0;

  for (const token of tokens) {
    if (token.startsWith("<attributes")) {
      const divisionsRaw = Number(token.match(/<divisions>(\d+)<\/divisions>/)?.[1] ?? "");
      if (Number.isFinite(divisionsRaw) && divisionsRaw > 0) divisions = divisionsRaw;
      continue;
    }
    if (token.startsWith("<backup")) {
      const durationRaw = Number(token.match(/<duration>(-?\d+)<\/duration>/)?.[1] ?? "");
      if (Number.isFinite(durationRaw)) cursorDiv = Math.max(0, cursorDiv - Math.max(0, durationRaw));
      continue;
    }
    if (token.startsWith("<forward")) {
      const durationRaw = Number(token.match(/<duration>(-?\d+)<\/duration>/)?.[1] ?? "");
      if (Number.isFinite(durationRaw)) {
        cursorDiv += Math.max(0, durationRaw);
        maxEndDiv = Math.max(maxEndDiv, cursorDiv);
      }
      continue;
    }

    if (/<grace(\s|\/|>)/.test(token)) continue;
    const durationRaw = Number(token.match(/<duration>(-?\d+)<\/duration>/)?.[1] ?? "");
    const durationDiv = Number.isFinite(durationRaw) ? Math.max(0, durationRaw) : 0;
    const isChord = /<chord(\s|\/|>)/.test(token);
    const onsetDiv = isChord ? previousOnsetDiv : cursorDiv;
    const endDiv = onsetDiv + durationDiv;
    maxEndDiv = Math.max(maxEndDiv, endDiv);
    previousOnsetDiv = onsetDiv;
    if (!isChord) cursorDiv = endDiv;
  }
  return Math.round((maxEndDiv * 480) / divisions);
}

async function main() {
  const [, , inputArg, defaultLyricArg] = process.argv;
  const inputPath = resolve(inputArg ?? "tests/fixtures/musicxml-regression/pickup_regression_01/input.musicxml");
  const defaultLyric = defaultLyricArg ?? "ら";

  const sourceXml = await readFile(inputPath, "utf8");
  const sourceProject = getMusicXmlAdapter().parse(sourceXml, { defaultLyric });
  const sourcePickupTick = extractFirstMeasureActualTick(sourceProject);
  assert(sourcePickupTick != null, "Source firstMeasureActualTick was not detected.");

  const vsqx = convertMusicXmlToVsqx(sourceXml, { musicXml: { defaultLyric } });
  assert(
    /utaformatix3-ts-plus:firstMeasureActualTick=\d+/.test(vsqx),
    "VSQX pickup hint comment was not injected.",
  );

  const roundtripXml = convertVsqxToMusicXml(vsqx, { defaultLyric });
  const roundtripProject = getMusicXmlAdapter().parse(roundtripXml, { defaultLyric });
  const roundtripPickupTick = extractFirstMeasureActualTick(roundtripProject);
  assert(
    roundtripPickupTick === sourcePickupTick,
    `firstMeasureActualTick mismatch: ${sourcePickupTick} != ${String(roundtripPickupTick)}`,
  );

  const sourcePickupNotes = normalizeNotesWithin(sourceProject, sourcePickupTick, defaultLyric);
  const roundtripPickupNotes = normalizeNotesWithin(roundtripProject, sourcePickupTick, defaultLyric);
  const diff = diffMultiset(sourcePickupNotes, roundtripPickupNotes);
  assert(
    diff.missing === 0 && diff.extra === 0,
    `Pickup-note multiset changed: missing=${diff.missing}, extra=${diff.extra}`,
  );

  const consumed = extractFirstMeasureConsumedTick(roundtripXml);
  assert(consumed === sourcePickupTick, `Roundtrip first-measure consumed tick mismatch: ${String(consumed)} != ${sourcePickupTick}`);

  console.log(
    `MusicXML pickup regression validation OK: firstMeasureActualTick=${sourcePickupTick}, pickupNotes=${sourcePickupNotes.length}`,
  );
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`MusicXML pickup regression validation failed: ${message}`);
  process.exit(1);
});

