/**
 * ノートを書き換える操作はすべてこのファイル（と将来のbulk.ts）に集約する。
 * SPEC.md §10「ファイル書き込みの原則」— verify.shがこれを機械的に検査する。
 */
import { App, TFile } from "obsidian";
import {
	computeState,
	placeBookmarkAfterLine,
	placeBookmarkAtEnd,
	removeAllBookmarks,
	type ReadingState,
} from "./core/parse";

/** 「ここに栞」: afterLine の直後へ栞を移動し、新しい状態を返す */
export async function placeBookmarkAfter(
	app: App,
	file: TFile,
	afterLine: number,
	token: string,
): Promise<ReadingState> {
	let state: ReadingState = "unread";
	await app.vault.process(file, (content) => {
		const out = placeBookmarkAfterLine(content, afterLine, token);
		state = computeState(out);
		return out;
	});
	return state;
}

/** 「読了にする」: ファイル末尾へ栞を移動 */
export async function markAsRead(
	app: App,
	file: TFile,
	token: string,
): Promise<void> {
	await app.vault.process(file, (content) =>
		placeBookmarkAtEnd(content, token),
	);
}

/** 「未読に戻す」: 栞をすべて削除 */
export async function markAsUnread(app: App, file: TFile): Promise<void> {
	await app.vault.process(file, (content) => removeAllBookmarks(content));
}

/** 「対象外にする」: frontmatterへ reading-track: false（栞は削除しない） */
export async function excludeFromTracking(
	app: App,
	file: TFile,
): Promise<void> {
	await app.fileManager.processFrontMatter(file, (fm) => {
		fm["reading-track"] = false;
	});
}
