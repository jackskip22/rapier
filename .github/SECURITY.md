# Security

Rapier is an offline editor with optional sharing, sync and agent connections. Local editing needs no account.
Sharing, sync and connected agents transfer data to the services the person uses. Security reports cover hostile
documents and imports, unauthorized access or edits, exposed credentials, unintended network requests, and changes
to source or history without the person's permission.

**Report privately, first.** Use GitHub's "Report a vulnerability" on this repository's Security tab. If that is not
available to you, open an issue titled "security" with no details in it and a maintainer will reach you. Please do not
post the details in a public issue or discussion until a fix has shipped.

**What helps:** the smallest document, file or message that shows it; the browser and version; whether it needs the
Android app, the exported page, an embed, or the MCP door. A witness row that reproduces it is the best report there
is ([`CONTRIBUTING.md`](CONTRIBUTING.md) says how rows work).

**What you can expect:** an answer within a few days, a fix in the next release when the report is right, and your
name in the release notes if you want it there. There is no bounty; there is thanks.

**Scope.** `rapier.website`, `mcp.rapier.website`, the published page, the Android app, the npm packages
(`rapier-html`, `rapier-markdown-kit`, `rapier-embed`, `rapier-jxl`), the Claude and OpenAI plugins. Third-party sites
that embed Rapier are theirs.
