import { parseMusicXml as parseLegacyMusicXml, writeMusicXml as writeLegacyMusicXml } from "../../upstream/utaformatix3-ts/dist-lib/utaformatix3-ts.esm.js";
import type { Project } from "../../upstream/utaformatix3-ts/src/core/model/Project";
import {
  normalizeImportedMusicXmlText,
  parseMusicXmlDocument,
  prettyPrintMusicXmlText,
  serializeMusicXmlDocument,
} from "../../upstream/mikuscore/src/ts/musicxml-io.ts";
import type { MusicXmlAdapter, MusicXmlParseOptions, MusicXmlWriteOptions } from "./MusicXmlAdapter.ts";
import { generateMusicXmlFromProject } from "./ProjectToMusicXml.ts";

function hasXmlDomRuntime(): boolean {
  return typeof DOMParser !== "undefined" && typeof XMLSerializer !== "undefined";
}

function normalizeForOutput(xml: string): string {
  if (!hasXmlDomRuntime()) {
    return String(xml ?? "");
  }
  const normalized = normalizeImportedMusicXmlText(xml);
  const doc = parseMusicXmlDocument(normalized);
  if (!doc) {
    return normalized;
  }
  return prettyPrintMusicXmlText(serializeMusicXmlDocument(doc));
}

export class MikuscoreMusicXmlAdapter implements MusicXmlAdapter {
  public write(project: Project, options?: MusicXmlWriteOptions): string {
    const mode = options?.mode ?? "generate";
    const xml =
      mode === "preserve"
        ? writeLegacyMusicXml(project, { mode })
        : generateMusicXmlFromProject(project, options);
    return this.normalize(xml);
  }

  public parse(xml: string, options?: MusicXmlParseOptions): Project {
    const normalized = this.normalize(xml);
    return parseLegacyMusicXml(normalized, {
      defaultLyric: options?.defaultLyric,
    });
  }

  public normalize(xml: string): string {
    return normalizeForOutput(xml);
  }
}
