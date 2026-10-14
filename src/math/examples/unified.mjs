// SPDX-License-Identifier: MIT
import {unified} from 'unified';
import remarkParse from 'remark-parse';
import remarkMath from 'remark-math';
import remarkRehype from 'remark-rehype';
import rehypeSanitize, {defaultSchema} from 'rehype-sanitize';
import rehypeRapierMath from 'rapier-math/rehype';
import rehypeStringify from 'rehype-stringify';
import {createMathSession} from 'rapier-math/stream';
import {pathToFileURL} from 'node:url';

export const processor = unified().use(remarkParse)
  .use(remarkMath, {singleDollarTextMath: false}).use(remarkRehype)
  .use(rehypeSanitize, {
    ...defaultSchema,
    attributes: {...defaultSchema.attributes, code: [
      ...(defaultSchema.attributes.code || []).filter(rule => !(Array.isArray(rule) && rule[0] === 'className')),
      ['className', 'language-math', 'math-inline', 'math-display'],
    ]},
  })
  .use(rehypeRapierMath).use(rehypeStringify);

export function renderMarkdown(source, mathSession) {
  // A new VFile keeps diagnostics local to this whole-source render. Only the
  // explicitly supplied message lifetime carries formula work across previews.
  return processor.processSync({value: source, data: {rapierMathSession: mathSession}});
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const source = 'Price $5. Code `$$x$$`. Math $$x^2$$.\n\n$$\n\\frac{1}{2}\n$$';
  const mathSession = createMathSession();
  try {
    for (const preview of [source, source + '\n\nOne more $$x^2$$.']) {
      const file = renderMarkdown(preview, mathSession);
      console.log(String(file));
      console.error(file.messages);
    }
    console.error(mathSession.stats);
  } finally { mathSession.dispose(); }
}
