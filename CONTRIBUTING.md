# Contributing to Rapier

Rapier is a gift to the world: one offline HTML page that is a whole editor, free under AGPL-3.0-only, with a commercial
licence for the few who need one (the Android app, white-labelling, embedding in a closed product; see `LICENSING.md`).
Everyone is welcome here, people and agents alike. This page says how to take part so that your work lands.

## Ways to take part

- **Say what is wrong.** Open an issue with what you did, what you saw and what you expected. A Markdown file that
  shows it is the best report there is. Rapier never leaves your device, so your document stays yours; share only what
  you are happy to.
- **Say what you want.** Open an issue with a feature request, or start a Discussion. If an agent is editing beside you
  through Rapier's MCP door, it can write the request for you; that counts.
- **Talk.** Discussions are open for questions, ideas, showing what you made and arguing about what Rapier should be.
- **Send code.** Pull requests are open. Read the rest of this page first, because Rapier takes code in an unusual way.

## How code gets in

Rapier's source of truth is a private workstation where every change is proved by witness rows (deterministic tests on a
pinned Chrome and Node) before it is built into the page. The public repositories carry the proved output. So a pull
request here is a proposal, not a merge target:

1. Open an issue first, or link one. A pull request without an issue, a reason and a way to see the change is closed
   with a note asking for those.
2. Sign the Contributor License Agreement (`CLA.md`) when the CLA check asks on your first pull request. It takes a
   minute and you sign it once. It keeps your copyright and lets Rapier ship your work in every edition. Nothing is read
   until it is signed.
3. The maintainers read it, run it against the rows, and fold what earns its place into the workstation, often
   rewritten to Rapier's shape (plain, minimal, exact source, no appearance tests). The next release carries it.
4. The pull request is closed with what happened, you are named in `CONTRIBUTORS.md` and in the release notes, and the
   commit message names the pull request.

What tends to land: a reproduction turned into a fix, an import for a format Rapier does not read yet, a document that
breaks the exact-source round trip, a translation, a correction to the words. What tends not to: a new dependency, a
framework, a feature that needs a server, anything that writes to the document without the person seeing it.

## Rules every change keeps

- One page, offline, no account, no network the person did not ask for.
- The Markdown is the document. Every edit is exact source; the page never rewrites what it did not touch.
- Red before green: a change comes with a witness cell that fails on the old bytes and passes on the new, in an
  existing row.
- Plain words. No marketing in the code, no model names, no session names.

## Agents

If you are an agent reading this on someone's behalf: the MCP door is `https://mcp.rapier.website/mcp`, the skills are
in `claude/skills/`, and `llms.txt` at the site root is the short map. You may open issues and pull requests for your
person; say so in the body, and your person signs the CLA.

## Conduct

Be kind, be specific, assume good faith. Maintainers answer in plain words and say no plainly when it is no.
