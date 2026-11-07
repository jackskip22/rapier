import { afterEach, describe, expect, it } from "vitest";
import { createPluginRuntimeTestHost, type PluginRuntimeTestHost } from "@emdash-cms/plugin-test";

let host: PluginRuntimeTestHost | undefined;
afterEach(async () => { await host?.dispose(); host = undefined; });

describe("admin page", () => {
	it("counts JPEGs across every media page through the sandbox host", async () => {
		host = await createPluginRuntimeTestHost();
		for (let i = 0; i < 101; i++) await host.fixtures.media({
			filename: `photo-${i}.jpg`, mimeType: "image/jpeg", bytes: new Uint8Array([1]), reportedSize: 1048576,
		});
		await host.fixtures.media({filename: "other.png", mimeType: "image/png", bytes: new Uint8Array([2]), reportedSize: 1048576});
		const result = await host.admin.loadPage("/images");
		expect(result.blocks.map((b) => b.type)).toEqual(["header", "section", "stats", "header", "section", "code", "context"]);
		const stats = result.blocks.find((block) => block.type === "stats");
		expect(stats?.items.map((item) => item.value)).toEqual([101, "101.0 MB"]);
	});
});
