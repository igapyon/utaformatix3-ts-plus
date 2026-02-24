# MusicXML -> VSQX 仕様メモ（Phase 2）

この文書は `utaformatix3-ts-plus` における `MusicXML 4.0 -> VSQX` の実装方針を定義する。
対象は `convertMusicXmlToVsqx` / `convertMusicXmlToVsqxWithReport`。

## 1. 取り込み対象要素（MVP）

- `part`:
  - 各 `part` を 1 VSQX track に対応づける。
- `measure`:
  - 小節境界を時間軸計算に使用する。
- `note`:
  - pitch/rest/chord/tie を upstream parser の既存挙動で解釈する。
- `attributes`:
  - `time`（拍子）を master track へ反映する。
  - `divisions` は内部tick計算に利用する（出力PPQはVSQX既定の 480）。
  - `key` / `clef` は現段階では VSQX 直表現に持たないため、直接は出力しない。
- `direction`:
  - `sound tempo` / `metronome` 由来テンポを master track へ反映する。
- `notations`:
  - tie は note length 統合に関与する。
  - slur などVSQX直表現を持たない記譜要素は非対象（将来拡張）。

## 2. tie/slur/rest/chord の扱い

- tie:
  - 音価連結として扱う（upstream parser 挙動を利用）。
- slur:
  - VSQXへの直変換対象外。現段階では情報保持しない。
- rest:
  - VSQX note を生成しない（休符区間として時間軸にのみ影響）。
- chord:
  - 同時発音ノートとして複数 note を保持する。

## 3. 複数パートからVSQXトラックへの割り当て

- 基本ルールは `part index -> track index` の順序保持マッピング。
- track名は MusicXML part 名を優先し、欠落時は `Track {index+1}` を使用する。
- パート間マージは行わない（1 part = 1 track を維持）。

## 4. VSQX出力の必須構造と既定値

- スキーマ: VSQX4 を出力（upstream `writeVsqx` 挙動）。
- `preMeasure`:
  - `project.measurePrefix` を利用し、最低値は1。
- マスター情報の既定値（不足時フォールバック）:
  - tempo: `tick=0, bpm=120`
  - time signature: `measure=0, 4/4`
- トラックの既定値（不足時フォールバック）:
  - 最低1トラックを生成（`Track 1`、noteなし）。

## 5. 正規化ルール（bounded normalization）

`MusicXML -> VSQX` では、出力直前に以下のみを許可する。

1. tracks が空なら fallback track を1件補完
2. tempos が空なら fallback tempo を1件補完
3. timeSignatures が空なら fallback time signature を1件補完

それ以外の広域再構成（global reflow, cross-track merge）は行わない。

## 6. 診断ポリシー

- `convertMusicXmlToVsqxWithReport` は warning/error を `issues` で返す。
- 変換継続可能な不足は warning とし、フォールバック適用後に出力を継続する。
- parse失敗・writer失敗は error として返し、`vsqx: null` を返す。
- `slur` / `ornaments` / `articulations` 検出時は `MUSICXML_UNSUPPORTED_NOTATION` warning を返す。
- 未対応記譜の検出結果は `retainedExtras.musicxml.unsupportedNotations` に集約する。
