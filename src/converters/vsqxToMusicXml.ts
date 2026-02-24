import { parseVsqx } from "../../upstream/utaformatix3-ts/dist-lib/utaformatix3-ts.esm.js";
import type { Project } from "../../upstream/utaformatix3-ts/src/core/model/Project";
import type { Track } from "../../upstream/utaformatix3-ts/src/core/model/Track";
import { getMusicXmlAdapter } from "../musicxml/index.ts";
import type { MusicXmlWriteOptions } from "../musicxml/index.ts";

export type VsqxToMusicXmlOptions = {
  defaultLyric?: string;
  musicXml?: MusicXmlWriteOptions;
};

function estimateTrackKeyFifths(track: Track): number {
  if (track.notes.length === 0) return 0;
  const sharpOrder = ["F", "C", "G", "D", "A", "E", "B"];
  const flatOrder = ["B", "E", "A", "D", "G", "C", "F"];
  const defaultAlterFromFifths = (step: string, fifths: number): number => {
    if (fifths > 0 && sharpOrder.slice(0, fifths).includes(step)) return 1;
    if (fifths < 0 && flatOrder.slice(0, -fifths).includes(step)) return -1;
    return 0;
  };
  const toPitch = (key: number): { step: string; alter: number } => {
    const pc = ((Math.trunc(key) % 12) + 12) % 12;
    const candidates = [
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
    return candidates[pc];
  };

  let best = 0;
  let bestPenalty = Number.POSITIVE_INFINITY;
  for (let fifths = -7; fifths <= 7; fifths += 1) {
    let penalty = 0;
    for (const note of track.notes) {
      const pitch = toPitch(note.key);
      const keyAlter = defaultAlterFromFifths(pitch.step, fifths);
      penalty += Math.abs(pitch.alter - keyAlter);
    }
    if (penalty < bestPenalty) {
      bestPenalty = penalty;
      best = fifths;
    }
  }
  return best;
}

function enrichProjectWithEstimatedMusicXmlKeyFifths(project: Project): Project {
  const keyFifthsByTrack = project.tracks.map((track) => estimateTrackKeyFifths(track));
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
        keyFifthsSource: "estimated-from-vsqx-notes",
      },
    },
  };
}

export function convertVsqxToMusicXml(vsqxText: string, options?: VsqxToMusicXmlOptions): string {
  const parsed = parseVsqx(vsqxText, {
    defaultLyric: options?.defaultLyric ?? "あ",
  });
  const project = enrichProjectWithEstimatedMusicXmlKeyFifths(parsed);
  return getMusicXmlAdapter().write(project, options?.musicXml);
}
