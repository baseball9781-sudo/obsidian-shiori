import { App, Plugin, TFile } from "obsidian";
import { parseReadingQuery } from "./core/query";
import type { ReadingState } from "./core/parse";
import { TargetStore } from "./targets";

const headings: Record<ReadingState, string> = { unread: "○ 未読", reading: "◐ 途中", read: "● 既読" };

export function installReadingQuery(plugin: Plugin, app: App, targets: TargetStore): void {
	plugin.registerMarkdownCodeBlockProcessor("reading", async (source, el, ctx) => {
		const query = parseReadingQuery(source);
		let rows: Array<{ file: TFile; state: ReadingState }> = [];
		for (const file of app.vault.getMarkdownFiles()) {
			if (query.folder && !(file.path === query.folder || file.path.startsWith(`${query.folder}/`))) continue;
			const state = await targets.state(file);
			if (state && query.states.includes(state)) rows.push({ file, state });
		}
		rows.sort((a, b) => {
			const av = query.sortBy === "name" ? a.file.basename.toLocaleLowerCase() : a.file.stat[query.sortBy];
			const bv = query.sortBy === "name" ? b.file.basename.toLocaleLowerCase() : b.file.stat[query.sortBy];
			const cmp = av < bv ? -1 : av > bv ? 1 : 0;
			return query.direction === "asc" ? cmp : -cmp;
		});
		if (query.limit !== undefined) rows = rows.slice(0, query.limit);
		const renderList = (items: typeof rows, parent: HTMLElement) => {
			const ul = parent.createEl("ul");
			for (const { file, state } of items) {
				const link = ul.createEl("li").createEl("a", { cls: "internal-link", text: `${headings[state].slice(0, 1)} ${file.basename}` });
				link.dataset.href = file.path;
				link.addEventListener("click", (event) => { event.preventDefault(); void app.workspace.openLinkText(file.path, ctx.sourcePath); });
			}
		};
		if (query.group) {
			for (const state of query.states) {
				const items = rows.filter((row) => row.state === state);
				if (items.length) { el.createEl("h4", { text: headings[state] }); renderList(items, el); }
			}
		} else renderList(rows, el);
	});
}
