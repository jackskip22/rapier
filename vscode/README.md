# Rapier - Markdown Editor & Art

Write your Markdown files in [Rapier](https://rapier.website) inside VS Code: the same editor as the site.

- **Formatted or source.** Write in the formatted view; Ctrl+/ shows the source.
- **Everything in the file.** Tables, checklists, math, Mermaid diagrams, comments, find and replace, compare.
- **The file is unchanged except for your edits.** VS Code saves it. Line endings, the byte order mark and the final
  newline stay as they were.
- **Pictures.** Pictures next to the file show in place. A picture you paste or drop is saved next to the file.

## Open a file in Rapier

- Right-click a Markdown file and choose **Open in Rapier**, or use the Rapier button in the editor's title bar.
- Or **Open With… > Rapier**.
- To open every Markdown file in Rapier, add this to your settings:

  ```json
  "workbench.editorAssociations": {"*.md": "rapier.markdown"}
  ```

## Saving, Undo and keys

- An edit in Rapier is an edit of the file in VS Code. Save, Revert and unsaved changes work as for any file.
- A change made elsewhere, in another editor or by Git, shows in Rapier where you were.
- Undo and Redo are Rapier's, from its keys and from VS Code's Undo.

| Keys in Rapier | Do |
|---|---|
| Ctrl+B, Ctrl+I | Bold, italic |
| Ctrl+S | Save |
| Ctrl+Z, Ctrl+Shift+Z | Undo, redo |
| Ctrl+Shift+/ | Rapier's other keys |
| Ctrl+P, Ctrl+Shift+P, F1, Ctrl+K chords, Ctrl+W, Ctrl+Tab, Ctrl+N, Ctrl+O, Ctrl+J, Ctrl+\`, Ctrl+, | VS Code's, as everywhere |

On a Mac, Cmd for Ctrl.

## License

Rapier is licensed under AGPL-3.0-only. For other terms, see
[LICENSING.md](https://github.com/jackskip22/rapier/blob/main/LICENSING.md).
