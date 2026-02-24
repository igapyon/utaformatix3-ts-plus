# 変換品質の評価指標

この文書は、`utaformatix3-ts-plus` の品質評価に使う共通指標を定義する。

## 1. 指標定義

## 保持率（Retention Rate）

- Note保持率:
  - `roundtrip後note数 / 変換前note数`
- Tempo保持率:
  - `roundtrip後tempo数 / 変換前tempo数`
- TimeSignature保持率:
  - `roundtrip後拍子数 / 変換前拍子数`

備考:
- 件数だけでなく値一致（tick, pitch, lyric など）を `semantic diff` で同時確認する。

## 差分件数（Diff Count）

- semantic差分:
  - `fatal / important / tolerable` に分類した差分件数
  - 取得元:
    - `validate-vsqx-roundtrip-diff.mjs`
    - `validate-musicxml-roundtrip-diff.mjs`
- text差分:
  - `textDiffIndex` を補助指標として記録（意味差分がない場合は tolerable）

## 失敗率（Failure Rate）

- 変換失敗率:
  - `error件数 / 総入力件数`
  - report API (`convert*WithReport`) の `level=error` で算出
- 検証失敗率:
  - `check失敗fixture数 / 総fixture数`
  - golden / semantics / roundtrip check で算出

## 2. 合格基準（暫定）

- `fatal = 0`
- `important = 0`
- golden check失敗数 = 0
- semantics check失敗数 = 0
- 失敗率 = 0%

## 3. 現在のベースライン（2026-02-24）

- MusicXML golden check: 4/4 pass
- MusicXML semantics: 4/4 pass
- VSQX roundtrip check: semanticDiffs=0, fatal=0, important=0（5 fixtures）
- MusicXML roundtrip check: semanticDiffs=0, fatal=0, important=0（4 fixtures）

## 4. 測定コマンド

```bash
node scripts/validate-vsqx-golden.mjs check
node scripts/validate-musicxml-golden.mjs check
node scripts/validate-vsqx-semantics.mjs
node scripts/validate-musicxml-semantics.mjs
node scripts/validate-vsqx-roundtrip-diff.mjs upstream/utaformatix3-ts/tests/fixtures/vsqx あ check
node scripts/validate-musicxml-roundtrip-diff.mjs tests/fixtures/musicxml あ check
```

