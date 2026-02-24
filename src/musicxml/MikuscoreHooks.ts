import type { Project } from "../../upstream/utaformatix3-ts/src/core/model/Project";
import type { MusicXmlParseOptions, MusicXmlWriteOptions } from "./MusicXmlAdapter.ts";

export type MikuscoreMusicXmlHooks = {
  normalizeImportedMusicXmlText?: (xml: string) => string;
  parseMusicXmlToProject?: (xml: string, options?: MusicXmlParseOptions) => Project;
  writeProjectToMusicXml?: (project: Project, options?: MusicXmlWriteOptions) => string;
};

type GlobalLike = Record<string, unknown> & {
  __utaformatix3TsPlusMikuscoreHooks?: unknown;
  mikuscore?: unknown;
};

function getGlobalLike(): GlobalLike {
  return globalThis as unknown as GlobalLike;
}

export function getMikuscoreHooks(): MikuscoreMusicXmlHooks {
  const g = getGlobalLike();
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

export function installMikuscoreHooks(hooks: MikuscoreMusicXmlHooks): void {
  getGlobalLike().__utaformatix3TsPlusMikuscoreHooks = hooks;
}

export function clearMikuscoreHooks(): void {
  delete getGlobalLike().__utaformatix3TsPlusMikuscoreHooks;
}
