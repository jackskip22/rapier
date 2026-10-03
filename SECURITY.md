# Security

Rapier is one offline page. It keeps no account, sends nothing it was not asked to send, and the document never
leaves the device unless the person exports it. That makes most classes of vulnerability impossible and the remaining
ones serious: anything that lets a document, a pasted page, an imported file or an agent's message run code, read
another origin, reach the network, or change the source the person did not touch.

**Report privately, first.** Use GitHub's "Report a vulnerability" on this repository's Security tab. If that is not
available to you, open an issue titled "security" with no details in it and a maintainer will reach you. Please do not
post the details in a public issue or discussion until a fix has shipped.

**What helps:** the smallest document, file or message that shows it; the browser and version; whether it needs the
Android app, the exported page, an embed, or the MCP door. A witness row that reproduces it is the best report there
is (`CONTRIBUTING.md` says how rows work).

**What you can expect:** an answer within a few days, a fix in the next release when the report is right, and your
name in the release notes if you want it there. There is no bounty; there is thanks.

**Scope.** `rapier.website`, `mcp.rapier.website`, the published page, the Android app, the npm packages
(`rapier-html`, `rapier-markdown-kit`, `rapier-embed`, `rapier-jxl`), the Claude and OpenAI plugins. Third-party sites
that embed Rapier are theirs.
