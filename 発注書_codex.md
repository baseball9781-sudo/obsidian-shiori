# Codex発注書: Reading Tracker フェーズ2

仕様の正本は `SPEC.md`、開発ルールは `AGENTS.md`。**`./verify.sh` が通るまで自走すること。**

## 既にできているもの（変更しないこと）

- `src/core/parse.ts` — 状態判定（○/◐/●）・栞の移動/削除。テスト27件通過済み
- `src/commands.ts` — 書き込み4操作（ここに栞・読了・未読・対象外）
- `src/main.ts` — 右クリック「ここに栞」（Reading View / 編集画面）＋コマンド5種＋栞表記設定
- `styles.css` — 使うべきCSSクラス定義済み

## 発注範囲（実装順）

### 1. 対象判定 + キャッシュ（SPEC §3, §11）→ `src/targets.ts`（新規）

- 設定 `includeFolders` / `excludePaths`（main.tsのSettingsに枠だけある）を使い、あるファイルが対象かを判定する関数
- 優先順位: frontmatter `reading-track: false` > `true` > Include/Exclude。frontmatter判定は `MetadataCache.getFileCache(file)?.frontmatter` を使う（本文読み込み禁止）
- 状態キャッシュ `{ path: { mtime, state } }`。mtime一致なら再読込しない。`vault.on("create"/"modify"/"rename"/"delete")` で差分更新。起動時の全Vaultスキャン禁止（遅延評価）
- **このモジュールは一切書き込まない**

### 2. 設定画面の拡張（SPEC §3）→ main.tsのSettingTab

- Include folders / Exclude paths の追加・削除UI（テキスト+リストで可）
- 各Includeフォルダの対象件数表示（例: `Research/：312件が対象`）。件数はフォルダ内の.mdを数えるだけ（本文読み込み不要）

### 3. File Explorer装飾（SPEC §4）→ `src/explorer.ts`（新規）

- 対象ノートの `.nav-file-title` に `data-reading-state="unread|reading|read"` を付与（CSSは既存）
- MutationObserverでツリーの再描画に追従。**全処理をtry/catchで包み、失敗してもコア機能に影響させない**
- 検索・リネーム・並び順に影響させない（属性付与のみ）

### 4. ノート上部の状態UI（SPEC §5）→ `src/stateBar.ts`（新規）

- アクティブノートが対象なら上部に `◐ 途中` 等を表示（`.reading-tracker-state` クラス使用）
- 途中状態のときだけクリックで栞位置へジャンプ（main.tsの `jumpToBookmark` 相当を再利用）
- 自動ジャンプはしない

### 5. 「ここまで読んだ」ライン（SPEC §6）→ post-processor追加

- Reading Viewで、栞を含むセクションの位置に `.reading-tracker-divider` で「ここまで読んだ」を描画
- 🔖 / %%🔖%% 両モードで表示。ライブプレビューは対象外（実装しない）

### 6. readingクエリ（SPEC §8）→ `src/query.ts`（新規）

- `registerMarkdownCodeBlockProcessor("reading", ...)`
- パラメータ: state（複数可, デフォルトall）/ folder / sort（デフォルトmtime desc）/ limit / group
- 各項目は内部リンク描画（`a.internal-link` + `workspace.openLinkText`）。描画のたびに再計算。書き込みなし
- **パラメータパーサは純粋関数にして `tests/query.test.ts` を追加すること**

### 7. 一括操作（SPEC §9）→ `src/bulk.ts`（新規・書き込み可）

- コマンド「フォルダを一括既読にする」「フォルダを一括未読にする」（フォルダ選択→確認モーダル）
- **実行前に必ず件数確認モーダル**（例: `Research/ 配下 287件を既読にします。実行しますか？`）+ gitコミット/バックアップ推奨の一文
- 既読化は `core/parse.ts` の `placeBookmarkAtEnd`、未読化は `removeAllBookmarks` を使う（自前で文字列加工しない）

## 検収

1. `./verify.sh` 通過（テスト追加分含む）
2. verify.shの書き込みAPI検査に引っかからないこと（bulk.ts以外に書き込みを足さない）
3. 完了時に「SPEC完成条件1〜10のどれが機械検証済みで、どれが実機目視待ちか」を一覧で報告
