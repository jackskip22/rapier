// SPDX-License-Identifier: MIT
// One bounded walk of the admitted TeX tree. This is Presentation MathML, not a
// second grammar, a content-math inference engine or a public AST input API.
const MATH_ML_OPAQUE_COLOR = /^(?:aliceblue|antiquewhite|aqua|aquamarine|azure|beige|bisque|black|blanchedalmond|blue|blueviolet|brown|burlywood|cadetblue|chartreuse|chocolate|coral|cornflowerblue|cornsilk|crimson|cyan|darkblue|darkcyan|darkgoldenrod|darkgray|darkgreen|darkgrey|darkkhaki|darkmagenta|darkolivegreen|darkorange|darkorchid|darkred|darksalmon|darkseagreen|darkslateblue|darkslategray|darkslategrey|darkturquoise|darkviolet|deeppink|deepskyblue|dimgray|dimgrey|dodgerblue|firebrick|floralwhite|forestgreen|fuchsia|gainsboro|ghostwhite|gold|goldenrod|gray|green|greenyellow|grey|honeydew|hotpink|indianred|indigo|ivory|khaki|lavender|lavenderblush|lawngreen|lemonchiffon|lightblue|lightcoral|lightcyan|lightgoldenrodyellow|lightgray|lightgreen|lightgrey|lightpink|lightsalmon|lightseagreen|lightskyblue|lightslategray|lightslategrey|lightsteelblue|lightyellow|lime|limegreen|linen|magenta|maroon|mediumaquamarine|mediumblue|mediumorchid|mediumpurple|mediumseagreen|mediumslateblue|mediumspringgreen|mediumturquoise|mediumvioletred|midnightblue|mintcream|mistyrose|moccasin|navajowhite|navy|oldlace|olive|olivedrab|orange|orangered|orchid|palegoldenrod|palegreen|paleturquoise|palevioletred|papayawhip|peachpuff|peru|pink|plum|powderblue|purple|rebeccapurple|red|rosybrown|royalblue|saddlebrown|salmon|sandybrown|seagreen|seashell|sienna|silver|skyblue|slateblue|slategray|slategrey|snow|springgreen|steelblue|tan|teal|thistle|tomato|turquoise|violet|wheat|white|whitesmoke|yellow|yellowgreen)$/i;
const MATH_ML_NAMESPACE = 'http://www.w3.org/1998/Math/MathML';
const MATH_ML_INVALID_XML = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\ud800-\udfff\ufffe\uffff]/u;
function mathMLXML(value) {
  const text = String(value);
  if (MATH_ML_INVALID_XML.test(text))
    throw {code: 'invalid-semantic-character', offset: 0, message: 'A generated mathematical character is not valid XML.'};
  return text.replace(/[&<>"'\t\n\r]/g, character => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '\t': '&#9;', '\n': '&#10;', '\r': '&#13;'}[character]));
}

function mathML(tree, source, safeSource, options = {}) {
  const metrics = {nodes: 0, depth: 0, outputCodeUnits: 0, links: 0};
  const diagnostics = [], codes = new Set(), active = new WeakSet();
  const sourceOmitted = source.length > 1000000 || !!safeSource?.error?.sourceOmitted;
  // HAST stringifiers can emit decoded CR literally; a subsequent HTML parse
  // normalizes it. ASCII custody survives that real host pipeline unchanged.
  const utf16 = sourceOmitted ? null : (safeSource?.utf16 ?? null);
  const encoding = sourceOmitted ? null : utf16 === null ? 'application/x-tex' : 'application/x-rapier-tex-utf16';
  const sourceInfo = {encoding, ...(sourceOmitted ? {omitted: true} : {})};
  let parts = [], length = 0, content = 0;
  const fail = (code, message) => { throw {code, message, offset: 0}; };
  const write = value => {
    length += value.length;
    if (length > 8 * 1024 * 1024) fail('resource-limit', 'MathML presentation exceeds its output budget.');
    parts.push(value);
  };
  const open = (name, attributes = {}) => {
    let value = '<' + name;
    for (const [key, item] of Object.entries(attributes)) if (item !== undefined)
      value += ' ' + key + '="' + mathMLXML(item) + '"';
    write(value + '>');
  };
  const close = name => write('</' + name + '>');
  const token = (name, value, attributes, context) => {
    open(name, attributes); write(mathMLXML(value)); close(name);
    if (!context?.phantom && !context?.transparent && /[^\p{White_Space}\p{Default_Ignorable_Code_Point}]/u.test(value)) content++;
  };
  const decimal = value => {
    if (!Number.isFinite(value)) fail('invalid-semantic-value', 'A mathematical dimension is not finite.');
    return String(Math.round(value * 1e6) / 1e6 || 0);
  };
  const em = value => decimal(value) + 'em';
  const warn = (code, message) => {
    if (!codes.has(code)) { codes.add(code); diagnostics.push({code, message, offset: 0}); }
  };
  const visit = (node, depth) => {
    if (++metrics.nodes > 100000) fail('resource-limit', 'MathML traversal exceeds its work budget.');
    metrics.depth = Math.max(metrics.depth, depth);
    if (depth > 512) fail('resource-limit', 'MathML is nested too deeply.');
    if (!node || typeof node !== 'object') fail('unsupported-semantic-node', 'A mathematical part is missing.');
  };
  const family = node => {
    const role = node.semanticRole;
    if (role === 'chemistry') warn('semantic-chemistry-presentation', 'Chemical notation retains presentation structure; chemical element, bond, charge and reaction meanings are not inferred.');
    else if (role === 'physics') warn('semantic-physics-presentation', 'Physics notation retains its parsed mathematical relationships; physical and specialized operator meanings are not inferred.');
    else if (role === 'units') warn('semantic-units-presentation', 'Unit notation retains the parser-expanded mathematical structure; quantities and unit identities are not inferred.');
    else if (role === 'tag') warn('semantic-tag-presentation', 'An authored tag remains following content; no equation identity, numbering or cross-reference semantics are assigned.');
  };
  // An operator's form and movable limits belong to it alone, not to the expressions inside it.
  const inner = context => ({...context, form: undefined, movableLimits: undefined});
  const scriptContext = context => ({...inner(context), display: false, level: Math.min(2, context.level + 1)});
  const styledContext = (context, node) => {
    const next = {...context};
    if (node.variant) next.variant = node.variant;
    // Invalid names inherit the current color; they cannot prove visibility.
    if (/^(?:transparent|#[\da-f]{3}0|#[\da-f]{6}00)$/i.test(node.color || '')) next.transparent = true;
    else if (node.color && (/^#/.test(node.color) || MATH_ML_OPAQUE_COLOR.test(node.color))) next.transparent = false;
    if (node.absoluteSize !== undefined) next.size = node.absoluteSize;
    if (node.size !== undefined) next.size *= node.size;
    if (node.mathStyle) { next.display = node.mathStyle === 'display'; next.level = {display: 0, text: 0, script: 1, scriptscript: 2}[node.mathStyle]; }
    return next;
  };
  const variant = (node, context) => node.variant || (context.variant === 'normal' ? node.defaultVariant || (node.type === 'text' ? 'roman' : 'normal') : context.variant);
  const styledText = (value, face) => {
    // Native Core supports only mi mathvariant=normal. The shared pure Unicode
    // mapping keeps mathematical alphabets meaningful without loading the font.
    if (face === 'roman') return value;
    let result = '';
    for (const character of value) result += String.fromCodePoint(mathStyledCodePoint(character.codePointAt(0), face));
    return result;
  };
  const atom = (node, value, kind, context, attributes = {}) => {
    const face = variant(node, context);
    if (kind === 'mtext') {
      let css = '';
      if (face.includes('bold')) css += 'font-weight:700;';
      if (face.includes('italic')) css += 'font-style:italic;';
      if (face.includes('sans-serif')) css += 'font-family:sans-serif;';
      else if (face === 'monospace') css += 'font-family:monospace;';
      if (/script|fraktur|double-struck/.test(face)) {
        attributes.mathvariant = face;
        warn('semantic-text-variant', 'This text alphabet uses the MathML 3 mathvariant extension; a Core host may show ordinary text while preserving the text content.');
      }
      if (css) attributes.style = css;
      // MathML trims token whitespace; \text{if } keeps its spaces only as no-break spaces.
      token(kind, value.replace(/ /g, '\u00a0'), attributes, context); return;
    }
    // A single-character mi is italic by default in MathML Core; the plain letter is what assistive technology speaks.
    const styled = kind === 'mi' && (face === 'normal' || face === 'italic') && [...value].length === 1 ? value : styledText(value, face);
    if (kind === 'mo' && context.movableLimits !== undefined) attributes.movablelimits = String(context.movableLimits);
    if (kind === 'mi' && face !== 'normal' && face !== 'italic') attributes.mathvariant = 'normal';
    token(kind, styled, attributes, context);
  };
  const kind = node => node.tokenKind || (/^\p{Decimal_Number}+$/u.test(node.value) ? 'mn' : /^[∞∅ℵℶℷℸ℘℧⅁]$/.test(node.value) ? 'mi' :
    ['op', 'bin', 'rel', 'open', 'close', 'punct', 'inner'].includes(node.class) ||
    /^[\p{Sm}\p{P}\p{Sc}\p{So}\p{Sk}\u2061-\u2064]$/u.test(node.value) ? 'mo' : 'mi');
  const classOf = node => {
    if (!node) return undefined;
    if (node.class) return node.class;
    if (node.type === 'row' && node.group) return 'ord';
    if (node.type === 'scripts' || node.type === 'accent') return classOf(node.base);
    if (node.type === 'style' || node.type === 'link') return classOf(node.body);
    if (node.type === 'row' && node.children.length === 1) return classOf(node.children[0]);
    return 'ord';
  };
  const limitsOf = node => {
    if (!node) return undefined;
    if (node.limits) return node.limits;
    if (node.type === 'row' && node.group) return undefined;
    if (node.type === 'style' || node.type === 'link') return limitsOf(node.body);
    if (node.type === 'row' && node.children.length === 1) return limitsOf(node.children[0]);
    if (node.type === 'accent') return limitsOf(node.base);
    return undefined;
  };
  const plain = (node, depth, strict = false) => {
    visit(node, depth); family(node);
    if (strict && node.variant && node.variant !== 'roman') return null;
    if (node.type === 'text' || !strict && node.type === 'glyph') return node.value;
    if (node.type !== 'row') return null;
    const values = [];
    for (const child of node.children) {
      const value = plain(child, depth + 1, strict);
      if (value === null) return null;
      values.push(value);
    }
    return values.join('');
  };
  const fence = (value, form, context, size) => {
    if (value) token('mo', value, {fence: 'true', form, stretchy: 'true', symmetric: 'true', ...(size ? {minsize: em(size), maxsize: em(size)} : {})}, context);
  };
  const numberPart = node => node?.type === 'glyph' && !node.semanticRole && !node.tokenKind && !node.large && !node.delimiter &&
    !node.delimiterSize && (!node.class || node.class === 'ord') && /^[\p{Decimal_Number}.]$/u.test(node.value);
  const sameNumberStyle = (left, right) => left.variant === right.variant && left.defaultVariant === right.defaultVariant;
  const singleToken = node => {
    while (node?.type === 'row' && !node.semanticRole && node.children.length === 1) node = node.children[0];
    return node?.type === 'glyph' || node?.type === 'text' ? node : null;
  };

  function scripts(node, context, depth, base) {
    if (node.pre) {
      open('mmultiscripts');
      if (base) base(); else emit(node.base, {...context, form: undefined, movableLimits: false}, depth + 1);
      open('mprescripts'); close('mprescripts');
      for (const part of [node.sub, node.sup]) {
        if (part) emit(part, scriptContext(context), depth + 1);
        else { open('mrow'); close('mrow'); }
      }
      close('mmultiscripts'); return;
    }
    const limits = node.limits || limitsOf(node.base), stacked = limits === 'always' || limits === 'display' && context.display && context.level === 0;
    const name = stacked ? node.sub && node.sup ? 'munderover' : node.sub ? 'munder' : 'mover' : node.sub && node.sup ? 'msubsup' : node.sub ? 'msub' : 'msup';
    open(name, stacked ? {accent: node.sup ? 'false' : undefined, accentunder: node.sub ? 'false' : undefined} : {});
    if (base) base(); else emit(node.base, {...context, form: undefined, movableLimits: stacked ? false : undefined}, depth + 1);
    if (node.sub) emit(node.sub, scriptContext(context), depth + 1);
    if (node.sup) emit(node.sup, scriptContext(context), depth + 1);
    close(name);
  }

  function row(children, context, depth) {
    if (children.some(node => node.type === 'choice')) {
      const selected = [];
      let selectionContext = context;
      const append = (nodes, level) => {
        for (const node of nodes) {
          if (node.type === 'style' && node.mathStyle && node.declaration && node.body.type === 'row' && !node.body.children.length)
            selectionContext = styledContext(selectionContext, node);
          if (node.type !== 'choice') { selected.push(node); continue; }
          visit(node, level); family(node);
          if (active.has(node)) fail('unsupported-semantic-node', 'A mathematical tree contains a cycle.');
          active.add(node);
          const branch = mathChoice(node, selectionContext);
          visit(branch, level + 1);
          append(branch.children, level + 2);
          active.delete(node);
        }
      };
      append(children, depth + 1); children = selected;
      if (children.length !== 1) context = {...context, ordinary: undefined};
    }
    // movablelimits belongs to an operator that is itself the base, not to operators inside a compound base.
    if (children.length > 1) context = {...context, movableLimits: undefined};
    open('mrow');
    let previous, styled = false;
    for (let index = 0; index < children.length; index++) {
      const node = children[index];
      if (node.type === 'style' && node.mathStyle && node.declaration && node.body.type === 'row' && !node.body.children.length) {
        visit(node, depth + 1); visit(node.body, depth + 2); context = styledContext(context, node);
        if (styled) close('mstyle');
        open('mstyle', {displaystyle: String(context.display), scriptlevel: String(context.level)}); styled = true; continue;
      }
      // The parser's prescript uses a phantom nucleus followed by the real nucleus for SVG placement.
      if (node.type === 'scripts' && node.pre && node.base?.type === 'phantom' && node.base.body === children[index + 1]) {
        emit({...node, base: children[++index]}, context, depth + 1);
        previous = classOf(node.base.body); continue;
      }
      if (numberPart(node)) {
        let end = index + 1;
        while (end < children.length && numberPart(children[end]) && sameNumberStyle(node, children[end])) end++;
        const scripted = children[end]?.type === 'scripts' && !children[end].semanticRole && numberPart(children[end].base) && sameNumberStyle(node, children[end].base) ? children[end] : null;
        const values = children.slice(index, end).map(child => child.value).join('') + (scripted ? scripted.base.value : '');
        // A malformed multi-dot run is not silently split into apparent decimal
        // numbers. Groups, explicit spaces, styles and scripts are hard borders.
        if (/^(?:\p{Decimal_Number}+(?:\.\p{Decimal_Number}*)?|\.\p{Decimal_Number}+)$/u.test(values)) {
          for (let at = index; at < end; at++) visit(children[at], depth + 1);
          if (scripted) {
            visit(scripted, depth + 1); visit(scripted.base, depth + 2);
            scripts(scripted, context, depth + 1, () => atom(node, values, 'mn', context)); end++;
          } else atom(node, values, 'mn', context);
          previous = 'ord'; index = end - 1; continue;
        }
        // Consume an invalid run in one pass. Reconsidering each suffix both
        // invents decimals (6.7.8 -> 6 . 7.8) and makes dot-only input quadratic.
        for (let at = index; at < end; at++) emit(children[at], context, depth + 1);
        if (scripted) { emit(scripted, context, depth + 1); end++; }
        previous = 'ord'; index = end - 1; continue;
      }
      let form;
      if ((node.type === 'glyph' || node.type === 'style' && node.body.type === 'glyph') && classOf(node) === 'bin') {
        // TeX's rule 5: a binary operator before a relation, a closing symbol or nothing is not infix.
        const next = children.slice(index + 1).find(child => child.type !== 'space' && !(child.type === 'style' && child.mathStyle && child.declaration && child.body.type === 'row' && !child.body.children.length));
        form = !previous || ['bin', 'op', 'rel', 'open', 'punct'].includes(previous) ? 'prefix' : !next || ['rel', 'close', 'punct'].includes(classOf(next)) ? 'postfix' : 'infix';
      }
      emit(node, {...context, form}, depth + 1);
      if (node.type !== 'space') previous = classOf(node);
    }
    if (styled) close('mstyle');
    close('mrow');
  }

  function table(node, context, depth) {
    const rows = node.rows, columns = Math.max(node.align?.length || 0, node.pairs ? node.pairs * 2 : 0, ...rows.map(cells => cells.length));
    const insertions = node.columnInsertions || [], rules = (node.columnRules?.length || 0) + (node.rowRules?.length || 0);
    if (columns > 256 || rows.length > 2048 || rows.length * (columns + insertions.length) + rules > 100000)
      fail('resource-limit', 'MathML table composition exceeds its work budget.');
    for (const boundary of node.columnRules || []) if (!Number.isInteger(boundary) || boundary < 0 || boundary > columns)
      fail('invalid-rule', 'An array rule exceeds its columns.');
    for (const rule of node.rowRules || []) {
      const from = rule.from ?? 0, to = rule.to ?? columns;
      if (!Number.isInteger(rule.before) || rule.before < 0 || rule.before > rows.length || !Number.isInteger(from) ||
        !Number.isInteger(to) || from < 0 || from > to || to > columns)
        fail('invalid-rule', 'An array rule exceeds its cells.');
    }
    if (insertions.length || rules) warn('semantic-array-presentation', 'Array insertion content is preserved in adjacent cells; decorative row and column rules have no additional mathematical meaning and are omitted.');
    const before = Array.from({length: columns + 1}, () => []);
    for (const insertion of insertions) {
      if (!Number.isInteger(insertion.before) || insertion.before < 0 || insertion.before > columns)
        fail('invalid-alignment', 'A MathML array insertion exceeds its columns.');
      before[insertion.before].push(insertion.body);
    }
    const small = /smallmatrix$/.test(node.env) || node.env === 'subarray' || node.env === 'substack';
    const display = /^(align(?:ed)?(?:at)?|flalign|split|[lr]?gather(?:ed)?|eqnarray|multline(?:d)?|equation|drcases|dcases|darray)$/.test(node.env);
    const cellContext = {...context, display: small ? false : display, level: small ? Math.max(1, context.level) : context.level};
    const delimiters = mathTableDelimiters(node.env);
    if (delimiters) { open('mrow'); fence(delimiters[0], 'prefix', context); }
    open('mtable', {displaystyle: String(cellContext.display), scriptlevel: String(cellContext.level), 'data-math-environment': node.env});
    for (let at = 0; at < rows.length; at++) {
      open('mtr');
      // \intertext spans the whole row at its left; \multicolumn and \hdotsfor span their columns.
      const intertext = rows[at][0]?.intertext;
      for (let column = 0; column < (intertext ? 1 : columns); column++) {
        if (++metrics.nodes > 100000) fail('resource-limit', 'MathML table cells exceed its work budget.');
        const cell = rows[at][column];
        if (cell?.covered) continue;
        let align = intertext ? 'l' : cell?.spanAlign || (node.env === 'eqnarray' ? ['r', 'c', 'l'][column % 3] : node.align?.[column] || 'c');
        if (/^multlined?$/.test(node.env) && columns === 1) align = at === 0 ? 'l' : at === rows.length - 1 ? 'r' : 'c';
        const span = intertext ? columns : cell?.span > 1 ? Math.min(cell.span, columns - column) : 0;
        open('mtd', {...(span > 1 ? {columnspan: String(span)} : {}), style: 'text-align:' + ({l: 'left', r: 'right', c: 'center'}[align] || 'center')});
        open('mrow');
        for (const body of before[column]) emit(body, cellContext, depth + 1);
        if (cell?.dots) token('mo', '…', {stretchy: 'false'}, cellContext);
        else if (cell) emit(cell, cellContext, depth + 1);
        if (column + Math.max(1, span) >= columns) for (const body of before[columns]) emit(body, cellContext, depth + 1);
        close('mrow'); close('mtd');
      }
      close('mtr');
    }
    close('mtable');
    if (delimiters) { fence(delimiters[1], 'postfix', context); close('mrow'); }
    if (node.position || node.rowGaps?.some(value => value))
      warn('semantic-table-spacing', 'Table row and cell relationships are preserved; custom baseline placement and row gaps are not reproduced.');
  }

  function emit(node, context, depth = 0) {
    visit(node, depth); family(node);
    if (active.has(node)) fail('unsupported-semantic-node', 'A mathematical tree contains a cycle.');
    active.add(node);
    try {
      switch (node.type) {
        // A braced group is an ordinary atom in TeX; an operator alone in it takes no spacing of its own.
        case 'row': row(node.children, node.group && node.children.length === 1 ? {...context, ordinary: true} : {...context, ordinary: undefined}, depth); break;
        case 'choice': emit(mathChoice(node, context), context, depth + 1); break;
        case 'glyph': {
          const name = kind(node), attributes = {};
          if (name === 'mo') {
            if (node.class === 'open' || node.class === 'close') { attributes.fence = String(!/^[!?]$/.test(node.value)); attributes.form = node.class === 'open' ? 'prefix' : 'postfix'; }
            else if (node.class === 'punct') attributes.separator = 'true';
            else if (context.form) attributes.form = context.form;
            if (node.large !== undefined) attributes.largeop = String(!!node.large);
            if (node.limits) attributes.movablelimits = String(node.limits === 'display');
            if (node.delimiter || node.delimiterSize || node.stretch) attributes.stretchy = 'true';
            else attributes.stretchy = 'false';
            if (node.delimiterSize) attributes.minsize = attributes.maxsize = em(node.delimiterSize);
            else if (node.minWidth) attributes.minsize = em(node.minWidth);
            if (node.class === 'ord' && node.tokenKind === 'mo') attributes.lspace = attributes.rspace = '0em';
            if (context.ordinary) { attributes.lspace = attributes.rspace = '0em'; if (node.limits) attributes.movablelimits = 'false'; }
          }
          atom(node, node.value, name, context, attributes); break;
        }
        case 'text': atom(node, node.value, ['op', 'bin', 'rel'].includes(node.class) ? 'mo' : 'mtext', context,
          node.class === 'op' ? {form: 'prefix', movablelimits: String(node.limits === 'display')} : {}); break;
        case 'space': {
          const width = options.displayMode && node.displayWidth !== undefined ? node.displayWidth : node.width;
          open('mspace', {width: em(Math.max(0, width)), style: width < 0 ? 'margin-left:' + em(width) : undefined}); close('mspace'); break;
        }
        case 'scripts': scripts(node, context, depth); break;
        case 'frac': {
          const local = node.style ? styledContext(context, {mathStyle: node.style}) : context;
          if (node.style) open('mstyle', {displaystyle: String(local.display), scriptlevel: String(local.level)});
          if (node.left || node.right) { open('mrow'); fence(node.left, 'prefix', local); }
          open('mfrac', {linethickness: node.bar === false ? '0' : node.barThickness === undefined ? undefined : em(node.barThickness)});
          const child = local.display && local.level === 0 ? {...local, display: false} : scriptContext(local);
          emit(node.num, inner(child), depth + 1); emit(node.den, inner(child), depth + 1); close('mfrac');
          if (node.left || node.right) { fence(node.right, 'postfix', local); close('mrow'); }
          if (node.style) close('mstyle');
          if (node.align) warn('semantic-fraction-alignment', 'The fraction relationship is preserved; continued-fraction numerator alignment is left to the MathML host.');
          break;
        }
        case 'root':
          open(node.index ? 'mroot' : 'msqrt'); emit(node.body, inner(context), depth + 1);
          if (node.index) emit(node.index, {...inner(context), display: false, level: 2}, depth + 1);
          close(node.index ? 'mroot' : 'msqrt'); break;
        case 'fence':
          open('mrow'); fence(node.left, 'prefix', context, node.size); emit(node.body, inner(context), depth + 1); fence(node.right, 'postfix', context, node.size); close('mrow'); break;
        case 'enclose': {
          warn('semantic-overlay', 'An enclosure uses the MathML 3 menclose extension; hosts implementing only Core may omit its lines.');
          const css = (node.color ? 'color:' + node.color + ';' : '') + (node.background ? 'background:' + node.background + ';' : '');
          open('menclose', {notation: node.notation.join(' '), style: css || undefined}); emit(node.body, context, depth + 1); close('menclose'); break;
        }
        case 'accent': {
          if (node.overlay || node.position === 'through') {
            warn('semantic-overlay', 'An overlay uses the MathML 3 menclose extension; hosts implementing only Core may omit the cancellation or negation mark.');
            const notation = node.value === '╲' ? 'downdiagonalstrike' : node.value === '╳' ? 'updiagonalstrike downdiagonalstrike' : node.value === '↗' ? 'updiagonalarrow' : node.value === '─' ? 'horizontalstrike' : 'updiagonalstrike';
            open('menclose', {notation}); emit(node.base, context, depth + 1); close('menclose'); break;
          }
          const under = node.position === 'under', name = under ? 'munder' : 'mover';
          open(name, {[under ? 'accentunder' : 'accent']: 'true'}); emit(node.base, {...context, movableLimits: false}, depth + 1);
          token('mo', node.value, {stretchy: String(!!node.stretch)}, context); close(name); break;
        }
        case 'overunder': {
          const base = node.minWidth ? {...node.base, minWidth: node.minWidth} : node.base;
          if (!node.over && !node.under) { emit(base, {...context, ordinary: node.unspaced || undefined}, depth + 1); break; }
          const name = node.over && node.under ? 'munderover' : node.under ? 'munder' : 'mover';
          open(name, {accent: node.over ? 'false' : undefined, accentunder: node.under ? 'false' : undefined}); emit(base, {...context, movableLimits: false, ordinary: node.unspaced || undefined}, depth + 1);
          if (node.under) emit(node.under, scriptContext(context), depth + 1);
          if (node.over) emit(node.over, scriptContext(context), depth + 1);
          close(name); break;
        }
        case 'table': table(node, context, depth); break;
        case 'style': {
          const local = styledContext(context, node), attributes = {'data-math-class': node.class};
          if (node.mathStyle) { attributes.displaystyle = String(local.display); attributes.scriptlevel = String(local.level); }
          let css = '';
          if (node.absoluteSize !== undefined || node.size !== undefined) css += 'font-size:' + decimal(local.size / context.size) + 'em;';
          if (node.color) css += 'color:' + node.color + ';';
          if (node.background) css += 'background-color:' + node.background + ';';
          if (node.border) css += 'border:0.04em solid ' + node.border + ';padding:' + em(node.padding ?? .2) + ';';
          if (css) attributes.style = css;
          open('mstyle', attributes);
          if (node.tokenKind) {
            atom({variant: local.variant}, node.tokenText, node.tokenKind, local);
          } else if (node.operatorName) {
            const value = plain(node.body, depth + 1, true);
            if (value === null) {
              warn('semantic-rich-operator', 'A styled or mixed-math operator name retains its nested structure instead of becoming one plain operator token.');
              emit(node.body, local, depth + 1);
            } else atom({variant: 'roman'}, value, 'mo', local, {form: 'prefix', movablelimits: String(node.limits === 'display')});
          } else if (node.width !== undefined) {
            warn('semantic-layout-adjustment', 'A TeX layout adjustment retains its mathematical content with a bounded presentation approximation.');
            open('mpadded', {width: em(node.width)}); emit(node.body, local, depth + 1); close('mpadded');
          } else if (node.class) {
            const leaf = singleToken(node.body);
            if (leaf) emit({...leaf, class: node.class}, local, depth + 1);
            else if (node.body.type === 'row' && node.body.children.filter(child => child.type !== 'space').length === 1 &&
              node.body.children.every(child => child.type === 'space' || classOf(child) === node.class)) emit(node.body, local, depth + 1);
            else {
              warn('semantic-atom-class', 'A compound expression retains its mathematical children; its TeX atom class does not create a single MathML operator.');
              emit(node.body, local, depth + 1);
            }
          } else emit(node.body, local, depth + 1);
          close('mstyle'); break;
        }
        case 'phantom': {
          const before = content;
          if (node.mode === 'h' || node.mode === 'v') open('mpadded', node.mode === 'h' ? {height: '0', depth: '0'} : {width: '0'});
          open('mphantom'); emit(node.body, {...context, phantom: true}, depth + 1); close('mphantom');
          if (node.mode === 'h' || node.mode === 'v') close('mpadded');
          content = before; break;
        }
        case 'smash':
          open('mpadded', {height: node.mode === 'b' ? undefined : '0', depth: node.mode === 't' ? undefined : '0'});
          emit(node.body, context, depth + 1); close('mpadded'); break;
        case 'raise':
          open('mpadded', {voffset: node.center ? undefined : em(node.amount), height: node.height === undefined ? undefined : em(node.height), depth: node.depth === undefined ? undefined : em(node.depth)});
          emit(node.body, context, depth + 1); close('mpadded'); break;
        case 'rule':
          warn('semantic-rule-presentation', 'A rule is represented as a decorative mathematical space; no additional mathematical relationship is inferred.');
          open('mspace', {width: em(node.width), height: em(node.height), depth: em(node.depth), style: 'background-color:currentColor'}); close('mspace');
          if (!context.phantom && !context.transparent && node.width > 0 && node.height + node.depth > 0) content++; break;
        case 'link': {
          if (context.inLink) fail('semantic-nested-link', 'Nested authored mathematical links cannot be represented as valid native HTML links.');
          if (context.phantom) fail('semantic-hidden-link', 'An authored link inside phantom content cannot become an invisible native focus target.');
          let url;
          try { url = new URL(node.href); } catch { fail('unsafe-link', 'A mathematical link has an invalid address.'); }
          if (!['http:', 'https:'].includes(url.protocol) || !/^https?:\/\/[^\s<>"'\\]+$/i.test(node.href))
            fail('unsafe-link', 'A mathematical link must use an HTTP or HTTPS address.');
          warn('semantic-link-embedding', 'The authored link uses native HTML inside MathML text, with a nested MathML expression; assistive-technology interaction depends on the host.');
          metrics.links++;
          open('mtext'); open('a', {xmlns: 'http://www.w3.org/1999/xhtml', href: node.href, title: node.href, target: '_blank', rel: 'noopener noreferrer'});
          const before = content;
          open('math', {xmlns: MATH_ML_NAMESPACE, display: 'inline'}); emit(node.body, {...context, inLink: true, display: false}, depth + 1);
          if (content === before) fail('semantic-empty-link', 'An authored mathematical link has no visible content for native focus.');
          close('math'); close('a'); close('mtext'); break;
        }
        default: fail('unsupported-semantic-node', 'Unsupported mathematical node for MathML.');
      }
    } finally { active.delete(node); }
  }

  let status;
  try {
    if (sourceOmitted) fail('resource-limit', 'This formula is too long for MathML. Its source was not embedded; retain the original input.');
    if (options.error || safeSource?.error) throw options.error || safeSource.error;
    if (!tree) fail('unsupported-semantic-node', 'A parsed mathematical expression is required.');
    emit(tree, {display: !!options.displayMode, level: 0, size: 1, variant: 'normal', inLink: false});
    status = diagnostics.length ? 'presentation-fallback' : 'complete';
  } catch (cause) {
    const error = mathDiagnostic(cause);
    if (sourceOmitted) error.sourceOmitted = true;
    diagnostics.length = 0; diagnostics.push(error);
    status = 'refused'; metrics.links = 0;
    parts = ['<merror><mtext>Formula could not be represented as MathML.</mtext></merror>'];
  }
  const presentation = parts.join('');
  const annotation = sourceOmitted ? '' : encoding === 'application/x-tex' ?
    '<annotation encoding="application/x-tex">' + mathMLXML(source) + '</annotation>' :
    '<annotation encoding="text/plain">' + mathMLXML(safeSource.alternative) + '</annotation>' +
    '<annotation encoding="application/x-rapier-tex-utf16">' + utf16 + '</annotation>';
  const wrap = body => '<math xmlns="' + MATH_ML_NAMESPACE + '" display="' + (options.displayMode ? 'block' : 'inline') +
    '" data-rapier-mathml-status="' + status + '"' + (sourceOmitted ? ' data-math-source-omitted="true"' : '') +
    '><semantics>' + body + annotation + '</semantics></math>';
  // Source admission bounds escaping independently of the presentation budget:
  // at most 6M XML-escaped source, or 6M alternative plus 4M UTF-16 carrier.
  let mathml = wrap(presentation);
  if (mathml.length > 16 * 1024 * 1024) {
    status = 'refused'; metrics.links = 0;
    diagnostics.length = 0;
    diagnostics.push({code: 'resource-limit', offset: 0, message: 'Complete MathML exceeds its output budget.'});
    mathml = wrap('<merror><mtext>Formula could not be represented as MathML.</mtext></merror>');
  }
  metrics.outputCodeUnits = mathml.length;
  return {mathml, status, errors: diagnostics, metrics, source: sourceInfo};
}

import {mathDiagnostic} from './source.js';
import {mathStyledCodePoint} from './variants.js';
import {mathChoice, mathTableDelimiters} from './parser.js';
export {mathML};
