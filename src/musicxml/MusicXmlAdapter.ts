import type { Project } from "../../upstream/utaformatix3-ts/src/core/model/Project";

export type MusicXmlWriteMode = "generate" | "preserve";

export type MusicXmlKeyFifthsOption = number | number[];
export type MusicXmlKeyFifthsByMeasureOption = Array<Array<number | undefined>>;

export type MusicXmlWriteOptions = {
  mode?: MusicXmlWriteMode;
  keyFifths?: MusicXmlKeyFifthsOption;
  keyFifthsByMeasure?: MusicXmlKeyFifthsByMeasureOption;
  estimateKeyFifthsByMeasure?: boolean;
  preferProjectExtras?: boolean;
};

export type MusicXmlParseOptions = {
  defaultLyric?: string;
};

export interface MusicXmlAdapter {
  write(project: Project, options?: MusicXmlWriteOptions): string;
  parse(xml: string, options?: MusicXmlParseOptions): Project;
  normalize(xml: string): string;
}
