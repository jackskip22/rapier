// SPDX-License-Identifier: MIT
import {installMathRules} from './markdown-rules.mjs';
import {createFormulaRenderer, escapeText} from './integration.mjs';
import {assertMathSession} from './reuse.mjs';

export default function rapierMath(md, options = {}) {
  installMathRules(md, options);
  let document;
  function withDocument(renderer, render, tokens, opts, env) {
    const previous = document, mathSession = env?.rapierMathSession;
    assertMathSession(mathSession);
    try {
      const current = {render: createFormulaRenderer(options, mathSession), parents: new WeakMap(), linked: new WeakSet(), activeTokens: tokens};
      const visit = (tokens, depth = 0) => {
        for (const token of tokens) {
          if (token.type === 'link_close') depth--;
          if (depth > 0) current.linked.add(token);
          if (token.type === 'link_open') depth++;
          if (token.children) { current.parents.set(token.children, tokens); visit(token.children, depth); }
        }
      };
      visit(tokens);
      document = current;
      return render.call(renderer, tokens, opts, env);
    }
    catch (error) { mathSession?.clear(); throw error; }
    finally { document = previous; }
  }
  const render = md.renderer.render, renderInline = md.renderer.renderInline;
  md.renderer.render = function(tokens, opts, env) {
    return withDocument(this, render, tokens, opts, env);
  };
  md.renderer.renderInline = function(tokens, opts, env) {
    // Only descent from the active parent shares its budget. Reentering an
    // already active inline tree (or its sibling) owns a fresh document budget.
    if (document && document.parents.get(tokens) === document.activeTokens) {
      const current = document, previous = current.activeTokens;
      current.activeTokens = tokens;
      try { return renderInline.call(this, tokens, opts, env); }
      finally { current.activeTokens = previous; }
    }
    return withDocument(this, renderInline, tokens, opts, env);
  };
  function formula(tokens, index, _options, env) {
    const token = tokens[index], display = token.type === 'math_block';
    const result = (document?.render || createFormulaRenderer(options, env?.rapierMathSession))(token.content, display, document?.linked.has(token));
    if (result.errors.length) {
      (env.rapierMathErrors ||= []).push({source: token.content, errors: result.errors});
      return '<code data-math-error="' + escapeText(result.errors[0].code) + '">' +
        escapeText(token.meta?.mathSource ?? token.content) + '</code>';
    }
    return result.markup;
  }
  md.renderer.rules.math_inline = formula;
  md.renderer.rules.math_block = (tokens, index, opts, env) => {
    const result = formula(tokens, index, opts, env);
    return tokens[index].block ? '<div class="math-display">' + result + '</div>\n' : result;
  };
}
