/**
 * 状態判定コア（SPEC.md §1）
 *
 * Obsidian APIに依存しない純粋関数のみ。node上で単体テスト可能。
 * オフセットはすべてUTF-16（JS文字列 / CodeMirror互換）。
 */

export type ReadingState = "unread" | "reading" | "read";

export interface Bookmark {
	/** 0-based 行番号 */
	line: number;
	/** 全文中のトークン開始オフセット */
	start: number;
	/** 全文中のトークン終了オフセット（`%%🔖%%` なら閉じ `%%` の直後） */
	end: number;
	/** マッチしたトークン文字列（"🔖" または "%%🔖%%"） */
	token: string;
}

const TOKEN_RE = /%%🔖%%|🔖/gu;

/** frontmatterの範囲（行番号、両端含む）。無ければnull */
export function frontmatterRange(
	lines: string[],
): { startLine: number; endLine: number } | null {
	if (lines.length === 0 || lines[0].trimEnd() !== "---") return null;
	for (let i = 1; i < lines.length; i++) {
		const t = lines[i].trimEnd();
		if (t === "---" || t === "...") return { startLine: 0, endLine: i };
	}
	return null; // 閉じていないfrontmatterはfrontmatterとみなさない
}

/**
 * インラインコードspanの中身を空白でマスクした行を返す。
 * CommonMark準拠の簡易版: 同じ長さのバッククォート連で開閉。
 */
export function maskInlineCode(line: string): string {
	let out = "";
	let i = 0;
	while (i < line.length) {
		if (line[i] === "`") {
			let n = 0;
			while (line[i + n] === "`") n++;
			// 同じ長さの閉じ連を探す
			let j = i + n;
			let close = -1;
			while (j < line.length) {
				if (line[j] === "`") {
					let m = 0;
					while (line[j + m] === "`") m++;
					if (m === n) {
						close = j;
						break;
					}
					j += m;
				} else {
					j++;
				}
			}
			if (close >= 0) {
				out +=
					"`".repeat(n) + " ".repeat(close - (i + n)) + "`".repeat(n);
				i = close + n;
			} else {
				out += line.slice(i);
				break;
			}
		} else {
			out += line[i];
			i++;
		}
	}
	return out;
}

/**
 * 栞として有効な 🔖 / %%🔖%% を全文から列挙する（出現順）。
 * frontmatter / fenced code block / inline code / blockquote 内は無視（SPEC.md §1）。
 */
export function findAllBookmarks(content: string): Bookmark[] {
	const lines = content.split("\n");
	const fm = frontmatterRange(lines);
	const result: Bookmark[] = [];

	let offset = 0;
	let fence: string | null = null; // 開いているfenceのマーカー（"```" 等）

	for (let li = 0; li < lines.length; li++) {
		const line = lines[li];
		const lineStart = offset;
		offset += line.length + 1; // +1 = "\n"

		if (fm && li >= fm.startLine && li <= fm.endLine) continue;

		// fenced code block の開閉
		const fenceMatch = line.match(/^\s{0,3}(`{3,}|~{3,})/);
		if (fence !== null) {
			if (
				fenceMatch &&
				fenceMatch[1][0] === fence[0] &&
				fenceMatch[1].length >= fence.length &&
				line.trim().replace(new RegExp(`^${fence[0]}+`), "") === ""
			) {
				fence = null; // 閉じfence
			}
			continue; // fence内（閉じ行含む）は無視
		}
		if (fenceMatch) {
			fence = fenceMatch[1];
			continue; // 開きfence行自体も無視
		}

		// blockquote
		if (/^\s*>/.test(line)) continue;

		// inline code をマスクしてから検索
		const masked = maskInlineCode(line);
		TOKEN_RE.lastIndex = 0;
		let m: RegExpExecArray | null;
		while ((m = TOKEN_RE.exec(masked)) !== null) {
			result.push({
				line: li,
				start: lineStart + m.index,
				end: lineStart + m.index + m[0].length,
				token: m[0],
			});
		}
	}
	return result;
}

/** 有効な栞（最後の1個）。無ければnull（SPEC.md §1: 複数ある場合は最後の1個） */
export function effectiveBookmark(content: string): Bookmark | null {
	const all = findAllBookmarks(content);
	return all.length > 0 ? all[all.length - 1] : null;
}

/** ノート本文から読書状態を判定する */
export function computeState(content: string): ReadingState {
	const bm = effectiveBookmark(content);
	if (!bm) return "unread";
	return content.slice(bm.end).trim() === "" ? "read" : "reading";
}

// ---------------------------------------------------------------------------
// 栞の移動・削除（純粋な文字列変換。ファイルI/Oは呼び出し側の責務）
// ---------------------------------------------------------------------------

/**
 * 有効栞を1個だけ取り除いた本文を返す。栞が無ければそのまま。
 * トークン除去後に行が空白のみになったら行ごと削除し、
 * 直前が空行なら1行に潰す（栞は空行付きで挿入されるため）。
 */
export function removeEffectiveBookmark(content: string): string {
	const bm = effectiveBookmark(content);
	if (!bm) return content;
	return removeBookmarkAt(content, bm);
}

/** 有効・無効を問わず、栞として検出される全トークンを削除する（「未読に戻す」用） */
export function removeAllBookmarks(content: string): string {
	// 1個消すたびにオフセットがずれるので、都度再計算しながら消す
	let cur = content;
	for (;;) {
		const all = findAllBookmarks(cur);
		if (all.length === 0) return cur;
		cur = removeBookmarkAt(cur, all[all.length - 1]);
	}
}

function removeBookmarkAt(content: string, bm: Bookmark): string {
	const lines = content.split("\n");
	const line = lines[bm.line];
	// 行内オフセットに変換
	let lineStart = 0;
	for (let i = 0; i < bm.line; i++) lineStart += lines[i].length + 1;
	const s = bm.start - lineStart;
	const e = bm.end - lineStart;
	const newLine = line.slice(0, s) + line.slice(e);

	if (newLine.trim() === "") {
		// 行ごと削除
		lines.splice(bm.line, 1);
		// 削除位置の前後が両方空行なら1行に潰す
		if (
			bm.line > 0 &&
			bm.line < lines.length &&
			lines[bm.line - 1].trim() === "" &&
			lines[bm.line].trim() === ""
		) {
			lines.splice(bm.line, 1);
		}
	} else {
		lines[bm.line] = newLine;
	}
	return lines.join("\n");
}

/**
 * 「ここに栞」: afterLine（0-based）の直後に栞を置いた本文を返す。
 * 既存の有効栞は先に削除する（SPEC.md §7）。
 * 栞は空行を挟んだ独立行として挿入する。
 */
export function placeBookmarkAfterLine(
	content: string,
	afterLine: number,
	token: string,
): string {
	// 先に有効栞を消す（行番号のずれを補正）
	const bm = effectiveBookmark(content);
	let target = afterLine;
	let cur = content;
	if (bm) {
		const before = cur.split("\n").length;
		cur = removeBookmarkAt(cur, bm);
		const removed = before - cur.split("\n").length; // 0〜2行減る
		if (removed > 0 && bm.line <= target) {
			target = Math.max(0, target - removed);
		}
	}

	const lines = cur.split("\n");
	const at = Math.min(target, lines.length - 1);
	const insert: string[] = [];
	if (lines[at] !== undefined && lines[at].trim() !== "") insert.push("");
	insert.push(token);
	// 直後に本文が続くなら空行を挟む
	const next = lines[at + 1];
	if (next !== undefined && next.trim() !== "") insert.push("");
	lines.splice(at + 1, 0, ...insert);
	return lines.join("\n");
}

/** 「読了にする」: ファイル末尾へ栞を移動した本文を返す */
export function placeBookmarkAtEnd(content: string, token: string): string {
	const cur = removeEffectiveBookmark(content);
	const trimmed = cur.replace(/\s+$/, "");
	if (trimmed === "") return `${token}\n`;
	return `${trimmed}\n\n${token}\n`;
}
