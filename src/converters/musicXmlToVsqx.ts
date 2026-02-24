import { writeVsqx } from "../../upstream/utaformatix3-ts/dist-lib/utaformatix3-ts.esm.js";
import { getMusicXmlAdapter } from "../musicxml/index.ts";
import type { MusicXmlParseOptions } from "../musicxml/index.ts";

export type MusicXmlToVsqxOptions = {
  musicXml?: MusicXmlParseOptions;
};

export function convertMusicXmlToVsqx(musicXmlText: string, options?: MusicXmlToVsqxOptions): string {
  const project = getMusicXmlAdapter().parse(musicXmlText, options?.musicXml);
  return writeVsqx(project).content;
}
