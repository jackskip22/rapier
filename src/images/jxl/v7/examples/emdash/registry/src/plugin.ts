import type { SandboxedPlugin } from "emdash/plugin";
import { WORDS } from "../../media-words.mjs";

function isSetupPage(input: unknown): boolean {
	if (!input || typeof input !== "object" || Array.isArray(input)) return false;
	const value = input as Record<string, unknown>;
	return value.type === "page_load" && value.page === "/jpeg-xl";
}

// The sandbox uses EmDash's supported Block Kit and the originating request's own site URL.
const plugin: SandboxedPlugin = {
	routes: {
		admin: {
			permission: "plugins:read",
			handler: async (routeCtx) => {
				if (!isSetupPage(routeCtx.input)) return { blocks: [] };
				const optimizer = new URL("/_emdash/admin/plugins/rapier-media/jpeg-xl", routeCtx.request.url).href;
				return { blocks: [
					{ type: "header", text: WORDS.name },
					{ type: "section", text: WORDS.setupIntro },
					{ type: "tab", panels: [
						{ label: WORDS.setupCommandTab, blocks: [{ type: "code", code: WORDS.setupCommand, language: "bash" }] },
						{ label: WORDS.setupAgentTab, blocks: [{ type: "code", code: WORDS.setupAgent }] },
						{ label: WORDS.setupManualTab, blocks: [
							{ type: "code", code: WORDS.setupInstall, language: "bash" },
							{ type: "code", code: WORDS.setupManual, language: "ts" },
						] },
					] },
					{ type: "actions", elements: [{ type: "link", label: WORDS.setupAfter, target: { kind: "external", url: optimizer }, appearance: "inline" }] },
				] };
			},
		},
	},
};

export default plugin;
