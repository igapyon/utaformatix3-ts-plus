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

## ライセンス

[LICENSE](./LICENSE) を参照してください。
