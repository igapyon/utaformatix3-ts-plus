# MusicXML 譜表・記号判定ロジック

この文書は、`VSQX -> MusicXML` 出力時に

- 単一譜表にするか
- 大譜表（ト音+ヘ音）にするか
- 単一譜表時にト音/ヘ音をどう選ぶか

を判定する現行ロジックを説明する。

実装箇所: `src/musicxml/ProjectToMusicXml.ts`

## 1. 使用している主要閾値

- `VIOLIN_TREBLE_LOWEST_KEY = 55`（G3）
- `LOWER_STAFF_HOLD_MAX = 64`（E4）
- `STAFF_SPLIT_C4 = 60`（C4）
- `STAFF_SPLIT_B3 = 59`（B3）

## 2. 大譜表を使うかの一次判定

まずトラック全体で以下を評価する。

- `minKey <= 55 (G3)` かつ `maxKey >= 64 (E4)` のときのみ、大譜表候補にする。
- それ以外は単一譜表にする。

## 3. 大譜表候補時の上段/下段割り当て

同時発音クラスタ単位で staff を割り当てる。

- 基本境界:
  - `key >= 60 (C4)` は上段候補
  - `key <= 59 (B3)` は下段候補
- ヒステリシス:
  - 直前が上段なら、`maxClusterKey >= 55` の間は上段維持
  - 直前が下段なら、`minClusterKey <= 64` の間は下段維持

## 4. 大譜表の最終ガード（片側空防止）

割り当て後に実音が

- 上段のみ
- 下段のみ

のどちらか片側だけだった場合は、大譜表を無効化して単一譜表に戻す。

これにより「片側に音がないのに休符だけの五線を出す」状態を防ぐ。

## 5. 単一譜表時の clef 選択

- `minKey >= 55 (G3)` ならト音記号（G）を維持
- それより低い音がある場合は、中央値ベースでヘ音記号（F）を選択しうる

## 6. 関連テスト

- `scripts/validate-musicxml-grandstaff-hysteresis.mjs`
- `scripts/validate-musicxml-clef-threshold-g3.mjs`
- `scripts/validate-musicxml-no-phantom-grandstaff.mjs`

