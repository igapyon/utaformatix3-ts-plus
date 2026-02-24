import type { MusicXmlAdapter } from "./MusicXmlAdapter";
import { MikuscoreMusicXmlAdapter } from "./MikuscoreMusicXmlAdapter";

let activeMusicXmlAdapter: MusicXmlAdapter = new MikuscoreMusicXmlAdapter();

export function getMusicXmlAdapter(): MusicXmlAdapter {
  return activeMusicXmlAdapter;
}

export function setMusicXmlAdapter(adapter: MusicXmlAdapter): void {
  activeMusicXmlAdapter = adapter;
}

export { MikuscoreMusicXmlAdapter };
export type { MusicXmlAdapter, MusicXmlParseOptions, MusicXmlWriteMode, MusicXmlWriteOptions } from "./MusicXmlAdapter";

