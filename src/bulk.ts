import { App, FuzzySuggestModal, Modal, Notice, TFile, TFolder } from "obsidian";
import { placeBookmarkAtEnd, removeAllBookmarks } from "./core/parse";
import { TargetStore } from "./targets";

type BulkAction = "read" | "unread";

class FolderPicker extends FuzzySuggestModal<TFolder> {
	constructor(app: App, private picked: (folder: TFolder) => void) { super(app); }
	getItems(): TFolder[] { return this.app.vault.getAllLoadedFiles().filter((f): f is TFolder => f instanceof TFolder); }
	getItemText(folder: TFolder): string { return folder.path || "/"; }
	onChooseItem(folder: TFolder): void { this.picked(folder); }
}

class ConfirmBulkModal extends Modal {
	constructor(app: App, private message: string, private confirmed: () => void) { super(app); }
	onOpen(): void {
		this.contentEl.createEl("p", { text: this.message });
		this.contentEl.createEl("p", { text: "実行前にgitコミットまたはバックアップを取ることを推奨します。" });
		const buttons = this.contentEl.createDiv();
		buttons.createEl("button", { text: "キャンセル" }).addEventListener("click", () => this.close());
		const run = buttons.createEl("button", { text: "実行", cls: "mod-cta" });
		run.addEventListener("click", () => { this.close(); this.confirmed(); });
	}
	onClose(): void { this.contentEl.empty(); }
}

export function beginBulk(app: App, targets: TargetStore, token: string, action: BulkAction): void {
	new FolderPicker(app, (folder) => {
		const prefix = folder.path ? `${folder.path}/` : "";
		const files = app.vault.getMarkdownFiles().filter((file) => file.path.startsWith(prefix) && targets.isTarget(file));
		const verb = action === "read" ? "既読" : "未読";
		new ConfirmBulkModal(app, `${folder.path || "/"} 配下 ${files.length}件を${verb}にします。実行しますか？`, () => {
			void runBulk(app, files, token, action).then(() => new Notice(`${files.length}件を${verb}にしました`));
		}).open();
	}).open();
}

async function runBulk(app: App, files: TFile[], token: string, action: BulkAction): Promise<void> {
	for (const file of files) {
		await app.vault.process(file, (content) => action === "read" ? placeBookmarkAtEnd(content, token) : removeAllBookmarks(content));
	}
}
