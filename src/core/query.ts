import type { ReadingState } from "./parse";

export interface ReadingQuery {
	states: ReadingState[];
	folder?: string;
	sortBy: "mtime" | "ctime" | "name";
	direction: "asc" | "desc";
	limit?: number;
	group: boolean;
}

export function parseReadingQuery(source: string): ReadingQuery {
	const values = new Map<string, string>();
	for (const line of source.split("\n")) {
		const match = line.match(/^\s*([a-z]+)\s*:\s*(.*?)\s*$/i);
		if (match) values.set(match[1].toLowerCase(), match[2]);
	}
	const allowed: ReadingState[] = ["unread", "reading", "read"];
	const rawStates = (values.get("state") ?? "all").split(",").map((v) => v.trim());
	const states = rawStates.includes("all") ? allowed : allowed.filter((s) => rawStates.includes(s));
	const sortParts = (values.get("sort") ?? "mtime desc").trim().split(/\s+/);
	const sortBy = (["mtime", "ctime", "name"] as const).includes(sortParts[0] as never)
		? sortParts[0] as ReadingQuery["sortBy"] : "mtime";
	const direction = sortParts[1] === "asc" ? "asc" : "desc";
	const parsedLimit = Number.parseInt(values.get("limit") ?? "", 10);
	return {
		states,
		folder: values.get("folder")?.replace(/^\/+|\/+$/g, "") || undefined,
		sortBy,
		direction,
		limit: Number.isFinite(parsedLimit) && parsedLimit >= 0 ? parsedLimit : undefined,
		group: values.get("group")?.toLowerCase() === "true",
	};
}
