# utaformatix3-ts-plus

`utaformatix3-ts-plus` は、`utaformatix3-ts` を出発点として開発する派生プロジェクトです。  
実装言語は **TypeScript** です。

本プロジェクトは、`utaformatix3-ts` のような「Kotlin版 UtaFormatix への忠実移植」を目的としません。  
**MusicXML と VSQX の相互変換品質を高めること**を最優先の目的とします。  
とくに **MusicXML 4.0 サポート**を目標に開発します。

## 背景

- ベースプロジェクト: <https://github.com/igapyon/utaformatix3-ts>
- 追加参照 upstream: <https://github.com/igapyon/mikuscore>
- `utaformatix3-ts` は Kotlin で書かれた UtaFormatix の TypeScript への忠実移植
- `mikuscore` は MusicXML の入出力実装を含み、本プロジェクトの重要な参照実装
- `utaformatix3-ts-plus` は互換性を努力目標に下げ、改善のための変更を許容

## 基本方針

1. `utaformatix3-ts` と同一挙動は必須にしない
2. よりよい変換品質のために、破壊的変更を含む設計変更を許容する
3. 実装対象は **MusicXML 4.0 <-> VSQX** に集中する
4. 品質評価は「移植忠実性」より「相互変換の正確性・再現性」を重視する
5. `utaformatix3-ts` 由来の MusicXML 入出力（2.0想定）は大規模拡張しない
6. MusicXML 入出力は `mikuscore` 実装を優先活用し、`plus` 側はアダプタ層で接続する

## 開発フェーズ

### Phase 1 (最優先)

**VSQX Import -> MusicXML Export** を強化する。

まずはこのルートの安定化と品質向上を最優先で進める。

### Phase 2

**MusicXML Import -> VSQX Export** を強化する。

### Phase 3

**Round-trip 最適化** (往復変換時の情報落ち最小化) を進める。

## スコープ

- 対象: **MusicXML 4.0** と VSQX の相互変換
- 非対象: 上記以外のフォーマット強化は当面の優先対象外

## 統合目標

- `utaformatix3-ts-plus` は将来的に **mikuscore のライブラリとして同梱**されることを目指す
- ただし初期フェーズでは同梱統合を前提にせず、まずは単体で変換品質を高める
- 開発では `mikuscore` の既存ソースを最大限参照・活用する
- `mikuscore` 側に改善余地が見つかった場合は、改善要望として整理して提案する

## ステータス

- 仕様整理・実装方針の確立フェーズ
- まずは Phase 1 の定義と実装を進める
- `src/musicxml` に `MusicXmlAdapter` の初期実装を追加済み（ブリッジ段階）
  - `generate` は `src/musicxml/ProjectToMusicXml.ts` の自前生成 + `mikuscore` 正規化で出力
  - 同時発音ノート（同一開始tick）は `<chord/>` として出力
  - 重なりノート時は voice 自動割り当て + `<backup>` で複数voiceを出力
  - 基本音価に加えて付点音価（1dot/2dot）で `<type>` と `<dot/>` を出力
  - テンポは `<direction-type><metronome>` と `<sound tempo>` の両方で出力（第1パートに集約）
  - テンポ列は正規化して出力（不正値除外、同tick統合、tick=0補完）
  - `attributes` に `divisions/key/time/clef` を出力（clef はトラック音域から自動選択）
  - `Project.measurePrefix` を小節番号オフセットに反映
  - トラック0件でも最低1パートを自動補完して有効なMusicXMLを生成
  - `preserve` は当面 `utaformatix3-ts` 既存実装を利用
  - 最終的には `mikuscore` 依存を主軸とした入出力へ段階移行する
- `src/converters` に双方向の入口を追加済み
  - `convertVsqxToMusicXml`
  - `convertMusicXmlToVsqx`
  - `convertVsqxToMusicXml` では VSQX読込時に推定調号を `project.extras.musicxml.keyFifthsByTrack` として注入
- 調号推定ロジックは `src/musicxml/KeyFifthsEstimator.ts` に共通化済み（converter / generator で共有）
- Phase 2 の `MusicXML -> VSQX` 仕様メモを `MUSICXML_TO_VSQX_SPEC.md` に追加済み
- `VSQX -> MusicXML` 出力規則を `MUSICXML_OUTPUT_RULES.md` に追加済み
- Phase 3 の roundtrip差分優先度分類を `ROUNDTRIP_DIFF_CLASSIFICATION.md` に追加済み
- MusicXML 4.0 要素カバレッジ一覧を `MUSICXML_4_0_COVERAGE.md` に追加済み
- 変換品質評価指標を `QUALITY_METRICS.md` に追加済み
- VSQX input仕様メモを `VSQX_INPUT_SPEC.md` に追加済み
- mikuscore参照ポイント一覧を `MIKUSCORE_REFERENCE_POINTS.md` に追加済み
- MusicXmlAdapter境界定義を `MUSICXML_ADAPTER_BOUNDARY.md` に追加済み
- mikuscore連携方針を `MIKUSCORE_INTEGRATION_PLAN.md` に追加済み
- mikuscore改善候補バックログを `MIKUSCORE_IMPROVEMENT_BACKLOG.md` に追加済み
- 同梱条件の再評価メモを `MIKUSCORE_BUNDLING_READINESS.md` に追加済み

## クイック変換（試験用）

ローカル一括検証（推奨）:

```bash
npm run check:all
```

VSQX から MusicXML を試験変換するスクリプト:

```bash
node scripts/quick-convert-vsqx-to-musicxml.mjs <input.vsqx> <output.musicxml> [defaultLyric] [keyFifths]
```

VSQX から MusicXML 生成後に、MusicXML パースまで通して簡易検証するスクリプト:

```bash
node scripts/validate-vsqx-to-musicxml.mjs <input.vsqx> [defaultLyric]
```

VSQX fixture 一式を一括検証するスクリプト:

```bash
node scripts/validate-vsqx-fixtures.mjs [fixturesRoot] [defaultLyric]
```

VSQX 変換のエラー/警告ポリシー（report API）のスモーク検証:

```bash
node scripts/validate-vsqx-error-policy.mjs
```

MusicXML 変換のエラー/警告ポリシー（report API）のスモーク検証:

```bash
node scripts/validate-musicxml-error-policy.mjs
```

MusicXML 未対応記譜（slur/ornaments/articulations）の警告ポリシー検証:

```bash
node scripts/validate-musicxml-unsupported-notation-policy.mjs
```

MusicXML 未対応記譜の `retainedExtras` 退避検証:

```bash
node scripts/validate-musicxml-unsupported-notation-extras.mjs
```

`MikuscoreMusicXmlAdapter` のグローバルフック（normalize/parse/write）検証:

```bash
node scripts/validate-mikuscore-adapter-hooks.mjs
```

VSQX fixture から MusicXML ゴールデンを更新・比較するスクリプト:

```bash
# 初回または意図した仕様変更時に更新
node scripts/validate-vsqx-golden.mjs update [fixturesRoot] [goldenRoot] [defaultLyric]

# 通常確認（差分があれば失敗）
node scripts/validate-vsqx-golden.mjs check [fixturesRoot] [goldenRoot] [defaultLyric]
```

MusicXML fixture から VSQX ゴールデンを更新・比較するスクリプト:

```bash
# 初回または意図した仕様変更時に更新
node scripts/validate-musicxml-golden.mjs update [fixturesRoot] [goldenRoot] [defaultLyric]

# 通常確認（差分があれば失敗）
node scripts/validate-musicxml-golden.mjs check [fixturesRoot] [goldenRoot] [defaultLyric]
```

VSQX→MusicXML→再読込で主要情報（音高・長さ・歌詞・テンポ・拍子）を意味比較するスクリプト:

```bash
node scripts/validate-vsqx-semantics.mjs [fixturesRoot] [defaultLyric]
```

MusicXML→VSQX→再読込で主要情報（音高・長さ・歌詞・テンポ・拍子）を意味比較するスクリプト:

```bash
node scripts/validate-musicxml-semantics.mjs [fixturesRoot] [defaultLyric]
```

VSQX→MusicXML→VSQX の差分可視化（`report`）/ 検証（`check`）スクリプト:

```bash
node scripts/validate-vsqx-roundtrip-diff.mjs [fixturesRoot] [defaultLyric] [report|check]
```

MusicXML→VSQX→MusicXML の差分可視化（`report`）/ 検証（`check`）スクリプト:

```bash
node scripts/validate-musicxml-roundtrip-diff.mjs [fixturesRoot] [defaultLyric] [report|check]
```

両スクリプトは差分を `fatal / important / tolerable` に分類して集計表示します。

MusicXML 出力の臨時記号ロジック（sharp/natural/小節リセット）を検証するスモークスクリプト:

```bash
node scripts/validate-musicxml-accidentals.mjs
```

MusicXML 出力の歌詞音節（`<syllabic>`）ロジックを検証するスモークスクリプト:

```bash
node scripts/validate-musicxml-lyrics.mjs
```

`<syllabic>` のハイフン解釈は `project.japaneseLyricsType` が `RomajiCv` / `RomajiVcv` の場合に適用し、
Kana系では歌詞テキストを優先して `single` として出力します。

MusicXML 出力の調号指定ロジック（options / extras / 推定）を検証するスモークスクリプト:

```bash
node scripts/validate-musicxml-keyfifths.mjs
```

## 既知制約と回避策

- MusicXML `slur` / ornaments / articulation は現状未保持
  - 回避策: roundtripで必要な記号は現状利用を避けるか、変換後にDAW/エディタ側で再付与する
  - `convertMusicXmlToVsqxWithReport` では `MUSICXML_UNSUPPORTED_NOTATION` warning を返す
- MusicXML の `key` / `clef` は `MusicXML -> VSQX` で可逆保持していない
  - 回避策: `VSQX -> MusicXML` 出力時は options/extras による調号制御を利用する
- `MusicXML -> VSQX` は lyric text を保持するが `syllabic` 種別は保持しない
  - 回避策: 歌詞分割情報が必要なケースは MusicXML 側を正本として運用する
- VSQX roundtrip のテキスト完全一致は保証しない（semantic一致を重視）
  - 回避策: `validate-*-semantics` と `validate-*-roundtrip-diff` の `fatal/important` を品質ゲートに使う

## 関連仕様ドキュメント

- `MUSICXML_TO_VSQX_SPEC.md`
- `MUSICXML_OUTPUT_RULES.md`
- `VSQX_INPUT_SPEC.md`
- `PHASE1_SCOPE_SPEC.md`
- `MUSICXML_4_0_COVERAGE.md`
- `ROUNDTRIP_DIFF_CLASSIFICATION.md`
- `QUALITY_METRICS.md`
- `MIKUSCORE_REFERENCE_POINTS.md`
- `MUSICXML_ADAPTER_BOUNDARY.md`
- `MIKUSCORE_INTEGRATION_PLAN.md`
- `MIKUSCORE_IMPROVEMENT_BACKLOG.md`
- `MIKUSCORE_BUNDLING_READINESS.md`

## API メモ（調号）

`convertVsqxToMusicXml(..., { musicXml: ... })` / `MusicXmlAdapter.write(..., options)` の `options` で調号を制御できます。

- `keyFifths: number` ですべてのトラックに固定調号を適用
- `keyFifths: number[]` でトラックごとに調号を指定
- `keyFifthsByMeasure: number[][]` でトラック・小節ごとに調号を指定
- `estimateKeyFifthsByMeasure: boolean` で小節ごとの推定調号を有効化
  - 推定は小節間の連続性を考慮し、不要な調号ジャンプを抑制
  - 単発・短尺ノートによる弱い根拠では前小節の調号を維持
- `preferProjectExtras: true|false` で `project.extras` 由来設定の優先を制御
  - `true`（デフォルト）: `options.keyFifths` 未指定時に `project.extras` を参照
  - `false`: `project.extras` を無視して推定調号を使用

## API メモ（エラー/警告）

- `convertVsqxToMusicXml(vsqxText, options)`:
  - 従来通り `string` を返す
  - 失敗時は `Error` を throw
- `convertVsqxToMusicXmlWithReport(vsqxText, options)`:
  - `{ musicXml: string | null, issues: VsqxToMusicXmlIssue[] }` を返す
  - `issues` に warning / error を蓄積して返す（非throwで扱いたい用途向け）
  - VSQX parser の `importWarnings` も `VSQX_IMPORT_WARNING` として取り込む
- `convertMusicXmlToVsqx(musicXmlText, options)`:
  - 従来通り `string` を返す
  - 失敗時は `Error` を throw
- `convertMusicXmlToVsqxWithReport(musicXmlText, options)`:
  - `{ vsqx: string | null, issues: MusicXmlToVsqxIssue[], retainedExtras?: Record<string, unknown> }` を返す
  - `issues` に warning / error を蓄積して返す（非throwで扱いたい用途向け）
  - MusicXML parse 時の `importWarnings` を `MUSICXML_IMPORT_WARNING` として取り込む
  - 未対応記譜がある場合は `retainedExtras.musicxml.unsupportedNotations` に集約する

## ライセンス

[LICENSE](./LICENSE) を参照してください。
