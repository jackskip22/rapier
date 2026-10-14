// SPDX-License-Identifier: AGPL-3.0-only
import {VERSION} from '../version.mjs';

export const MCP_DOOR = 'https://mcp.rapier.website/mcp';
export const DISCOVERY_LINKS = '<link rel="describedby" href="https://rapier.website/llms.txt" type="text/plain">\n' +
  '<link rel="ai-catalog" href="https://rapier.website/.well-known/ai-catalog.json" type="application/ai-catalog+json">';
export const SITE_TITLE = 'Rapier: fast offline Markdown editor and notes';
export const SITE_DESCRIPTION = 'A fast offline Markdown editor for notes, SVG drawing and watercolor. ' +
  'Import Word and PDF; export Word, PDF and HTML for free. No ads or tracking.';
export const APP_DESCRIPTION = 'Fast Markdown editor and note-taking app for writing, Mermaid diagrams, editable SVG drawing and watercolor painting. ' +
  'Keep text and embedded pictures in plain Markdown. Import Word and PDF; export Word, PDF, text and offline HTML for free. ' +
  'Work offline, or collaborate online with AI agents over MCP and WebMCP. No ads or tracking.';

export function mcpServer({endpoint = MCP_DOOR, packageVersion = VERSION} = {}) {
  return {
    $schema: 'https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json',
    name: 'io.github.jackskip22/rapier',
    title: 'Rapier',
    description: 'Fast Markdown editor you share live with your AI agent: notes, diagrams, drawing and watercolor.',
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
