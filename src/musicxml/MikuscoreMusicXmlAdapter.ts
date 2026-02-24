import { parseMusicXml as parseLegacyMusicXml, writeMusicXml as writeLegacyMusicXml } from "../../upstream/utaformatix3-ts/dist-lib/utaformatix3-ts.esm.js";
import type { Project } from "../../upstream/utaformatix3-ts/src/core/model/Project";
import type { MusicXmlAdapter, MusicXmlParseOptions, MusicXmlWriteOptions } from "./MusicXmlAdapter.ts";
import { generateMusicXmlFromProject } from "./ProjectToMusicXml.ts";

type MikuscoreMusicXmlHooks = {
  normalizeImportedMusicXmlText?: (xml: string) => string;
  parseMusicXmlToProject?: (xml: string, options?: MusicXmlParseOptions) => Project;
  writeProjectToMusicXml?: (project: Project, options?: MusicXmlWriteOptions) => string;
};

function getGlobalHooks(): MikuscoreMusicXmlHooks {
  const g = globalThis as unknown as Record<string, unknown>;
  const fromDirect = g.__utaformatix3TsPlusMikuscoreHooks;
  if (fromDirect && typeof fromDirect === "object") {
    return fromDirect as MikuscoreMusicXmlHooks;
  }
  const mks = g.mikuscore;
  if (mks && typeof mks === "object") {
    return mks as MikuscoreMusicXmlHooks;
  }
  return {};
}

function hasXmlDomRuntime(): boolean {
  return typeof DOMParser !== "undefined" && typeof XMLSerializer !== "undefined";
}

function parseMusicXmlDocument(xml: string): Document | null {
  if (!hasXmlDomRuntime()) return null;
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  return doc.querySelector("parsererror") ? null : doc;
}

function serializeMusicXmlDocument(doc: Document): string {
  return new XMLSerializer().serializeToString(doc);
}

function prettyPrintMusicXmlText(xml: string): string {
  const compact = String(xml || "").replace(/>\s+</g, "><").trim();
  const split = compact.replace(/(>)(<)(\/*)/g, "$1\n$2$3").split("\n");
  let indent = 0;
  const lines: string[] = [];
  for (const rawToken of split) {
    const token = rawToken.trim();
    if (!token) continue;
    if (/^<\//.test(token)) indent = Math.max(0, indent - 1);
    lines.push(`${" ".repeat(indent)}${token}`);
    const isOpening = /^<[^!?/][^>]*>$/.test(token);
    const isSelfClosing = /\/>$/.test(token);
    if (isOpening && !isSelfClosing) indent += 1;
  }
  return lines.join("\n");
}

function normalizeForOutput(xml: string): string {
  const hooks = getGlobalHooks();
  if (typeof hooks.normalizeImportedMusicXmlText === "function") {
    try {
      return hooks.normalizeImportedMusicXmlText(xml);
    } catch {
      return String(xml ?? "");
    }
  }
  if (!hasXmlDomRuntime()) {
    return String(xml ?? "");
  }
  const normalized = String(xml ?? "");
  const doc = parseMusicXmlDocument(normalized);
  if (!doc) {
    return normalized;
  }
  return prettyPrintMusicXmlText(serializeMusicXmlDocument(doc));
}

export class MikuscoreMusicXmlAdapter implements MusicXmlAdapter {
  public write(project: Project, options?: MusicXmlWriteOptions): string {
    const hooks = getGlobalHooks();
    if (typeof hooks.writeProjectToMusicXml === "function") {
      try {
        return this.normalize(hooks.writeProjectToMusicXml(project, options));
      } catch {
        // Fall back to built-in path for robustness.
      }
    }
    const mode = options?.mode ?? "generate";
    const xml =
      mode === "preserve"
        ? writeLegacyMusicXml(project, { mode })
        : generateMusicXmlFromProject(project, options);
    return this.normalize(xml);
  }

  public parse(xml: string, options?: MusicXmlParseOptions): Project {
    const normalized = this.normalize(xml);
    const hooks = getGlobalHooks();
    if (typeof hooks.parseMusicXmlToProject === "function") {
      try {
        return hooks.parseMusicXmlToProject(normalized, options);
      } catch {
        // Fall back to built-in path for robustness.
      }
    }
    return parseLegacyMusicXml(normalized, {
      defaultLyric: options?.defaultLyric,
    });
  }

  public normalize(xml: string): string {
    return normalizeForOutput(xml);
  }
}
