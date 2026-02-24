# mikuscore 調査メモ（utaformatix3-ts-plus 向け）

この文書は `upstream/mikuscore` 調査で得た知見を、`utaformatix3-ts-plus` 実装に活用する目的で整理したものです。

## 1. 要点サマリ

- mikuscore は **MusicXML 4.0 を基準**に据えている。
- 変換と編集は **DOM中心**で設計し、文字列シリアライズは境界でのみ行う。
- import 時の補正は「必要最小限」に限定し、過剰な再構成を避ける。
- unknown要素や `<backup>/<forward>/<beam>` の保持を重視している。
- 変換時の補正・劣化は `miscellaneous-field` に構造化して残す方針が明確。

## 2. 参照すべき実装ポイント

### 2.1 MusicXML 4.0 基準と設計方針

- `docs/spec/ARCHITECTURE.md`
  - MusicXML 4.0 baseline を明記
  - DOM-centric data flow を明記
  - unknown保持・no-op save の原則を明記

### 2.2 import 正規化（必要最小限）

- `src/ts/musicxml-io.ts`
  - `normalizeImportedMusicXmlText`
  - `part-list` と `part/@id` の補完
  - tuplet 記法不足の補完（`time-modification` 由来）

### 2.3 ZIP/MXL 処理

- `src/ts/mxl-io.ts`
  - `META-INF/container.xml` 優先でルート解決
  - fallback で `.musicxml/.xml` を探索
  - ZIP壊れ入力への防御的チェック

### 2.4 多形式取り込みの流れ

- `src/ts/load-flow.ts`
  - 入口で拡張子判定
  - 各形式を `Format -> MusicXML` に収束
  - 失敗時は診断付きで早期リターン

### 2.5 診断とメタデータ運用

- `docs/spec/FORMAT_IO_CHECKLIST.md`
  - `miscellaneous-field` 名前空間の分離方針
    - `src:*`（入力ソース保持）
    - `mks:*`（拡張メタ）
    - `diag:*`（変換診断）
- `src/ts/midi-io.ts`, `src/ts/abc-io.ts`
  - `diag:*` / `mks:*` / `src:*` 実装例

## 3. utaformatix3-ts-plus への適用方針（提案）

1. Phase 1（VSQX -> MusicXML 4.0）で DOM中心処理を優先する。
2. import 正規化は bounded normalization のみ許可する。
3. VSQX 由来で MusicXML に表現しきれない情報は `src:vsqx:*` に退避する。
4. 変換時の補正・劣化は `diag:*` で記録し、無言で落とさない。
5. テストは「構造比較 + 意味比較」の二層で設計する。

## 4. テスト戦略のヒント

- 文字列完全一致ではなく、正規化後の比較を基本にする。
- fixture は「小さく、目的単位で分離」する。
- round-trip は段階的に評価する。
  - `VSQX -> MusicXML`
  - `MusicXML -> VSQX`
  - 双方向往復で差分分類

## 5. mikuscore 側へ将来出せる改善要望（下書き）

- `musicxml-io` の正規化機能を外部再利用しやすい API に分解する。
- `diag:*` ペイロード生成を共通ユーティリティ化する。
- ブラウザDOM依存境界を明示し、Node利用時の差し替えポイントを整理する。

## 6. 主な参照ファイル

- `upstream/mikuscore/docs/spec/ARCHITECTURE.md`
- `upstream/mikuscore/docs/spec/FORMAT_IO_CHECKLIST.md`
- `upstream/mikuscore/docs/spec/DIAGNOSTICS.md`
- `upstream/mikuscore/src/ts/musicxml-io.ts`
- `upstream/mikuscore/src/ts/mxl-io.ts`
- `upstream/mikuscore/src/ts/load-flow.ts`
- `upstream/mikuscore/src/ts/midi-io.ts`
- `upstream/mikuscore/src/ts/abc-io.ts`
- `upstream/mikuscore/tests/unit/musicxml-io.spec.ts`
- `upstream/mikuscore/tests/unit/core.spec.ts`
