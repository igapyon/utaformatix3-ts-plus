import { writeVsqx } from "../../upstream/utaformatix3-ts/src/core/io/Vsqx";
import { getMusicXmlAdapter } from "../musicxml";
import type { MusicXmlParseOptions } from "../musicxml";

export type MusicXmlToVsqxOptions = {
  musicXml?: MusicXmlParseOptions;
};

export function convertMusicXmlToVsqx(musicXmlText: string, options?: MusicXmlToVsqxOptions): string {
  const project = getMusicXmlAdapter().parse(musicXmlText, options?.musicXml);
  return writeVsqx(project).content;
}

