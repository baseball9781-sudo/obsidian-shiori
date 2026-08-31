import { describe, expect, it } from "vitest";
import {
	computeState,
	effectiveBookmark,
	findAllBookmarks,
	maskInlineCode,
	placeBookmarkAfterLine,
	placeBookmarkAtEnd,
	removeAllBookmarks,
	removeEffectiveBookmark,
} from "../src/core/parse";

describe("computeState（SPEC §1）", () => {
	it("🔖なし → unread", () => {
		expect(computeState("ただのメモ\n本文")).toBe("unread");
		expect(computeState("")).toBe("unread");
	});

	it("🔖以降が空白・改行のみ → read", () => {
		expect(computeState("最後の文章\n\n🔖")).toBe("read");
		expect(computeState("最後の文章\n\n🔖\n")).toBe("read");
		expect(computeState("最後の文章\n\n🔖\n\n   \n")).toBe("read");
	});

	it("🔖より後ろに本文あり → reading", () => {
		expect(computeState("前半\n\n🔖\n\n後半")).toBe("reading");
		expect(computeState("最後の文章\n\n🔖\n\n## 追加\n新しい内容\n")).toBe(
			"reading",
		);
	});

	it("同一行で🔖の後ろに文字がある → reading", () => {
		expect(computeState("読んだ 🔖 ここまで")).toBe("reading");
	});

	it("%%🔖%%モードでも判定は同一（閉じ%%は本文扱いしない）", () => {
		expect(computeState("最後の文章\n\n%%🔖%%\n")).toBe("read");
		expect(computeState("前半\n\n%%🔖%%\n\n後半")).toBe("reading");
	});

	it("複数ある場合は最後の1個が有効", () => {
		expect(computeState("a\n\n🔖\n\nb\n\n🔖\n")).toBe("read");
		expect(computeState("a\n\n🔖\n\nb\n\n🔖\n\nc")).toBe("reading");
	});
});

describe("無視される🔖（SPEC §1）", () => {
	it("frontmatter内は無視", () => {
		expect(computeState("---\ntitle: 🔖テスト\n---\n本文")).toBe("unread");
	});

	it("fenced code block内は無視（```と~~~）", () => {
		expect(computeState("本文\n```\n🔖\n```\n")).toBe("unread");
		expect(computeState("本文\n~~~\n🔖\n~~~\n")).toBe("unread");
	});

	it("inline code内は無視", () => {
		expect(computeState("栞は `🔖` を使う")).toBe("unread");
		expect(computeState("栞は ``🔖`` を使う")).toBe("unread");
	});

	it("blockquote内は無視", () => {
		expect(computeState("> 引用に🔖がある\n本文")).toBe("unread");
		expect(computeState("  > インデント引用の🔖も無視")).toBe("unread");
	});

	it("無視対象の🔖と有効な🔖の混在", () => {
		const md = "---\nx: 🔖\n---\n> 🔖\n`🔖`\n本文\n\n🔖\n";
		expect(computeState(md)).toBe("read");
		expect(findAllBookmarks(md)).toHaveLength(1);
	});

	it("閉じていないfrontmatterはfrontmatter扱いしない", () => {
		expect(computeState("---\n🔖\n本文")).toBe("reading");
	});

	it("閉じていないinline codeはコード扱いしない", () => {
		expect(computeState("`これは閉じない 🔖")).toBe("read");
	});
});

describe("maskInlineCode", () => {
	it("code span内をマスクする", () => {
		expect(maskInlineCode("a `bc` d")).toBe("a `  ` d");
	});
	it("長さの違うバッククォート連は閉じ扱いしない", () => {
		expect(maskInlineCode("``a`b`` c")).toBe("``   `` c");
	});
});

describe("effectiveBookmark", () => {
	it("行番号・オフセットが正しい", () => {
		const md = "abc\n\n🔖\n";
		const bm = effectiveBookmark(md)!;
		expect(bm.line).toBe(2);
		expect(md.slice(bm.start, bm.end)).toBe("🔖");
	});

	it("%%🔖%%はトークン全体を1個として扱う", () => {
		const md = "abc\n\n%%🔖%%\n";
		const bm = effectiveBookmark(md)!;
		expect(bm.token).toBe("%%🔖%%");
		expect(md.slice(bm.start, bm.end)).toBe("%%🔖%%");
	});
});

describe("栞の移動・削除（SPEC §7）", () => {
	it("removeEffectiveBookmark: 栞行ごと消え、空行が二重にならない", () => {
		expect(removeEffectiveBookmark("a\n\n🔖\n\nb")).toBe("a\n\nb");
		expect(removeEffectiveBookmark("a\n\n🔖\n")).toBe("a\n");
	});

	it("removeEffectiveBookmark: 同一行に本文があればトークンだけ消す", () => {
		expect(removeEffectiveBookmark("読んだ 🔖 ここまで")).toBe(
			"読んだ  ここまで",
		);
	});

	it("removeAllBookmarks: 複数の栞を全部消す（無視対象は残す）", () => {
		const md = "a\n\n🔖\n\nb\n\n🔖\n\n`🔖`は残る";
		const out = removeAllBookmarks(md);
		expect(findAllBookmarks(out)).toHaveLength(0);
		expect(out).toContain("`🔖`");
	});

	it("placeBookmarkAfterLine: 途中の段落の直後に置く → reading", () => {
		const md = "一段落目\n\n二段落目\n\n三段落目\n";
		const out = placeBookmarkAfterLine(md, 2, "🔖");
		expect(out).toBe("一段落目\n\n二段落目\n\n🔖\n\n三段落目\n");
		expect(computeState(out)).toBe("reading");
	});

	it("placeBookmarkAfterLine: 最後の本文の直後に置く → read", () => {
		const md = "一段落目\n\n最後の文章\n";
		const out = placeBookmarkAfterLine(md, 2, "🔖");
		expect(computeState(out)).toBe("read");
	});

	it("placeBookmarkAfterLine: 既存の有効栞は移動する（1ノート1個）", () => {
		const md = "a\n\n🔖\n\nb\n\nc\n";
		const out = placeBookmarkAfterLine(md, 4, "🔖");
		expect(findAllBookmarks(out)).toHaveLength(1);
		expect(computeState(out)).toBe("reading");
		// bの後・cの前にある
		expect(out.indexOf("🔖")).toBeGreaterThan(out.indexOf("b"));
		expect(out.indexOf("🔖")).toBeLessThan(out.indexOf("c"));
	});

	it("placeBookmarkAfterLine: 栞が後方にある場合の行ずれ補正", () => {
		const md = "a\n\nb\n\n🔖\n";
		const out = placeBookmarkAfterLine(md, 0, "🔖");
		expect(findAllBookmarks(out)).toHaveLength(1);
		expect(out.indexOf("🔖")).toBeLessThan(out.indexOf("b"));
		expect(computeState(out)).toBe("reading");
	});

	it("placeBookmarkAfterLine: %%🔖%%モード", () => {
		const out = placeBookmarkAfterLine("a\n\nb\n", 2, "%%🔖%%");
		expect(computeState(out)).toBe("read");
		expect(out).toContain("%%🔖%%");
	});

	it("placeBookmarkAtEnd: 末尾へ移動 → read（AI追記でreadingに戻る形）", () => {
		const md = "a\n\n🔖\n\nb\n";
		const out = placeBookmarkAtEnd(md, "🔖");
		expect(out).toBe("a\n\nb\n\n🔖\n");
		expect(computeState(out)).toBe("read");
		// AI追記シミュレーション
		expect(computeState(out + "\n## 追加\n新しい内容\n")).toBe("reading");
	});

	it("placeBookmarkAtEnd: 空ノート", () => {
		expect(placeBookmarkAtEnd("", "🔖")).toBe("🔖\n");
		expect(computeState(placeBookmarkAtEnd("", "🔖"))).toBe("read");
	});
});
