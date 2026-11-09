import { afterEach, describe, expect, it } from "vitest";
import { createPluginRuntimeTestHost, type PluginRuntimeTestHost } from "@emdash-cms/plugin-test";

let host: PluginRuntimeTestHost | undefined;
afterEach(async () => { await host?.dispose(); host = undefined; });

describe("setup companion", () => {
	it("renders through the sandbox host without media permission", async () => {
		host = await createPluginRuntimeTestHost();
		const result = await host.admin.loadPage("/jpeg-xl");
		expect(result.blocks).toContainEqual({ type: "header", text: "JPEG XL Image Optimizer" });
		expect(result.blocks.some((block) => block.type === "stats")).toBe(false);
		const tabs = result.blocks.find((block) => block.type === "tab");
		expect(tabs?.type === "tab" && tabs.panels.find((panel) => panel.label === "Coding agent")?.blocks)
			.toEqual([{ type: "code", code: "Add rapier-jxl to my EmDash site with npx rapier-jxl add emdash." }]);
	});
});
