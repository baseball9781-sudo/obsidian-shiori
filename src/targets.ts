import { App, TAbstractFile, TFile } from "obsidian";
import { computeState, type ReadingState } from "./core/parse";

export interface TargetSettings {
	includeFolders: string[];
	excludePaths: string[];
}

const clean = (path: string) => path.replace(/^\/+|\/+$/g, "");
const contains = (root: string, path: string) => {
	const r = clean(root);
	return r === "" || path === r || path.startsWith(`${r}/`);
};

export class TargetStore {
	private cache = new Map<string, { mtime: number; state: ReadingState }>();
	private listeners = new Set<() => void>();

	constructor(private app: App, private settings: () => TargetSettings) {}

	start(register: (event: ReturnType<App["vault"]["on"]>) => void): void {
		register(this.app.vault.on("create", (file) => this.changed(file)));
		register(this.app.vault.on("modify", (file) => this.changed(file)));
		register(this.app.vault.on("delete", (file) => this.removed(file.path)));
		register(this.app.vault.on("rename", (file, oldPath) => {
			this.cache.delete(oldPath);
			this.changed(file);
		}));
	}

	onChange(listener: () => void): () => void {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}

	isTarget(file: TFile): boolean {
		const fm = this.app.metadataCache.getFileCache(file)?.frontmatter;
		const override = fm?.["reading-track"];
		if (override === false || override === "false") return false;
		if (override === true || override === "true") return true;
		const { includeFolders, excludePaths } = this.settings();
		if (excludePaths.some((path) => contains(path, file.path))) return false;
		return includeFolders.some((folder) => contains(folder, file.path));
	}

	async state(file: TFile): Promise<ReadingState | null> {
		if (!this.isTarget(file)) return null;
		const hit = this.cache.get(file.path);
		if (hit?.mtime === file.stat.mtime) return hit.state;
		const state = computeState(await this.app.vault.cachedRead(file));
		this.cache.set(file.path, { mtime: file.stat.mtime, state });
		return state;
	}

	invalidateAll(): void {
		this.cache.clear();
		this.emit();
	}

	private changed(file: TAbstractFile): void {
		if (file instanceof TFile) this.cache.delete(file.path);
		this.emit();
	}

	private removed(path: string): void {
		this.cache.delete(path);
		this.emit();
	}

	private emit(): void {
		for (const listener of this.listeners) listener();
	}
}
