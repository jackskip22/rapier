import type { SandboxedPlugin } from "emdash/plugin";

// Conversion runs in the site.
const SETUP = `// astro.config.mjs
import emdash from 'emdash/astro';
import {r2} from '@emdash-cms/cloudflare';
import {rapierStorage} from './storage.mjs';
import {rapierMediaPlugin} from './media-plugin.mjs';
emdash({
  storage: rapierStorage(r2({binding: 'MEDIA'})),
  plugins: [rapierMediaPlugin()],
});

// src/middleware.mjs
export {onRequest} from '../middleware.mjs';`;

const megabytes = (n: number) => `${(n / 1048576).toFixed(1)} MB`;

const plugin: SandboxedPlugin = {
	routes: {
		admin: {
			handler: async (_routeCtx, ctx) => {
				let jpegs = 0, bytes = 0, cursor: string | undefined;
				do {
					const page = await ctx.media!.list({ mimeType: "image/jpeg", limit: 100, cursor });
					for (const item of page.items) { jpegs++; bytes += item.size ?? 0; }
					cursor = page.hasMore ? page.cursor : undefined;
				} while (cursor);
				return {
					blocks: [
						{ type: "header", text: "Smaller images" },
						{ type: "section", text: "JPEG uploads are kept as JPEG XL, about a fifth smaller, and every browser gets the same picture: JPEG XL where it shows one, the original JPEG elsewhere." },
						{ type: "stats", items: [
							{ label: "JPEGs", value: jpegs },
							{ label: "Their size", value: megabytes(bytes) },
						] },
						{ type: "header", text: "Set up" },
						{ type: "section", text: "Install rapier-jxl and copy examples/emdash into the site, then these lines:" },
						{ type: "code", language: "ts", code: SETUP },
						{ type: "context", text: "The Smaller images page then converts uploads and the existing library." },
					],
				};
			},
		},
	},
};

export default plugin;

