// SPDX-License-Identifier: AGPL-3.0-only
import {VERSION} from '../version.mjs';

export const MCP_DOOR = 'https://mcp.rapier.website/mcp';
export const DISCOVERY_LINKS = '<link rel="describedby" href="https://rapier.website/llms.txt" type="text/plain">\n' +
  '<link rel="ai-catalog" href="https://rapier.website/.well-known/ai-catalog.json" type="application/ai-catalog+json">';
export const APP_DESCRIPTION = 'Fast Markdown editor for notes, diagrams, drawing and watercolor painting in one HTML file. ' +
  'Android, Web and Windows. Phone-first and offline. Collaborate with AI agents over MCP and WebMCP. ' +
  'Optional encrypted sync to your own Cloudflare account. Embeddable editor and lightweight Markdown reader (about 190 kB gzipped).';

// Registry and Server Card identity share one source. Live MCP lists the available tools.
export function mcpServer() {
  return {
    $schema: 'https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json',
    name: 'io.github.jackskip22/rapier',
    title: 'Rapier',
    description: 'Fast Markdown editor you share live with your AI agent: notes, diagrams, drawing and watercolor.',
    version: VERSION,
    websiteUrl: 'https://rapier.website/agents',
    repository: {url: 'https://github.com/jackskip22/rapier-plugins', source: 'github'},
    icons: [{src: 'https://rapier.website/icon-512.png', mimeType: 'image/png', sizes: ['512x512']}],
    remotes: [{type: 'streamable-http', url: MCP_DOOR}],
  };
}

// MCP SEP-2127 and https://ai-catalog.io/spec/: one public catalog with an inline Server Card.
export function aiCatalog() {
  return {
    specVersion: '1.0',
    host: {displayName: 'Rapier', documentationUrl: 'https://rapier.website/agents'},
    entries: [{identifier: 'urn:air:rapier.website:mcp:rapier', type: 'application/mcp-server-card+json',
      data: {...mcpServer(), $schema: 'https://static.modelcontextprotocol.io/schemas/v1/server-card.schema.json'}}],
  };
}
