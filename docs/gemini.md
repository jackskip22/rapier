# Add Rapier to Gemini

Rapier works with Gemini through MCP. No Rapier account, key or sign-in is needed. Your agent opens a shared editor
in your browser, and you keep the result as Markdown or as one editable offline HTML file.

Rapier's address is `https://mcp.rapier.website/door/mcp`.

## Gemini app

Custom apps need a personal Google Account, age 18 or over, the United States, English and Keep Activity turned on.
You add them on the web; they then work in the Gemini app on your phone too.

1. Open [gemini.google.com](https://gemini.google.com) on a computer.
2. Open **Settings**, then **Connected Apps**.
3. Under **Custom apps**, choose **Add a custom app**.
4. Enter `https://mcp.rapier.website/door/mcp` and choose **Next**.
5. In a chat, type **@**, choose **Rapier** and ask: "Write a project plan in Rapier that I can edit in my browser."

Gemini asks you to confirm each change before Rapier makes it.

## Antigravity

Install the plugin, which adds Rapier's skills and its MCP server:

```sh
agy plugin install https://github.com/jackskip22/rapier-plugins
```

Or add only the server:

```sh
agy mcp add rapier https://mcp.rapier.website/door/mcp
```

## Gemini CLI

```sh
gemini mcp add --transport http rapier https://mcp.rapier.website/door/mcp
```

## Gemini Enterprise

A team administrator adds Rapier for the team:

1. Open **Settings & help**, then **Manage team**, then **Connected apps**.
2. Add an MCP server with the URL `https://mcp.rapier.website/door/mcp`.
3. For authentication, choose **No authentication**.
4. Turn the connector on.

## Use it

- Open the editor link that Gemini gives you to watch and edit the same document.
- If the link shows a four-letter code, tell Gemini the code within a minute, then choose **Allow** in the browser.
- Keep the document value private; it opens your workspace. Workspaces expire after 30 idle days.
- Painting needs the editor open, and Water needs WebGPU.

[Privacy and terms](https://rapier.website/privacy) · [Agent guide](https://rapier.website/agents) ·
hello@rapier.website
