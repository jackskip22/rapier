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
  let count = 0;
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
        if (command === 'verb') {
          // Verbatim changes TeX's character categories before its body is read.
          while (source[i] === ' ' || source[i] === '\t') i++;
          const starred = source[i] === '*';
          if (starred) i++;
          while (source[i] === ' ' || source[i] === '\t') i++;
          const delimiter = i < source.length ? String.fromCodePoint(source.codePointAt(i)) : '';
          if (!delimiter || /[\r\n]/.test(delimiter))
            throw new MathTexError('unclosed-verb', 'A verbatim span needs a delimiter on the same line.', offset + start, 'verb');
          i += delimiter.length;
          const end = source.indexOf(delimiter, i), newline = source.slice(i, end < 0 ? undefined : end).search(/[\r\n]/);
          if (end < 0 || newline >= 0)
            throw new MathTexError('unclosed-verb', 'A verbatim span must close on the same line.', offset + start, 'verb');
          if (count + end - i + 1 > 100000)
            throw new MathTexError('resource-limit', 'This formula has too many tokens to render safely.', offset + start, 'verb');
          tokens.push({kind: 'verbatim', value: source.slice(i, end), starred, delimiter, offset: offset + start});
          i = end + delimiter.length;
        } else {
          tokens.push({kind: 'command', value: command, offset: offset + start});
          while (i < source.length && /\s/.test(source[i])) i++;
        }
      } else {
        command = String.fromCodePoint(source.codePointAt(i));
        i += command.length;
        tokens.push({kind: 'command', value: /\s/.test(command) ? ' ' : command, offset: offset + start});
      }
    } else if (/\s/.test(value)) {
      while (i < source.length && /\s/.test(source[i])) i++;
      tokens.push({kind: 'space', value: ' ', offset: offset + start});
    } else tokens.push({kind: 'char', value, offset: offset + start});
    count += tokens.at(-1).kind === 'verbatim' ? 1 + tokens.at(-1).value.length : 1;
    if (count > 100000)
      throw new MathTexError('resource-limit', 'This formula has too many tokens to render safely.', offset + start);
  }
  return tokens;
}

const MATH_TEX_VARIANTS = Object.freeze({
  mathrm: 'roman', mathnormal: 'normal', mathit: 'italic', mathbf: 'bold', boldsymbol: 'bold-italic', bm: 'bold-italic', pmb: 'bold-italic',
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
// LaTeX's text commands set series, shape and family independently: \textit inside \textbf is bold italic.
function mathTextVariant(outer, name) {
  let family = /sans-serif/.test(outer) ? 'sans-serif' : outer === 'monospace' ? 'monospace' : 'roman', bold = /bold/.test(outer), italic = /italic/.test(outer);
  if (name === 'textnormal') { family = 'roman'; bold = italic = false; }
  else if (name === 'textbf') bold = true;
  else if (name === 'textit' || name === 'textsl') italic = true;
  else if (name === 'emph') italic = !italic;
  else if (name === 'textup') italic = false;
  else if (name === 'textrm') family = 'roman';
  else if (name === 'textsf') family = 'sans-serif';
  else if (name === 'texttt') family = 'monospace';
  if (family === 'monospace') return 'monospace';
  const style = (bold ? '-bold' : '') + (italic ? '-italic' : '');
  return family === 'sans-serif' ? 'sans-serif' + style : style ? style.slice(1) : 'roman';
}
const MATH_TEX_TEXT_LETTERS = Object.freeze({ss: 'ß', ae: 'æ', AE: 'Æ', oe: 'œ', OE: 'Œ', o: 'ø', O: 'Ø', aa: 'å', AA: 'Å', l: 'ł', L: 'Ł', i: 'ı', j: 'ȷ'});
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
const MATH_TEX_LONG_ARROWS = {iff: 'Longleftrightarrow', implies: 'Longrightarrow', impliedby: 'Longleftarrow', And: 'And'};
// These unicode-math aliases do not expose a binary/relation mathchar to amsmath's raw-token lookahead.
const MATH_TEX_DOTS_LOW = new Set('circ bullet diamond lor land smallsetminus bigcirc dag ddag bigtriangledown le ge neq owns Join blacktriangleleft blacktriangleright therefore because coloneqq eqqcolon dblcolon gets to'.split(' '));
// mathtools: a colon or double colon joined to a relation, 1.2 mu apart.
const MATH_TEX_COLONS = {coloneq: '∶−', Coloneq: '∷−', Coloneqq: '∷=', Eqqcolon: '=∷', eqcolon: '−∶', Eqcolon: '−∷', colonapprox: '∶≈', Colonapprox: '∷≈', colonsim: '∶∼', Colonsim: '∷∼'};
// dvipsnames in CMYK percent (LaTeX graphics bundle), converted as xcolor does: each RGB channel is 1 − min(1, CMY + K).
// xcolor's base colors in RGB, for mixing.
const MATH_TEX_XCOLOR_BASE = Object.freeze(Object.fromEntries(Object.entries({red: [1, 0, 0], green: [0, 1, 0], blue: [0, 0, 1], cyan: [0, 1, 1], magenta: [1, 0, 1],
  yellow: [1, 1, 0], black: [0, 0, 0], white: [1, 1, 1], gray: [.5, .5, .5], darkgray: [.25, .25, .25], lightgray: [.75, .75, .75], brown: [.75, .5, .25],
  lime: [.75, 1, 0], olive: [.5, .5, 0], orange: [1, .5, 0], pink: [1, .75, .75], purple: [.75, 0, .25], teal: [0, .5, .5], violet: [.5, 0, .5]})
  .map(([name, rgb]) => [name, '#' + rgb.map(c => Math.round(c * 255).toString(16).padStart(2, '0')).join('')])));
const MATH_TEX_DVIPSNAMES = Object.create(null), MATH_TEX_DVIPS_CMYK = Object.create(null);
for (const [, name, ...cmyk] of `GreenYellow 15 0 69 0 Yellow 0 0 100 0 Goldenrod 0 10 84 0 Dandelion 0 29 84 0 Apricot 0 32 52 0 Peach 0 50 70 0
Melon 0 46 50 0 YellowOrange 0 42 100 0 Orange 0 61 87 0 BurntOrange 0 51 100 0 Bittersweet 0 75 100 24 RedOrange 0 77 87 0 Mahogany 0 85 87 35
Maroon 0 87 68 32 BrickRed 0 89 94 28 Red 0 100 100 0 OrangeRed 0 100 50 0 RubineRed 0 100 13 0 WildStrawberry 0 96 39 0 Salmon 0 53 38 0
CarnationPink 0 63 0 0 Magenta 0 100 0 0 VioletRed 0 81 0 0 Rhodamine 0 82 0 0 Mulberry 34 90 0 2 RedViolet 7 90 0 34 Fuchsia 47 91 0 8
Lavender 0 48 0 0 Thistle 12 59 0 0 Orchid 32 64 0 0 DarkOrchid 40 80 20 0 Purple 45 86 0 0 Plum 50 100 0 0 Violet 79 88 0 0 RoyalPurple 75 90 0 0
BlueViolet 86 91 0 4 Periwinkle 57 55 0 0 CadetBlue 62 57 23 0 CornflowerBlue 65 13 0 0 MidnightBlue 98 13 0 43 NavyBlue 94 54 0 0 RoyalBlue 100 50 0 0
Blue 100 100 0 0 Cerulean 94 11 0 0 Cyan 100 0 0 0 ProcessBlue 96 0 0 0 SkyBlue 62 0 12 0 Turquoise 85 0 20 0 TealBlue 86 0 34 2 Aquamarine 82 0 30 0
BlueGreen 85 0 33 0 Emerald 100 0 50 0 JungleGreen 99 0 52 0 SeaGreen 69 0 50 0 Green 100 0 100 0 ForestGreen 91 0 88 12 PineGreen 92 0 59 25
LimeGreen 50 0 100 0 YellowGreen 44 0 74 0 SpringGreen 26 0 76 0 OliveGreen 64 0 95 40 RawSienna 0 72 100 45 Sepia 0 83 100 70 Brown 0 81 100 60
Tan 14 42 56 0 Gray 0 0 0 50 Black 0 0 0 100 White 0 0 0 0`.matchAll(/(\w+) (\d+) (\d+) (\d+) (\d+)/g))
  MATH_TEX_DVIPS_CMYK[name] = cmyk.map(value => value / 100), MATH_TEX_DVIPSNAMES[name] = '#' + cmyk.slice(0, 3).map(value => Math.round(255 * (1 - Math.min(1, (+value + +cmyk[3]) / 100))).toString(16).padStart(2, '0')).join('');
const MATH_TEX_SPACES = Object.freeze({
  ',': 3 / 18, ':': 4 / 18, ';': 5 / 18, '!': -3 / 18, ' ': 1 / 3,
  quad: 1, qquad: 2, enspace: .5, enskip: .5, thinspace: 3 / 18, medspace: 4 / 18, thickspace: 5 / 18,
  negthinspace: -3 / 18, negmedspace: -4 / 18, negthickspace: -5 / 18
});
const mathSITable = text => Object.freeze(Object.fromEntries(text.split(' ').map(entry => entry.split('='))));
const MATH_SI_UNITS = mathSITable('gram=g metre=m meter=m second=s ampere=A kelvin=K mole=mol candela=cd newton=N joule=J watt=W pascal=Pa hertz=Hz volt=V ohm=Ω coulomb=C farad=F henry=H tesla=T weber=Wb siemens=S celsius=°C degreeCelsius=°C litre=L liter=L electronvolt=eV degree=° percent=% minute=min hour=h day=d hectare=ha tonne=t becquerel=Bq gray=Gy sievert=Sv katal=kat lumen=lm lux=lx radian=rad steradian=sr arcminute=′ arcsecond=″ bar=bar angstrom=Å dalton=Da bel=B decibel=dB astronomicalunit=au atomicmassunit=u neper=Np');
// siunitx's abbreviated units (\km, \kHz, \uA...): prefix letters (u for micro) and a unit symbol.
const MATH_SI_ABBREVIATIONS = Object.freeze(Object.fromEntries(`f,p,n,u,m,,k:g p,n,u,m,c,d,,k:m a,f,p,n,u,m,:s f,p,n,u,m,,k:mol p,n,u,m,,k:A u,m,,h:L u,m,,h:l
,m,k,M,G,T:Hz m,,k,M:N ,k,M,G:Pa m,k,M:ohm p,n,u,m,,k:V u,m,,k,M,G:W u,m,,k:J ,m,k,M,G,T:eV k:Wh f,p,n,u,m,:F ,m:H n,u,m,:C ,m:T :K d:B`.split(/\s+/).flatMap(entry => {
  const [prefixes, unit] = entry.split(':'), symbol = {ohm: 'Ω', l: 'L'}[unit] || unit;
  return prefixes.split(',').map(prefix => [prefix + unit, (prefix === 'u' ? 'µ' : prefix) + symbol]);
}).filter(([name]) => name.length > 1 || /^[gmsAJLlVWNFHCTK]$/.test(name))));
const MATH_SI_PREFIXES = mathSITable('quecto=q ronto=r yocto=y zepto=z atto=a femto=f pico=p nano=n micro=µ milli=m centi=c deci=d deca=da deka=da hecto=h kilo=k mega=M giga=G tera=T peta=P exa=E zetta=Z yotta=Y ronna=R quetta=Q');
const MATH_TEX_PACKAGES = new Set(('ams amsmath amssymb amsfonts mathtools color newcommand unicode mhchem physics siunitx bbm bboldx dsfont cancel bbox boldsymbol').split(' '));
const MATH_TEX_PHYSICS = new Set('dv derivative pdv pderivative fdv functionalderivative dd differential qty quantity pqty bqty Bqty vqty abs absolutevalue norm bra ket braket innerproduct ip ketbra dyad outerproduct op expval expectationvalue ev mel matrixel matrixelement comm commutator acomm anticommutator pb poissonbracket vb va vu vectorbold vectorarrow vectorunit grad gradient divergence curl laplacian eval evaluated order Tr tr trace rank diag Res mqty pmqty bmqty Bmqty Pmqty vmqty smqty dmat diagonalmatrix admat antidiagonalmatrix imat identitymatrix zmat zeromatrix xmat xmatrix pmat paulimatrix qq qc qcc qif qthen qelse qotherwise qunless qgiven qusing qassume qsince qlet qfor qall qeven qodd qinteger qand qor qas qin'.split(' '));
const MATH_TEX_ENVIRONMENTS = new Set(('matrix pmatrix bmatrix Bmatrix vmatrix Vmatrix smallmatrix psmallmatrix bsmallmatrix Bsmallmatrix vsmallmatrix Vsmallmatrix array aligned alignedat align alignat flalign gathered lgathered rgathered gather split cases dcases rcases drcases subarray substack eqnarray multline multlined equation darray CD').split(' '));
const MATH_TABLE_DELIMITERS = Object.freeze({pmatrix: ['(', ')'], bmatrix: ['[', ']'], Bmatrix: ['{', '}'], vmatrix: ['|', '|'], Vmatrix: ['‖', '‖'], cases: ['{', ''], rcases: ['', '}']});
function mathTableDelimiters(environment) { return MATH_TABLE_DELIMITERS[environment.replace(/smallmatrix$/, 'matrix').replace(/^d(r?cases)$/, '$1')]; }
const MATH_ENCLOSE_NOTATIONS = new Set('box roundedbox circle left right top bottom horizontalstrike verticalstrike updiagonalstrike downdiagonalstrike updiagonalarrow longdiv actuarial madruwb radical phasorangle'.split(' '));
const MATH_TEX_LITERAL_CLASSES = Object.freeze({
  '+': 'bin', '−': 'bin', '-': 'bin', '±': 'bin', '∓': 'bin', '×': 'bin', '÷': 'bin', '*': 'bin', '⋅': 'bin',
  '=': 'rel', '<': 'rel', '>': 'rel', '≤': 'rel', '≥': 'rel', '≠': 'rel', ':': 'rel',
  '(': 'open', '[': 'open', '{': 'open', '⟨': 'open', ')': 'close', ']': 'close', '}': 'close', '⟩': 'close', ',': 'punct', ';': 'punct',
  '!': 'close',
  '∑': 'op', '∏': 'op', '∫': 'op', '∮': 'op', '∬': 'op', '∭': 'op'
});

function mathTexTokenText(tokens) {
  return tokens.map(token => token.kind === 'verbatim' ? '\\verb' + (token.starred ? '*' : '') + token.delimiter + token.value + token.delimiter :
    token.kind === 'command' ? '\\' + token.value + (/^[A-Za-z@]+$/.test(token.value) ? ' ' : '') : token.value).join('');
}
function mathChoice(node, context) { return node.choices[context.level ? Math.min(context.level + 1, 3) : context.display ? 0 : 1]; }
// Whether braces in a token run pair up without closing below their start.
function mathTexBalanced(tokens) {
  let depth = 0;
  for (const token of tokens) if (token.kind === 'char') { depth += token.value === '{' ? 1 : token.value === '}' ? -1 : 0; if (depth < 0) return false; }
  return depth === 0;
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
  reserveParts(count, token) {
    // Peeking only on refusal: a skipping peek here would consume the spaces that \ce reads.
    if (!Number.isSafeInteger(count) || count < 0 || this.budget.nodes + count > 50000)
      this.error('resource-limit', 'This formula has too many parts to render safely.', token || this.rawPeek());
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
      if (token.kind === 'command' && (Object.hasOwn(MATH_TEX_DECLARATIONS, token.value) || token.value === 'color')) {
        this.take();
        const fields = token.value === 'color' ? {color: this.readColor()} : MATH_TEX_DECLARATIONS[token.value];
        // A math style is an ordered list node: a selected mathchoice can change the style of later atoms.
        if (fields.mathStyle) { children.push(this.node('style', {...fields, declaration: true, body: this.row([])})); continue; }
        // A declaration styles each following atom; the atoms keep their own classes and spacing.
        const rest = this.nested(() => this.parseRow(stop, allowFraction));
        // The first one notes where the declaration stood: TeX keeps no italic correction across it.
        for (const [at, body] of (rest.type === 'row' ? rest.children : [rest]).entries()) children.push(this.styledDeclaration(fields, body, at === 0));
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
        if (base.type === 'choice' || base.type === 'style' && base.mathStyle && base.declaration && !base.body.children.length) { children.push(base); base = this.row([]); }
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
      // A symbol remembers where its source begins, so a tap on it can find its place in the source.
      if (atom && (atom.type === 'glyph' || atom.type === 'text') && atom.at === undefined) atom.at = token.offset;
      if (atom) children.push(atom.type === 'choice' ? atom : this.readScripts(atom));
    }
    // An equation tag follows its equation wherever \tag was written.
    const tags = children.filter(child => child?.semanticRole === 'tag');
    return this.row(tags.length ? [...children.filter(child => child?.semanticRole !== 'tag'), ...tags] : children);
  }
  styledDeclaration(fields, body, first) {
    // Font/color assignments are group-local; math-style nodes remain in the list even through these assignments.
    if (body.type === 'style' && body.mathStyle && body.declaration) return body;
    if (body.type === 'choice') {
      for (const branch of body.choices) branch.children = branch.children.map((child, index) => this.styledDeclaration(fields, child, first && index === 0));
      return body;
    }
    return this.node('style', {...fields, body, ...(first ? {declaration: true} : {})});
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
        // Runs of primes use the font's joined double, triple and quadruple prime glyphs.
        let count = 1;
        while (this.is("'")) { this.take(); count++; }
        const primes = [];
        for (; count > 0; count -= 4) primes.push(this.node('glyph', {value: '′″‴⁗'[Math.min(count, 4) - 1], class: 'ord', variant: 'roman'}));
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
        // An empty argument remembers the place inside its braces, so a tap can put the caret there.
        if (body.type === 'row' && !body.children.length) body.at = token.offset + 1;
        this.expect('}');
        return body;
      });
    }
    const atom = this.parseAtom();
    if (!atom) this.error('missing-argument', 'An argument must contain a mathematical expression.', token);
    if ((atom.type === 'glyph' || atom.type === 'text') && atom.at === undefined) atom.at = token.offset;
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
    if (token.kind === 'verbatim') return this.readVerb(token);
    if (token.kind === 'command') return this.command(token);
    if (token.value === '{') {
      return this.nested(() => {
        const body = this.parseRow(item => item.kind === 'char' && item.value === '}');
        this.expect('}');
        // TeX makes a braced group in a formula one ordinary atom, whatever it holds: a{=}b has no relation spaces.
        body.group = true;
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
      const symbol = Object.hasOwn(MATH_SYMBOLS, token.value) ? MATH_SYMBOLS[token.value] : null;
      if (symbol && (['open', 'close'].includes(symbol.class) || /^(vert|Vert|backslash|slash|[uUdD].*arrow)$/.test(token.value))) return symbol.value;
    }
    if (token.kind === 'char' && '.()[]{}|/<>‖⌈⌉⌊⌋⟨⟩↑↓↕⇑⇓⇕'.includes(token.value))
      return token.value === '.' ? '' : token.value === '<' ? '⟨' : token.value === '>' ? '⟩' : token.value;
    this.error('invalid-delimiter', 'Expected a mathematical delimiter.', token);
  }
  command(token) {
    const name = token.value;
    if (name === 'mathchoice') return this.node('choice', {choices: Array.from({length: 4}, () => {
      if (!this.is('{')) this.error('missing-argument', 'Each math choice needs a braced expression.');
      return this.argument();
    })});
    if (Object.hasOwn(MATH_TEX_SPACES, name)) return this.node('space', {width: MATH_TEX_SPACES[name]});
    // amsmath: \iff, \implies and \impliedby are a long double arrow between thick spaces, one relation.
    if (Object.hasOwn(MATH_TEX_LONG_ARROWS, name)) return this.node('style', {class: 'rel', body: this.row([this.node('space', {width: 5 / 18}), this.node('glyph', MATH_SYMBOLS[MATH_TEX_LONG_ARROWS[name]]), this.node('space', {width: 5 / 18})])});
    if (/^dots[bcimo]?$/.test(name)) return this.readDots(name);
    // amsmath's \colon: a colon 2 mu after the left side and 6 mu before the right, with no punctuation space.
    if (name === 'colon') return this.row([this.node('space', {width: 2 / 18}), this.node('glyph', {value: ':', class: 'ord', variant: 'roman', tokenKind: 'mo'}), this.node('space', {width: 6 / 18})]);
    if (Object.hasOwn(MATH_SYMBOLS, name)) return this.node('glyph', MATH_SYMBOLS[name]);
    if (Object.hasOwn(MATH_TEX_VARIANTS, name)) {
      let body = this.argument();
      // amsmath's \boldsymbol and \pmb, and bm's \bm, keep one symbol's class (\binrel@); a plain group is ordinary.
      if (/^(boldsymbol|bm|pmb)$/.test(name) && body.type === 'row' && body.children.length === 1 && body.children[0].type === 'glyph') body = body.children[0];
      return this.node('style', {variant: MATH_TEX_VARIANTS[name], body});
    }
    if (Object.hasOwn(MATH_TEX_TEXT_VARIANTS, name)) return this.subparse(this.rawArgument(), true, MATH_TEX_TEXT_VARIANTS[name]);
    if (MATH_NAMED_OPERATORS.has(name) || MATH_LIMIT_OPERATORS.has(name)) {
      const values = {limsup: 'lim\u2009sup', liminf: 'lim\u2009inf', injlim: 'inj\u2009lim', projlim: 'proj\u2009lim', varlimsup: 'lim', varliminf: 'lim', varinjlim: 'lim', varprojlim: 'lim'};
      let body = this.node('text', {value: values[name] || name, class: 'op', limits: MATH_LIMIT_OPERATORS.has(name) ? 'display' : 'never', variant: 'roman'});
      // amsmath's \injlim and \projlim are the words inj lim and proj lim; the var forms draw an arrow under lim.
      if (['varinjlim', 'varprojlim'].includes(name)) body = this.node('accent', {base: body, value: /inj/.test(name) ? '→' : '←', position: 'under', stretch: true, class: 'op', limits: 'display', varlim: true});
      if (name === 'varlimsup' || name === 'varliminf') body = this.node('accent', {base: body, value: '¯', position: name === 'varlimsup' ? 'over' : 'under', stretch: true, class: 'op', limits: 'display', varlim: true});
      return body;
    }
    if (Object.hasOwn(MATH_TEX_ACCENTS, name)) {
      const [value, position, stretch] = MATH_TEX_ACCENTS[name];
      // mathtools' \overbracket[rule][height]{...}: the font's bracket keeps its own rule and height.
      if (/bracket$/.test(name) && this.optionalRaw()) this.optionalRaw();
      // TeX's braces, parentheses and brackets over or under a formula are operators with limits.
      return this.node('accent', {base: this.argument(), value, position, stretch, ...(/(brace|paren|bracket)$/.test(name) ? {limits: 'always'} : {})});
    }
    if (/^[{}%$&#_]$/.test(name)) return this.literal(name, {variant: 'roman'});
    if (name === '|') return this.literal('‖', {variant: 'roman'});
    if (name === 'frac' || name === 'dfrac' || name === 'tfrac' || name === 'cfrac') {
      const align = name === 'cfrac' ? this.optionalRaw() : null;
      if (align && !/^[lr]$/.test(mathTexTokenText(align).trim())) this.error('invalid-option', 'Continued-fraction alignment must be l or r.', token);
      return this.node('frac', {num: this.argument(), den: this.argument(), bar: true, ...(name === 'dfrac' || name === 'cfrac' ? {style: 'display'} : name === 'tfrac' ? {style: 'text'} : {}), ...(align ? {align: mathTexTokenText(align).trim()} : {}), ...(name === 'cfrac' ? {strut: true} : {})});
    }
    if (/^(binom|dbinom|tbinom)$/.test(name)) return this.node('frac', {num: this.argument(), den: this.argument(), bar: false, left: '(', right: ')', textDelimiters: true, ...(name[0] === 'd' ? {style: 'display'} : name[0] === 't' ? {style: 'text'} : {})});
    if (name === 'genfrac') {
      const left = this.delimiterArgument(), right = this.delimiterArgument(), thickness = this.plainArgument(), style = this.plainArgument();
      if (!/^[0-3]?$/.test(style)) this.error('invalid-style', 'The fraction style must be 0, 1, 2 or 3.', token);
      const barThickness = thickness ? this.dimension(thickness, token) : undefined;
      return this.node('frac', {num: this.argument(), den: this.argument(), bar: barThickness !== 0, left, right, textDelimiters: true, ...(barThickness === undefined ? {} : {barThickness}), ...(style ? {style: ['display', 'text', 'script', 'scriptscript'][Number(style)]} : {})});
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
      const value = this.delimiterArgument(), sizes = {big: 1.2, Big: 1.8, bigg: 2.4, Bigg: 3};
      const base = name.replace(/[lrm]$/, '');
      return this.literal(value, {delimiterSize: sizes[base], class: name.endsWith('l') ? 'open' : name.endsWith('r') ? 'close' : name.endsWith('m') ? 'rel' : 'ord', variant: 'roman'});
    }
    if (name === 'begin') return this.environment(this.plainArgument(), token);
    if (name === 'substack') return this.tableFromTokens(this.rawArgument(), 'substack');
    if (/^(matrix|pmatrix|bmatrix|Bmatrix|vmatrix|Vmatrix|cases|smallmatrix)$/.test(name)) return this.tableFromTokens(this.rawArgument(), name);
    if (name === 'operatorname' || name === 'operatornamewithlimits') {
      const starred = name !== 'operatorname' || this.is('*'); if (starred && name === 'operatorname') this.take();
      // The name is set in math mode, where TeX ignores spaces: \operatorname{arg max} is argmax.
      const body = this.subparse(this.rawArgument().filter(token => token.kind !== 'space'), true, 'roman');
      return this.node('style', {body, variant: 'roman', class: 'op', limits: starred ? 'display' : 'never', operatorName: true});
    }
    if (/^math(ord|op|bin|rel|open|close|punct|inner)$/.test(name)) return this.node('style', {body: this.argument(), class: name.slice(4), ...(name === 'mathop' ? {limits: 'display'} : {})});
    // Plain TeX's \buildrel top \over relation is \stackrel{top}{relation}.
    if (name === 'buildrel') {
      const top = [];
      for (let depth = 0, item = this.rawTake(false); !(depth === 0 && item.kind === 'command' && item.value === 'over'); item = this.rawTake(false)) {
        if (item.kind === 'eof') this.error('missing-argument', '\\buildrel needs \\over.', token);
        if (item.kind === 'char' && item.value === '{') depth++;
        if (item.kind === 'char' && item.value === '}') depth--;
        top.push(item);
      }
      return this.node('overunder', {base: this.argument(), over: this.subparse(top), class: 'rel'});
    }
    if (name === 'overset' || name === 'underset' || name === 'stackrel' || name === 'stackbin') {
      const decoration = this.argument(), base = this.argument();
      return this.node('overunder', {base, [name === 'underset' ? 'under' : 'over']: decoration, ...(name === 'stackrel' ? {class: 'rel'} : name === 'stackbin' ? {class: 'bin'} : {})});
    }
    if (name === 'overunderset') { const over = this.argument(), under = this.argument(); return this.node('overunder', {base: this.argument(), over, under}); }
    if (/^x(leftarrow|rightarrow|leftrightarrow|Leftarrow|Rightarrow|Leftrightarrow|mapsto|hookleftarrow|hookrightarrow|leftharpoonup|leftharpoondown|rightharpoonup|rightharpoondown|rightleftharpoons|leftrightharpoons|twoheadleftarrow|twoheadrightarrow|longequal)$/.test(name)) {
      const under = this.optionalRaw(), over = this.argument(), symbol = name === 'xlongequal' ? '=' : MATH_SYMBOLS[name.slice(1)].value;
      return this.node('overunder', {base: this.literal(symbol, {class: 'rel', stretch: true}), over, ...(under ? {under: this.subparse(under)} : {}), class: 'rel', arrow: name.slice(1)});
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
      return this.node('raise', {body: this.subparse(this.rawArgument(), true, 'roman'), amount, ...(height ? {height: this.dimension(mathTexTokenText(height), token)} : {}), ...(depth ? {depth: this.dimension(mathTexTokenText(depth), token)} : {})});
    }
    if (name === 'raise' || name === 'lower') return this.node('raise', {amount: this.readDimension() * (name === 'lower' ? -1 : 1), body: this.argument()});
    if (name === 'textcolor' || name === 'mathcolor') { const color = this.readColor(); return this.node('style', {body: this.argument(), color}); }
    if (name === 'colorbox' || name === 'fcolorbox') {
      const border = name === 'fcolorbox' ? this.readColor() : undefined, background = this.readColor();
      return this.node('style', {body: this.subparse(this.rawArgument(), true, 'roman'), background, ...(border ? {border} : {})});
    }
    if (name === 'definecolor') {
      const colorName = this.plainArgument(), model = this.plainArgument(), value = this.plainArgument();
      if (!/^[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(colorName)) this.error('invalid-color', 'Invalid color name.', token);
      this.colors[colorName] = this.color(value, model, token); return null;
    }
    // MathJax's bbox: a background colour, a padding length and a CSS border whose last word is its colour.
    if (name === 'bbox') {
      const fields = {padding: 0}, options = this.optionalRaw();
      for (const option of options ? mathTexTokenText(options).split(',') : []) {
        const value = option.trim(), border = /^border\s*:(.*)$/i.exec(value);
        if (border) fields.border = this.color(border[1].trim().split(/\s+/).pop(), '', token);
        else if (/^[+-]?[\d.]/.test(value)) fields.padding = this.dimension(value, token);
        else if (value) fields.background = this.color(value, '', token);
      }
      return this.node('style', {body: this.argument(), ...fields});
    }
    if (name === 'intertext' || name === 'multicolumn' || name === 'hdotsfor')
      this.error('misplaced-alignment', name === 'intertext' ? '\\intertext goes at the start of a row of align, alignat, flalign or gather.' : '\\' + name + ' fills a whole cell of a matrix or array.', token);
    // MathJax's \enclose{notation}[attributes]{body}: MathML's menclose notations, with mathcolor and mathbackground.
    if (name === 'enclose') {
      const notation = this.plainArgument().split(/[\s,]+/).filter(Boolean), options = this.optionalRaw();
      if (!notation.length) this.error('missing-argument', '\\enclose needs a notation.', token);
      for (const item of notation) if (!MATH_ENCLOSE_NOTATIONS.has(item)) this.error('unsupported-notation', 'Unsupported enclose notation: ' + item + '.', token);
      const fields = {};
      for (const pair of options ? mathTexTokenText(options).split(',') : []) {
        const [key, value = ''] = pair.split('=').map(part => part.trim());
        if (key === 'mathcolor' || key === 'mathbackground') fields[key === 'mathcolor' ? 'color' : 'background'] = this.color(value, '', token);
      }
      return this.node('enclose', {notation: [...new Set(notation)], body: this.argument(), ...fields});
    }
    if (name === 'boxed' || name === 'fbox') return this.node('style', {body: name === 'fbox' ? this.subparse(this.rawArgument(), true, 'roman') : this.argument(), border: 'currentColor', padding: .25});
    if (name === 'cancel' || name === 'bcancel' || name === 'xcancel' || name === 'sout') return this.node('accent', {base: this.argument(), value: name === 'bcancel' ? '╲' : name === 'xcancel' ? '╳' : name === 'sout' ? '─' : '╱', position: 'over', overlay: true, stretch: true});
    if (name === 'cancelto') { const over = this.argument(); return this.node('overunder', {base: this.node('accent', {base: this.argument(), value: '↗', position: 'over', overlay: true, stretch: true}), over}); }
    if (['newcommand', 'renewcommand', 'providecommand', 'def', 'gdef', 'edef', 'xdef', 'DeclareMathOperator', 'DeclarePairedDelimiter', 'let'].includes(name)) { this.define(name, token); return null; }
    // Assignment prefixes: \global makes the next definition global; \long and \outer change nothing here.
    if (name === 'global' || name === 'long' || name === 'outer') {
      let next = token, global = false;
      while (next.kind === 'command' && /^(global|long|outer)$/.test(next.value)) { global ||= next.value === 'global'; next = this.rawTake(); }
      if (next.kind !== 'command' || !/^[egx]?def$/.test(next.value)) this.error('invalid-macro', '\\' + name + ' needs a \\def.', token);
      this.define(global ? {def: 'gdef', edef: 'xdef'}[next.value] || next.value : next.value, next); return null;
    }
    if (name === 'require') {
      const value = this.plainArgument();
      if (!MATH_TEX_PACKAGES.has(value)) this.error('unsupported-package', 'Unsupported math package: ' + value + '.', token, name);
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
      return {...this.row([this.node('space', {width: 2}), starred ? body : this.node('fence', {left: '(', right: ')', body})]), semanticRole: 'tag'};
    }
    if (Object.hasOwn(MATH_TEX_COLONS, name))
      return this.node('style', {class: 'rel', body: this.row([...MATH_TEX_COLONS[name]].flatMap((value, i) => [...(i ? [this.node('space', {width: -1.2 / 18})] : []), this.literal(value, {class: 'ord', variant: 'roman'})]))});
    const make = (value, kind = 'command') => ({kind, value, offset: token.offset});
    // mathtools: \cmd{x} keeps the declared delimiters' size, \cmd*{x} stretches them and \cmd[\big]{x} sets it.
    if (name === '@paired') {
      const left = this.rawArgument(), right = this.rawArgument(), starred = this.is('*');
      if (starred) this.take();
      const size = starred ? null : this.optionalRaw()?.filter(item => item.kind !== 'space'), body = this.rawArgument();
      if (size && (size.length !== 1 || !/^(big|Big|bigg|Bigg)$/.test(size[0].value))) this.error('invalid-option', 'A delimiter size must be \\big, \\Big, \\bigg or \\Bigg.', token);
      const group = tokens => [make('{', 'char'), ...tokens, make('}', 'char')];
      return this.subparse(starred ? [make('left'), ...left, ...body, make('right'), ...right] : size ? [make(size[0].value + 'l'), ...left, ...group(body), make(size[0].value + 'r'), ...right] :
        [make('mathopen'), ...group(left), ...group(body), make('mathclose'), ...group(right)]);
    }
    // braket: \Bra, \Ket, \Braket and \Set stretch their delimiters; bars inside \Braket, and the first in \Set and \set, divide.
    if (/^(Bra|Ket|Braket|Set|set)$/.test(name)) {
      const [left, right] = {Bra: ['langle', '|'], Ket: ['|', 'rangle'], Braket: ['langle', 'rangle'], Set: ['{', '}'], set: ['{', '}']}[name], body = [];
      const raw = this.rawArgument(), delimiter = value => value === '|' ? make('|', 'char') : make(value);
      let divided = false;
      for (let i = 0; i < raw.length; i++) {
        // braket.sty reads || and \| as one double bar.
        const item = raw[i], command = name !== 'set' && item.kind === 'command' && item.value === '|', bar = command || item.kind === 'char' && item.value === '|',
          double = command || bar && raw[i + 1]?.kind === 'char' && raw[i + 1].value === '|';
        if (!bar || divided || (name !== 'Braket' && name !== 'Set' && name !== 'set')) { body.push(item); continue; }
        if (double && !command) i++;
        divided = name !== 'Braket';
        body.push(...(name === 'set' ? [make('mid')] : [make(name === 'Set' ? ';' : ','), make('middle'), double ? make('|') : make('|', 'char'), make(name === 'Set' ? ';' : ',')]));
      }
      if (name === 'set') return this.subparse([make('{'), make(','), ...body, make(','), make('}')]);
      // braket.sty pads \Set with a medium space inside its braces.
      return this.subparse([make('left'), delimiter(left), ...(name === 'Set' ? [make(':')] : []), ...body, ...(name === 'Set' ? [make(':')] : []), make('right'), delimiter(right)]);
    }
    // units' \nicefrac (and xfrac's \sfrac): a script numerator raised 0.5 ex, a solidus, a script denominator lowered 0.25 ex.
    if (name === 'nicefrac' || name === 'sfrac') {
      const script = body => this.node('style', {mathStyle: 'script', body}), num = this.argument(), den = this.argument();
      return this.row([this.node('raise', {amount: .225, body: script(num)}), this.node('space', {width: -.1}), this.literal('/'), this.node('space', {width: -.15}), this.node('raise', {amount: -.1125, body: script(den)})]);
    }
    if (name === 'vcenter') return this.node('raise', {body: this.argument(), center: true});
    // mathtools \prescript{sup}{sub}{base}: scripts before the base, right aligned, at the base's height.
    if (name === 'prescript') {
      const sup = this.argument(), sub = this.argument(), base = this.argument();
      return this.row([this.node('scripts', {base: this.node('phantom', {body: base, mode: 'v'}), sup, sub, pre: true}), base]);
    }
    // amsmath \sideset{_a^b}{_c^d}\sum: corner scripts beside the operator; later scripts become its limits.
    if (name === 'sideset') {
      const before = this.argument(), after = this.argument(), op = this.argument(), corners = (side, base) => {
        const scripts = side.type === 'row' && side.children.length === 1 ? side.children[0] : side;
        return scripts.type === 'scripts' ? {...scripts, base} : this.row([base, side]);
      };
      return this.node('style', {class: 'op', limits: 'display', body: this.row([corners(before, this.node('phantom', {body: op, mode: 'v'})), corners(after, {...op, limits: 'never'})])});
    }
    // accents.sty: \accentset sets any symbol over its base; \underaccent sets an accent or symbol under it.
    if (name === 'accentset' || name === 'underaccent') {
      const mark = this.rawArgument().filter(item => item.kind !== 'space');
      if (mark.length === 1 && mark[0].kind === 'command' && Object.hasOwn(MATH_TEX_ACCENTS, mark[0].value)) {
        const [value, , stretch] = MATH_TEX_ACCENTS[mark[0].value];
        return this.node('accent', {base: this.argument(), value, position: name === 'accentset' ? 'over' : 'under', stretch});
      }
      const decoration = this.subparse(mark);
      return this.node('overunder', {base: this.argument(), [name === 'accentset' ? 'over' : 'under']: decoration, accentGap: true});
    }
    if (name === 'slashed') return this.node('accent', {base: this.argument(), value: '/', position: 'through'});
    if (name === 'bmod') return this.row([this.node('space', {width: 5 / 18}), this.node('text', {value: 'mod', variant: 'roman', class: 'bin'}), this.node('space', {width: 5 / 18})]);
    if (name === 'mod' || name === 'pmod' || name === 'pod') return this.row([
      this.node('space', {width: (name === 'mod' ? 12 : 8) / 18, displayWidth: 1}),
      ...(name === 'mod' ? [] : [this.literal('(')]),
      ...(name === 'pod' ? [] : [this.node('text', {value: 'mod', variant: 'roman'}), this.node('space', {width: 1 / 3})]),
      this.argument(), ...(name === 'mod' ? [] : [this.literal(')')])
    ]);
    if (name === 'ce') return {...this.chemistry(this.rawArgument()), semanticRole: 'chemistry'};
    if (name === 'pu') return {...this.units(this.rawArgument()), semanticRole: 'units'};
    if (/^(SI|si|num|unit|ang|SIrange|numrange|qtyrange)$/.test(name)) return {...this.siunitx(name, token), semanticRole: 'units'};
    // mathtools \smashoperator[lr]{op}: the limits overhang the operator's own width on the named sides.
    if (name === 'smashoperator') {
      const sides = mathTexTokenText(this.optionalRaw() || []).trim() || 'lr';
      if (!/^(l|r|lr|rl)$/.test(sides)) this.error('invalid-option', 'A smashed operator side must be l, r or lr.', token);
      return this.node('style', {body: this.argument(), smashOperator: sides});
    }
    if (name === 'mathmakebox') {
      const width = this.optionalRaw(), position = mathTexTokenText(this.optionalRaw() || []).trim() || 'c';
      if (!/^[lrcs]$/.test(position)) this.error('invalid-option', 'A box position must be l, r, c or s.', token);
      const body = this.argument();
      return width ? this.node('style', {body, width: this.dimension(mathTexTokenText(width), token), align: {l: 'left', r: 'right'}[position] || 'center'}) : body;
    }
    // amsmath \idotsint: two integral signs joined by centred dots, one operator.
    if (name === 'idotsint') {
      const integral = () => this.literal('∫', {large: true, limits: 'never', class: 'op'});
      return this.node('style', {class: 'op', limits: 'never', body: this.row([integral(), this.node('space', {width: -1 / 6}), this.node('glyph', MATH_SYMBOLS.cdots), this.node('space', {width: -1 / 6}), integral()])});
    }
    if (MATH_TEX_PHYSICS.has(name)) return {...this.physics(name, token), semanticRole: 'physics'};
    if (name === 'mmlToken') return this.mathmlToken(token);
    if (name === 'unicode' || name === 'char') return this.character(name, token);
    if (name === 'TeX' || name === 'LaTeX') return this.node('text', {value: name, variant: 'roman'});
    if (name === 'textbackslash') return this.literal('\\', {variant: 'roman'});
    if (name === 'textasciitilde') return this.literal('~', {variant: 'roman'});
    if (name === 'textasciicircum') return this.literal('^', {variant: 'roman'});
    if (['end', 'right', '\\', 'cr', 'of'].includes(name)) this.error('unexpected-command', '\\' + name + ' has no matching opening command.', token);
    this.error('unsupported-command', 'Unsupported math command: \\' + name + '.', token);
  }

  delimiterArgument() {
    const tokens = this.rawArgument().filter(token => token.kind !== 'space');
    if (!tokens.length) return '';
    const parser = new MathTexParser(this.source, {tokens, scopes: this.scopes, budget: this.budget});
    const delimiter = parser.readDelimiter();
    if (parser.peek().kind !== 'eof') this.error('invalid-delimiter', 'A delimiter must be one symbol.', tokens[0]);
    return delimiter;
  }
  readDots(name) {
    let next = this.rawPeek();
    if (name === 'dots' && next.kind === 'command' && next.value === 'boldsymbol') {
      const frames = this.frames.map(frame => ({...frame}));
      try { this.rawTake(); next = this.rawArgument()[0] || this.eof; }
      finally { this.frames = frames; }
    }
    let macro = next.kind === 'command' && !next.builtin && this.macro(next.value);
    if (macro?.body?.[0]?.builtin) { next = macro.body[0]; macro = null; }
    const first = macro?.body?.[0], command = next.kind === 'command' ? next.value : '',
      centered = macro ? first?.kind === 'command' && /^(mathbin|mathrel|not|DOTSB)$/.test(first.value) :
        next.kind === 'char' ? ['bin', 'rel'].includes(MATH_TEX_LITERAL_CLASSES[next.value]) :
          command === 'not' || Object.hasOwn(MATH_TEX_LONG_ARROWS, command) ||
          !MATH_TEX_DOTS_LOW.has(command) && ['bin', 'rel'].includes(MATH_SYMBOLS[command]?.class),
      integral = name === 'dotsi' || name === 'dots' && (command === 'idotsint' || first?.value === 'DOTSI'),
      raised = integral || name === 'dotsb' || name === 'dotsm' || name === 'dots' && centered,
      closing = next.kind === 'eof' || next.kind === 'char' && /^(\)|\]|\$)$/.test(next.value) ||
        /^(rbrack|\}|rbrace|rangle|rceil|rfloor|rgroup|rmoustache|right|bigr|biggr|Bigr|Biggr)$/.test(command),
      extra = !integral && (name === 'dots' ? !raised && closing : closing || next.kind === 'char' &&
        (name === 'dotsc' ? /^[.;]$/.test(next.value) : /^[,.;]$/.test(next.value))),
      dots = this.node('glyph', raised ? MATH_SYMBOLS.cdots : MATH_SYMBOLS.ldots);
    return integral || extra ? this.node('style', {class: 'inner', body: this.row([
      ...(integral ? [this.node('space', {width: -1 / 6})] : []), dots, ...(extra ? [this.node('space', {width: 1 / 6})] : [])
    ])}) : dots;
  }
  readLink(token) {
    const href = this.rawArgument().map(item => {
      if (item.kind !== 'command' || /^[#$%&_]$/.test(item.value)) return item.value;
      this.error('unsafe-link', 'A link address cannot contain TeX commands.', item);
    }).join('').trim();
    if (!/^https?:\/\/[^\s<>"'\\]+$/i.test(href) || /[\u0000-\u0020\u007f]/.test(href))
      this.error('unsafe-link', 'A math link must use an HTTP or HTTPS address.', token);
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
    // xcolor's mixes: red!30 is 30% red in white; red!30!blue is 30% red in blue, and so on along the expression.
    if (!model && value.includes('!')) {
      const parts = value.split('!'), rgb = name => {
        const hex = Object.hasOwn(MATH_TEX_XCOLOR_BASE, name) ? MATH_TEX_XCOLOR_BASE[name] : Object.hasOwn(this.colors, name) ? this.colors[name] : MATH_TEX_DVIPSNAMES[name] || (/^#[a-fA-F0-9]{6}$/.test(name) ? name : null);
        if (!hex || !/^#[a-fA-F0-9]{6}$/.test(hex)) this.error('invalid-color', 'Unsupported or invalid color value.', token, 'color');
        return [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255);
      };
      // xcolor mixes in the first color's model: a dvipsnames color mixes in CMYK, with RGB as 1 - x less its black.
      const cmyk = !Object.hasOwn(this.colors, parts[0].trim()) && MATH_TEX_DVIPS_CMYK[parts[0].trim()], channels = name => {
        if (!cmyk) return rgb(name);
        if (!Object.hasOwn(this.colors, name) && MATH_TEX_DVIPS_CMYK[name]) return MATH_TEX_DVIPS_CMYK[name];
        const [c, m, y] = rgb(name).map(channel => 1 - channel), k = Math.min(c, m, y);
        return [c - k, m - k, y - k, k];
      };
      let mixed = channels(parts[0].trim());
      for (let i = 1; i < parts.length; i += 2) {
        const percent = Number(parts[i]);
        if (!/^\s*\d+(?:\.\d+)?\s*$/.test(parts[i]) || percent > 100) this.error('invalid-color', 'Unsupported or invalid color value.', token, 'color');
        const other = i + 1 < parts.length ? channels(parts[i + 1].trim()) : cmyk ? [0, 0, 0, 0] : [1, 1, 1];
        mixed = mixed.map((channel, k) => channel * percent / 100 + other[k] * (1 - percent / 100));
      }
      if (cmyk) mixed = mixed.slice(0, 3).map(channel => 1 - Math.min(1, channel + mixed[3]));
      return '#' + mixed.map(channel => Math.round(channel * 255).toString(16).padStart(2, '0')).join('');
    }
    if (!model) {
      if (Object.hasOwn(this.colors, value)) return this.colors[value];
      if (MATH_TEX_DVIPSNAMES[value]) return MATH_TEX_DVIPSNAMES[value];
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
    this.error('invalid-color', 'Unsupported or invalid color value.', token, 'color');
  }

  environment(fullName, token) {
    const env = fullName.replace(/\*$/, '');
    if (!MATH_TEX_ENVIRONMENTS.has(env)) throw Object.assign(new MathTexError('unsupported-environment', 'Unsupported math environment: ' + fullName + '.', token.offset, 'begin'), {environment: env});
    return this.nested(() => {
      let options = {};
      const position = this.optionalRaw();
      if (position) {
        const value = mathTexTokenText(position).trim();
        if (!/^[tbclr]$/.test(value)) this.error('invalid-option', 'Invalid matrix alignment.', token);
        if (['l', 'r', 'c'].includes(value)) options.columnAlign = value;
        else options.position = value;
      }
      if (env === 'CD') return this.commutativeDiagram(fullName, token);
      if (env === 'array' || env === 'subarray' || env === 'darray') options = {...options, ...this.columnSpec(this.rawArgument(), token)};
      if (env === 'alignedat' || env === 'alignat') {
        const value = this.plainArgument();
        if (!/^\d+$/.test(value) || Number(value) < 1 || Number(value) > 256) this.error('invalid-alignment', 'An alignedat environment needs its number of column pairs.', token);
        options.pairs = Number(value);
      }
      const body = this.readTable(env, options, item => item.kind === 'command' && item.value === 'end', /cases\*$/.test(fullName) ? 1 : -1);
      this.expect('end', 'command');
      const ending = this.plainArgument();
      if (ending !== fullName) this.error('mismatched-environment', 'Expected \\end{' + fullName + '}, received \\end{' + ending + '}.', token);
      return body;
    });
  }
  // amscd: rows of objects joined by @>>>, @<<< and @= arrows, between rows of @VVV, @AAA, @| and @. arrows.
  commutativeDiagram(fullName, token) {
    const rows = [];
    let cells = [], current = [];
    const arrow = (kind, labels) => {
      const label = tokens => tokens.length ? this.subparse(tokens) : null;
      if (kind === '>' || kind === '<' || kind === '=') {
        const body = this.node('overunder', {base: this.literal(kind === '>' ? '→' : kind === '<' ? '←' : '=', {class: 'rel', stretch: true}),
          ...(kind !== '=' ? {over: label(labels[0]) || this.row([])} : {}), ...(labels[1]?.length ? {under: label(labels[1])} : {}), class: 'rel', minWidth: 3, labelPad: 15, diagram: true});
        return this.row([this.node('space', {width: 0.5}), body, this.node('space', {width: 0.5})]);
      }
      if (kind === '.') return this.row([]);
      const side = (tokens, align) => tokens?.length ? [this.node('style', {width: 0, align, body: this.node('raise', {center: true, body: this.node('style', {mathStyle: 'script', body: label(tokens)})})})] : [];
      return this.row([...side(labels[0], 'right'), this.literal(kind === 'V' ? '↓' : kind === 'A' ? '↑' : '‖', {delimiterSize: 1.8, class: 'ord'}), ...side(labels[1], 'left')]);
    };
    for (;;) {
      const item = this.rawTake(false);
      if (item.kind === 'eof') this.error('unclosed-environment', 'A closing \\end command is missing.', token);
      const end = item.kind === 'command' && item.value === 'end';
      if (end || item.kind === 'command' && item.value === '\\') {
        if (current.some(part => part.kind !== 'space')) cells.push(this.subparse(current));
        if (cells.length) rows.push(cells);
        if (end) break;
        cells = []; current = []; continue;
      }
      if (!(item.kind === 'char' && item.value === '@')) { current.push(item); continue; }
      const kind = this.rawTake(false), name = kind.kind === 'command' && kind.value === '|' ? '|' : kind.value;
      if (!'><=VA|.'.includes(name) || kind.kind === 'eof') this.error('invalid-diagram', 'Expected an amscd arrow after @.', kind);
      const labels = [];
      if ('><VA'.includes(name)) for (let part = 0; part < 2; part++) {
        const tokens = [];
        for (let depth = 0, next = this.rawTake(false); depth || !(next.kind === 'char' && next.value === name); next = this.rawTake(false)) {
          if (next.kind === 'eof') this.error('invalid-diagram', 'An amscd arrow is missing its closing ' + name + '.', kind);
          if (next.kind === 'char') depth += next.value === '{' ? 1 : next.value === '}' ? -1 : 0;
          tokens.push(next);
        }
        labels.push(tokens);
      }
      if ('VA|'.includes(name) || name === '.' && rows.length % 2) { cells.push(arrow(name, labels), this.row([])); current = []; continue; }
      cells.push(current.some(part => part.kind !== 'space') ? this.subparse(current) : this.row([]), arrow(name, labels)); current = [];
    }
    const ending = this.plainArgument();
    if (ending !== fullName) this.error('mismatched-environment', 'Expected \\end{' + fullName + '}, received \\end{' + ending + '}.', token);
    for (const row of rows) if (row.length % 2 === 0 && row.at(-1).type === 'row' && !row.at(-1).children.length) row.pop();
    const columns = Math.max(...rows.map(row => row.length));
    return this.node('table', {env: 'CD', rows, align: Array(columns).fill('c'), rowGaps: [], rowRules: []});
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
    // arydshln's : is a dashed rule; columnDashes marks which rules are dashed.
    const align = [], columnRules = [], columnInsertions = [], columnDashes = [];
    while (parser.peek().kind !== 'eof') {
      const item = parser.take();
      if (item.kind === 'char' && /^[lcr]$/.test(item.value)) { this.reserveParts(1, item); align.push(item.value); }
      else if (item.kind === 'char' && (item.value === '|' || item.value === ':')) { this.reserveParts(1, item); columnRules.push(align.length); columnDashes.push(item.value === ':'); }
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
          columnRules.push(...repeated.columnRules.map(index => at + index)); columnDashes.push(...(repeated.columnDashes || repeated.columnRules.map(() => false)));
          columnInsertions.push(...repeated.columnInsertions.map(insertion => ({...insertion, before: at + insertion.before})));
          align.push(...repeated.align);
        }
      } else this.error('unsupported-alignment', 'Unsupported array column specification: ' + item.value + '.', item);
      if (align.length > 256) this.error('resource-limit', 'This array has too many columns to render safely.', token);
    }
    if (!align.length) this.error('invalid-alignment', 'An array needs a column specification.', token);
    return {align, columnRules, columnInsertions, ...(columnDashes.some(Boolean) ? {columnDashes} : {})};
  }
  // mathtools' starred cases set their condition column as text, with $...$ for maths.
  textCell(separator) {
    const tokens = [];
    for (let depth = 0, token = this.rawPeek(false); token.kind !== 'eof' && (depth > 0 || !separator(token)); token = this.rawPeek(false)) {
      if (token.kind === 'char') depth += token.value === '{' ? 1 : token.value === '}' ? -1 : 0;
      tokens.push(this.rawTake(false));
    }
    while (tokens[0]?.kind === 'space') tokens.shift();
    while (tokens.at(-1)?.kind === 'space') tokens.pop();
    return this.subparse(tokens, true);
  }
  readTable(env, options, end, textColumn = -1) {
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
      // amsmath's \intertext is a line of text between the rows of an alignment, set at its left.
      if (this.commandIs('intertext')) {
        const at = this.take();
        if (!/^(align|alignat|flalign|gather)$/.test(env) || cells.length) this.error('unexpected-intertext', '\\intertext goes at the start of a row of align, alignat, flalign or gather.', at);
        rows.push([this.node('row', {children: [this.subparse(this.rawArgument(), true)], intertext: true})]);
        // It sits a display skip (10 pt, 1 em with the row's \jot) from the rows around it.
        if (rows.length > 1) rowGaps[rows.length - 2] = (rowGaps[rows.length - 2] || 0) + 0.7;
        rowGaps[rows.length - 1] = 0.7;
        continue;
      }
      // \multicolumn{n}{spec}{body} and amsmath's \hdotsfor[spacing]{n} fill n columns of one row.
      if (this.commandIs('multicolumn') || this.commandIs('hdotsfor')) {
        const at = this.take(), dots = at.value === 'hdotsfor', spacing = dots ? this.optionalRaw() : null, count = this.plainArgument();
        if (!/^\d+$/.test(count) || +count < 1 || cells.length + +count > 256) this.error('invalid-alignment', '\\' + at.value + ' needs a column count.', at);
        let cell;
        if (dots) {
          const factor = spacing ? Number(mathTexTokenText(spacing).trim()) : 1;
          if (!(factor > 0 && factor <= 16)) this.error('invalid-option', '\\hdotsfor spacing must be a positive number.', at);
          cell = this.node('row', {children: [], span: +count, dots: factor});
        } else {
          const spec = this.columnSpec(this.rawArgument(), at);
          if (spec.align.length !== 1) this.error('invalid-alignment', '\\multicolumn takes one column.', at);
          cell = this.node('row', {children: [this.argument()], span: +count, spanAlign: spec.align[0], ...(spec.columnRules.length ? {spanRules: spec.columnRules} : {})});
        }
        if (!separator(this.peek())) this.error('unexpected-token', 'A \\' + at.value + ' fills its whole cell.', this.peek());
        cells.push(cell);
        for (let i = 1; i < +count; i++) cells.push(this.node('row', {children: [], covered: true}));
      } else cells.push(cells.length === textColumn ? this.textCell(separator) : this.nested(() => this.parseRow(separator)));
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
    if (!align) align = Array.from({length: columns}, (_, index) => /^(align|aligned|alignat|alignedat|flalign|split)$/.test(env) ? (index % 2 ? 'l' : 'r') : /cases$/.test(env) || env === 'lgathered' ? 'l' : env === 'rgathered' ? 'r' : options.columnAlign || 'c');
    return this.node('table', {env, rows, ...options, align, rowGaps, rowRules});
  }

  define(name, token) {
    let starred = false;
    if (this.rawPeek().kind === 'char' && this.rawPeek().value === '*') { this.rawTake(); starred = true; }
    const nameTokens = this.rawArgument().filter(item => item.kind !== 'space');
    if (nameTokens.length !== 1 || nameTokens[0].kind !== 'command') this.error('invalid-macro', 'A macro name must be one command.', token);
    const macroName = nameTokens[0].value;
    const make = value => ({kind: 'command', value, offset: token.offset});
    const literal = value => ({kind: 'char', value, offset: token.offset});
    if (name === 'DeclareMathOperator') {
      const body = this.rawArgument();
      this.scopes[this.scopes.length - 1][macroName] = {params: [], prefix: [], body: [make('operatorname'), ...(starred ? [literal('*')] : []), literal('{'), ...body, literal('}')], optional: null};
      return;
    }
    if (name === 'DeclarePairedDelimiter') {
      const left = this.rawArgument(), right = this.rawArgument();
      this.scopes[this.scopes.length - 1][macroName] = {params: [], prefix: [], body: [make('@paired'), literal('{'), ...left, literal('}'), literal('{'), ...right, literal('}')], optional: null};
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
    if (/^[egx]?def$/.test(name)) {
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
      if (name === 'edef' || name === 'xdef') {
        // \edef expands the macros in its replacement when it is defined.
        const parser = new MathTexParser(this.source, {tokens: body, scopes: this.scopes, budget: this.budget});
        body = [];
        for (let item = parser.take(false); item.kind !== 'eof'; item = parser.take(false)) body.push(item);
      }
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
    const existing = this.macro(macroName) || Object.hasOwn(MATH_SYMBOLS, macroName) || Object.hasOwn(MATH_TEX_VARIANTS, macroName) || MATH_NAMED_OPERATORS.has(macroName) || MATH_LIMIT_OPERATORS.has(macroName);
    if (name === 'providecommand' && existing) return;
    if (name === 'newcommand' && existing) this.error('duplicate-macro', '\\' + macroName + ' is already defined.', token);
    this.scopes[name === 'gdef' || name === 'xdef' ? 0 : this.scopes.length - 1][macroName] = {params, prefix, body, optional};
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

  readVerb(token) {
    // Raw spans are single tokens, but each copied character consumes the same admission budget as a glyph.
    this.reserveParts(token.value.length, token);
    // LaTeX places \verb in a text-size hbox, including when it occurs in a script.
    return this.node('style', {mathStyle: 'text', body: this.node('text', {
      value: token.value.replace(/[ \t]/g, token.starred ? '\u2423' : '\u00a0'), variant: 'monospace', verbatim: true, at: token.offset
    })});
  }
  parseText(variant = 'roman') {
    const children = [];
    let value = '';
    // TeX's text fonts join --- and -- into dashes and turn `` '' ` ' into curly quotes; typewriter text keeps them.
    const flush = () => { if (value) children.push(this.node('text', {value: variant === 'monospace' ? value : value.replace(/---|--|``|''|`|'/g, run => ({'---': '—', '--': '–', '``': '“', "''": '”', '`': '‘', "'": '’'})[run]), variant})); value = ''; };
    for (;;) {
      const token = this.take(false);
      if (token.kind === 'eof') break;
      if (token.kind === 'verbatim') { flush(); children.push(this.readVerb(token)); continue; }
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
        flush(); children.push(this.subparse(this.rawArgument(), true, mathTextVariant(variant, name))); continue;
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
      if (Object.hasOwn(MATH_TEX_TEXT_LETTERS, name)) { value += MATH_TEX_TEXT_LETTERS[name]; continue; }
      if (Object.hasOwn(MATH_SYMBOLS, name) && !MATH_SYMBOLS[name].large) { value += MATH_SYMBOLS[name].value; continue; }
      flush();
      const body = this.command(token);
      if (body) children.push(body);
    }
    flush();
    return this.row(children);
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
    if (['Tr', 'tr', 'trace', 'rank', 'diag', 'Res'].includes(name)) return this.node('text', {value: name === 'trace' ? 'tr' : name, variant: 'roman', class: 'op', limits: 'never'});
    if (name === 'qty' || name === 'quantity') {
      if (this.is('{')) return this.node('fence', {left: '{', right: '}', body: this.argument()});
      const left = this.readDelimiter(), right = {'(': ')', '[': ']', '{': '}', '|': '|', '‖': '‖', '⟨': '⟩'}[left];
      if (!right) this.error('invalid-delimiter', 'A quantity needs paired delimiters.', token);
      const body = this.nested(() => this.parseRow(item => item.kind === 'char' && item.value === right));
      this.expect(right);
      return this.node('fence', {left, right, body});
    }
    // \qq{text} and the \qif family: text between quads; \qc is a comma and a quad.
    if (/^q/.test(name)) {
      const quad = () => this.node('space', {width: 1}), words = {qcc: 'c.c.'};
      if (name === 'qc') return this.node('style', {class: 'punct', body: this.row([this.literal(',', {class: 'punct'}), quad()])});
      return this.row([quad(), name === 'qq' ? this.subparse(this.rawArgument(), true) : this.node('text', {value: words[name] || name.slice(1), variant: 'roman'}), quad()]);
    }
    if (name === 'eval' || name === 'evaluated') return this.node('fence', {left: '', right: '|', body: this.argument()});
    if (name === 'order') return this.row([this.literal('O'), this.node('fence', {left: '(', right: ')', body: this.argument()})]);
    // \mqty(…), \mqty[…] and \mqty|…| choose their brackets as physics.sty does.
    if (name === 'mqty' && ['(', '[', '|'].includes(this.rawPeek().value) && this.rawPeek().kind === 'char') {
      const open = this.rawTake().value, close = {'(': ')', '[': ']', '|': '|'}[open], tokens = [];
      for (let depth = 0, token = this.rawTake(false); ; token = this.rawTake(false)) {
        if (token.kind === 'eof') this.error('unclosed-group', 'Expected ' + close + '.', token);
        if (token.kind === 'char' && token.value === '{') depth++;
        if (token.kind === 'char' && token.value === '}') depth--;
        if (!depth && token.kind === 'char' && token.value === close) break;
        tokens.push(token);
      }
      return this.tableFromTokens(tokens, {'(': 'pmatrix', '[': 'bmatrix', '|': 'vmatrix'}[open]);
    }
    if (/^(mqty|pmqty|bmqty|Bmqty|vmqty|smqty)$/.test(name)) {
      const env = name === 'bmqty' ? 'bmatrix' : name === 'Bmqty' ? 'Bmatrix' : name === 'vmqty' ? 'vmatrix' : name === 'smqty' ? 'smallmatrix' : name === 'pmqty' ? 'pmatrix' : 'matrix';
      return this.tableFromTokens(this.rawArgument(), env);
    }
    if (name === 'Pmqty') return this.node('fence', {left: '⟮', right: '⟯', body: this.tableFromTokens(this.rawArgument(), 'matrix')});
    // physics.sty's matrix contents: diagonal and antidiagonal (a filler fills the rest), identity, zero, a matrix of x_{ij}, Pauli.
    if (/^(dmat|diagonalmatrix|admat|antidiagonalmatrix|imat|identitymatrix|zmat|zeromatrix|xmat|xmatrix|pmat|paulimatrix)$/.test(name)) {
      const text = tokens => mathTexTokenText(tokens).trim(), cells = [];
      const count = tokens => { const n = Number(text(tokens)); if (!Number.isInteger(n) || n < 1 || n > 32) this.error('invalid-argument', 'A matrix size is a whole number from 1 to 32.', token); return n; };
      if (/^(dmat|diagonalmatrix|admat|antidiagonalmatrix)$/.test(name)) {
        const filler = this.optionalRaw() || [], entries = [], raw = this.rawArgument();
        let depth = 0, entry = [];
        for (const item of raw) {
          if (item.kind === 'char' && item.value === '{') depth++;
          if (item.kind === 'char' && item.value === '}') depth--;
          if (!depth && item.kind === 'char' && item.value === ',') { entries.push(entry); entry = []; } else entry.push(item);
        }
        entries.push(entry);
        if (entries.length > 32) this.error('resource-limit', 'This matrix is too large to render safely.', token);
        const anti = /^a/.test(name);
        // Each diagonal entry is its own \mqty, as in physics.sty.
        const own = entry => [{kind: 'command', value: 'mqty', offset: token.offset}, {kind: 'char', value: '{', offset: token.offset}, ...entry, {kind: 'char', value: '}', offset: token.offset}];
        for (let r = 0; r < entries.length; r++) cells.push(entries.map((_, c) => (anti ? c === entries.length - 1 - r : c === r) ? own(entries[r]) : filler));
      } else if (/^(imat|identitymatrix)$/.test(name)) {
        const n = count(this.rawArgument()), one = mathTexTokens('1', token.offset), zero = mathTexTokens('0', token.offset);
        for (let r = 0; r < n; r++) cells.push(Array.from({length: n}, (_, c) => c === r ? one : zero));
      } else if (/^(zmat|zeromatrix)$/.test(name)) {
        const rows = count(this.rawArgument()), columns = this.is('{') ? count(this.rawArgument()) : rows, zero = mathTexTokens('0', token.offset);
        for (let r = 0; r < rows; r++) cells.push(Array(columns).fill(zero));
      } else if (/^(xmat|xmatrix)$/.test(name)) {
        const symbol = this.rawArgument(), rows = count(this.rawArgument()), columns = count(this.rawArgument());
        for (let r = 1; r <= rows; r++) cells.push(Array.from({length: columns}, (_, c) => [...symbol, ...(starred ? mathTexTokens('_{' + (rows > 1 ? r : '') + (columns > 1 ? c + 1 : '') + '}', token.offset) : [])]));
      } else {
        const which = text(this.rawArgument()), rows = {'0': '1&0\\\\0&1', '1': '0&1\\\\1&0', x: '0&1\\\\1&0', '2': '0&-i\\\\i&0', y: '0&-i\\\\i&0', '3': '1&0\\\\0&-1', z: '1&0\\\\0&-1'}[which];
        if (!rows) this.error('invalid-argument', 'A Pauli matrix is 0, 1, 2, 3, x, y or z.', token);
        return this.tableFromTokens(mathTexTokens(rows, token.offset), 'matrix');
      }
      const amp = {kind: 'char', value: '&', offset: token.offset}, newline = {kind: 'command', value: '\\', offset: token.offset};
      return this.tableFromTokens(cells.flatMap((row, r) => [...(r ? [newline] : []), ...row.flatMap((cell, c) => [...(c ? [amp] : []), ...cell])]), 'matrix');
    }
    const first = this.argument();
    if (/^(bra|ket|pqty|bqty|Bqty|vqty|abs|absolutevalue|norm)$/.test(name)) {
      const ends = {bra: ['⟨', '|'], ket: ['|', '⟩'], pqty: ['(', ')'], bqty: ['[', ']'], Bqty: ['{', '}'], vqty: ['|', '|'], abs: ['|', '|'], absolutevalue: ['|', '|'], norm: ['‖', '‖']}[name];
      return this.node('fence', {left: ends[0], right: ends[1], body: first});
    }
    if (/^(comm|commutator|acomm|anticommutator|pb|poissonbracket)$/.test(name)) return this.node('fence', {left: /^(comm|commutator)$/.test(name) ? '[' : '{', right: /^(comm|commutator)$/.test(name) ? ']' : '}', body: this.row([first, this.literal(',', {class: 'punct'}), this.argument()])});
    if (/^(mel|matrixel|matrixelement)$/.test(name)) {
      const operator = this.argument(), right = this.argument();
      return this.node('fence', {left: '⟨', right: '⟩', body: this.row([first, this.literal('|', {delimiter: true}), operator, this.literal('|', {delimiter: true}), right])});
    }
    const second = this.is('{') ? this.argument() : null;
    if (/^(ketbra|dyad|outerproduct|op)$/.test(name)) return this.row([this.node('fence', {left: '|', right: '⟩', body: first}), this.node('fence', {left: '⟨', right: '|', body: second || first})]);
    if (/^(expval|expectationvalue|ev)$/.test(name)) return this.node('fence', {left: '⟨', right: '⟩', body: second ? this.row([second, this.literal('|', {delimiter: true}), first, this.literal('|', {delimiter: true}), second]) : first});
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
    let spaced = true, subAllowed = false, moleculeParts = 0, isotope = null;
    // mhchem hangs a count, then a charge, each on its own X-high phantom after the formula, side by side.
    const script = (key, body) => {
      const last = children.at(-1);
      if (last?.chemical && !(key === 'sup' && last.sub && !last.sup)) {
        if (last[key]) last[key] = this.row([last[key], body]); else last[key] = body;
        return;
      }
      children.push(this.node('scripts', {base: this.node('phantom', {body: this.node('text', {value: 'X', variant: 'roman'}), mode: 'v'}), [key]: body, chemical: true}));
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
      if (isotope && !(token.kind === 'char' && /^[\^_A-Za-z]$/.test(token.value))) isotope = null;
      if (token.kind === 'space') {
        spaced = true; subAllowed = false; moleculeParts = 0;
        // An operator or arrow already carries its own spacing; a separating space adds none beside it.
        const after = this.rawPeek(false), before = children.at(-1)?.class;
        if (before !== 'bin' && before !== 'rel' && !children.at(-2)?.unspaced && !(after.kind === 'char' && /^[+<=-]$/.test(after.value))) children.push(this.node('space', {width: 3 / 18}));
        continue;
      }
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
        children.push(this.node('style', {variant: 'normal', body: this.nested(() => this.parseRow(item => item.kind === 'char' && item.value === '$'))}));
        this.expect('$'); spaced = false; subAllowed = false; continue;
      }
      // mhchem's (^) and (v): a gas given off and a precipitate, with a thin space after.
      if (token.value === '(' && this.rawPeek(false).kind === 'char' && /^[\^v]$/.test(this.rawPeek(false).value)) {
        const mark = this.rawTake(false).value;
        if (this.rawPeek(false).value !== ')') this.error('unexpected-token', 'Expected ).', this.rawPeek(false));
        this.rawTake(false);
        children.push(this.literal(mark === '^' ? '↑' : '↓', {class: 'ord', variant: 'roman'}), this.node('space', {width: 3 / 18})); spaced = false; subAllowed = false; continue;
      }
      if (token.value === '(' || token.value === '[') {
        // mhchem separates a lowercase state from its formula by 0.2 ex (Latin Modern's x height is 0.431 em).
        const before = children.at(-1)?.type === 'space' ? children.at(-2) : children.at(-1), first = this.rawPeek(false);
        if (token.value === '(' && before && !['bin', 'rel'].includes(before.class) && first.kind === 'char' && /^[a-z]$/.test(first.value))
          children.push(this.node('space', {width: .0862}));
        const end = token.value === '(' ? ')' : ']';
        const body = this.nested(() => this.chemicalRow(item => item.kind === 'char' && item.value === end));
        this.expect(end);
        // mhchem's brackets are plain opening and closing characters: an ordinary group, with no inner spacing.
        children.push(this.node('fence', {left: token.value, right: end, body, class: 'ord'}));
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
          children.push(this.literal('↑', {class: 'ord', variant: 'roman'}), this.node('space', {width: 3 / 18})); spaced = false; subAllowed = false; continue;
        }
        let body;
        if (this.is('{')) {
          const tokens = this.rawArgument(), value = mathTexTokenText(tokens).trim(), math = tokens[0]?.value === '$' && tokens.at(-1)?.value === '$';
          body = /^[A-Za-z]{2,}$/.test(value) ? this.node('text', {value, variant: 'roman'}) : this.subparse(math ? tokens.slice(1, -1) : tokens);
          // Single-letter variables and their integer expressions are math; words and oxidation numerals stay upright.
          if (math || /^\d*[a-z](?:[+\-−]\d*)?$/.test(value)) body = this.node('style', {variant: 'normal', body});
        }
        else {
          const value = consumeRun(character => /^[0-9+\-−IVX]$/.test(character));
          const variable = this.rawPeek(false).kind === 'char' && /^[a-z]$/.test(this.rawPeek(false).value);
          body = value ? this.node('text', {value: value.replace(/-/g, '−'), variant: 'roman'}) : this.argument();
          if (!value && variable) body = this.node('style', {variant: 'normal', body});
        }
        // Scripts that open a term are an isotope's mass and atomic numbers, set before the next element.
        if (spaced) {
          if (!isotope) children.push(isotope = this.node('scripts', {base: this.row([]), pre: true}));
          if (isotope[key]) this.error('duplicate-script', 'An isotope cannot have two ' + (key === 'sub' ? 'subscripts' : 'superscripts') + '.', token);
          isotope[key] = body; continue;
        }
        script(key, body); spaced = false; continue;
      }
      if (/^[0-9]$/.test(token.value)) {
        // A subscript count is whole: in CuSO4.5H2O the point is the addition dot.
        const number = token.value + consumeRun(character => subAllowed && !spaced ? /^[0-9]$/.test(character) : /^[0-9.]$/.test(character));
        // 1/2 opening a term is mhchem's text-style fraction.
        if (!(subAllowed && !spaced) && this.rawPeek(false).value === '/' && /^[0-9]$/.test(this.frames.at(-1)?.tokens[this.frames.at(-1).at + 1]?.value ?? '')) {
          this.rawTake(false);
          const denominator = consumeRun(character => /^[0-9]$/.test(character));
          children.push(this.node('frac', {num: this.node('text', {value: number, variant: 'roman'}), den: this.node('text', {value: denominator, variant: 'roman'}), bar: true, style: 'text'}));
          spaced = false; subAllowed = false; continue;
        }
        if (subAllowed && !spaced) {
          if (moleculeParts === 1 && ['+', '-'].includes(this.rawPeek(false).value)) {
            const sign = this.rawTake(false).value;
            script('sup', this.node('text', {value: number + (sign === '-' ? '−' : '+'), variant: 'roman'}));
          } else script('sub', this.node('text', {value: number, variant: 'roman'}));
        } else {
          // A coefficient keeps a thin space before its formula.
          children.push(this.node('text', {value: number, variant: 'roman'}));
          if (this.rawPeek(false).kind === 'char' && /^[A-Z(\[]$/.test(this.rawPeek(false).value)) children.push(this.node('space', {width: 3 / 18}));
        }
        spaced = false; continue;
      }
      if (token.value === '<' || token.value === '-' || token.value === '=') {
        let arrow = token.value;
        while (this.rawPeek(false).kind === 'char' && /^[<=>-]$/.test(this.rawPeek(false).value) && arrow.length < 5) arrow += this.rawTake(false).value;
        const arrows = {'->': '→', '<-': '←', '<->': '↔', '<-->': '⇄', '<=>': '⇌', '=>': '⇒', '<=': '⇐', '<<=>': '⇋', '<=>>': '⇌'};
        if (arrows[arrow]) {
          // Only an adjacent bracket labels the arrow; a peek that skips spaces would drop the next one.
          const over = this.rawPeek(false).value === '[' ? this.optionalRaw() : null, under = over && this.rawPeek(false).value === '[' ? this.optionalRaw() : null;
          // mhchem's arrow is at least 2 em, with a thick space inside each end; <-> and <--> pad a label by 18 mu.
          const base = this.literal(arrows[arrow], {class: 'rel', variant: 'roman', stretch: true}), space = () => this.node('space', {width: 5 / 18});
          // A label in braces is text, with its word spaces; otherwise it is chemistry.
          const label = tokens => {
            if (!tokens?.some(item => item.kind !== 'space')) return null;
            const inner = tokens.filter(item => item.kind !== 'space');
            if (inner[0]?.value === '{' && inner.at(-1)?.value === '}' && tokens.indexOf(inner[0]) === 0 && mathTexBalanced(inner.slice(1, -1))) return this.subparse(tokens.slice(1, tokens.lastIndexOf(inner.at(-1))), true, 'roman');
            return this.chemistry(tokens);
          };
          children.push(space(), this.node('overunder', {base, over: label(over), under: label(under), class: 'rel', minWidth: 2, unspaced: true, ...(/^<--?>$/.test(arrow) ? {labelPad: 18} : {})}), space());
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
        if (word === 'v' && spaced && !isotope) { children.push(this.literal('↓', {class: 'ord', variant: 'roman'}), this.node('space', {width: 3 / 18})); spaced = false; subAllowed = false; continue; }
        const element = this.node('text', {value: word, variant: 'roman'});
        if (isotope) { isotope.base = this.node('phantom', {body: element, mode: 'v'}); isotope = null; }
        children.push(element);
        moleculeParts++; spaced = false; subAllowed = true; continue;
      }
      if (token.value === '#') children.push(this.literal('≡', {class: 'ord', variant: 'roman'}));
      // mhchem's addition dot (. or *) has a thin space on each side and starts a new formula.
      else if (token.value === '.' || token.value === '·' || token.value === '*') {
        children.push(this.node('space', {width: 3 / 18}), this.literal('⋅', {class: 'ord', variant: 'roman'}), this.node('space', {width: 3 / 18}));
        spaced = true; subAllowed = false; moleculeParts = 0; continue;
      }
      else if (token.value === '~') children.push(this.node('space', {width: 1 / 3}));
      else children.push(this.literal(token.value, {variant: 'roman'}));
      spaced = false;
    }
    return this.row(children);
  }
  // siunitx: \num groups digits, \si and \unit set units upright (macros or literal), \SI joins them, \ang marks degrees.
  // Formatting options are accepted and not reproduced.
  siunitx(name, token) {
    this.optionalRaw();
    if (name === 'num') return this.siNumber(this.rawArgument());
    if (name === 'si' || name === 'unit') return this.siUnit(this.rawArgument(), token);
    if (name === 'ang') {
      const parts = mathTexTokenText(this.rawArgument()).split(';');
      if (parts.length > 3) this.error('invalid-number', 'An angle has at most degrees, minutes and seconds.', token);
      return this.row(parts.flatMap((part, i) => part.trim() ? [this.siNumber(mathTexTokens(part.trim(), token.offset)), this.literal('°′″'[i], {variant: 'roman'})] : []));
    }
    // \numrange and \SIrange: "1 to 5", the unit after each number.
    if (/range$/.test(name)) {
      const from = this.siNumber(this.rawArgument()), to = this.siNumber(this.rawArgument()), word = {type: 'text', value: 'to', variant: 'roman'},
        unit = name === 'numrange' ? null : this.rawArgument(), quantity = value => unit ? [value, this.node('space', {width: 3 / 18}), this.siUnit(unit, token)] : [value];
      return this.row([...quantity(from), this.node('space', {width: 1 / 3}), this.node('text', word), this.node('space', {width: 1 / 3}), ...quantity(to)]);
    }
    const value = this.siNumber(this.rawArgument()), before = this.optionalRaw();
    return this.row([...(before ? [this.siUnit(before, token), this.node('space', {width: 3 / 18})] : []), value, this.node('space', {width: 3 / 18}), this.siUnit(this.rawArgument(), token)]);
  }
  siNumber(tokens) {
    const text = mathTexTokenText(tokens).replace(/\s+/g, '');
    if (!/^[-+]?(\d+[.,]?\d*|[.,]\d+)(\+-\d+[.,]?\d*)?([eE][-+]?\d+)?$/.test(text)) return this.subparse(tokens);
    const group = (digits, fromLeft) => digits.length < 5 ? digits : (fromLeft ? digits.match(/\d{1,3}/g) : digits.split('').reverse().join('').match(/\d{1,3}/g).map(part => part.split('').reverse().join('')).reverse()).join('\\,');
    const [, sign = '', whole = '', fraction, uncertainty, exponent] = /^([-+]?)(\d*)(?:[.,](\d*))?(?:\+-(\d+[.,]?\d*))?(?:[eE]([-+]?\d+))?$/.exec(text);
    const value = (sign === '-' ? '-' : sign) + (group(whole) || '0') + (fraction === undefined ? '' : '.' + group(fraction, true)) +
      (uncertainty ? '{\\pm}' + uncertainty.replace(',', '.') : '') + (exponent ? '\\times 10^{' + exponent.replace('+', '') + '}' : '');
    return this.subparse(mathTexTokens(value, tokens[0]?.offset || 0));
  }
  siUnit(tokens, token) {
    const units = MATH_SI_UNITS, prefixes = MATH_SI_PREFIXES, items = [];
    if (!tokens.some(item => item.kind === 'command' && (Object.hasOwn(units, item.value) || Object.hasOwn(prefixes, item.value) || Object.hasOwn(MATH_SI_ABBREVIATIONS, item.value) || /^(per|square|cubic|squared|cubed|tothe|raiseto)$/.test(item.value))))
      return this.node('style', {variant: 'roman', body: this.subparse(tokens.map(item => item.kind === 'char' && (item.value === '.' || item.value === '~') ? {...item, kind: 'command', value: ','} : item))});
    let prefix = '', power = 1, per = false;
    const number = at => { const group = tokens[at]?.value === '{' ? tokens.slice(at + 1, tokens.findIndex((item, i) => i > at && item.value === '}')) : [tokens[at]]; return [mathTexTokenText(group.filter(Boolean)).trim(), at + (group.length > 1 || tokens[at]?.value === '{' ? group.length + 1 : 0)]; };
    for (let at = 0; at < tokens.length; at++) {
      const item = tokens[at], value = item.value;
      if (item.kind === 'space' || item.kind === 'char' && (value === '.' || value === '~')) continue;
      if (item.kind === 'command' && Object.hasOwn(prefixes, value)) prefix += prefixes[value];
      else if (item.kind === 'command' && value === 'per') per = true;
      else if (item.kind === 'command' && (value === 'square' || value === 'cubic')) power = value === 'square' ? 2 : 3;
      else if (item.kind === 'command' && /^(squared|cubed|tothe|raiseto)$/.test(value) && items.length) {
        let exponent = value === 'squared' ? '2' : '3';
        if (value === 'tothe' || value === 'raiseto') [exponent, at] = number(at + 1);
        if (!/^-?\d+(\.\d+)?$/.test(exponent)) this.error('invalid-unit', 'A unit power must be a number.', item);
        items.at(-1).power = exponent;
      } else if (item.kind === 'char' && value === '/' && items.length) items.at(-1).slash = true;
      else if (item.kind === 'command' && (Object.hasOwn(units, value) || !prefix && Object.hasOwn(MATH_SI_ABBREVIATIONS, value)) || item.kind === 'char' && /^[A-Za-z]$/.test(value)) {
        items.push({symbol: prefix + (item.kind === 'command' ? units[value] ?? MATH_SI_ABBREVIATIONS[value] : value), power: String(power), per});
        prefix = ''; power = 1; per = false;
      } else this.error('invalid-unit', 'Unsupported unit: ' + mathTexTokenText([item]).trim() + '.', item);
    }
    if (prefix || per || !items.length || items.at(-1).slash) this.error('invalid-unit', 'A unit prefix, \\per or / needs a unit.', token);
    // A unit after a written solidus follows it directly: m/s.
    return this.row(items.flatMap((unit, i) => {
      const exponent = (unit.per ? '−' : '') + unit.power.replace('-', '−'), base = this.node('text', {value: unit.symbol, variant: 'roman'});
      return [...(i && !items[i - 1].slash ? [this.node('space', {width: 3 / 18})] : []), exponent === '1' ? base : this.node('scripts', {base, sup: this.node('text', {value: exponent, variant: 'roman'})}),
        ...(unit.slash ? [this.literal('/', {variant: 'roman'})] : [])];
    }));
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
    return this.node('style', {variant, tokenKind: kind, tokenText: text, body: kind === 'mtext' ? this.node('text', {value: text, variant}) : this.row([...text].map(value => this.literal(value, {variant})))});
  }
  character(name, token) {
    let raw;
    if (name === 'unicode') {
      const metrics = this.optionalRaw(), font = this.optionalRaw();
      if (metrics || font) this.error('unsupported-character-option', 'Unicode characters use the embedded math font.', token);
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

// While a person types, a formula is unfinished where they are typing. Preview mends it there: a half-typed command
// before the caret waits (blanked, so later offsets hold), a missing argument shows a placeholder box, and groups,
// options, fences and environments left open at the end close. Any other fault stays a fault.
function parseMathTexPreview(source, error, caret = source.length) {
  if (source.length > 4096) return null;
  caret = Math.max(0, Math.min(source.length, Math.floor(caret) || 0));
  let text = source;
  const tail = /(?<!\\)\\(?:[A-Za-z]*|(?:begin|end)\{[A-Za-z*]*)$/.exec(text.slice(0, caret));
  // A name being typed previews blank; a finished misspelling (no known name continues it) keeps its fix.
  if (tail && error?.code === 'unsupported-command' && error.offset === tail.index && /^\\[A-Za-z]+$/.test(tail[0])) {
    const name = tail[0].slice(1), suggestion = mathSuggest(name);
    if (suggestion && !mathTexNames.command.some(candidate => candidate.length > name.length && candidate.startsWith(name))) return null;
  }
  if (tail) text = text.slice(0, tail.index) + ' '.repeat(tail[0].length) + text.slice(caret);
  const atEnd = (cause, length) => /^unclosed-(group|option|environment)$/.test(cause.code) || cause.offset >= length;
  for (let attempt = 0; attempt < 24; attempt++) {
    try { return new MathTexParser(text).parse(); } catch (cause) { error = cause; }
    if (error.code === 'missing-argument' && error.offset < text.length) { text = text.slice(0, error.offset) + '{\\square}' + text.slice(error.offset); continue; }
    if (!atEnd(error, text.length)) return null;
    if (/[\^_]$/.test(text)) { text += '{\\square}'; continue; }
    if (/[{[]$/.test(text)) { text += '\\square'; continue; }
    const open = [...text.matchAll(/\\(begin|end)\{([A-Za-z*]+)\}/g)].reduce((stack, [, kind, name]) => (kind === 'begin' ? stack.push(name) : stack.pop(), stack), []).at(-1);
    const expected = /^Expected (.+)\.$/.exec(error.message)?.[1], fixes = ['}', ']', '\\right.', ...(open ? ['\\end{' + open + '}'] : []), '$', '{\\square}'];
    const first = error.code === 'unclosed-option' ? ']' : error.code === 'missing-argument' ? '{\\square}' : error.code === 'unclosed-environment' && open ? '\\end{' + open + '}' : expected && fixes.includes(expected === '\\right' ? '\\right.' : expected) ? (expected === '\\right' ? '\\right.' : expected) : '}';
    let next = null;
    for (const fix of [first, ...fixes.filter(fix => fix !== first)]) {
      try { return new MathTexParser(text + fix).parse(); }
      catch (cause) { if (!next && atEnd(cause, text.length + fix.length)) next = text + fix; }
    }
    if (!next) return null;
    text = next;
  }
  return null;
}

// The command or environment a mistyped name most likely meant: one edit away (two for longer names), where swapping
// two neighbouring letters is one edit.
const MATH_TEX_STRUCTURE = 'enclose multicolumn hdotsfor intertext frac dfrac tfrac cfrac binom dbinom tbinom genfrac sqrt root left right middle big Big bigg Bigg bigl bigr Bigl Bigr begin end text textbf textit mathrm mathbf operatorname overset underset stackrel buildrel xrightarrow xleftarrow not phantom smash hspace quad qquad color textcolor mathcolor colorbox boxed cancel newcommand renewcommand def ce pu SI si num unit ang SIrange numrange qtyrange dv pdv qty abs norm bra ket braket substack tag label href';
// Every other command the parser accepts: a name being typed toward one of them is not a misspelling.
const MATH_TEX_OTHER = 'TeX let char over LaTeX Set unicode bbox matrix pmatrix bmatrix Bmatrix vmatrix Vmatrix smallmatrix cases atop choose brace brack above overwithdelims atopwithdelims abovewithdelims limits nolimits displaylimits long strut operatornamewithlimits mathop stackbin overunderset xlongequal hphantom vphantom mathstrut rlap llap clap mathrlap mathllap mathclap mspace kern mkern hskip mskip rule raise raisebox lower fcolorbox definecolor fbox bcancel xcancel sout cancelto providecommand gdef edef xdef DeclareMathOperator DeclarePairedDelimiter global outer require url notag nonumber relax allowbreak nobreak protect displaystylelimits mathopen mathclose mathbin mathrel mathord mathinner mathpunct Bra Ket Braket set nicefrac sfrac vcenter prescript sideset accentset underaccent slashed mod bmod pmod pod smashoperator mathmakebox idotsint mmlToken textbackslash textasciitilde textasciicircum mathchoice verb';
let mathTexNames;
function mathSuggest(name, environment = false) {
  if (typeof name !== 'string' || name.length < 2 || name.length > 32) return undefined;
  mathTexNames ||= {command: [...new Set([...MATH_TEX_STRUCTURE.split(' '), ...MATH_TEX_OTHER.split(' '), ...Object.keys(MATH_SYMBOLS), ...Object.keys(MATH_TEX_VARIANTS), ...Object.keys(MATH_TEX_TEXT_VARIANTS),
    ...Object.keys(MATH_TEX_ACCENTS), ...Object.keys(MATH_TEX_DECLARATIONS), ...Object.keys(MATH_TEX_COLONS), ...MATH_TEX_PHYSICS, ...MATH_NAMED_OPERATORS, ...MATH_LIMIT_OPERATORS, ...Object.keys(MATH_TEX_SPACES), ...Object.keys(MATH_TEX_LONG_ARROWS)])], environment: [...MATH_TEX_ENVIRONMENTS]};
  const limit = name.length > 5 ? 2 : 1;
  let best, bestDistance = limit + 1;
  for (const candidate of mathTexNames[environment ? 'environment' : 'command']) {
    if (Math.abs(candidate.length - name.length) > limit) continue;
    const d = Array.from({length: name.length + 1}, (_, i) => [i, ...Array(candidate.length).fill(0)]);
    for (let j = 1; j <= candidate.length; j++) d[0][j] = j;
    for (let i = 1; i <= name.length; i++) for (let j = 1; j <= candidate.length; j++) {
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (name[i - 1] === candidate[j - 1] ? 0 : 1));
      if (i > 1 && j > 1 && name[i - 1] === candidate[j - 2] && name[i - 2] === candidate[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
    if (d[name.length][candidate.length] < bestDistance) { best = candidate; bestDistance = d[name.length][candidate.length]; }
  }
  return best === undefined ? undefined : (environment ? best : '\\' + best);
}

import {MATH_SYMBOLS, MATH_NAMED_OPERATORS, MATH_LIMIT_OPERATORS} from './symbols.js';
export {parseMathTex, parseMathTexPreview, mathSuggest, mathChoice, mathTableDelimiters};
