# ROADMAP（utaformatix3-ts-plus）

このロードマップは `utaformatix3-ts-plus` の開発方針を示します。  
`utaformatix3-ts` との互換は努力目標とし、**MusicXML 4.0 <-> VSQX 変換品質の最大化**を優先します。

## 開発原則

- 実装言語は TypeScript
- 目的は忠実移植ではなく、変換品質と実用性
- 改善のための破壊的変更を許容
- 評価基準は round-trip の正確性・再現性・情報保持率
- `igapyon/mikuscore` の MusicXML 入出力実装を重要な参照として活用
- 最終的に `utaformatix3-ts-plus` を mikuscore 同梱ライブラリとして提供可能にする
- ただし初期フェーズでは統合を前提にしない（単体品質向上を優先）

## Phase 1（最優先）

### 目的

- **VSQX Import -> MusicXML 4.0 Export** の品質向上

### 成果物

- VSQX 読み込みの安定化（主要ケースでクラッシュしない）
- MusicXML 4.0 出力の基盤整備
- 主要情報の保持: 音高、長さ、歌詞、テンポ、拍子、トラック構造
- 変換テストの自動化（fixture ベース）

### 完了条件

- 代表 VSQX fixture で変換成功率 100%
- 主要情報の意味差分が許容範囲内
- 既知制約を文書化

## Phase 2

### 目的

- **MusicXML 4.0 Import -> VSQX Export** の品質向上

### 成果物

- MusicXML 4.0 要素の読み取り強化
- VSQX 出力の構造・互換性改善
- 双方向で共通利用できる正規化ルール整備

### 完了条件

- 代表 MusicXML fixture で変換成功率 100%
- Phase 1 と同等の主要情報保持を確認

## Phase 3

### 目的

- **Round-trip 最適化**（往復変換での情報落ち最小化）

### 成果物

- VSQX -> MusicXML -> VSQX の差分低減
- MusicXML -> VSQX -> MusicXML の差分低減
- 差分診断ツール・テストレポート整備

### 完了条件

- 主要 fixture で round-trip 差分が管理可能な水準
- 回帰テストで品質を継続監視できる状態

## 非スコープ（当面）

- MusicXML/VSQX 以外のフォーマット拡張
- Kotlin 版 UtaFormatix への厳密追従

## 運用

- 仕様変更時は `README.md` / `ROADMAP.md` / `TODO.md` を同時更新
- upstream 取り込みは submodule (`upstream/utaformatix3-ts`) を基点に判断
- `mikuscore` 側の利用要件（API 形状、配布形態、依存条件）との整合は Phase 3 以降で確認する
- `mikuscore` 側に不足や改善余地を見つけたら、改善要望として論点を整理して提出する
