# tests/artifacts

手動変換で生成した確認用ファイルの出力先。

- 推奨出力先: `tests/artifacts/manual-convert/`
- 目的: fixture/golden とは分離して、都度生成物を確認するため
- 注意: ここは検証補助用。正式な期待値は `tests/golden/` を使う
- 方針: 手動変換の出力先は `tests/artifacts/manual-convert/` に限定する。

## 当面の運用

- 変換対象: `upstream/mikuscore/src/samples/musicxml/sample1.musicxml`
- 変換対象: `upstream/mikuscore/src/samples/musicxml/sample2.musicxml`
- 出力先: `tests/artifacts/manual-convert/sample1.vsqx`
- 出力先: `tests/artifacts/manual-convert/sample2.vsqx`
- ラウンドトリップ出力先: `tests/artifacts/manual-convert/sample1.roundtrip.musicxml`
- ラウンドトリップ出力先: `tests/artifacts/manual-convert/sample2.roundtrip.musicxml`
