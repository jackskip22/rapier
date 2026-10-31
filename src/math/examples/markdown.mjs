// SPDX-License-Identifier: MIT
import MarkdownIt from 'markdown-it';
import rapierMath from 'rapier-math/markdown-it';
import {createMathSession} from 'rapier-math/stream';
import {pathToFileURL} from 'node:url';

export const md = new MarkdownIt({html: false}).use(rapierMath);
export function renderMarkdown(source, mathSession) {
  const env = {rapierMathSession: mathSession};
  return {html: md.render(source, env), errors: env.rapierMathErrors || []};
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const source = 'It costs $5 and $10. Code: `$$x$$`. Math: \\(x^2\\).\n\n$$\\frac{1}{2}$$\n';
  const mathSession = createMathSession();
  try {
    // Replace the host's whole preview. The same formulas can reuse work, while
    // each document render has its own limits and diagnostics.
    for (const preview of [source, source + '\nOne more \\(x^2\\).']) {
      const result = renderMarkdown(preview, mathSession);
      console.log(result.html);
      console.error(result.errors);
    }
    console.error(mathSession.stats);
  } finally { mathSession.dispose(); }
}
