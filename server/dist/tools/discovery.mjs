// SPDX-License-Identifier: AGPL-3.0-only
import {VERSION} from '../version.mjs';

export const MCP_DOOR = 'https://mcp.rapier.website/mcp';
export const CURRENT_DOOR = 'https://mcp.rapier.website/door/mcp';
export const REGISTRY_NAME = 'website.rapier/markdown-editor-draw-paint-jpeg-xl';
export const RETIRED_REGISTRY_NAME = 'io.github.jackskip22/rapier';
export const REGISTRY_AUTH = 'v=MCPv1; k=ed25519; p=cWitI+O/mhS26/DGVLNlxo5yv6FNNFk+aRxphsrw378=';
export const MUSE_DOOR = 'https://mcp.rapier.website/muse';
export const DISCOVERY_LINKS = '<link rel="describedby" href="https://rapier.website/llms.txt" type="text/plain">\n' +
  '<link rel="ai-catalog" href="https://rapier.website/.well-known/ai-catalog.json" type="application/ai-catalog+json">';
export const PLAY_URL = 'https://play.google.com/store/apps/details?id=app.rapier';
export const HOME_TITLE = 'Rapier: Free Online Markdown Editor';
export const HOME_H1 = 'Free online Markdown editor';
export const HOME_DESCRIPTION = 'The fast, free Markdown editor for your phone and computer. Notes, drawing and painting. ' +
  'Opens and saves Word and PDF. Works offline, no account.';
export const APP_DESCRIPTION = 'Free Markdown editor and notes app for Android, the web, Windows and Linux. ' +
  'Write on the formatted page or in the Markdown source, make Mermaid diagrams, draw editable SVG and paint watercolor. ' +
  'Text and pictures stay in one plain Markdown file. Import Word and PDF; export Word, PDF, text and offline HTML for free. ' +
  'Works offline with no install. No account, no tracking, no ads. Optionally, an AI agent edits with you over MCP and WebMCP.';

export const REGISTRY_DESCRIPTION = 'Markdown editor for notes, diagrams, drawing and painting with your AI, and a JPEG XL converter.';

export function mcpServer({endpoint = MCP_DOOR, packageVersion = VERSION} = {}) {
  return {
    $schema: 'https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json',
    name: REGISTRY_NAME,
    title: 'Rapier - Markdown Editor & Art',
    description: REGISTRY_DESCRIPTION,
    version: packageVersion,
    websiteUrl: 'https://rapier.website/agents',
    repository: {url: 'https://github.com/jackskip22/rapier-plugins', source: 'github'},
    icons: [{src: 'https://rapier.website/icon-512.png', mimeType: 'image/png', sizes: ['512x512']}],
    remotes: [{type: 'streamable-http', url: endpoint}],
  };
}

export function aiCatalog(target) {
  return {
    specVersion: '1.0',
    host: {displayName: 'Rapier', documentationUrl: 'https://rapier.website/agents'},
    entries: [{identifier: 'urn:air:rapier.website:mcp:rapier', type: 'application/mcp-server-card+json',
      data: {...mcpServer(target), $schema: 'https://static.modelcontextprotocol.io/schemas/v1/server-card.schema.json'}}],
  };
}

export function mcpWellKnown(target) {
  return aiCatalog(target).entries[0].data;
}

export function agentsGuide({endpoint = MCP_DOOR} = {}) {
  return `# Rapier for agents

Rapier is a free Markdown editor for notes, editable diagrams, drawing and watercolor painting, on the web, Android,
Windows and Linux. A person and an agent edit the same document; the person's typing wins.

## Connect

- MCP, Streamable HTTP, no account: \`${endpoint}\`
- Server Card: https://rapier.website/.well-known/mcp.json
- Guide: https://rapier.website/agents

## First calls

1. \`open {text, filename}\` creates the document with its whole first text, drawings included. Share \`editor_url\`.
2. \`read {document}\` returns the exact text and its revision.
3. \`edit {document, revision, changes: [{old, new}]}\` applies one undoable act. Keep its \`act\`.
4. \`undo {document, act}\` takes back only that act.
5. \`export {document, format: "html"}\` gives one offline file with the editor and the document inside.
6. \`convert\` turns pictures into JPEG XL on the person's device. In a sandbox, \`npx rapier-jxl <file|folder>\` converts and prints each size.

## npm packages

- \`rapier-html\`: \`npx rapier-html notes.md\` writes one offline HTML file with the editor and the document.
- \`rapier-embed\`: \`Rapier.mount(element, {load, save})\` puts the editor or the reader in a web app.
- \`rapier-markdown-kit\`: reads, renders and writes Markdown that carries its pictures and drawings.
- \`rapier-jxl\`: JPEG XL encoder and decoder for browsers, Node and Cloudflare Workers.
`;
}

export function geminiExtension({endpoint = CURRENT_DOOR, packageVersion = VERSION} = {}) {
  return {name: 'rapier', version: packageVersion, description: REGISTRY_DESCRIPTION, mcpServers: {rapier: {httpUrl: endpoint}}};
}
