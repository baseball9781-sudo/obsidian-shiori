# obsidian-reading-tracker

Obsidian用Reading Trackerプラグイン。仕様の正本は `SPEC.md`（変更禁止。疑問があれば作業を止めて質問する）。

## 合否判定

```bash
./verify.sh
```

**これが通ることが完了条件。目視レビューは判定に使わない。** typecheck / 単体テスト / ビルド / 書き込みAPI配置検査を行う。

## 絶対ルール

1. **ノートを書き換えるAPI（`vault.modify` / `vault.process` / `adapter.write` / `processFrontMatter`）を呼んでよいのは `src/commands.ts` と `src/bulk.ts` のみ**（SPEC §10）。verify.shが機械検査する。
2. `src/core/` は純粋関数のみ。Obsidian APIをimportしない。ここの判定ロジックの意味を変える場合は `tests/parse.test.ts` を先に直し、変更理由を書く。
3. DOM拡張（File Explorer装飾・状態UI・ライン表示）内の例外はtry/catchで握りつぶし、コア機能へ伝播させない（SPEC §12）。
4. ファイル名・タイトルは一切変更しない。
5. 依存追加は不可（devDependenciesの範囲で完結させる）。

## 構成

- `src/core/parse.ts` — 状態判定・栞移動の純粋関数（テスト済み・完成）
- `src/commands.ts` — 書き込み操作の集約場所
- `src/main.ts` — プラグイン本体（スパイク版: 右クリック「ここに栞」＋コマンド動作済み）
- `tests/` — vitest。新機能の純粋ロジックはここにテストを足す
- `styles.css` — 装飾用CSS（クラス名は定義済み）

## 動作確認

```bash
./deploy.sh   # Vaultのプラグインフォルダへコピー
```

その後Obsidian側でリロード。実機での見た目確認は人間が行う。
