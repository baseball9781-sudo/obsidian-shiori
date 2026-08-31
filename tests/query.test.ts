import { describe, expect, it } from "vitest";
import { parseReadingQuery } from "../src/core/query";

describe("parseReadingQuery", () => {
	it("uses the SPEC defaults", () => {
		expect(parseReadingQuery("")).toEqual({ states: ["unread", "reading", "read"], sortBy: "mtime", direction: "desc", group: false });
	});

	it("parses every supported parameter", () => {
		expect(parseReadingQuery("state: unread, reading\nfolder: /Research/\nsort: name asc\nlimit: 20\ngroup: true")).toEqual({
			states: ["unread", "reading"], folder: "Research", sortBy: "name", direction: "asc", limit: 20, group: true,
		});
	});

	it("falls back for invalid sort and limit", () => {
		expect(parseReadingQuery("sort: size sideways\nlimit: nope")).toMatchObject({ sortBy: "mtime", direction: "desc", limit: undefined });
	});
});
