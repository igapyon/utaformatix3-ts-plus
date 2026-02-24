# 同梱ライブラリ化の技術条件（再評価メモ）

この文書は、`utaformatix3-ts-plus` を `mikuscore` 同梱ライブラリとして扱う際の再評価条件を整理する。

## 1. 機能条件

- 双方向変換APIが report 版を含めて安定していること。
- Phase 2の仕様（`MUSICXML_TO_VSQX_SPEC.md`）と実装の乖離がないこと。
- 既知制約が README に明記されていること。

## 2. 品質条件

- 品質ゲート:
  - golden / semantics / roundtrip check がすべて pass
  - roundtrip diff の `fatal=0` かつ `important=0`
- 回帰fixture:
  - defaults系（tempo/timesig fallback）を含めて継続監視できること。

## 3. 配布条件

- IIFE bundle の再現ビルド手順が固定されていること。
- 公開グローバル名・フック仕様が文書化されていること。
- `mikuscore` 側の読み込み順要件が明示されていること。

## 4. 運用条件

- 変換失敗時の診断（issues）を UI/ログで可視化できること。
- `mikuscore` 改善候補がバックログ化され、追跡可能であること。
- リリース前に連携スモーク（最小変換）を毎回実施すること。

## 5. 現時点の評価（2026-02-24）

- 条件1-4を満たすための基礎要素は概ね整備済み。
- 未対応要素（slur等の高度notations）は既知制約として継続管理。
- 同梱判断は、`mikuscore` 側の受け入れ条件（配布フロー/依存ポリシー）との最終照合後に実施する。

