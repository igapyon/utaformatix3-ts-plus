import type { Project } from "../../upstream/utaformatix3-ts/src/core/model/Project";

export type MusicXmlWriteMode = "generate" | "preserve";

export type MusicXmlWriteOptions = {
  mode?: MusicXmlWriteMode;
};

export type MusicXmlParseOptions = {
  defaultLyric?: string;
};

export interface MusicXmlAdapter {
  write(project: Project, options?: MusicXmlWriteOptions): string;
  parse(xml: string, options?: MusicXmlParseOptions): Project;
  normalize(xml: string): string;
}
