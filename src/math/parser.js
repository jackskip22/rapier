// SPDX-License-Identifier: MIT
// TeX is tokenized before parsing. Expansions use a stack, never executable code.
class MathTexError extends Error {
  constructor(code, message, offset = 0, command = '') {
    super(message);
    this.name = 'MathTexError';
    this.code = code;
    this.offset = offset;
    this.command = command;
  }
}

function mathTexTokens(source, offset = 0) {
  const tokens = [];
  for (let i = 0; i < source.length;) {
    const start = i, value = String.fromCodePoint(source.codePointAt(i));
    i += value.length;
    if (value === '%') {
      while (i < source.length && source[i] !== '\n' && source[i] !== '\r') i++;
      if (source[i] === '\r') i++;
      if (source[i] === '\n') i++;
      continue;
    }
    if (value === '\\') {
      if (i === source.length) throw new MathTexError('unfinished-command', 'A command is missing after the backslash.', offset + start);
      let command = '';
      if (/[A-Za-z@]/.test(source[i])) {
        while (i < source.length && /[A-Za-z@]/.test(source[i])) command += source[i++];
        tokens.push({kind: 'command', value: command, offset: offset + start});
        while (i < source.length && /\s/.test(source[i])) i++;
      } else {
        command = String.fromCodePoint(source.codePointAt(i));
        i += command.length;
        tokens.push({kind: 'command', value: /\s/.test(command) ? ' ' : command, offset: offset + start});
      }
    } else if (/\s/.test(value)) {
      while (i < source.length && /\s/.test(source[i])) i++;
      tokens.push({kind: 'space', value: ' ', offset: offset + start});
    } else tokens.push({kind: 'char', value, offset: offset + start});
    if (tokens.length > 100000)
      throw new MathTexError('resource-limit', 'This formula has too many tokens to render safely.', offset + start);
  }
  return tokens;
}

const MATH_TEX_VARIANTS = Object.freeze({
  mathrm: 'roman', mathnormal: 'normal', mathit: 'italic', mathbf: 'bold', boldsymbol: 'bold-italic', bm: 'bold-italic',
  mathbb: 'double-struck', mathbbm: 'double-struck', mathbbmss: 'double-struck', mathbbmtt: 'double-struck', mathds: 'double-struck',
  Bbb: 'double-struck', mathcal: 'script', mathscr: 'script', mathfrak: 'fraktur', frak: 'fraktur',
  mathsf: 'sans-serif', mathss: 'sans-serif', mathtt: 'monospace', mathbfit: 'bold-italic',
  mathbfsf: 'sans-serif-bold', mathsfit: 'sans-serif-italic', mathbfsfit: 'sans-serif-bold-italic',
  mathbfscr: 'bold-script', mathbffrak: 'bold-fraktur', bold: 'bold'
});
const MATH_TEX_TEXT_VARIANTS = Object.freeze({
  text: 'roman', textrm: 'roman', textnormal: 'roman', mbox: 'roman', hbox: 'roman', textup: 'roman',
  textbf: 'bold', textit: 'italic', emph: 'italic', textsl: 'italic', textsf: 'sans-serif', texttt: 'monospace',
  textsc: 'roman'
});
const MATH_TEX_DECLARATIONS = Object.freeze({
  rm: {variant: 'roman'}, rmfamily: {variant: 'roman'}, normalfont: {variant: 'roman'},
  it: {variant: 'italic'}, itshape: {variant: 'italic'}, sl: {variant: 'italic'},
  bf: {variant: 'bold'}, bfseries: {variant: 'bold'}, sf: {variant: 'sans-serif'}, sffamily: {variant: 'sans-serif'},
  tt: {variant: 'monospace'}, ttfamily: {variant: 'monospace'}, cal: {variant: 'script'},
  displaystyle: {mathStyle: 'display'}, textstyle: {mathStyle: 'text'}, scriptstyle: {mathStyle: 'script'}, scriptscriptstyle: {mathStyle: 'scriptscript'},
  tiny: {absoluteSize: .5}, scriptsize: {absoluteSize: .7}, footnotesize: {absoluteSize: .8}, small: {absoluteSize: .9}, normalsize: {absoluteSize: 1},
  large: {absoluteSize: 1.2}, Large: {absoluteSize: 1.44}, LARGE: {absoluteSize: 1.728}, huge: {absoluteSize: 2.074}, Huge: {absoluteSize: 2.488}
});
const MATH_TEX_ACCENTS = Object.freeze({
  hat: ['̂', 'over'], widehat: ['̂', 'over', true], check: ['̌', 'over'], widecheck: ['̌', 'over', true],
  tilde: ['̃', 'over'], widetilde: ['̃', 'over', true], acute: ['́', 'over'], grave: ['̀', 'over'],
  breve: ['̆', 'over'], bar: ['̄', 'over'], vec: ['⃗', 'over'], dot: ['̇', 'over'], ddot: ['̈', 'over'],
  dddot: ['⃛', 'over'], ddddot: ['⃜', 'over'], mathring: ['̊', 'over'], ring: ['̊', 'over'],
  overline: ['¯', 'over', true], underline: ['_', 'under', true], overbrace: ['⏞', 'over', true], underbrace: ['⏟', 'under', true],
  overparen: ['⏜', 'over', true], underparen: ['⏝', 'under', true], overbracket: ['⎴', 'over', true], underbracket: ['⎵', 'under', true],
  overrightarrow: ['→', 'over', true], overleftarrow: ['←', 'over', true], overleftrightarrow: ['↔', 'over', true],
  underrightarrow: ['→', 'under', true], underleftarrow: ['←', 'under', true], underleftrightarrow: ['↔', 'under', true],
  overleftharpoon: ['↼', 'over', true], overrightharpoon: ['⇀', 'over', true], utilde: ['̃', 'under', true]
});
const MATH_TEX_LONG_ARROWS = {iff: 'Longleftrightarrow', implies: 'Longrightarrow', impliedby: 'Longleftarrow'};
const MATH_TEX_SPACES = Object.freeze({
  ',': 3 / 18, ':': 4 / 18, ';': 5 / 18, '!': -3 / 18, ' ': 1 / 3,
  quad: 1, qquad: 2, enspace: .5, enskip: .5, thinspace: 3 / 18, medspace: 4 / 18, thickspace: 5 / 18,
  negthinspace: -3 / 18, negmedspace: -4 / 18, negthickspace: -5 / 18
});
const MATH_TEX_PACKAGES = new Set(('ams amsmath amssymb amsfonts mathtools color newcommand unicode mhchem physics bbm bboldx dsfont cancel bbox boldsymbol').split(' '));
const MATH_TEX_ENVIRONMENTS = new Set(('matrix pmatrix bmatrix Bmatrix vmatrix Vmatrix smallmatrix psmallmatrix bsmallmatrix Bsmallmatrix vsmallmatrix Vsmallmatrix array aligned alignedat align alignat flalign gathered gather split cases dcases rcases drcases subarray substack eqnarray multline equation').split(' '));
const MATH_TEX_LITERAL_CLASSES = Object.freeze({
  '+': 'bin', '−': 'bin', '-': 'bin', '±': 'bin', '∓': 'bin', '×': 'bin', '÷': 'bin', '*': 'bin', '⋅': 'bin',
  '=': 'rel', '<': 'rel', '>': 'rel', '≤': 'rel', '≥': 'rel', '≠': 'rel', ':': 'rel',
  '(': 'open', '[': 'open', '⟨': 'open', ')': 'close', ']': 'close', '⟩': 'close', ',': 'punct', ';': 'punct',
  '∑': 'op', '∏': 'op', '∫': 'op', '∮': 'op', '∬': 'op', '∭': 'op'
});

function mathTexTokenText(tokens) {
  return tokens.map(token => token.kind === 'command' ? '\\' + token.value + (/^[A-Za-z@]+$/.test(token.value) ? ' ' : '') : token.value).join('');
}
function mathTexTokenEqual(a, b) { return !!a && !!b && a.kind === b.kind && a.value === b.value; }

class MathTexParser {
  constructor(source, options = {}) {
    this.source = source;
    this.frames = [{tokens: options.tokens || mathTexTokens(source), at: 0}];
    this.scopes = options.scopes || [Object.create(null)];
    this.budget = options.budget || {nodes: 0, expansions: 0, expandedTokens: 0, depth: 0};
    this.fenceDepth = options.fenceDepth || 0;
    this.colors = options.colors || Object.create(null);
    this.eof = {kind: 'eof', value: '', offset: source.length};
  }
  error(code, message, token = this.rawPeek(), command) {
    throw new MathTexError(code, message, token.offset, command === undefined && token.kind === 'command' ? token.value : command || '');
  }
  node(type, fields = {}) {
    this.reserveParts(1);
    return {type, ...fields};
  }
  reserveParts(count, token = this.rawPeek()) {
    if (!Number.isSafeInteger(count) || count < 0 || this.budget.nodes + count > 50000)
      this.error('resource-limit', 'This formula has too many parts to render safely.', token);
    this.budget.nodes += count;
  }
  row(children) { return this.node('row', {children: children.filter(Boolean)}); }
  rawPeek(skipSpace = true) {
    while (this.frames.length) {
      const frame = this.frames[this.frames.length - 1];
      if (frame.at >= frame.tokens.length) { this.frames.pop(); continue; }
      const token = frame.tokens[frame.at];
      if (skipSpace && token.kind === 'space') { frame.at++; continue; }
      return token;
    }
    return this.eof;
  }
  rawTake(skipSpace = true) {
    const token = this.rawPeek(skipSpace);
    if (token.kind !== 'eof') this.frames[this.frames.length - 1].at++;
    return token;
  }
  macro(name) {
    for (let i = this.scopes.length - 1; i >= 0; i--)
      if (Object.hasOwn(this.scopes[i], name)) return this.scopes[i][name];
    return null;
  }
  peek(skipSpace = true) {
    for (;;) {
      const token = this.rawPeek(skipSpace);
      const macro = token.kind === 'command' && !token.builtin && this.macro(token.value);
      if (!macro) return token;
      this.rawTake(skipSpace);
      this.expand(macro, token);
    }
  }
  take(skipSpace = true) {
    const token = this.peek(skipSpace);
    return token.kind === 'eof' ? token : this.rawTake(skipSpace);
  }
  is(value) { return this.peek().value === value && this.peek().kind === 'char'; }
  commandIs(value) { const token = this.peek(); return token.kind === 'command' && token.value === value; }
  expect(value, kind = 'char') {
    const token = this.take();
    if (token.kind !== kind || token.value !== value) this.error('unexpected-token', 'Expected ' + (kind === 'command' ? '\\' : '') + value + '.', token);
    return token;
  }
  nested(fn) {
    if (++this.budget.depth > 192) this.error('resource-limit', 'This formula is nested too deeply to render safely.');
    this.scopes.push(Object.create(null));
    try { return fn(); }
    finally { this.scopes.pop(); this.budget.depth--; }
  }
  parse() {
    const result = this.parseRow(() => false);
    if (this.peek().kind !== 'eof') this.error('unexpected-token', 'Unexpected content after the formula.');
    return result;
  }
  parseRow(stop, allowFraction = true) {
    const children = [];
    for (;;) {
      const token = this.peek();
      if (token.kind === 'eof' || stop(token)) break;
      if (token.kind === 'command' && (MATH_TEX_DECLARATIONS[token.value] || token.value === 'color')) {
        this.take();
        const fields = token.value === 'color' ? {color: this.readColor()} : MATH_TEX_DECLARATIONS[token.value];
        children.push(this.node('style', {...fields, body: this.nested(() => this.parseRow(stop, allowFraction))}));
        break;
      }
      if (token.kind === 'command' && /^(over|atop|choose|brace|brack|above|overwithdelims|atopwithdelims|abovewithdelims)$/.test(token.value)) {
        if (!allowFraction) this.error('ambiguous-fraction', 'Put each infix fraction in its own group.', token);
        this.take();
        const name = token.value, fields = {num: this.row(children), den: null, bar: !/atop|choose|brace|brack/.test(name)};
        if (name.includes('withdelims')) { fields.left = this.readDelimiter(); fields.right = this.readDelimiter(); }
        else if (name === 'choose') { fields.left = '('; fields.right = ')'; }
        else if (name === 'brace') { fields.left = '{'; fields.right = '}'; }
        else if (name === 'brack') { fields.left = '['; fields.right = ']'; }
        if (name.startsWith('above')) { fields.barThickness = this.readDimension(); fields.bar = fields.barThickness !== 0; }
        fields.den = this.parseRow(stop, false);
        return this.row([this.node('frac', fields)]);
      }
      if (token.kind === 'char' && (token.value === '^' || token.value === '_' || token.value === "'")) {
        let base = children.pop() || this.row([]);
        children.push(this.readScripts(base));
        continue;
      }
      if (token.kind === 'command' && /^(limits|nolimits|displaylimits)$/.test(token.value)) {
        this.take();
        const base = children[children.length - 1];
        if (!base) this.error('missing-operator', '\\' + token.value + ' needs an operator.', token);
        base.limits = token.value === 'limits' ? 'always' : token.value === 'nolimits' ? 'never' : 'display';
        continue;
      }
      const atom = this.parseAtom();
      if (atom) children.push(this.readScripts(atom));
    }
    return this.row(children);
  }
  readScripts(base) {
    let result = base;
    for (;;) {
      const token = this.peek();
      if (token.kind === 'command' && /^(limits|nolimits|displaylimits)$/.test(token.value)) {
        this.take();
        result.limits = token.value === 'limits' ? 'always' : token.value === 'nolimits' ? 'never' : 'display';
        continue;
      }
      if (token.kind !== 'char' || !['_', '^', "'"].includes(token.value)) break;
      this.take();
      if (result.type !== 'scripts') result = this.node('scripts', {base: result, limits: result.limits});
      const key = token.value === '_' ? 'sub' : 'sup';
      if (token.value === "'") {
        const primes = [this.node('glyph', {value: '′', class: 'ord', variant: 'roman'})];
        while (this.is("'")) { this.take(); primes.push(this.node('glyph', {value: '′', class: 'ord', variant: 'roman'})); }
        if (this.is('^')) { this.take(); primes.push(this.argument()); }
        if (result.sup) this.error('duplicate-script', 'A base cannot have two superscripts.', token);
        result.sup = this.row(primes);
      } else {
        if (result[key]) this.error('duplicate-script', 'A base cannot have two ' + (key === 'sub' ? 'subscripts' : 'superscripts') + '.', token);
        result[key] = this.argument();
      }
    }
    return result;
  }
  argument() {
    if (++this.budget.depth > 192) this.error('resource-limit', 'This formula is nested too deeply to render safely.');
    try { return this.argumentValue(); }
    finally { this.budget.depth--; }
  }
  argumentValue() {
    const token = this.peek();
    if (token.kind === 'eof' || (token.kind === 'char' && ['}', '^', '_', '&'].includes(token.value)))
      this.error('missing-argument', 'A mathematical argument is missing.', token);
    if (this.is('{')) {
      this.take();
      return this.nested(() => {
        const body = this.parseRow(item => item.kind === 'char' && item.value === '}');
        this.expect('}');
        return body;
      });
    }
    const atom = this.parseAtom();
    if (!atom) this.error('missing-argument', 'An argument must contain a mathematical expression.', token);
    return atom;
  }
  rawArgument() {
    const first = this.rawTake();
    if (first.kind === 'eof') this.error('missing-argument', 'A command argument is missing.', first);
    if (first.kind !== 'char' || first.value !== '{') return [first];
    const result = [];
    let depth = 1;
    while (depth) {
      const token = this.rawTake(false);
      if (token.kind === 'eof') this.error('unclosed-group', 'A closing brace is missing.', first);
      if (token.kind === 'char' && token.value === '{') depth++;
      if (token.kind === 'char' && token.value === '}') depth--;
      if (depth > 192) this.error('resource-limit', 'This argument is nested too deeply.', token);
      if (depth) result.push(token);
    }
    return result;
  }
  optionalRaw() {
    if (this.rawPeek().kind !== 'char' || this.rawPeek().value !== '[') return null;
    const start = this.rawTake(), result = [];
    let braces = 0;
    for (;;) {
      const token = this.rawTake(false);
      if (token.kind === 'eof') this.error('unclosed-option', 'A closing bracket is missing.', start);
      if (token.kind === 'char') {
        if (token.value === ']' && !braces) break;
        if (token.value === '{') braces++;
        if (token.value === '}') braces--;
        if (braces < 0) this.error('unclosed-option', 'An option ended before its closing bracket.', token);
      }
      result.push(token);
    }
    return result;
  }
  subparse(tokens, text = false, variant = 'roman') {
    return this.nested(() => {
      const parser = new MathTexParser(this.source, {tokens, scopes: this.scopes, budget: this.budget, fenceDepth: this.fenceDepth, colors: this.colors});
      return text ? parser.parseText(variant) : parser.parse();
    });
  }
  plainArgument() {
    return mathTexTokenText(this.rawArgument()).trim();
  }
  literal(value, fields = {}) {
    return this.node('glyph', {value: value === '-' ? '−' : value === '*' ? '∗' : value, class: MATH_TEX_LITERAL_CLASSES[value] || 'ord', ...fields});
  }
  parseAtom() {
    const token = this.take();
    if (token.kind === 'eof') this.error('missing-argument', 'A mathematical expression is missing.', token);
    if (token.kind === 'command') return this.command(token);
    if (token.value === '{') {
      return this.nested(() => {
        const body = this.parseRow(item => item.kind === 'char' && item.value === '}');
        this.expect('}');
        return body;
      });
    }
    if (token.value === '}') this.error('unexpected-brace', 'A closing brace has no opening brace.', token);
    if (token.value === '&') this.error('unexpected-alignment', 'An alignment tab needs a matrix or aligned environment.', token);
    if (token.value === '#') this.error('unexpected-parameter', 'A macro parameter is outside a macro definition.', token);
    if (token.value === '$') this.error('unexpected-delimiter', 'A math delimiter is inside the formula.', token);
    if (token.value === '~') return this.node('space', {width: 1 / 3});
    if (/^[\u0000-\u001f\u007f]$/.test(token.value)) this.error('invalid-character', 'A control character cannot be typeset.', token);
    return this.literal(token.value, /[∑∏∫∮∬∭]/.test(token.value) ? {large: true, limits: /[∫∮∬∭]/.test(token.value) ? 'never' : 'display'} : {});
  }
  readDelimiter() {
    const token = this.take();
    if (token.kind === 'command') {
      if (token.value === '{' || token.value === '}') return token.value;
      if (token.value === '|') return '‖';
      const symbol = MATH_SYMBOLS[token.value];
      if (symbol && (['open', 'close'].includes(symbol.class) || /^(vert|Vert|backslash|slash|[uUdD].*arrow)$/.test(token.value))) return symbol.value;
    }
    if (token.kind === 'char' && '.()[]{}|/<>‖⌈⌉⌊⌋⟨⟩↑↓↕⇑⇓⇕'.includes(token.value))
      return token.value === '.' ? '' : token.value === '<' ? '⟨' : token.value === '>' ? '⟩' : token.value;
    this.error('invalid-delimiter', 'Expected a mathematical delimiter.', token);
  }
  command(token) {
    const name = token.value;
    if (Object.hasOwn(MATH_TEX_SPACES, name)) return this.node('space', {width: MATH_TEX_SPACES[name]});
    // amsmath: \iff, \implies and \impliedby are a long double arrow between thick spaces, one relation.
    if (Object.hasOwn(MATH_TEX_LONG_ARROWS, name)) return this.node('style', {class: 'rel', body: this.row([this.node('space', {width: 5 / 18}), this.node('glyph', MATH_SYMBOLS[MATH_TEX_LONG_ARROWS[name]]), this.node('space', {width: 5 / 18})])});
    // amsmath \dots: centred dots before a binary operator, a relation or an integral, low dots otherwise.
    if (name === 'dots') {
      const next = this.rawPeek(), after = next.kind === 'command' ? MATH_SYMBOLS[next.value] : null;
      const centred = next.kind === 'char' ? '+-=<>*:'.includes(next.value) : !!after && (['bin', 'rel'].includes(after.class) || /^(?:int|iint|iiint|oint)$/.test(next.value));
      if (centred) return this.node('glyph', MATH_SYMBOLS.cdots);
    }
    if (Object.hasOwn(MATH_SYMBOLS, name)) return this.node('glyph', MATH_SYMBOLS[name]);
    if (Object.hasOwn(MATH_TEX_VARIANTS, name)) return this.node('style', {variant: MATH_TEX_VARIANTS[name], body: this.argument()});
    if (Object.hasOwn(MATH_TEX_TEXT_VARIANTS, name)) return this.subparse(this.rawArgument(), true, MATH_TEX_TEXT_VARIANTS[name]);
    if (MATH_NAMED_OPERATORS.has(name) || MATH_LIMIT_OPERATORS.has(name)) {
      const values = {limsup: 'lim sup', liminf: 'lim inf', injlim: 'lim', projlim: 'lim', varlimsup: 'lim', varliminf: 'lim', varinjlim: 'lim', varprojlim: 'lim'};
      let body = this.node('text', {value: values[name] || name, class: 'op', limits: MATH_LIMIT_OPERATORS.has(name) ? 'display' : 'never', variant: 'roman'});
      if (['injlim', 'varinjlim', 'projlim', 'varprojlim'].includes(name)) body = this.node('accent', {base: body, value: /inj/.test(name) ? '→' : '←', position: 'under', stretch: true, class: 'op', limits: 'display'});
      if (name === 'varlimsup' || name === 'varliminf') body = this.node('accent', {base: body, value: '¯', position: name === 'varlimsup' ? 'over' : 'under', stretch: true, class: 'op', limits: 'display'});
      return body;
    }
    if (Object.hasOwn(MATH_TEX_ACCENTS, name)) {
      const [value, position, stretch] = MATH_TEX_ACCENTS[name];
      return this.node('accent', {base: this.argument(), value, position, stretch, ...(/brace$/.test(name) ? {limits: 'always'} : {})});
    }
    if (/^[{}%$&#_]$/.test(name)) return this.literal(name, {variant: 'roman'});
    if (name === '|') return this.literal('‖', {variant: 'roman'});
    if (name === 'frac' || name === 'dfrac' || name === 'tfrac' || name === 'cfrac') {
      const align = name === 'cfrac' ? this.optionalRaw() : null;
      if (align && !/^[lr]$/.test(mathTexTokenText(align).trim())) this.error('invalid-option', 'Continued-fraction alignment must be l or r.', token);
      return this.node('frac', {num: this.argument(), den: this.argument(), bar: true, ...(name === 'dfrac' || name === 'cfrac' ? {style: 'display'} : name === 'tfrac' ? {style: 'text'} : {}), ...(align ? {align: mathTexTokenText(align).trim()} : {})});
    }
    if (/^(binom|dbinom|tbinom)$/.test(name)) return this.node('frac', {num: this.argument(), den: this.argument(), bar: false, left: '(', right: ')', ...(name[0] === 'd' ? {style: 'display'} : name[0] === 't' ? {style: 'text'} : {})});
    if (name === 'genfrac') {
      const left = this.delimiterArgument(), right = this.delimiterArgument(), thickness = this.plainArgument(), style = this.plainArgument();
      if (!/^[0-3]?$/.test(style)) this.error('invalid-style', 'The fraction style must be 0, 1, 2 or 3.', token);
      const barThickness = thickness ? this.dimension(thickness, token) : undefined;
      return this.node('frac', {num: this.argument(), den: this.argument(), bar: barThickness !== 0, left, right, ...(barThickness === undefined ? {} : {barThickness}), ...(style ? {style: ['display', 'text', 'script', 'scriptscript'][Number(style)]} : {})});
    }
    if (name === 'sqrt') {
      const index = this.optionalRaw();
      return this.node('root', {body: this.argument(), ...(index ? {index: this.subparse(index)} : {})});
    }
    if (name === 'root') {
      const index = this.parseRow(item => item.kind === 'command' && item.value === 'of');
      this.expect('of', 'command');
      return this.node('root', {body: this.argument(), index});
    }
    if (name === 'left') {
      const left = this.readDelimiter();
      this.fenceDepth++;
      try {
        const body = this.nested(() => this.parseRow(item => item.kind === 'command' && item.value === 'right'));
        this.expect('right', 'command');
        return this.node('fence', {left, right: this.readDelimiter(), body});
      } finally { this.fenceDepth--; }
    }
    if (name === 'middle') {
      if (!this.fenceDepth) this.error('unexpected-delimiter', '\\middle needs an enclosing \\left and \\right.', token);
      const value = this.readDelimiter();
      return value ? this.literal(value, {class: 'rel', delimiter: true, variant: 'roman'}) : this.row([]);
    }
    if (/^(big|Big|bigg|Bigg)[lrm]?$/.test(name)) {
      const value = this.readDelimiter(), sizes = {big: 1.2, Big: 1.8, bigg: 2.4, Bigg: 3};
      const base = name.replace(/[lrm]$/, '');
      return this.literal(value, {delimiterSize: sizes[base], class: name.endsWith('l') ? 'open' : name.endsWith('r') ? 'close' : name.endsWith('m') ? 'rel' : 'ord', variant: 'roman'});
    }
    if (name === 'begin') return this.environment(this.plainArgument(), token);
    if (name === 'substack') return this.tableFromTokens(this.rawArgument(), 'substack');
    if (/^(matrix|pmatrix|bmatrix|Bmatrix|vmatrix|Vmatrix|cases|smallmatrix)$/.test(name)) return this.tableFromTokens(this.rawArgument(), name);
    if (name === 'operatorname') {
      const starred = this.is('*'); if (starred) this.take();
      const body = this.subparse(this.rawArgument(), true, 'roman');
      return this.node('style', {body, variant: 'roman', class: 'op', limits: starred ? 'display' : 'never'});
    }
    if (/^math(ord|op|bin|rel|open|close|punct|inner)$/.test(name)) return this.node('style', {body: this.argument(), class: name.slice(4), ...(name === 'mathop' ? {limits: 'display'} : {})});
    if (name === 'overset' || name === 'underset' || name === 'stackrel' || name === 'stackbin') {
      const decoration = this.argument(), base = this.argument();
      return this.node('overunder', {base, [name === 'underset' ? 'under' : 'over']: decoration, ...(name === 'stackrel' ? {class: 'rel'} : name === 'stackbin' ? {class: 'bin'} : {})});
    }
    if (name === 'overunderset') { const over = this.argument(), under = this.argument(); return this.node('overunder', {base: this.argument(), over, under}); }
    if (/^x(leftarrow|rightarrow|leftrightarrow|Leftarrow|Rightarrow|Leftrightarrow|mapsto|hookleftarrow|hookrightarrow|leftharpoonup|leftharpoondown|rightharpoonup|rightharpoondown|rightleftharpoons|leftrightharpoons|twoheadleftarrow|twoheadrightarrow|longequal)$/.test(name)) {
      const under = this.optionalRaw(), over = this.argument(), symbol = name === 'xlongequal' ? '=' : MATH_SYMBOLS[name.slice(1)].value;
      return this.node('overunder', {base: this.literal(symbol, {class: 'rel', stretch: true}), over, ...(under ? {under: this.subparse(under)} : {}), class: 'rel'});
    }
    if (name === 'not') {
      const base = this.argument(), negated = {'=': '≠', '<': '≮', '>': '≯', '≤': '≰', '≥': '≱', '∈': '∉', '∋': '∌', '⊂': '⊄', '⊃': '⊅', '⊆': '⊈', '⊇': '⊉', '∣': '∤', '∥': '∦', '∼': '≁', '≈': '≉', '≡': '≢', '→': '↛', '←': '↚', '↔': '↮', '⇒': '⇏', '⇐': '⇍', '⇔': '⇎'};
      if (base.type === 'glyph' && negated[base.value]) return this.literal(negated[base.value], {class: base.class, variant: 'roman'});
      return this.node('accent', {base, value: '̸', position: 'over', overlay: true, class: 'rel'});
    }
    if (name === 'phantom' || name === 'hphantom' || name === 'vphantom') return this.node('phantom', {body: this.argument(), mode: name[0] === 'h' ? 'h' : name[0] === 'v' ? 'v' : 'both'});
    if (name === 'smash') {
      const option = this.optionalRaw(), mode = option ? mathTexTokenText(option).trim() : '';
      if (option && mode !== 't' && mode !== 'b') this.error('invalid-option', 'A smash option must be t or b.', token);
      return this.node('smash', {body: this.argument(), ...(mode ? {mode} : {})});
    }
    if (name === 'mathstrut' || name === 'strut') return this.node('phantom', {body: this.literal('('), mode: 'v'});
    if (name === 'rlap' || name === 'llap' || name === 'clap' || name === 'mathrlap' || name === 'mathllap' || name === 'mathclap')
      return this.node('style', {body: this.argument(), width: 0, align: name.includes('rlap') ? 'left' : name.includes('llap') ? 'right' : 'center'});
    if (name === 'hspace' || name === 'mspace') {
      if (this.is('*')) this.take();
      return this.node('space', {width: this.dimension(this.plainArgument(), token)});
    }
    if (['kern', 'mkern', 'hskip', 'mskip'].includes(name)) return this.node('space', {width: this.readDimension()});
    if (name === 'rule') {
      const raise = this.optionalRaw(), width = this.dimension(this.plainArgument(), token), height = this.dimension(this.plainArgument(), token);
      const body = this.node('rule', {width, height, depth: 0});
      return raise ? this.node('raise', {body, amount: this.dimension(mathTexTokenText(raise), token)}) : body;
    }
    if (name === 'raisebox') {
      const amount = this.dimension(this.plainArgument(), token), height = this.optionalRaw(), depth = this.optionalRaw();
      return this.node('raise', {body: this.argument(), amount, ...(height ? {height: this.dimension(mathTexTokenText(height), token)} : {}), ...(depth ? {depth: this.dimension(mathTexTokenText(depth), token)} : {})});
    }
    if (name === 'raise' || name === 'lower') return this.node('raise', {amount: this.readDimension() * (name === 'lower' ? -1 : 1), body: this.argument()});
    if (name === 'textcolor') { const color = this.readColor(); return this.node('style', {body: this.argument(), color}); }
    if (name === 'colorbox' || name === 'fcolorbox') {
      const border = name === 'fcolorbox' ? this.readColor() : undefined, background = this.readColor();
      return this.node('style', {body: this.subparse(this.rawArgument(), true, 'roman'), background, ...(border ? {border} : {})});
    }
    if (name === 'definecolor') {
      const colorName = this.plainArgument(), model = this.plainArgument(), value = this.plainArgument();
      if (!/^[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(colorName)) this.error('invalid-color', 'Invalid colour name.', token);
      this.colors[colorName] = this.color(value, model, token); return null;
    }
    if (name === 'boxed' || name === 'fbox') return this.node('style', {body: name === 'fbox' ? this.subparse(this.rawArgument(), true, 'roman') : this.argument(), border: 'currentColor', padding: .25});
    if (name === 'cancel' || name === 'bcancel' || name === 'xcancel') return this.node('accent', {base: this.argument(), value: name === 'bcancel' ? '╲' : name === 'xcancel' ? '╳' : '╱', position: 'over', overlay: true, stretch: true});
    if (name === 'cancelto') { const over = this.argument(); return this.node('overunder', {base: this.node('accent', {base: this.argument(), value: '↗', position: 'over', overlay: true, stretch: true}), over}); }
    if (['newcommand', 'renewcommand', 'providecommand', 'def', 'gdef', 'DeclareMathOperator', 'let'].includes(name)) { this.define(name, token); return null; }
    if (name === 'require') {
      const value = this.plainArgument();
      if (!MATH_TEX_PACKAGES.has(value)) this.error('unsupported-package', 'Unsupported maths package: ' + value + '.', token, name);
      return null;
    }
    if (name === 'href') {
      const href = this.readLink(token);
      return this.node('link', {href, body: this.argument()});
    }
    if (name === 'url') {
      const href = this.readLink(token);
      return this.node('link', {href, body: this.node('text', {value: href, variant: 'monospace'})});
    }
    if (name === 'label') { this.plainArgument(); return null; }
    if (['notag', 'nonumber', 'relax', 'allowbreak', 'nobreak', 'protect', 'displaystylelimits'].includes(name)) return null;
    if (name === 'tag') {
      const starred = this.is('*'); if (starred) this.take();
      const body = this.subparse(this.rawArgument(), true);
      return this.row([this.node('space', {width: 2}), starred ? body : this.node('fence', {left: '(', right: ')', body})]);
    }
    if (name === 'mod' || name === 'bmod') return this.row([this.node('space', {width: name === 'bmod' ? 5 / 18 : 1}), this.node('text', {value: 'mod', variant: 'roman', class: name === 'bmod' ? 'bin' : 'op'}), this.node('space', {width: name === 'bmod' ? 5 / 18 : 1 / 3})]);
    if (name === 'pmod' || name === 'pod') return this.row([this.node('space', {width: 1}), this.node('fence', {left: '(', right: ')', body: this.row([...(name === 'pmod' ? [this.node('text', {value: 'mod', variant: 'roman'}), this.node('space', {width: 1 / 3})] : []), this.argument()])})]);
    if (name === 'bmod') return this.node('text', {value: 'mod', variant: 'roman', class: 'bin'});
    if (name === 'ce') return this.chemistry(this.rawArgument());
    if (name === 'pu') return this.units(this.rawArgument());
    if (this.physicsCommand(name)) return this.physics(name, token);
    if (name === 'mmlToken') return this.mathmlToken(token);
    if (name === 'unicode' || name === 'char') return this.character(name, token);
    if (name === 'TeX' || name === 'LaTeX') return this.node('text', {value: name, variant: 'roman'});
    if (name === 'textbackslash') return this.literal('\\', {variant: 'roman'});
    if (name === 'textasciitilde') return this.literal('~', {variant: 'roman'});
    if (name === 'textasciicircum') return this.literal('^', {variant: 'roman'});
    if (['end', 'right', '\\', 'cr', 'of'].includes(name)) this.error('unexpected-command', '\\' + name + ' has no matching opening command.', token);
    this.error('unsupported-command', 'Unsupported maths command: \\' + name + '.', token);
  }

  delimiterArgument() {
    const tokens = this.rawArgument().filter(token => token.kind !== 'space');
    if (!tokens.length) return '';
    const parser = new MathTexParser(this.source, {tokens, scopes: this.scopes, budget: this.budget});
    const delimiter = parser.readDelimiter();
    if (parser.peek().kind !== 'eof') this.error('invalid-delimiter', 'A fraction delimiter must be one symbol.', tokens[0]);
    return delimiter;
  }
  readLink(token) {
    const href = this.rawArgument().map(item => {
      if (item.kind !== 'command' || /^[#$%&_]$/.test(item.value)) return item.value;
      this.error('unsafe-link', 'A link address cannot contain TeX commands.', item);
    }).join('').trim();
    if (!/^https?:\/\/[^\s<>"'\\]+$/i.test(href) || /[\u0000-\u0020\u007f]/.test(href))
      this.error('unsafe-link', 'A maths link must use an HTTP or HTTPS address.', token);
    return href;
  }
  dimension(value, token = this.rawPeek()) {
    const match = /^\s*([+-]?(?:\d+(?:\.\d*)?|\.\d+))\s*(em|ex|mu|pt|px|pc|in|cm|mm|bp|dd|cc|sp)\s*$/.exec(value);
    if (!match) this.error('invalid-dimension', 'A length needs a number and a TeX unit.', token);
    const factors = {em: 1, ex: .45, mu: 1 / 18, pt: .1, px: .075, pc: 1.2, in: 7.227, cm: 7.227 / 2.54, mm: 7.227 / 25.4, bp: 7.227 / 72, dd: .107, cc: 1.284, sp: .1 / 65536};
    const result = Number(match[1]) * factors[match[2]];
    if (!Number.isFinite(result) || Math.abs(result) > 1000) this.error('resource-limit', 'This length is too large to render safely.', token);
    return result;
  }
  readDimension() {
    if (this.is('{')) return this.dimension(this.plainArgument());
    const start = this.peek(), tokens = [];
    while (this.peek().kind === 'char' && /^[+\-\d.]$/.test(this.peek().value)) tokens.push(this.take());
    while (this.peek().kind === 'char' && /^[A-Za-z]$/.test(this.peek().value) && tokens.filter(item => /[A-Za-z]/.test(item.value)).length < 2) tokens.push(this.take());
    const value = mathTexTokenText(tokens);
    return this.dimension(value, start);
  }
  readColor() {
    const model = this.optionalRaw();
    return this.color(this.plainArgument(), model ? mathTexTokenText(model).trim() : '', this.rawPeek());
  }
  color(value, model, token) {
    if (!model) {
      if (Object.hasOwn(this.colors, value)) return this.colors[value];
      if (/^#[a-fA-F0-9]{3,8}$/.test(value) && [4, 5, 7, 9].includes(value.length)) return value;
      if (/^[A-Za-z]{1,32}$/.test(value) && !/^(inherit|unset|initial|revert)$/i.test(value)) return value;
    } else if (model === 'HTML' && /^[a-fA-F0-9]{6}$/.test(value)) return '#' + value;
    else if (['rgb', 'RGB', 'gray', 'cmyk'].includes(model)) {
      const numbers = value.split(',').map(Number), count = model === 'gray' ? 1 : model === 'cmyk' ? 4 : 3, max = model === 'RGB' ? 255 : 1;
      if (numbers.length === count && numbers.every(number => Number.isFinite(number) && number >= 0 && number <= max)) {
        let rgb = model === 'gray' ? Array(3).fill(numbers[0]) : numbers;
        if (model === 'cmyk') rgb = numbers.slice(0, 3).map(number => 1 - Math.min(1, number + numbers[3]));
        return '#' + rgb.map(number => Math.round(number * (model === 'RGB' ? 1 : 255)).toString(16).padStart(2, '0')).join('');
      }
    }
    this.error('invalid-color', 'Unsupported or invalid colour value.', token, 'color');
  }

  environment(fullName, token) {
    const env = fullName.replace(/\*$/, '');
    if (!MATH_TEX_ENVIRONMENTS.has(env)) this.error('unsupported-environment', 'Unsupported maths environment: ' + fullName + '.', token, 'begin');
    return this.nested(() => {
      let options = {};
      const position = this.optionalRaw();
      if (position) {
        const value = mathTexTokenText(position).trim();
        if (!/^[tbc l r]$/.test(value)) this.error('invalid-option', 'Invalid matrix alignment.', token);
        if (['l', 'r', 'c'].includes(value)) options.columnAlign = value;
        else options.position = value;
      }
      if (env === 'array' || env === 'subarray') options = {...options, ...this.columnSpec(this.rawArgument(), token)};
      if (env === 'alignedat' || env === 'alignat') {
        const value = this.plainArgument();
        if (!/^\d+$/.test(value) || Number(value) < 1 || Number(value) > 256) this.error('invalid-alignment', 'An alignedat environment needs its number of column pairs.', token);
        options.pairs = Number(value);
      }
      const body = this.readTable(env, options, item => item.kind === 'command' && item.value === 'end');
      this.expect('end', 'command');
      const ending = this.plainArgument();
      if (ending !== fullName) this.error('mismatched-environment', 'Expected \\end{' + fullName + '}, received \\end{' + ending + '}.', token);
      return body;
    });
  }
  tableFromTokens(tokens, env) {
    return this.nested(() => {
      const parser = new MathTexParser(this.source, {tokens, scopes: this.scopes, budget: this.budget, colors: this.colors});
      const result = parser.readTable(env, {}, item => item.kind === 'eof');
      if (parser.peek().kind !== 'eof') parser.error('unexpected-token', 'Unexpected content after the matrix.');
      return result;
    });
  }
  columnSpec(tokens, token) {
    const parser = new MathTexParser(this.source, {tokens, scopes: this.scopes, budget: this.budget, colors: this.colors});
    const align = [], columnRules = [], columnInsertions = [];
    while (parser.peek().kind !== 'eof') {
      const item = parser.take();
      if (item.kind === 'char' && /^[lcr]$/.test(item.value)) { this.reserveParts(1, item); align.push(item.value); }
      else if (item.kind === 'char' && item.value === '|') { this.reserveParts(1, item); columnRules.push(align.length); }
      else if (item.kind === 'char' && (item.value === '@' || item.value === '!')) {
        this.reserveParts(1, item);
        columnInsertions.push({before: align.length, body: this.subparse(parser.rawArgument()), replaceGap: item.value === '@'});
      }
      else if (item.kind === 'char' && item.value === '*') {
        const count = parser.plainArgument();
        if (!/^\d+$/.test(count) || Number(count) > 256) this.error('invalid-alignment', 'Invalid array column repetition.', item);
        const repeated = this.nested(() => this.columnSpec(parser.rawArgument(), item));
        if (align.length + Number(count) * repeated.align.length > 256)
          this.error('resource-limit', 'This array has too many columns to render safely.', item);
        // Reserve the complete expansion before allocating any repeated metadata.
        this.reserveParts(Number(count) * (repeated.align.length + repeated.columnRules.length + repeated.columnInsertions.length), item);
        for (let i = 0; i < Number(count); i++) {
          const at = align.length;
          columnRules.push(...repeated.columnRules.map(index => at + index));
          columnInsertions.push(...repeated.columnInsertions.map(insertion => ({...insertion, before: at + insertion.before})));
          align.push(...repeated.align);
        }
      } else this.error('unsupported-alignment', 'Unsupported array column specification: ' + item.value + '.', item);
      if (align.length > 256) this.error('resource-limit', 'This array has too many columns to render safely.', token);
    }
    if (!align.length) this.error('invalid-alignment', 'An array needs a column specification.', token);
    return {align, columnRules, columnInsertions};
  }
  readTable(env, options, end) {
    const rows = [], rowGaps = [], rowRules = [];
    let cells = [], endedAfterBreak = false;
    const separator = item => (item.kind === 'char' && item.value === '&') || (item.kind === 'command' && ['\\', 'cr', 'crcr'].includes(item.value)) || end(item);
    for (;;) {
      if (this.peek().kind === 'eof' && !end(this.peek())) this.error('unclosed-environment', 'A closing \\end command is missing.');
      while (this.commandIs('hline') || this.commandIs('hdashline') || this.commandIs('cline')) {
        const line = this.take();
        if (line.value === 'cline') {
          const range = this.plainArgument(), match = /^(\d+)-(\d+)$/.exec(range);
          if (!match || Number(match[1]) < 1 || Number(match[2]) < Number(match[1])) this.error('invalid-rule', 'A partial rule needs a column range.', line);
          rowRules.push({before: rows.length, from: Number(match[1]) - 1, to: Number(match[2])});
        } else rowRules.push({before: rows.length, dashed: line.value === 'hdashline'});
      }
      if (end(this.peek())) {
        if (cells.length || (!rows.length && !endedAfterBreak)) { cells.push(this.row([])); rows.push(cells); }
        break;
      }
      cells.push(this.nested(() => this.parseRow(separator)));
      endedAfterBreak = false;
      const next = this.peek();
      if (next.kind === 'char' && next.value === '&') { this.take(); continue; }
      rows.push(cells); cells = [];
      if (end(next)) break;
      if (next.kind === 'command' && ['\\', 'cr', 'crcr'].includes(next.value)) {
        this.take();
        if (this.is('*')) this.take();
        const gap = this.optionalRaw();
        rowGaps[rows.length - 1] = gap ? this.dimension(mathTexTokenText(gap), next) : 0;
        endedAfterBreak = true;
      } else this.error('unexpected-alignment', 'Expected a row separator or the end of the environment.', next);
      if (rows.length > 2048 || cells.length > 256) this.error('resource-limit', 'This matrix is too large to render safely.', next);
    }
    const columns = rows.reduce((max, row) => Math.max(max, row.length), 0);
    if (columns > 256) this.error('resource-limit', 'This matrix has too many columns to render safely.');
    if (options.align && rows.some(row => row.length > options.align.length)) this.error('invalid-alignment', 'This row has more cells than the array declares.');
    if (options.pairs && rows.some(row => row.length > options.pairs * 2)) this.error('invalid-alignment', 'This row has more cells than alignedat declares.');
    let align = options.align;
    if (!align) align = Array.from({length: columns}, (_, index) => /^(align|aligned|alignat|alignedat|flalign|split)$/.test(env) ? (index % 2 ? 'l' : 'r') : /cases$/.test(env) ? 'l' : options.columnAlign || 'c');
    return this.node('table', {env, rows, ...options, align, rowGaps, rowRules});
  }

  define(name, token) {
    let starred = false;
    if (this.rawPeek().kind === 'char' && this.rawPeek().value === '*') { this.rawTake(); starred = true; }
    const nameTokens = this.rawArgument().filter(item => item.kind !== 'space');
    if (nameTokens.length !== 1 || nameTokens[0].kind !== 'command') this.error('invalid-macro', 'A macro name must be one command.', token);
    const macroName = nameTokens[0].value;
    if (name === 'DeclareMathOperator') {
      const body = this.rawArgument();
      const make = value => ({kind: 'command', value, offset: token.offset});
      const literal = value => ({kind: 'char', value, offset: token.offset});
      this.scopes[this.scopes.length - 1][macroName] = {params: [], prefix: [], body: [make('operatorname'), ...(starred ? [literal('*')] : []), literal('{'), ...body, literal('}')], optional: null};
      return;
    }
    if (name === 'let') {
      if (this.rawPeek().kind === 'char' && this.rawPeek().value === '=') this.rawTake();
      const target = this.rawTake();
      if (target.kind === 'eof') this.error('invalid-macro', '\\let needs a replacement token.', token);
      const existing = target.kind === 'command' && this.macro(target.value);
      this.scopes[this.scopes.length - 1][macroName] = existing || {params: [], prefix: [], body: [{...target, builtin: true}], optional: null};
      return;
    }
    let params = [], prefix = [], optional = null, body;
    if (name === 'def' || name === 'gdef') {
      const specification = [];
      while (!(this.rawPeek().kind === 'char' && this.rawPeek().value === '{')) {
        const item = this.rawTake(false);
        if (item.kind === 'eof') this.error('invalid-macro', 'A macro definition needs a replacement group.', token);
        specification.push(item);
      }
      let current = prefix;
      for (let i = 0; i < specification.length; i++) {
        const item = specification[i];
        if (item.kind === 'char' && item.value === '#') {
          const number = specification[++i];
          if (!number || number.kind !== 'char' || Number(number.value) !== params.length + 1 || !/^[1-9]$/.test(number.value)) this.error('invalid-macro', 'Macro parameters must be numbered consecutively from 1.', item);
          const parameter = {index: Number(number.value), delimiter: []};
          params.push(parameter); current = parameter.delimiter;
        } else current.push(item);
      }
      body = this.rawArgument();
    } else {
      const countTokens = this.optionalRaw();
      const count = countTokens ? mathTexTokenText(countTokens).trim() : '0';
      if (!/^[0-9]$/.test(count)) this.error('invalid-macro', 'A macro accepts zero to nine arguments.', token);
      params = Array.from({length: Number(count)}, (_, index) => ({index: index + 1, delimiter: []}));
      optional = this.optionalRaw();
      if (optional && !params.length) this.error('invalid-macro', 'An optional argument needs a parameter.', token);
      body = this.rawArgument();
    }
    for (let i = 0; i < body.length; i++) if (body[i].kind === 'char' && body[i].value === '#') {
      const next = body[++i];
      if (!next || next.kind !== 'char' || !(next.value === '#' || (/^[1-9]$/.test(next.value) && Number(next.value) <= params.length)))
        this.error('invalid-macro', 'A replacement refers to a missing macro parameter.', body[i - 1]);
    }
    const existing = this.macro(macroName) || MATH_SYMBOLS[macroName] || MATH_TEX_VARIANTS[macroName] || MATH_NAMED_OPERATORS.has(macroName) || MATH_LIMIT_OPERATORS.has(macroName);
    if (name === 'providecommand' && existing) return;
    if (name === 'newcommand' && existing) this.error('duplicate-macro', '\\' + macroName + ' is already defined.', token);
    this.scopes[name === 'gdef' ? 0 : this.scopes.length - 1][macroName] = {params, prefix, body, optional};
  }
  expand(macro, token) {
    if (++this.budget.expansions > 4096) this.error('resource-limit', 'Macro expansion did not finish within the rendering limit.', token);
    for (const prefix of macro.prefix) {
      const actual = this.rawTake(prefix.kind !== 'space');
      if (!mathTexTokenEqual(actual, prefix)) this.error('invalid-macro-argument', 'A macro argument does not match its definition.', actual, token.value);
    }
    const args = [];
    for (const param of macro.params) {
      if (param.index === 1 && macro.optional) args[param.index] = this.optionalRaw() || macro.optional;
      else if (!param.delimiter.length) args[param.index] = this.rawArgument();
      else {
        const value = [];
        let depth = 0;
        for (;;) {
          const item = this.rawTake(false);
          if (item.kind === 'eof') this.error('invalid-macro-argument', 'A delimited macro argument is incomplete.', token);
          value.push(item);
          if (item.kind === 'char' && item.value === '{') depth++;
          if (item.kind === 'char' && item.value === '}') depth--;
          if (depth < 0) this.error('invalid-macro-argument', 'A macro argument escaped its group.', item);
          if (depth === 0 && value.length >= param.delimiter.length && param.delimiter.every((expected, index) => mathTexTokenEqual(value[value.length - param.delimiter.length + index], expected))) {
            value.length -= param.delimiter.length;
            break;
          }
        }
        if (value[0]?.value === '{' && value[value.length - 1]?.value === '}') {
          let depth = 0, whole = true;
          for (let i = 0; i < value.length - 1; i++) {
            if (value[i].kind === 'char' && value[i].value === '{') depth++;
            if (value[i].kind === 'char' && value[i].value === '}') depth--;
            if (!depth) whole = false;
          }
          args[param.index] = whole ? value.slice(1, -1) : value;
        } else args[param.index] = value;
      }
    }
    const replacement = [];
    for (let i = 0; i < macro.body.length; i++) {
      const item = macro.body[i];
      if (item.kind === 'char' && item.value === '#') {
        const next = macro.body[++i];
        if (next.value === '#') replacement.push(next);
        else for (const replacementToken of args[Number(next.value)]) {
          replacement.push(replacementToken);
          if (replacement.length > 100000) this.error('resource-limit', 'A macro expands to too much content.', token);
        }
      } else replacement.push(item);
      if (replacement.length > 100000) this.error('resource-limit', 'A macro expands to too much content.', token);
    }
    this.budget.expandedTokens += replacement.length;
    if (this.budget.expandedTokens > 100000) this.error('resource-limit', 'Macro expansion produced too much content to render safely.', token);
    this.frames.push({tokens: replacement, at: 0});
  }

  parseText(variant = 'roman') {
    const children = [];
    let value = '';
    const flush = () => { if (value) children.push(this.node('text', {value, variant})); value = ''; };
    for (;;) {
      const token = this.take(false);
      if (token.kind === 'eof') break;
      if (token.kind === 'space') { value += ' '; continue; }
      if (token.kind === 'char') {
        if (token.value === '{') {
          flush();
          this.frames.push({tokens: [token], at: 0});
          children.push(this.subparse(this.rawArgument(), true, variant));
        } else if (token.value === '$') {
          flush();
          children.push(this.nested(() => this.parseRow(item => item.kind === 'char' && item.value === '$')));
          this.expect('$');
        } else if (token.value === '}') this.error('unexpected-brace', 'A closing brace has no opening brace.', token);
        else if (token.value === '#' || token.value === '&' || token.value === '_') this.error('invalid-text', 'Escape ' + token.value + ' inside text.', token);
        else value += token.value === '~' ? '\u00a0' : token.value;
        continue;
      }
      const name = token.value;
      if (/^[{}%$&#_ ]$/.test(name)) { value += name; continue; }
      if (name === '-') continue;
      if (name === 'TeX' || name === 'LaTeX') { value += name; continue; }
      if (name === 'textbackslash') { value += '\\'; continue; }
      if (name === 'textasciitilde') { value += '~'; continue; }
      if (name === 'textasciicircum') { value += '^'; continue; }
      if (name === '(' || name === '[') {
        flush();
        const end = name === '(' ? ')' : ']';
        children.push(this.nested(() => this.parseRow(item => item.kind === 'command' && item.value === end)));
        this.expect(end, 'command');
        continue;
      }
      if (Object.hasOwn(MATH_TEX_TEXT_VARIANTS, name)) {
        flush(); children.push(this.subparse(this.rawArgument(), true, MATH_TEX_TEXT_VARIANTS[name])); continue;
      }
      if (name === 'color' || name === 'textcolor') {
        flush();
        const color = this.readColor();
        children.push(this.node('style', {color, body: name === 'color' ? this.nested(() => this.parseText(variant)) : this.subparse(this.rawArgument(), true, variant)}));
        if (name === 'color') break;
        continue;
      }
      if (name === 'href') {
        flush();
        const href = this.readLink(token);
        children.push(this.node('link', {href, body: this.subparse(this.rawArgument(), true, variant)}));
        continue;
      }
      if (name === 'fbox' || name === 'colorbox' || name === 'fcolorbox') {
        flush();
        const border = name === 'fbox' ? 'currentColor' : name === 'fcolorbox' ? this.readColor() : undefined;
        const background = name === 'fbox' ? undefined : this.readColor();
        children.push(this.node('style', {body: this.subparse(this.rawArgument(), true, variant), ...(border ? {border} : {}), ...(background ? {background} : {}), padding: .25}));
        continue;
      }
      if (name === 'underline') {
        flush();
        children.push(this.node('accent', {base: this.subparse(this.rawArgument(), true, variant), value: '_', position: 'under', stretch: true}));
        continue;
      }
      if (Object.hasOwn(MATH_TEX_DECLARATIONS, name)) {
        flush(); children.push(this.node('style', {...MATH_TEX_DECLARATIONS[name], body: this.nested(() => this.parseText(MATH_TEX_DECLARATIONS[name].variant || variant))})); break;
      }
      if (/^['`"^~=.]$/.test(name) || ['c', 'v', 'u', 'H', 'r', 'k', 'b', 'd'].includes(name)) {
        const marks = {"'": '\u0301', '`': '\u0300', '"': '\u0308', '^': '\u0302', '~': '\u0303', '=': '\u0304', '.': '\u0307', c: '\u0327', v: '\u030c', u: '\u0306', H: '\u030b', r: '\u030a', k: '\u0328', b: '\u0331', d: '\u0323'};
        const raw = this.rawArgument();
        const letters = mathTexTokenText(raw).trim();
        if ([...letters].length !== 1) this.error('invalid-accent', 'A text accent needs one character.', token);
        value += (letters + marks[name]).normalize('NFC'); continue;
      }
      if (MATH_SYMBOLS[name] && !MATH_SYMBOLS[name].large) { value += MATH_SYMBOLS[name].value; continue; }
      flush();
      const body = this.command(token);
      if (body) children.push(body);
    }
    flush();
    return this.row(children);
  }

  physicsCommand(name) {
    return /^(dv|derivative|pdv|pderivative|fdv|functionalderivative|dd|differential|qty|quantity|pqty|bqty|Bqty|vqty|abs|absolutevalue|norm|bra|ket|braket|innerproduct|ketbra|dyad|outerproduct|expval|expectationvalue|comm|commutator|acomm|anticommutator|vb|va|vu|vectorbold|vectorarrow|vectorunit|grad|gradient|divergence|curl|laplacian|eval|evaluated|order|Tr|tr|trace|rank|diag|mqty|pmqty|bmqty|vmqty|smqty)$/.test(name);
  }
  physics(name, token) {
    const starred = this.is('*'); if (starred) this.take();
    if (/^(dv|derivative|pdv|pderivative|fdv|functionalderivative)$/.test(name)) {
      const orderTokens = this.optionalRaw(), first = this.argument(), second = this.is('{') ? this.argument() : null;
      const variables = [second || first];
      if (/^(pdv|pderivative)$/.test(name)) while (this.is('{') && variables.length < 9) variables.push(this.argument());
      const d = () => this.literal(/^(pdv|pderivative)$/.test(name) ? '∂' : /^(fdv|functionalderivative)$/.test(name) ? 'δ' : 'd', {variant: 'roman'});
      const order = orderTokens ? this.subparse(orderTokens) : variables.length > 1 ? this.literal(String(variables.length), {variant: 'roman'}) : null;
      const numerator = this.row([order ? this.node('scripts', {base: d(), sup: order}) : d(), ...(second ? [first] : [])]);
      const denominator = this.row(variables.flatMap((variable, index) => [d(), order && variables.length === 1 ? this.node('scripts', {base: variable, sup: order}) : variable, ...(index < variables.length - 1 ? [this.node('space', {width: .1})] : [])]));
      return this.node('frac', {num: numerator, den: denominator, bar: true, ...(starred ? {style: 'text'} : {})});
    }
    if (name === 'dd' || name === 'differential') {
      const order = this.optionalRaw(), base = this.literal('d', {variant: 'roman'});
      return this.row([this.node('space', {width: 3 / 18}), order ? this.node('scripts', {base, sup: this.subparse(order)}) : base, ...(this.is('{') ? [this.argument()] : [])]);
    }
    if (/^(vb|va|vu|vectorbold|vectorarrow|vectorunit)$/.test(name)) {
      const body = this.node('style', {body: this.argument(), variant: starred ? 'bold-italic' : 'bold'});
      return /^(va|vu|vectorarrow|vectorunit)$/.test(name) ? this.node('accent', {base: body, value: /^(vu|vectorunit)$/.test(name) ? '̂' : '⃗', position: 'over'}) : body;
    }
    if (/^(grad|gradient|divergence|curl|laplacian)$/.test(name)) {
      let base = this.literal('∇', {variant: 'roman'});
      if (name === 'laplacian') base = this.node('scripts', {base, sup: this.literal('2', {variant: 'roman'})});
      return this.row([base, ...(/^(divergence|curl)$/.test(name) ? [this.literal(name === 'curl' ? '×' : '⋅', {class: 'bin', variant: 'roman'})] : []), ...(this.is('{') ? [this.argument()] : [])]);
    }
    if (['Tr', 'tr', 'trace', 'rank', 'diag'].includes(name)) return this.node('text', {value: name === 'trace' ? 'tr' : name, variant: 'roman', class: 'op', limits: 'never'});
    if (name === 'eval' || name === 'evaluated') return this.node('fence', {left: '', right: '|', body: this.argument()});
    if (name === 'order') return this.row([this.literal('O'), this.node('fence', {left: '(', right: ')', body: this.argument()})]);
    if (/^(mqty|pmqty|bmqty|vmqty|smqty)$/.test(name)) {
      const env = name === 'bmqty' ? 'bmatrix' : name === 'vmqty' ? 'vmatrix' : name === 'smqty' ? 'smallmatrix' : name === 'pmqty' ? 'pmatrix' : 'matrix';
      return this.tableFromTokens(this.rawArgument(), env);
    }
    if (name === 'qty' || name === 'quantity') {
      if (this.is('{')) return this.node('fence', {left: '(', right: ')', body: this.argument()});
      const left = this.readDelimiter(), right = {'(': ')', '[': ']', '{': '}', '|': '|', '‖': '‖', '⟨': '⟩'}[left];
      if (!right) this.error('invalid-delimiter', 'A quantity needs paired delimiters.', token);
      const body = this.nested(() => this.parseRow(item => item.kind === 'char' && item.value === right));
      this.expect(right);
      return this.node('fence', {left, right, body});
    }
    const first = this.argument();
    if (/^(bra|ket|pqty|bqty|Bqty|vqty|abs|absolutevalue|norm)$/.test(name)) {
      const ends = {bra: ['⟨', '|'], ket: ['|', '⟩'], pqty: ['(', ')'], bqty: ['[', ']'], Bqty: ['{', '}'], vqty: ['|', '|'], abs: ['|', '|'], absolutevalue: ['|', '|'], norm: ['‖', '‖']}[name];
      return this.node('fence', {left: ends[0], right: ends[1], body: first});
    }
    if (/^(comm|commutator|acomm|anticommutator)$/.test(name)) return this.node('fence', {left: /^(acomm|anticommutator)$/.test(name) ? '{' : '[', right: /^(acomm|anticommutator)$/.test(name) ? '}' : ']', body: this.row([first, this.literal(',', {class: 'punct'}), this.argument()])});
    const second = this.is('{') ? this.argument() : null;
    if (/^(ketbra|dyad|outerproduct)$/.test(name)) return this.row([this.node('fence', {left: '|', right: '⟩', body: first}), this.node('fence', {left: '⟨', right: '|', body: second || first})]);
    if (/^(expval|expectationvalue)$/.test(name)) return this.node('fence', {left: '⟨', right: '⟩', body: second ? this.row([second, this.literal('|', {delimiter: true}), first, this.literal('|', {delimiter: true}), second]) : first});
    return this.node('fence', {left: '⟨', right: '⟩', body: second ? this.row([first, this.literal('|', {delimiter: true}), second]) : first});
  }

  chemistry(tokens) {
    return this.nested(() => {
      const parser = new MathTexParser(this.source, {tokens, scopes: this.scopes, budget: this.budget, colors: this.colors});
      return this.node('style', {variant: 'roman', body: parser.chemicalRow(() => false)});
    });
  }
  chemicalRow(stop) {
    const children = [];
    let spaced = true, subAllowed = false, moleculeParts = 0;
    const script = (key, body) => {
      let base = children.pop() || this.row([]);
      if (base.type !== 'scripts') base = this.node('scripts', {base});
      if (base[key]) base[key] = this.row([base[key], body]); else base[key] = body;
      children.push(base);
    };
    const consumeRun = predicate => {
      let value = '';
      while (this.rawPeek(false).kind === 'char' && predicate(this.rawPeek(false).value)) value += this.rawTake(false).value;
      return value;
    };
    for (;;) {
      const next = this.peek(false);
      if (next.kind === 'eof' || stop(next)) break;
      const token = this.take(false);
      if (token.kind === 'space') { spaced = true; subAllowed = false; moleculeParts = 0; children.push(this.node('space', {width: 3 / 18})); continue; }
      if (token.kind === 'command') {
        if (token.value === 'bond') {
          const value = this.plainArgument(), bonds = {'-': '−', '=': '=', '#': '≡', '~': '∼', '->': '→', '<-': '←', '...': '⋯'};
          if (!bonds[value]) this.error('unsupported-bond', 'Unsupported chemical bond: ' + value + '.', token);
          children.push(this.literal(bonds[value], {class: 'ord', variant: 'roman'}));
        } else {
          const body = this.command(token);
          if (body) children.push(this.readScripts(body));
        }
        spaced = false; subAllowed = true; continue;
      }
      if (token.value === '$') {
        children.push(this.nested(() => this.parseRow(item => item.kind === 'char' && item.value === '$')));
        this.expect('$'); spaced = false; subAllowed = false; continue;
      }
      if (token.value === '(' || token.value === '[') {
        const end = token.value === '(' ? ')' : ']';
        const body = this.nested(() => this.chemicalRow(item => item.kind === 'char' && item.value === end));
        this.expect(end);
        children.push(this.node('fence', {left: token.value, right: end, body}));
        spaced = false; subAllowed = true; moleculeParts++; continue;
      }
      if (token.value === '{') {
        const body = this.nested(() => this.chemicalRow(item => item.kind === 'char' && item.value === '}'));
        this.expect('}'); children.push(body); spaced = false; subAllowed = true; continue;
      }
      if (token.value === '}' || token.value === ')' || token.value === ']') this.error('unexpected-delimiter', 'A chemical group has an unmatched delimiter.', token);
      if (token.value === '^' || token.value === '_') {
        const key = token.value === '^' ? 'sup' : 'sub';
        if (token.value === '^' && (this.rawPeek(false).kind === 'space' || this.rawPeek(false).kind === 'eof')) {
          children.push(this.literal('↑', {class: 'ord', variant: 'roman'})); spaced = false; subAllowed = false; continue;
        }
        let body;
        if (this.is('{')) body = this.subparse(this.rawArgument());
        else {
          const value = consumeRun(character => /^[0-9+\-−IVX]$/.test(character));
          body = value ? this.node('text', {value: value.replace(/-/g, '−'), variant: 'roman'}) : this.argument();
        }
        script(key, body); spaced = false; continue;
      }
      if (/^[0-9]$/.test(token.value)) {
        const number = token.value + consumeRun(character => /^[0-9.]$/.test(character));
        if (subAllowed && !spaced) {
          if (moleculeParts === 1 && ['+', '-'].includes(this.rawPeek(false).value)) {
            const sign = this.rawTake(false).value;
            script('sup', this.node('text', {value: number + (sign === '-' ? '−' : '+'), variant: 'roman'}));
          } else script('sub', this.node('text', {value: number, variant: 'roman'}));
        } else children.push(this.node('text', {value: number, variant: 'roman'}));
        spaced = false; continue;
      }
      if (token.value === '<' || token.value === '-' || token.value === '=') {
        let arrow = token.value;
        while (this.rawPeek(false).kind === 'char' && /^[<=>-]$/.test(this.rawPeek(false).value) && arrow.length < 5) arrow += this.rawTake(false).value;
        const arrows = {'->': '→', '<-': '←', '<->': '↔', '<=>': '⇌', '=>': '⇒', '<=': '⇐', '<<=>': '⇋', '<=>>': '⇌'};
        if (arrows[arrow]) {
          const over = this.optionalRaw(), under = this.optionalRaw();
          const base = this.literal(arrows[arrow], {class: 'rel', variant: 'roman', stretch: true});
          children.push(over || under ? this.node('overunder', {base, ...(over ? {over: this.chemistry(over)} : {}), ...(under ? {under: this.chemistry(under)} : {}), class: 'rel'}) : base);
          spaced = true; subAllowed = false; moleculeParts = 0; continue;
        }
        if (arrow.length !== 1) this.error('unsupported-reaction', 'Unsupported chemical reaction arrow: ' + arrow + '.', token);
        if (arrow === '-' && !spaced && subAllowed && (this.rawPeek(false).kind === 'space' || this.rawPeek(false).kind === 'eof' || /^[)\]}]$/.test(this.rawPeek(false).value))) script('sup', this.literal('−', {variant: 'roman'}));
        else children.push(this.literal(arrow, {class: spaced ? 'bin' : 'ord', variant: 'roman'}));
        spaced = false; continue;
      }
      if (token.value === '+') {
        if (!spaced && subAllowed && (this.rawPeek(false).kind === 'space' || this.rawPeek(false).kind === 'eof' || /^[)\]}]$/.test(this.rawPeek(false).value))) script('sup', this.literal('+', {variant: 'roman'}));
        else { children.push(this.literal('+', {class: 'bin', variant: 'roman'})); moleculeParts = 0; }
        spaced = false; subAllowed = false; continue;
      }
      if (/^[A-Za-z]$/.test(token.value)) {
        const word = token.value + consumeRun(character => /^[a-z]$/.test(character));
        children.push(this.node('text', {value: word === 'v' && spaced ? '↓' : word, variant: 'roman'}));
        moleculeParts++; spaced = false; subAllowed = true; continue;
      }
      if (token.value === '#') children.push(this.literal('≡', {class: 'ord', variant: 'roman'}));
      else if (token.value === '.' || token.value === '·') children.push(this.literal('·', {class: 'ord', variant: 'roman'}));
      else if (token.value === '~') children.push(this.node('space', {width: 1 / 3}));
      else children.push(this.literal(token.value, {variant: 'roman'}));
      spaced = false;
    }
    return this.row(children);
  }
  units(tokens) {
    let value = mathTexTokenText(tokens);
    value = value.replace(/(\d(?:[\d.]*\d)?)[eE]([+-]?\d+)/g, '$1\\times 10^{$2}');
    value = value.replace(/([A-Za-zµΩ°]+)([-+]\d+)/g, '$1^{$2}');
    value = value.replace(/\s+/g, '\\,');
    const parser = new MathTexParser(this.source, {tokens: mathTexTokens(value, tokens[0]?.offset || 0), scopes: this.scopes, budget: this.budget, colors: this.colors});
    return this.node('style', {variant: 'roman', body: parser.parse()});
  }

  mathmlToken(token) {
    const kind = this.plainArgument(), attributes = this.optionalRaw(), text = this.plainArgument();
    if (!['mi', 'mn', 'mo', 'mtext'].includes(kind)) this.error('unsupported-token', 'Unsupported mathematical token kind: ' + kind + '.', token);
    let variant = kind === 'mi' ? 'normal' : 'roman';
    if (attributes) {
      const value = mathTexTokenText(attributes).trim(), match = /^mathvariant\s*=\s*["']([a-z-]+)["']$/.exec(value);
      const variants = new Set(['normal', 'bold', 'italic', 'bold-italic', 'double-struck', 'script', 'bold-script', 'fraktur', 'bold-fraktur', 'sans-serif', 'bold-sans-serif', 'sans-serif-italic', 'sans-serif-bold-italic', 'sans-serif-bold', 'monospace']);
      if (!match || !variants.has(match[1])) this.error('unsupported-attribute', 'Only a mathematical font variant is supported on a token.', token);
      variant = match[1] === 'normal' ? 'roman' : match[1] === 'bold-sans-serif' ? 'sans-serif-bold' : match[1];
    }
    return this.node('style', {variant, body: kind === 'mtext' ? this.node('text', {value: text, variant}) : this.row([...text].map(value => this.literal(value, {variant})))});
  }
  character(name, token) {
    let raw;
    if (name === 'unicode') {
      const metrics = this.optionalRaw(), font = this.optionalRaw();
      if (metrics || font) this.error('unsupported-character-option', 'Unicode characters use the embedded maths font.', token);
      raw = this.plainArgument();
    } else if (this.is('{')) raw = this.plainArgument();
    else {
      let prefix = '';
      if (this.is('"') || this.is("'")) prefix = this.take().value;
      raw = prefix;
      while (this.peek().kind === 'char' && (prefix === '"' ? /^[0-9a-fA-F]$/ : prefix === "'" ? /^[0-7]$/ : /^[0-9]$/).test(this.peek().value)) raw += this.take().value;
    }
    if (!/^(?:(?:x|0x|U\+|\")[0-9a-f]+|'[0-7]+|[0-9]+)$/i.test(raw)) this.error('invalid-character', 'Invalid Unicode character number.', token);
    const value = /^(?:x|0x|U\+|\")/i.test(raw) ? parseInt(raw.replace(/^(?:0x|U\+|x|\")/i, ''), 16) : raw.startsWith("'") ? parseInt(raw.slice(1), 8) : Number(raw);
    if (!Number.isInteger(value) || value < 32 || value > 0x10ffff || (value >= 0xd800 && value <= 0xdfff)) this.error('invalid-character', 'Invalid Unicode character number.', token);
    return this.literal(String.fromCodePoint(value));
  }
}

function parseMathTex(source) {
  if (typeof source !== 'string') throw new MathTexError('invalid-source', 'The mathematical source must be text.');
  if (source.length > 1000000) throw new MathTexError('resource-limit', 'This formula is too long to render safely.');
  return new MathTexParser(source).parse();
}
