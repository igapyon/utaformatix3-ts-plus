# 開発ワークフロー（ローカル運用）

この文書は `utaformatix3-ts-plus` の日常開発フローを定義する。
本リポジトリは **GitHub操作なし** を前提に、ローカル品質ゲートで運用する。

## 1. ディレクトリ構成

- `src/`
  - 変換ロジック本体（converter / musicxml adapter）
- `scripts/`
  - 検証・変換・ビルド補助
- `tests/fixtures/`
  - ローカル検証用fixture
- `tests/golden/`
  - ゴールデンデータ
- `tests/artifacts/manual-convert/`
  - 手動変換の出力先（確認用）
- `upstream/utaformatix3-ts/`
  - 参照実装（read-only運用）
- `upstream/mikuscore/`
  - 参照実装（read-only運用）

## 2. 基本コマンド

- 全体チェック:
  - `npm run check:all`
- VSQX系チェック:
  - `npm run check:vsqx`
- MusicXML系チェック:
  - `npm run check:musicxml`
- roundtripチェック:
  - `npm run check:roundtrip`

## 3. 日常フロー

1. 仕様文書（README/TODO/該当spec）を更新
2. 実装変更
3. fixture/golden更新（必要時）
4. `npm run check:all` 実行
5. 差分確認

## 4. 品質ゲート方針

- `check:all` を最小品質ゲートとする。
- 失敗時は修正完了まで次工程へ進まない。
- roundtripは `fatal=0` かつ `important=0` を維持する。

## 5. 禁止事項（本運用）

- GitHub Actions の追加/更新
- GitHubへのpushやPR操作
- リモート環境依存の検証フロー
