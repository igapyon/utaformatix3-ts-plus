# utaformatix3-ts-plus

`utaformatix3-ts-plus` は、VSQX と MusicXML の相互変換を行う TypeScript 実装です。
開発者が変換機能を組み込み・検証しやすいように、双方向 API と report API（警告/エラー収集）を提供します。
`utaformatix3-ts-plus` は、`utaformatix3-ts` を出発点として開発する派生プロジェクトです。
実装言語は **TypeScript** です。
`utaformatix3-ts` は `utaformatix3` (主に Kotlin で記述されたもの) を TypeScript に移植したものです。
本プロジェクトの MusicXML 入出力は、`mikuscore` の一部機能に依存しています。

実装寄りの旧 README は [README_IMPLEMENTATION_ARCHIVE.md](./README_IMPLEMENTATION_ARCHIVE.md) に退避しています。

## できること

- `VSQX -> MusicXML`
- `MusicXML -> VSQX`
- 変換時の warning / error を report として取得
- MusicXML 変換時の調号制御（固定・トラック別・小節別・推定）

## セットアップ

前提:

- Node.js 18+
- npm

依存関係のインストール:

```bash
npm install
```

## クイックスタート

### API で使う

```ts
import {
  convertVsqxToMusicXml,
  convertMusicXmlToVsqx,
  convertVsqxToMusicXmlWithReport,
  convertMusicXmlToVsqxWithReport,
} from "./src/index.ts";

const musicXml = convertVsqxToMusicXml(vsqxText);
const vsqx = convertMusicXmlToVsqx(musicXmlText);

const vsqxToMusicXmlReport = convertVsqxToMusicXmlWithReport(vsqxText);
const musicXmlToVsqxReport = convertMusicXmlToVsqxWithReport(musicXmlText);
```

### スクリプトで試す

```bash
# 全体チェック
npm run check:all

# VSQX -> MusicXML の簡易変換
node scripts/quick-convert-vsqx-to-musicxml.mjs <input.vsqx> <output.musicxml> [defaultLyric] [keyFifths]

# VSQX -> MusicXML の簡易検証
node scripts/validate-vsqx-to-musicxml.mjs <input.vsqx> [defaultLyric]
```

## 主要 API

- `convertVsqxToMusicXml(vsqxText, options?)`
: 変換結果の MusicXML 文字列を返します。失敗時は `Error` を throw します。

- `convertMusicXmlToVsqx(musicXmlText, options?)`
: 変換結果の VSQX 文字列を返します。失敗時は `Error` を throw します。

- `convertVsqxToMusicXmlWithReport(vsqxText, options?)`
: `{ musicXml, issues }` を返します。`issues` に warning / error を収集します。

- `convertMusicXmlToVsqxWithReport(musicXmlText, options?)`
: `{ vsqx, issues, retainedExtras? }` を返します。未対応記譜は `retainedExtras` に退避されます。

## MusicXML オプション（調号）

`convertVsqxToMusicXml(..., { musicXml: ... })` で制御できます。

- `keyFifths: number` : 全トラック共通の固定調号
- `keyFifths: number[]` : トラック別調号
- `keyFifthsByMeasure: number[][]` : トラック x 小節別調号
- `estimateKeyFifthsByMeasure: boolean` : 小節別の推定調号を有効化
- `preferProjectExtras: boolean` : `project.extras` 優先を切り替え

## 既知の制約

- MusicXML の一部記譜（例: `slur` / ornaments / articulation）は完全保持ではありません。
- `MusicXML -> VSQX` で `syllabic` 種別は保持しません（歌詞テキストは保持）。
- roundtrip はテキスト完全一致ではなく semantic 一致を重視します。

## 関連ドキュメント

- [DEVELOPMENT_WORKFLOW.md](./DEVELOPMENT_WORKFLOW.md)
- [MUSICXML_TO_VSQX_SPEC.md](./MUSICXML_TO_VSQX_SPEC.md)
- [MUSICXML_OUTPUT_RULES.md](./MUSICXML_OUTPUT_RULES.md)
- [MUSICXML_STAFF_CLEF_LOGIC.md](./MUSICXML_STAFF_CLEF_LOGIC.md)
- [MUSICXML_4_0_COVERAGE.md](./MUSICXML_4_0_COVERAGE.md)
- [QUALITY_METRICS.md](./QUALITY_METRICS.md)

## ライセンス

[LICENSE](./LICENSE)
