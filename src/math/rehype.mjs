// SPDX-License-Identifier: MIT
import {fromHtml} from 'hast-util-from-html';
import {createFormulaRenderer} from './integration.mjs';
import {assertMathSession} from './reuse.mjs';

// Run AFTER the host sanitizer. Only known math code nodes are replaced, using
// fresh renderer output parsed into HAST. Authored raw nodes never become HTML here.
export default function rehypeRapierMath(options = {}) {
  return (tree, file) => {
    const mathSession = file?.data?.rapierMathSession;
    assertMathSession(mathSession);
    let render;
    function math(node) {
      const names = node?.properties?.className;
      if (node?.type !== 'element' || node.tagName !== 'code' || !Array.isArray(names) ||
          !names.includes('language-math') || !names.some(name => name === 'math-inline' || name === 'math-display') ||
          !Array.isArray(node.children) || !node.children.every(child => child.type === 'text' && typeof child.value === 'string')) return null;
      return {source: node.children.map(child => child.value).join(''), display: names.includes('math-display')};
    }
    function visit(parent, hostLink = null) {
      if (parent.type === 'element' && parent.tagName === 'a') hostLink = parent;
      for (let index = 0; index < (parent.children?.length || 0); index++) {
        const node = parent.children[index];
        const code = node.type === 'element' && node.tagName === 'pre' && node.children?.length === 1 ? node.children[0] : node;
        const input = math(code);
        if (!input) { visit(node, hostLink); continue; }
        const result = render(input.source, input.display, !!hostLink);
        if (result.errors.length) {
          for (const error of result.errors) {
            const message = file?.message(error.message, {place: code.position, source: 'rapier-math', ruleId: error.code});
            if (message) { message.mathSource = input.source; message.mathOffset = error.offset; }
          }
          continue;
        }
        // Native MathML descendants do not supply a link name in every host.
        // Match internal formula links' destination fallback without inventing
        // mathematical speech or replacing an authored accessible name.
        if (result.presentation && hostLink) {
          const properties = hostLink.properties ||= {};
          if (!properties.ariaLabel && !properties.ariaLabelledBy && !properties.title &&
              typeof properties.href === 'string' && properties.href)
            properties.title = properties.href;
        }
        // Every occurrence gets fresh nodes, including every part of a composed
        // result. Reusable formula artifacts never own host HAST identity.
        const children = fromHtml(result.markup, {fragment: true}).children;
        const replacement = input.display ? [{type: 'element', tagName: 'div', properties: {className: ['math-display']}, children}] : children;
        parent.children.splice(index, 1, ...replacement);
        index += replacement.length - 1;
      }
    }
    try {
      render = createFormulaRenderer(options, mathSession);
      visit(tree);
    }
    catch (error) { mathSession?.clear(); throw error; }
  };
}
