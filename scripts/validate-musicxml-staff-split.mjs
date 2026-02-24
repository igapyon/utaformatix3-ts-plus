#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parseVsqx } from "../upstream/utaformatix3-ts/dist-lib/utaformatix3-ts.esm.js";
import { convertMusicXmlToVsqx } from "../src/converters/musicXmlToVsqx.ts";

function countPartStaves(xml) {
  const partBlocks = Array.from(xml.matchAll(/<part(?:\s[^>]*)?>([\s\S]*?)<\/part>/g)).map((m) => m[1]);
  if (partBlocks.length === 0) {
    throw new Error("No <part> found in input MusicXML.");
  }
  return partBlocks
    .map((partBlock) => {
      const declared = Array.from(partBlock.matchAll(/<staves>(\d+)<\/staves>/g)).map((m) => Number(m[1]));
      const observed = Array.from(partBlock.matchAll(/<staff>(\d+)<\/staff>/g)).map((m) => Number(m[1]));
      const declaredMax = declared.length > 0 ? Math.max(...declared) : 1;
      const observedMax = observed.length > 0 ? Math.max(...observed) : 1;
      return Math.max(1, declaredMax, observedMax);
    })
    .reduce((sum, n) => sum + n, 0);
}

async function main() {
  const [, , inputArg, defaultLyricArg] = process.argv;
  const inputPath = resolve(inputArg ?? "upstream/mikuscore/src/samples/musicxml/sample1.musicxml");
  const defaultLyric = defaultLyricArg ?? "あ";

  const xml = await readFile(inputPath, "utf8");
  const expectedTrackCount = countPartStaves(xml);
  const vsqx = convertMusicXmlToVsqx(xml, { musicXml: { defaultLyric }, splitPartStaves: true });
  const project = parseVsqx(vsqx, { defaultLyric });

  if (project.tracks.length !== expectedTrackCount) {
    throw new Error(`Track count mismatch: expected=${expectedTrackCount} actual=${project.tracks.length}`);
  }

  console.log(
    `MusicXML staff split validation OK: expectedTracks=${expectedTrackCount} actualTracks=${project.tracks.length}`,
  );
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`MusicXML staff split validation failed: ${message}`);
  process.exit(1);
});
