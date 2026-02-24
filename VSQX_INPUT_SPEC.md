# VSQX Input 仕様メモ（Phase 1）

この文書は `VSQX -> Project` 取り込みの対象仕様を定義する。

## 1. 対象バージョン

- `vsq3` / `vsq4` を対象とする。
- 判定は VSQX namespace から行う。

## 2. 必須構造

- ルート要素（`vsq3` または `vsq4`）
- `masterTrack`
- `vsTrack`（0件許容、warning対象）

不足時の扱い:

- `masterTrack` 欠落: parse error
- `timeSig` 欠落: default 4/4 を補完 + warning
- `tempo` 欠落: default 120 BPM を補完 + warning

## 3. 取り込み対象要素

- master:
  - `preMeasure`
  - `timeSig`
  - `tempo`
- track:
  - track name
  - musical part / vsPart
  - note:
    - position
    - duration
    - key
    - lyric
    - phoneme（可能な場合）

## 4. 正規化ルール（bounded）

- preMeasure 区間より前の time signature / tempo は先頭要素として丸める。
- tick基準は `tickPrefix` を使って project time-axis へ再配置する。
- 不正値は parse時に除外または既定値へ補正する（クラッシュ回避優先）。

## 5. 診断ポリシー

- parse不能な構造は error（変換停止）。
- 既定値補完で継続可能な不足は warning。
- warningは `convertVsqxToMusicXmlWithReport` の `issues` へ反映する。

## 6. 現時点の既知制約

- VSQX拡張要素の完全保持は未対応。
- ピッチ制御イベント（PIT/PBS）の取り込みは upstream実装依存で段階運用。

