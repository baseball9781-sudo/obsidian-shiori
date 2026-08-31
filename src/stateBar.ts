import { App, MarkdownView, Plugin } from "obsidian";
import type { ReadingState } from "./core/parse";
import { TargetStore } from "./targets";

const labels: Record<ReadingState, string> = { unread: "○ 未読", reading: "◐ 途中", read: "● 既読" };

export function installStateBar(plugin: Plugin, app: App, targets: TargetStore, jump: (view: MarkdownView) => Promise<void>): void {
	const render = async () => {
		try {
			document.querySelectorAll(".reading-tracker-state").forEach((el) => el.remove());
			const view = app.workspace.getActiveViewOfType(MarkdownView);
			if (!view?.file) return;
			const state = await targets.state(view.file);
			if (!state) return;
			const host = view.containerEl.querySelector<HTMLElement>(".view-content");
			if (!host) return;
			const bar = document.createElement("div");
			bar.className = `reading-tracker-state${state === "reading" ? " is-reading" : ""}`;
			bar.textContent = labels[state];
			if (state === "reading") bar.addEventListener("click", () => void jump(view));
			host.prepend(bar);
		} catch (e) {
			console.error("[reading-tracker] state bar failed", e);
		}
	};
	plugin.registerEvent(app.workspace.on("file-open", () => void render()));
	plugin.registerEvent(app.workspace.on("layout-change", () => void render()));
	plugin.register(targets.onChange(() => void render()));
	void render();
}
