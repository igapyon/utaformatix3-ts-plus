# MusicXML 4.0 出力ルール（VSQX -> MusicXML）

この文書は `generateMusicXmlFromProject` が採用する出力規則を定義する。

## 1. 最小スキーマ方針

- 出力形式は `score-partwise version="4.0"`。
- 最低1つの `part-list/score-part` と `part` を出力する。
- 各小節で `attributes` を出力し、以下を明示する。
  - `divisions`
  - `key/fifths`
  - `time`
  - `clef`

## 2. 音価・タイ・休符

- noteの duration は divisions基準のtickを使用する。
- 単一の音価で表せる場合は `type`（必要に応じて `dot`）を付与する。
- 分割が必要な長音価は複数noteへ分解し、`tie`/`notations/tied` を付与する。
- ノート間ギャップは `rest` を生成して補完する。
- 同tick開始ノートは `<chord/>` で和音として出力する。

## 3. テンポ指示

- テンポは `direction-type/metronome` と `sound tempo` を併記する。
- 同tickの重複テンポは最後の値で統合する。
- テンポ列に先頭 (`tick=0`) がない場合は先頭テンポを補完する。

## 4. 拍子

- 拍子列は小節位置順で管理し、先頭 (`measure=0`) がない場合は `4/4` を補完する。
- 小節境界は拍子に応じた ticks-per-measure で計算する。

## 5. 追加規則

- 重なりノートがある場合は voice を自動割り当てし、必要時に `<backup>` を出力する。
- 調号は `options -> project.extras -> 推定` の優先順位で決定する。
- 臨時記号は小節内状態を管理し、必要時のみ `<accidental>` を出力する。

## 6. 譜表・記号の閾値規則

- 単一譜表での clef 自動選択:
  - 最高/中央値ではなく、`minKey` を優先して判定する。
  - `minKey >= 55 (G3)` ならト音記号 (`G`) を維持する。
  - それより低い場合は、中央値に基づいてヘ音記号 (`F`) を選択しうる。
- 大譜表（grand staff）判定:
  - 有効化条件は `minKey <= 55 (G3)` かつ `maxKey >= 64 (E4)`。
  - クラスタ分割の基準は `C4`（`key >= 60` を上段、それ未満を下段）。
  - ヒステリシス:
    - 上段維持: `maxKey >= 55 (G3)`
    - 下段維持: `minKey <= 64 (E4)`
