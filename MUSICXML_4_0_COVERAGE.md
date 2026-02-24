# MusicXML 4.0 要素カバレッジ（utaformatix3-ts-plus）

この文書は、`MusicXML 4.0 <-> VSQX` 変換での要素対応状況を示す。

凡例:

- `Supported`: 実装済み（現行テスト対象）
- `Partial`: 一部のみ対応、または意味保持に制約あり
- `Not yet`: 未対応

## 1. MusicXML -> VSQX（Import）

| 要素 | 状態 | 備考 |
|---|---|---|
| `part` | Supported | `part index -> track index` で対応 |
| `measure` | Supported | 小節境界を tick 計算に使用 |
| `note/pitch/duration` | Supported | 基本ノート変換 |
| `note/rest` | Supported | rest は VSQX note を生成しない |
| `note/chord` | Supported | 同時発音ノートとして保持 |
| `note/tie` | Supported | 連結音価として処理 |
| `attributes/divisions` | Supported | import時の tick rate に使用 |
| `attributes/time` | Supported | 拍子列として保持 |
| `direction/sound@tempo` | Supported | テンポ列として保持 |
| `direction/metronome` | Partial | `sound@tempo` 優先のため補助扱い |
| `attributes/key` | Not yet | VSQX直表現なし（現状は未保存） |
| `attributes/clef` | Not yet | VSQX直表現なし（現状は未保存） |
| `notations/slur` | Not yet | 現状は未保持 |
| `lyrics/syllabic` | Partial | lyric text は保持、syllabic種別は未保持 |

## 2. VSQX -> MusicXML（Export）

| 要素 | 状態 | 備考 |
|---|---|---|
| `part-list/part` | Supported | track単位で出力 |
| `measure` | Supported | measurePrefix を反映 |
| `note/pitch/duration` | Supported | 基本音価 + 付点対応 |
| `note/chord` | Supported | 同tick開始ノートに `<chord/>` |
| `voice` + `<backup>` | Supported | 重なりノート時に自動voice分割 |
| `attributes/divisions` | Supported | 固定divisionsで出力 |
| `attributes/time` | Supported | 拍子列を出力 |
| `attributes/key/fifths` | Supported | options/extras/推定を適用 |
| `attributes/clef` | Supported | トラック音域から自動選択 |
| `direction/sound@tempo` | Supported | テンポを出力 |
| `direction/metronome` | Supported | テンポを併記出力 |
| `accidental` | Supported | 小節内状態管理 + natural復帰 |
| `lyrics/syllabic` | Partial | Romaji時にハイフン規則、Kanaは `single` 優先 |
| `notations/slur` | Not yet | 未対応 |

## 3. 非対象・既知未対応

- MusicXML 4.0 全要素の完全対応（装飾記号、表情記号、高度な notations）
- slur / articulation / ornaments の意味保持
- VSQX側に直対応しない記譜情報（clef/key など）の可逆保持

