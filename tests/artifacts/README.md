# tests/artifacts

手動変換で生成した確認用ファイルの出力先。

- 推奨出力先: `tests/artifacts/manual-convert/`
- 目的: fixture/golden とは分離して、都度生成物を確認するため
- 注意: ここは検証補助用。正式な期待値は `tests/golden/` を使う
- 方針: 手動変換の出力先は `tests/artifacts/manual-convert/` に限定する。

## 命名ルール（手動ラウンドトリップ）

- 形式: `<basename>.from-<inputFormat>.<stage>.<ext>`
- `inputFormat`: `musicxml` または `vsqx`
- `stage`: `converted`（1回目の変換結果）または `roundtrip`（往復後の最終結果）
- `ext`: 出力フォーマットの拡張子（`musicxml` / `vsqx`）

例:

- MusicXML を入力した場合
- `sample1.from-musicxml.converted.vsqx`
- `sample1.from-musicxml.roundtrip.musicxml`
- VSQX を入力した場合
- `sample1.from-vsqx.converted.musicxml`
- `sample1.from-vsqx.roundtrip.vsqx`

## 当面の運用（sample1/sample2）

- 変換対象: `upstream/mikuscore/src/samples/musicxml/sample1.musicxml`
- 変換対象: `upstream/mikuscore/src/samples/musicxml/sample2.musicxml`
- 出力先: `tests/artifacts/manual-convert/sample1.from-musicxml.converted.vsqx`
- 出力先: `tests/artifacts/manual-convert/sample2.from-musicxml.converted.vsqx`
- ラウンドトリップ出力先: `tests/artifacts/manual-convert/sample1.from-musicxml.roundtrip.musicxml`
- ラウンドトリップ出力先: `tests/artifacts/manual-convert/sample2.from-musicxml.roundtrip.musicxml`

補足:

- 旧命名（`sample1.vsqx` / `sample1.roundtrip.musicxml` など）は互換目的で残っていてもよいが、新規生成は上記ルールを優先する。
