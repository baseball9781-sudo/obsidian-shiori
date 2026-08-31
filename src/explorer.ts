import { App, Plugin, TFile } from "obsidian";
import { TargetStore } from "./targets";

export function installExplorer(plugin: Plugin, app: App, targets: TargetStore): void {
	let queued = false;
	const decorate = async () => {
		try {
			for (const title of Array.from(document.querySelectorAll<HTMLElement>(".nav-file-title"))) {
				const owner = title.closest("[data-path]") as HTMLElement | null;
				const path = title.dataset.path ?? owner?.dataset.path;
				if (!path) continue;
				const file = app.vault.getAbstractFileByPath(path);
				const state = file instanceof TFile ? await targets.state(file) : null;
				if (state) title.dataset.readingState = state;
				else delete title.dataset.readingState;
			}
		} catch (e) {
			console.error("[reading-tracker] explorer decoration failed", e);
		}
	};
	const schedule = () => {
		try {
			if (queued) return;
			queued = true;
			window.requestAnimationFrame(() => { queued = false; void decorate(); });
		} catch (e) {
			console.error("[reading-tracker] explorer scheduling failed", e);
		}
	};
	try {
		const observer = new MutationObserver(schedule);
		observer.observe(document.body, { childList: true, subtree: true });
		plugin.register(() => observer.disconnect());
		plugin.register(targets.onChange(schedule));
		schedule();
	} catch (e) {
		console.error("[reading-tracker] explorer setup failed", e);
	}
}
