import type { MusicXmlAdapter } from "./MusicXmlAdapter.ts";
import type { MikuscoreMusicXmlHooks } from "./MikuscoreHooks.ts";
import { MikuscoreMusicXmlAdapter } from "./MikuscoreMusicXmlAdapter.ts";
import { clearMikuscoreHooks, getMikuscoreHooks, installMikuscoreHooks } from "./MikuscoreHooks.ts";

let activeMusicXmlAdapter: MusicXmlAdapter = new MikuscoreMusicXmlAdapter();

export function getMusicXmlAdapter(): MusicXmlAdapter {
  return activeMusicXmlAdapter;
}

export function setMusicXmlAdapter(adapter: MusicXmlAdapter): void {
  activeMusicXmlAdapter = adapter;
}

export { clearMikuscoreHooks, getMikuscoreHooks, installMikuscoreHooks };
export { MikuscoreMusicXmlAdapter };
export type { MusicXmlAdapter, MusicXmlParseOptions, MusicXmlWriteMode, MusicXmlWriteOptions } from "./MusicXmlAdapter.ts";
export type { MikuscoreMusicXmlHooks };
