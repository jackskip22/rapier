/* Geoffrey's sheet content, opened through Rapier's existing modal owner. */
function _rapierOpenInfoSheet(kind) {
  const content = {
    share: ['share',
      'Both keep your document exactly as you wrote it. The web page opens on any device, offline, prints, and reopens in Rapier for editing, with its layout and pictures inside. It uses the device\'s own fonts, so it stays small.',
      'The plain text file is your words alone, in Markdown: the plain text that Obsidian, Bear, GitHub and any text editor read. A code file is shared as itself. Other apps may show pictures and layout differently.',
      'Save keeps your editable file. DOCX is under Export.'],
    agent: ['agent control', 'FREE — it edits, you read after.',
      'CHECK — it pauses between changes until the changed block has held your view.',
      'ASK — it proposes; you decide each time.'],
    will: ['will', _RAPIER_WILL_INFO.lead,
      ..._RAPIER_WILL_INFO.laws.map(entry => _rapierProtectionWord(entry.law) + ' — ' + entry.line)],
    layout: ['layout',
      'Plain shows this document as other Markdown apps show it, GitHub, Obsidian and Bear among them: each picture on its own line, upright, at its natural size, with no words beside it. Rapier\'s layout is a small open standard: a picture\'s size, place and turn live in one invisible comment, so nothing is lost in those apps.'],
    /* RAPIER_NOTES_BEGIN */
    // R87, the founder, on the Notes settings panel: "maybe just add same (i) icons with info popup
    // explanations for this settings panel as we have in main one and the folder title will be fine
    // because people can have it explained in the popup if they don't understand." The same sheet,
    // the same component, the same button -- only four more entries in this one map.
    'notes-sort': ['sort by',
      'The order of the cards in each section.',
      'CUSTOM is your own order: hold a card and drag it.',
      'CREATED puts the newest note first; MODIFIED, the one you changed last.',
      'The notes themselves do not change.'],
    'notes-layout': ['layout',
      'How wide a card is.',
      'HALF puts two cards side by side, so more notes fit.',
      'FULL gives each card the whole width, so more of each note shows.'],
    'notes-sections': ['sections',
      'A section is a group of notes under its own heading. Pinned and Other are always there; yours sit between them.',
      'NEW makes an empty section; move a note into it from the note\'s actions.',
      'SECTIONS folds the cards into headings: drag to reorder, or tap your own section to rename or delete it.',
      'Pinned stays first. Deleting a section moves its notes to Other; no note is deleted.'],
    'notes-folder': ['folder',
      'Each note is an ordinary Markdown file in this folder, which any Markdown app can open too.',
      'IMPORT brings in notes from other note apps, Markdown files, saved web pages or a Rapier backup.',
      'BACKUP saves the folder as one file, or numbered parts for a very large library; keep every part somewhere safe. Signing in is not a backup.',
      'TIDY HISTORY clears old versions of your notes; the notes stay as they are.'],
    // R86h (docs/intent.md "R86h laws"): everything the settings panel used to spell out in prose
    // under Notes, Start in and Skills lives here now instead -- radical minimalism, the founder's
    // word. The last line is the browser's own live storage answer (notes/notes.js), not static copy.
    notes: ['notes',
      'your notes are cards over a folder of ordinary markdown files, one file per note.',
      'keyboard on the cards: c new note, / search, j/k next/previous, e archive, # delete, f pin, x select, escape back.',
      'a skill is a note in the skills section telling an agent how you like things done; agents in your browser read it through webmcp. off by default.',
      // What is true of this copy (law 57's sweep, 26 September 2026), read off the session's own gates: the
      // website's root connects a bucket through the box; any other copy cannot sync and says where it can;
      // the app says what the app does.
      (() => {
        const S = globalThis.RapierNotesSyncSession, where = {url: location.href, native: ['android', 'windows'].includes(String(globalThis.RapierPlatform?.environment?.id || '').toLowerCase()), framed: window.top !== window};
        if (!S) return 'cloudflare sync did not load here.';
        if (where.native) return S.r2KeyAvailability(where).reason;
        return S.r2KeyAvailability(where).ready || S.syncAvailability(where).ready ? 'sync with cloudflare, in the notes settings, stores an encrypted copy of your notes in your own r2 bucket, free: rapier never sees it.'
          : 'sync with cloudflare works on https://rapier.website/ only; this copy cannot sync.';
      })(),
      'backup, in notes settings, saves one file, or numbered parts for a very large library. syncing and signing in are not backups.',
      'the cloudflare sign-in grants access by account and permission group: every r2 bucket there. use a new cloudflare account for your notes alone.',
      'rapier’s source is on github: read it to check that sync only ever touches your notes.',
      typeof _rapierNotesStorageSentence === 'function' ? _rapierNotesStorageSentence() : 'your notes are in this browser’s own storage.'],
    /* RAPIER_NOTES_END */
  }[kind];
  if (!content) return;
  const overlay = _rapierUi.refs.infoOverlay, sheet = overlay.querySelector('.info-action-sheet');
  overlay.querySelector('#info-sheet-title').textContent = content[0];
  const body = overlay.querySelector('.info-action-body');
  body.replaceChildren(...content.slice(1).map(text => {
    const paragraph = document.createElement('p'); paragraph.textContent = text; return paragraph;
  }));
  if (kind === 'notes') {
    // Its id back, so a live answer arriving while the sheet is open still lands on screen.
    body.lastElementChild.id = 'notes-storage-note';
    if (typeof _rapierNotesStorageAnswer === 'function') void _rapierNotesStorageAnswer(false);
  }
  sheet.scrollTop = 0;
  openDialog(overlay, {panel: '.info-action-sheet', noautofocus: true});
  sheet.focus({preventScroll: true});
}

const _rapierInfoOverlay = document.getElementById('info-overlay');
_rapierInfoOverlay.addEventListener('click', event => {
  if (event.target === _rapierInfoOverlay || event.target.closest('[data-info-close]')) closeDialog(_rapierInfoOverlay);
});
_rapierInfoOverlay.addEventListener('keydown', event => {
  event.stopPropagation();
  if (event.key === 'Escape') { event.preventDefault(); closeDialog(_rapierInfoOverlay); }
});
