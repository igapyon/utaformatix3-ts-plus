# mikuscore 参照ポイント一覧（MusicXML I/O）

`utaformatix3-ts-plus` から `mikuscore` を参照する際の主要ポイントを整理する。

## 1. 正規化・DOM基盤

- `upstream/mikuscore/src/ts/musicxml-io.ts`
  - `normalizeImportedMusicXmlText(xml)`
  - `parseMusicXmlDocument(xml)`
  - `prettyPrintMusicXmlText(xml)`

## 2. 取込フロー（Format -> MusicXML）

- `upstream/mikuscore/src/ts/load-flow.ts`
  - 各formatからMusicXMLへ収束させる入口
  - `formatImportedMusicXml(...)` で正規化適用
- `upstream/mikuscore/src/ts/mxl-io.ts`
  - MXL/ZIPからMusicXML抽出

## 3. 出力フロー（MusicXML -> 他形式）

- `upstream/mikuscore/src/ts/download-flow.ts`
  - MusicXML DOMを各形式へエクスポートする導線

## 4. main統合点

- `upstream/mikuscore/src/ts/main.ts`
  - 正規化関数の接続
  - load/download/playback 各flowへの依存注入

## 5. 診断・メタデータ方針の参照

- `upstream/mikuscore/docs/spec/FORMAT_IO_CHECKLIST.md`
- `upstream/mikuscore/docs/spec/DIAGNOSTICS.md`
- `upstream/mikuscore/docs/spec/ARCHITECTURE.md`

## 6. plus 側での利用方針

- 直接importは行わず、IIFEのグローバルフック経由で連携する。
- 優先利用するフック:
  - `normalizeImportedMusicXmlText`
  - `parseMusicXmlToProject`
  - `writeProjectToMusicXml`

