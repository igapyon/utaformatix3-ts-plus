# mikuscore 連携方針（utaformatix3-ts-plus）

この文書は、`utaformatix3-ts-plus` を `mikuscore` で利用するための実装方針を定義する。

## 1. 連携の基本方針

- `mikuscore` からは IIFE bundle (`UtaFormatix3TsPlusMikuscore`) を外部ユーティリティとして読み込む。
- 依存方向は `mikuscore <- utaformatix3-ts-plus bundle` の一方向に限定する。
- `mikuscore` 本体への静的 import は行わない（循環参照を避ける）。

## 2. 公開API利用方針

- 変換入口:
  - `convertVsqxToMusicXmlWithReport`
  - `convertMusicXmlToVsqxWithReport`
- UI連携では `issues` を警告/エラー表示へ接続する。
- `string` API（非 report）版は単純な一括変換用途に限定する。

## 3. 正規化フック方針

- `globalThis.__utaformatix3TsPlusMikuscoreHooks.normalizeImportedMusicXmlText` を利用可能にする。
- フック未設定時でも `plus` 側フォールバックで処理継続する。
- フックは「構文正規化」に限定し、意味再構成（global reflow）は行わない。

## 4. 品質ゲート方針

連携前に以下を必須通過条件とする。

- golden check:
  - `validate-vsqx-golden.mjs check`
  - `validate-musicxml-golden.mjs check`
- semantics:
  - `validate-vsqx-semantics.mjs`
  - `validate-musicxml-semantics.mjs`
- roundtrip diff check:
  - `validate-vsqx-roundtrip-diff.mjs ... check`
  - `validate-musicxml-roundtrip-diff.mjs ... check`
  - `fatal=0` かつ `important=0`

## 5. 配布・運用方針

- bundle生成:
  - `node scripts/build-mikuscore-iife.mjs`
- 配布物:
  - `dist/utaformatix3-ts-plus.mikuscore.iife.js`
- `mikuscore` 読み込み順:
  - bundleを先読み、`window.UtaFormatix3TsPlusMikuscore` 存在確認後に利用する。

