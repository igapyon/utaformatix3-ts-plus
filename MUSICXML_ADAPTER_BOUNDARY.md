# MusicXmlAdapter 境界インターフェース定義

この文書は `src/musicxml/MusicXmlAdapter.ts` の責務境界を定義する。

## 1. 境界の目的

- `Project/UFData` 側モデルと `MusicXML` 表現の間を分離する。
- `mikuscore` 連携時に、内部実装差し替えを可能にする。

## 2. 提供インターフェース

- `write(project, options?) => string`
  - `Project -> MusicXML text` を担う。
- `parse(xml, options?) => Project`
  - `MusicXML text -> Project` を担う。
- `normalize(xml) => string`
  - I/O境界での最小正規化を担う。

## 3. オプション境界

- write側:
  - `mode` (`generate` / `preserve`)
  - `keyFifths`, `keyFifthsByMeasure`
  - `estimateKeyFifthsByMeasure`
  - `preferProjectExtras`
- parse側:
  - `defaultLyric`

## 4. 実装責務の分離

- `MikuscoreMusicXmlAdapter`:
  - デフォルト実装（upstream parser/writer + plus generator）
  - グローバルフックによる外部委譲を許可
- converter層:
  - 失敗時のissue化、report API、フォールバック正規化を担当

## 5. フック境界（IIFE連携）

`globalThis.__utaformatix3TsPlusMikuscoreHooks` で以下を受け取る。

- `normalizeImportedMusicXmlText(xml)`
- `parseMusicXmlToProject(xml, options?)`
- `writeProjectToMusicXml(project, options?)`

失敗時は内部実装へフォールバックする（変換停止を避ける）。

