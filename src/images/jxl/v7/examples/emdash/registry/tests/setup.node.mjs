import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import plugin from "../src/plugin.ts";

const handler = plugin.routes.admin.handler;
const noBridge = new Proxy({}, {
	get(_target, key) { throw new Error(`Setup guide accessed the host: ${String(key)}`); },
});

test("setup is independent of site data and has no fabricated savings", async () => {
	const result = await handler({ input: { type: "page_load", page: "/jpeg-xl" } , request: {url: "https://site.test/_emdash/api/plugins/jxl/admin"} }, noBridge);
	assert.ok(result.blocks.length > 0);
	assert.equal(result.blocks.some(block => block.type === "stats"), false);
	assert.equal(plugin.routes.admin.public, undefined);
	assert.equal(plugin.routes.admin.permission, "plugins:read");
});

test("unknown pages and interactions do not perform work", async () => {
	for (const input of [undefined, null, true, 42, "page_load", [], {},
		{ type: "page_load", page: "/other" },
		{ type: "form_submit", action_id: "convert", values: { enabled: true } },
		{ type: "block_action", action_id: "convert" },
	]) {
		assert.deepEqual(await handler({ input , request: {url: "https://site.test/_emdash/api/plugins/jxl/admin"} }, noBridge), { blocks: [] });
	}
});

test("EmDash 1.5 exact peer and matching registry test host", () => {
  const manifest = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
  const descriptor = readFileSync(new URL("../emdash-plugin.jsonc", import.meta.url), "utf8");
  assert.equal(manifest.peerDependencies.emdash, ">=1.5.0 <2.0.0");
  assert.equal(manifest.devDependencies.emdash, "1.5.0");
  assert.equal(manifest.devDependencies["@emdash-cms/plugin-test"], "0.2.12");
  assert.ok(descriptor.includes('"env:emdash": ">=1.5.0 <2.0.0"'));
});
