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

					const menu = new Menu();
					menu.addItem((item) =>
						item
							.setTitle("ここに栞")
							.setIcon("bookmark")
							.onClick(() =>
								this.placeAt(file, info.lineEnd),
							),
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
			new Notice(`栞を置きました → ${STATE_LABEL[state]}`);
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
