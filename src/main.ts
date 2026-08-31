/**
 * Reading Tracker — フェーズ1（スパイク版）
 *
 * SPEC.md §12「実装上の注意」に従い、技術的山場である
 * Reading Viewの右クリック「ここに栞」（表示段落→ソース行の逆引き =
 * MarkdownPostProcessorContext.getSectionInfo()）を最初に単体で動かす。
 *
 * このフェーズに含まれるもの:
 *   - Reading View右クリック「ここに栞」
 *   - 編集画面右クリック「ここに栞」（editor-menu）
 *   - コマンド: ここに栞 / 読了にする / 未読に戻す / 対象外にする
 *   - 設定: 栞表記（🔖 / %%🔖%%）
 *
 * 残り（対象判定・File Explorer装飾・状態UI・ここまで読んだライン・
 * readingクエリ・一括既読化・キャッシュ）は発注書_codex.md を参照。
 */
import {
	App,
	Editor,
	MarkdownView,
	Menu,
	Notice,
	Plugin,
	PluginSettingTab,
	Setting,
	TFile,
} from "obsidian";
import {
	computeState,
	effectiveBookmark,
	type ReadingState,
} from "./core/parse";
import {
	excludeFromTracking,
	markAsRead,
	markAsUnread,
	placeBookmarkAfter,
} from "./commands";

interface ReadingTrackerSettings {
	/** 栞表記（SPEC §1） */
	token: "🔖" | "%%🔖%%";
	/** Include folders（Codexフェーズで使用） */
	includeFolders: string[];
	/** Exclude folders / files（Codexフェーズで使用） */
	excludePaths: string[];
}

const DEFAULT_SETTINGS: ReadingTrackerSettings = {
	token: "🔖",
	includeFolders: [],
	excludePaths: [],
};

export const STATE_LABEL: Record<ReadingState, string> = {
	unread: "○ 未読",
	reading: "◐ 途中",
	read: "● 既読",
};

export default class ReadingTrackerPlugin extends Plugin {
	settings: ReadingTrackerSettings = DEFAULT_SETTINGS;

	async onload() {
		await this.loadSettings();
		this.addSettingTab(new ReadingTrackerSettingTab(this.app, this));

		// --- 山場: Reading Viewの右クリック「ここに栞」 -------------------
		// 各レンダリング済みセクションにcontextmenuを付け、クリック時に
		// getSectionInfo()でソース行範囲へ逆引きする。
		// 注意: getSectionInfo()は再レンダリング後にnullを返すことがある。
		// その場合は静かに何もしない（コア機能へ例外を伝播させない）。
		this.registerMarkdownPostProcessor((el, ctx) => {
			el.addEventListener("contextmenu", (evt: MouseEvent) => {
				try {
					// テキスト選択中はコピー等の既定動作を優先
					const sel = window.getSelection();
					if (sel && !sel.isCollapsed) return;

					const info = ctx.getSectionInfo(el);
					if (!info) return;

					const file = this.app.vault.getFileByPath(ctx.sourcePath);
					if (!(file instanceof TFile)) return;

					// 「その場」= クリックした行。逆引きできなければ段落末尾
					const line =
						resolveClickedLine(evt, info) ?? info.lineEnd;

					const menu = new Menu();
					menu.addItem((item) =>
						item
							.setTitle("ここに栞")
							.setIcon("bookmark")
							.onClick(() => this.placeAt(file, line)),
					);
					menu.showAtMouseEvent(evt);
				} catch (e) {
					// DOM拡張内の例外はコア機能へ伝播させない（SPEC §12）
					console.error("[reading-tracker] contextmenu failed", e);
				}
			});
		});

		// --- 編集画面の右クリック --------------------------------------
		this.registerEvent(
			this.app.workspace.on("editor-menu", (menu, editor, view) => {
				const file = view.file;
				if (!file) return;
				menu.addItem((item) =>
					item
						.setTitle("ここに栞")
						.setIcon("bookmark")
						.onClick(() =>
							this.placeAt(file, editor.getCursor().line),
						),
				);
			}),
		);

		// --- コマンド ---------------------------------------------------
		this.addCommand({
			id: "place-bookmark-here",
			name: "ここに栞",
			editorCallback: (editor: Editor, ctx) => {
				if (ctx.file)
					void this.placeAt(ctx.file, editor.getCursor().line);
			},
		});
		this.addCommand({
			id: "jump-to-bookmark",
			name: "栞へ移動",
			checkCallback: (checking) => {
				const view =
					this.app.workspace.getActiveViewOfType(MarkdownView);
				if (!view?.file) return false;
				if (!checking) void this.jumpToBookmark(view);
				return true;
			},
		});
		this.addCommand({
			id: "mark-as-read",
			name: "読了にする",
			checkCallback: (checking) => {
				const file = this.app.workspace.getActiveFile();
				if (!file) return false;
				if (!checking) {
					void markAsRead(this.app, file, this.settings.token).then(
						() => new Notice(`● 既読: ${file.basename}`),
					);
				}
				return true;
			},
		});
		this.addCommand({
			id: "mark-as-unread",
			name: "未読に戻す",
			checkCallback: (checking) => {
				const file = this.app.workspace.getActiveFile();
				if (!file) return false;
				if (!checking) {
					void markAsUnread(this.app, file).then(
						() => new Notice(`○ 未読: ${file.basename}`),
					);
				}
				return true;
			},
		});
		this.addCommand({
			id: "exclude-from-tracking",
			name: "対象外にする",
			checkCallback: (checking) => {
				const file = this.app.workspace.getActiveFile();
				if (!file) return false;
				if (!checking) {
					void excludeFromTracking(this.app, file).then(
						() => new Notice(`対象外: ${file.basename}`),
					);
				}
				return true;
			},
		});
	}

	/** 栞を置いて結果をNoticeで知らせる */
	private async placeAt(file: TFile, afterLine: number) {
		try {
			const state = await placeBookmarkAfter(
				this.app,
				file,
				afterLine,
				this.settings.token,
			);
			new Notice(
				state === "read"
					? `● 最後まで読んだ → 既読になりました`
					: `◐ ここまで読んだ → 続きは栞から`,
			);
		} catch (e) {
			console.error("[reading-tracker] placeAt failed", e);
			new Notice("栞を置けませんでした（コンソール参照）");
		}
	}

	/** 栞の行へスクロール（書き込みなし） */
	private async jumpToBookmark(view: MarkdownView) {
		const file = view.file;
		if (!file) return;
		const content = await this.app.vault.cachedRead(file);
		const bm = effectiveBookmark(content);
		if (!bm) {
			new Notice("栞がありません");
			return;
		}
		if (view.getMode() === "source") {
			view.editor.setCursor({ line: bm.line, ch: 0 });
			view.editor.scrollIntoView(
				{
					from: { line: bm.line, ch: 0 },
					to: { line: bm.line, ch: 0 },
				},
				true,
			);
		} else {
			view.currentMode.applyScroll(bm.line);
		}
	}

	async loadSettings() {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			await this.loadData(),
		);
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}

/**
 * Reading Viewで右クリックされた位置のソース行を逆引きする。
 *
 * 描画後のHTMLには行情報が無いため、クリック座標の文字列
 * （caretRangeFromPoint→周辺テキスト）をセクションのソース行から探す。
 * 装飾（**bold**等）をまたぐと一致しないことがあるので、
 * 全文→先頭10文字→最長単語、の順で緩めて探す。
 * 見つからなければnull（呼び出し側が段落末尾にフォールバック）。
 */
function resolveClickedLine(
	evt: MouseEvent,
	info: { text: string; lineStart: number; lineEnd: number },
): number | null {
	try {
		let probe = "";
		const doc = document as Document & {
			caretRangeFromPoint?: (x: number, y: number) => Range | null;
		};
		const range = doc.caretRangeFromPoint?.(evt.clientX, evt.clientY);
		if (range && range.startContainer.nodeType === Node.TEXT_NODE) {
			const t = range.startContainer.textContent ?? "";
			const off = range.startOffset;
			probe = t.slice(Math.max(0, off - 15), off + 15).trim();
		}
		if (!probe) {
			const blk = (evt.target as HTMLElement | null)?.closest(
				"li, p, h1, h2, h3, h4, h5, h6, td, th",
			);
			probe = (blk?.textContent ?? "").trim().slice(0, 30);
		}
		if (!probe) return null;

		const lines = info.text.split("\n");
		// 同じ文字列が複数行にあれば後ろの行を優先（読み進み方向）
		const findFrom = (needle: string): number | null => {
			if (needle.length < 3) return null;
			for (let i = info.lineEnd; i >= info.lineStart; i--) {
				if (lines[i]?.includes(needle)) return i;
			}
			return null;
		};

		const longestWord = probe
			.split(/[\s、。・,.]+/)
			.sort((a, b) => b.length - a.length)[0] ?? "";
		return (
			findFrom(probe) ??
			findFrom(probe.slice(0, 10)) ??
			findFrom(longestWord)
		);
	} catch {
		return null;
	}
}

class ReadingTrackerSettingTab extends PluginSettingTab {
	plugin: ReadingTrackerPlugin;

	constructor(app: App, plugin: ReadingTrackerPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		new Setting(containerEl)
			.setName("栞表記")
			.setDesc(
				"%%🔖%% はObsidianコメント記法（Reading Viewで栞自体は不可視）。判定は両モード共通。",
			)
			.addDropdown((dd) =>
				dd
					.addOption("🔖", "🔖")
					.addOption("%%🔖%%", "%%🔖%%")
					.setValue(this.plugin.settings.token)
					.onChange(async (v) => {
						this.plugin.settings.token = v as "🔖" | "%%🔖%%";
						await this.plugin.saveSettings();
					}),
			);
	}
}
