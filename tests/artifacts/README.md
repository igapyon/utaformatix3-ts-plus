# tests/artifacts

手動変換で生成した確認用ファイルの出力先。

- 推奨出力先: `tests/artifacts/manual-convert/`
- 目的: fixture/golden とは分離して、都度生成物を確認するため
- 注意: ここは検証補助用。正式な期待値は `tests/golden/` を使う
- 方針: 手動変換の出力先は `tests/artifacts/manual-convert/` に限定し、`download/` は使用しない
