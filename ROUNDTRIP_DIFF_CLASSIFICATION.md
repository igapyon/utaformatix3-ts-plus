# Roundtrip 差分優先度分類

この文書は Phase 3 の差分評価基準を定義する。

対象:

- `scripts/validate-vsqx-roundtrip-diff.mjs`
- `scripts/validate-musicxml-roundtrip-diff.mjs`

## 分類レベル

- `fatal`
  - 音高・発音タイミング・歌詞など、歌唱内容の意味が壊れる差分。
  - CI の `check` では失敗扱い。
- `important`
  - テンポ・拍子など、再生/拍節解釈に影響する差分。
  - CI の `check` では失敗扱い。
- `tolerable`
  - テキスト整形差分など、意味に影響しない差分。
  - `report` で可視化するが `check` の失敗条件には含めない。

## 現在の判定マッピング

- `TRACK_COUNT_MISMATCH` -> `fatal`
- `NOTES_MISMATCH` -> `fatal`
- `TEMPOS_MISMATCH` -> `important`
- `TIMESIGNATURES_MISMATCH` -> `important`
- `textDiffIndex` のみ変化（semantic diff なし） -> `tolerable` 相当

## 運用ルール

1. 新規差分コードを追加する際は、この文書へレベルを追記する。
2. `check` の失敗条件は `fatal || important` とする。
3. `tolerable` は許容するが、件数推移を監視して増加傾向を確認する。

