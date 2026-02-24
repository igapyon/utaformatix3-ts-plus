import type { MusicXmlAdapter } from "./MusicXmlAdapter.ts";
import { MikuscoreMusicXmlAdapter } from "./MikuscoreMusicXmlAdapter.ts";

let activeMusicXmlAdapter: MusicXmlAdapter = new MikuscoreMusicXmlAdapter();

export function getMusicXmlAdapter(): MusicXmlAdapter {
  return activeMusicXmlAdapter;
}

export function setMusicXmlAdapter(adapter: MusicXmlAdapter): void {
  activeMusicXmlAdapter = adapter;
}

export { MikuscoreMusicXmlAdapter };
export type { MusicXmlAdapter, MusicXmlParseOptions, MusicXmlWriteMode, MusicXmlWriteOptions } from "./MusicXmlAdapter.ts";
