// SPDX-License-Identifier: AGPL-3.0-only
import {VERSION} from '../version.mjs';

export const MCP_DOOR = 'https://mcp.rapier.website/mcp';
export const CURRENT_DOOR = 'https://mcp.rapier.website/door/mcp';
export const MUSE_DOOR = 'https://mcp.rapier.website/muse';
export const DISCOVERY_LINKS = '<link rel="describedby" href="https://rapier.website/llms.txt" type="text/plain">\n' +
  '<link rel="ai-catalog" href="https://rapier.website/.well-known/ai-catalog.json" type="application/ai-catalog+json">';
export const PLAY_URL = 'https://play.google.com/store/apps/details?id=app.rapier';
export const HOME_TITLE = 'Rapier - Free Online Markdown Editor, Viewer & Art';
export const HOME_H1 = 'Free online Markdown editor and viewer';
export const HOME_DESCRIPTION = 'Free online Markdown editor and viewer. Convert Markdown to PDF or Word and Word to ' +
  'Markdown, and draw Mermaid diagrams. No sign-up; works offline.';
export const APP_DESCRIPTION = 'Free Markdown editor and notes app for Android, the web and Windows. ' +
  'Write on the formatted page or in the Markdown source, make Mermaid diagrams, draw editable SVG and paint watercolor. ' +
  'Text and pictures stay in one plain Markdown file. Import Word and PDF; export Word, PDF, text and offline HTML for free. ' +
  'Works offline, with no account, ads or tracking. Optionally, an AI agent edits with you over MCP and WebMCP.';

export function mcpServer({endpoint = MCP_DOOR, packageVersion = VERSION} = {}) {
  return {
    $schema: 'https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json',
    name: 'io.github.jackskip22/rapier',
    title: 'Rapier - Markdown Editor & Art',
    description: 'Markdown editor for writing, notes, editable diagrams, drawing and painting with your AI assistant.',
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
