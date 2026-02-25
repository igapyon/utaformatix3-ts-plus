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
- `tests/fixtures/musicxml-regression/`
  - MusicXML回帰の最小再現fixture
- `tests/golden/`
  - ゴールデンデータ
- `tests/artifacts/manual-convert/`
  - 手動変換の出力先（確認用・一時成果物）
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

補足:

- 回帰不具合は可能な限り `tests/fixtures/musicxml-regression/` に最小fixtureとして固定する。
- `tests/artifacts/manual-convert/` の検証ファイルは恒久管理しない（調査完了後に削除）。

## 4. 品質ゲート方針

- `check:all` を最小品質ゲートとする。
- 失敗時は修正完了まで次工程へ進まない。
- roundtripは `fatal=0` かつ `important=0` を維持する。

## 5. テスト戦略（運用ルール）

本プロジェクトの品質は、次の3層テストを組み合わせて維持する。
これは単なる網羅数の確保ではなく、変換ソフトウェアの品質を
「実装の都合」ではなく「音楽情報の保存」という目的から定義するための運用である。

本プロジェクトでは、テキストの一致そのものを目的化しない。
目的は、往復変換や仕様進化の中でも、利用者にとって本質的な情報
（音高・長さ・歌詞・テンポ・拍子など）が壊れないことにある。
また、見つかった不具合は一時的な修正で終わらせず、
最小回帰fixtureとして知識化し、将来変更に対する防波堤へ変換する。

1. 通常テスト:
   - 変換ロジック/APIの仕様単位の正しさを確認する。
2. roundtripテスト:
   - `VSQX -> MusicXML -> VSQX` / `MusicXML -> VSQX -> MusicXML` の劣化を検出する。
   - テキスト完全一致ではなく semantic一致（fatal/important）を主判定にする。
3. 最小回帰fixtureテスト:
   - 不具合発見時は、現象を再現する「不具合のエッセンス」を1-2小節へ圧縮する。
   - 圧縮した最小fixtureを `tests/fixtures/musicxml-regression/` に追加して恒久回帰とする。

## 6. 禁止事項（本運用）

- GitHub Actions の追加/更新
- GitHubへのpushやPR操作
- リモート環境依存の検証フロー
