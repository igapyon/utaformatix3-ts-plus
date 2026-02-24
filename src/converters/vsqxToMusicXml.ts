import { parseVsqx } from "../../upstream/utaformatix3-ts/src/core/io/Vsqx";
import { getMusicXmlAdapter } from "../musicxml";
import type { MusicXmlWriteOptions } from "../musicxml";

export type VsqxToMusicXmlOptions = {
  defaultLyric?: string;
  musicXml?: MusicXmlWriteOptions;
};

export function convertVsqxToMusicXml(vsqxText: string, options?: VsqxToMusicXmlOptions): string {
  const project = parseVsqx(vsqxText, {
    defaultLyric: options?.defaultLyric ?? "あ",
  });
  return getMusicXmlAdapter().write(project, options?.musicXml);
}

