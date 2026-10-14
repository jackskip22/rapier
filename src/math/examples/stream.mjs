// SPDX-License-Identifier: MIT
import MarkdownIt from 'markdown-it';
import rapierMath from 'rapier-math/markdown-it';
import {createMarkdownStream} from 'rapier-math/stream';

const md = new MarkdownIt({html: false}).use(rapierMath);
const renderMarkdown = (source, session) => md.render(source, {rapierMathSession: session});
let stream = createMarkdownStream(renderMarkdown, {previewEvery: 16});
let shown;
function replacePreview(snapshot) {
  // A UI replaces its entire preview with snapshot.html, and keeps snapshot.source
  // for editing/copying. Neither field is an append-only Markdown prefix.
  shown = snapshot;
  console.log({phase: snapshot.final ? 'complete' : 'preview', ...snapshot});
}

try {
  for (const chunk of ['The answer is \\(', '\\frac{1}', '{2}', '\\)',
    '. Again: \\(\\frac{1}{2}\\).', ' Code: `$$x$$`.']) {
    const preview = stream.write(chunk);
    if (preview) replacePreview(preview);
  }
  replacePreview(stream.finish());
  if (shown.html !== md.render(shown.source, {})) throw new Error('Batch mismatch');
} finally {
  stream.abort();
}

// Each asynchronous producer captures its own handle. Cancel its transport too.
const oldProducer = stream;
stream = stream.reset();
try {
  try { oldProducer.write('stale source'); }
  catch (error) { console.log({staleProducer: error.message}); }
  stream.write('Replacement \\(y\\).');
  replacePreview(stream.finish());
} finally {
  stream.abort();
}
