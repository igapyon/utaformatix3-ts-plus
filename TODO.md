# TODO（utaformatix3-ts-plus）

このファイルは `ROADMAP.md` を実行単位に分解したチェックリストです。

## 0. 基盤整備

- [ ] `README.md` / `ROADMAP.md` / `TODO.md` の相互整合を維持する
- [ ] 開発用ディレクトリ構成（`src/`, `tests/`, `scripts/`）を確定する
- [ ] ビルド・テスト実行基盤（TypeScript + test runner）を初期化する
- [ ] CI の最小パイプライン（lint/typecheck/test）を構築する
- [ ] `mikuscore` 参照ポイント（MusicXML入出力の対象ファイル/関数）を一覧化する
- [ ] `MusicXmlAdapter` 境界インターフェース（`Project/UFData <-> MusicXML DOM`）を定義する

## 1. Phase 1: VSQX Import -> MusicXML 4.0 Export（最優先）

### 1-1. VSQX input 強化

- [ ] VSQX パーサの対象仕様（バージョン・必須要素）を定義する
- [ ] ノート、歌詞、テンポ、拍子、トラック構造の取り込みを安定化する
- [x] VSQX読込時に推定調号を `project.extras.musicxml.keyFifthsByTrack` へ注入する
- [x] 異常入力時のエラー/警告ポリシーを定義する（`convertVsqxToMusicXmlWithReport` 追加、`importWarnings` 取り込み）

### 1-2. MusicXML 4.0 output 強化

- [ ] MusicXML 4.0 出力の最小スキーマ方針を定義する（`mikuscore` 活用前提）
- [ ] 音価・タイ・休符・テンポ指示・拍子の出力規則を確定する
- [x] 歌詞・音節（syllabic）出力方針を確定する（Romaji時のみハイフン規則 `begin/middle/end/single` を適用）
- [x] 臨時記号（`<accidental>`）の基本出力と小節内状態管理を実装する
- [x] 調号（`<key><fifths>`）の推定出力と臨時記号判定の連動を実装する
- [ ] `mikuscore` の MusicXML I/O 呼び出しアダプタを試作する

### 1-3. テスト

- [x] VSQX fixture セットを作成する（最小/テンポ変化/拍子変化/複数トラック）
- [x] VSQX fixture を一括実行する簡易検証スクリプトを追加する（`scripts/validate-vsqx-fixtures.mjs`）
- [x] `VSQX -> MusicXML` のゴールデン比較テストを追加する（`scripts/validate-vsqx-golden.mjs`）
- [x] 主要情報（音高・長さ・歌詞・テンポ・拍子）の意味比較テストを追加する（`scripts/validate-vsqx-semantics.mjs`）
- [x] 調号推定ロジックを共通モジュール化し converter / generator の挙動差を抑制する（`src/musicxml/KeyFifthsEstimator.ts`）
- [x] 臨時記号（sharp/natural/小節リセット）のスモーク検証を追加する（`scripts/validate-musicxml-accidentals.mjs`）
- [x] 調号適用優先順位（options / extras / 推定）のスモーク検証を追加する（`scripts/validate-musicxml-keyfifths.mjs`）
- [x] 小節単位調号（`keyFifthsByMeasure`）のスモーク検証を追加する（`scripts/validate-musicxml-keyfifths.mjs`）
- [x] 小節単位推定調号（`estimateKeyFifthsByMeasure`）のスモーク検証を追加する（`scripts/validate-musicxml-keyfifths.mjs`）
- [x] 小節推定調号の安定化（弱い根拠では前小節維持）を実装しスモーク検証を追加する（`scripts/validate-musicxml-keyfifths.mjs`）
- [x] 歌詞音節（`<syllabic>`）のスモーク検証を追加する（`scripts/validate-musicxml-lyrics.mjs`）
- [x] VSQX変換の error/warning レポートAPI検証を追加する（`scripts/validate-vsqx-error-policy.mjs`）

## 2. Phase 2: MusicXML 4.0 Import -> VSQX Export

### 2-1. MusicXML 4.0 input 強化

- [ ] 取り込み対象要素（part/measure/note/attributes/direction/notations）を明確化する
- [ ] tie/slur/rest/chord の処理方針を定義する
- [ ] 複数パートから VSQX トラックへの割り当て規則を定義する

### 2-2. VSQX output 強化

- [ ] VSQX 出力の必須構造と既定値を定義する
- [ ] Phase 1 と整合するデータ正規化ルールを適用する

### 2-3. テスト

- [ ] MusicXML fixture セットを作成する（単純/複雑記譜/複数パート）
- [ ] `MusicXML -> VSQX` のゴールデン比較テストを追加する

## 3. Phase 3: Round-trip 最適化

- [ ] `VSQX -> MusicXML -> VSQX` 差分を可視化する
- [ ] `MusicXML -> VSQX -> MusicXML` 差分を可視化する
- [ ] 差分の優先度（致命/重要/許容）を分類する
- [ ] 回帰を防ぐ fixture を追加する

## 4. ドキュメント

- [ ] 対応済み/未対応の MusicXML 4.0 要素一覧を作成する
- [ ] 既知制約と回避策を `README.md` に追記する
- [ ] 変換品質の評価指標（保持率、差分件数、失敗率）を定義する

## 5. mikuscore 連携準備（初期は統合しない）

- [ ] `utaformatix3-ts-plus` から見た `mikuscore` 活用方針を文書化する
- [ ] 実装中に見つけた `mikuscore` 改善候補を issue 下書きとして蓄積する
- [ ] Phase 3 開始時に、同梱ライブラリ化の技術条件を再評価する

## 進行中（1つだけ）

- [ ] Phase 1 の対象仕様（VSQX input / `mikuscore` 活用 MusicXML 4.0 output）を確定する
