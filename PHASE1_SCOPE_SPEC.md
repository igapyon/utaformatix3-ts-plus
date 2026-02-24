# Phase 1 対象仕様（確定版）

対象: `VSQX Import -> MusicXML 4.0 Export`

## 1. 入力（VSQX）

- 対応バージョン: `vsq3` / `vsq4`
- 取り込み対象:
  - トラック構造
  - note（tick/key/lyric）
  - tempo
  - time signature
- 異常入力:
  - parse不能: error
  - 既定値補完可能: warning + 変換継続

## 2. 出力（MusicXML 4.0）

- 最小スキーマ:
  - `score-partwise 4.0`
  - `part-list/part/measure/attributes`
- 保持対象:
  - 音高、長さ、歌詞
  - テンポ、拍子
  - トラック構造
- 出力規則:
  - 長音価分割 + tie
  - 和音 `<chord/>`
  - 重なり音価は voice 分割 + `<backup>`
  - 調号推定と臨時記号制御

## 3. 品質ゲート

- `validate-vsqx-fixtures`
- `validate-vsqx-golden check`
- `validate-vsqx-semantics`
- `validate-vsqx-error-policy`

合格条件:

- error 0件
- semantic diff 0件
- golden diff 0件

