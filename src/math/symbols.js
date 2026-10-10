// SPDX-License-Identifier: MIT
// Command spellings name Unicode characters; glyph outlines belong to the font.
const MATH_SYMBOLS = Object.create(null);
function mathSymbolGroup(kind, entries, extra) {
  for (const entry of entries.trim().split(/\s+/)) {
    const split = entry.indexOf('=');
    const value = entry.slice(split + 1);
    for (const name of entry.slice(0, split).split('/'))
      MATH_SYMBOLS[name] = Object.freeze({type: 'glyph', value, class: kind, ...extra});
  }
}
mathSymbolGroup('ord', `
alpha=α beta=β gamma=γ delta=δ epsilon=ϵ varepsilon=ε zeta=ζ eta=η theta=θ vartheta=ϑ
iota=ι kappa=κ varkappa=ϰ lambda=λ mu=μ nu=ν xi=ξ omicron=ο pi=π varpi=ϖ rho=ρ varrho=ϱ
sigma=σ varsigma=ς tau=τ upsilon=υ phi=ϕ varphi=φ chi=χ psi=ψ omega=ω digamma=ϝ
Gamma=Γ Delta=Δ Theta=Θ Lambda=Λ Xi=Ξ Pi=Π Sigma=Σ Upsilon=Υ Phi=Φ Psi=Ψ Omega=Ω
varGamma=Γ varDelta=Δ varTheta=Θ varLambda=Λ varXi=Ξ varPi=Π varSigma=Σ varUpsilon=Υ varPhi=Φ varPsi=Ψ varOmega=Ω
aleph=ℵ beth=ℶ gimel=ℷ daleth=ℸ ell=ℓ hbar=ℏ hslash=ℏ imath=𝚤 jmath=𝚥
Re=ℜ Im=ℑ wp=℘ partial=∂ nabla=∇ infty=∞ emptyset=∅ varnothing=∅ complement=∁
top=⊤ bot=⊥ forall=∀ exists=∃ nexists=∄ neg/lnot=¬ angle=∠ measuredangle=∡ sphericalangle=∢
triangle=△ blacktriangle=▴ triangledown=▽ blacktriangledown=▾ square/Box=□ blacksquare=■ Diamond=◇ blacklozenge=◆ lozenge=◊
clubsuit=♣ diamondsuit=♢ heartsuit=♡ spadesuit=♠ checkmark=✓ maltese=✠ yen=¥ pounds=£ euro=€
S=§ P=¶ copyright=© circledR=® circledS=Ⓢ mho=℧ Finv=Ⅎ Game=⅁ eth=ð
prime=′ backprime=‵ doubleprime=″ tripleprime=‴ degree=° flat=♭ natural=♮ sharp=♯
surd=√ diagup=╱ diagdown=╲ Bbbk=𝕜
`, {variant: 'roman'});
// Lowercase Greek retains the ordinary mathematical italic convention.
for (const name of 'alpha beta gamma delta epsilon varepsilon zeta eta theta vartheta iota kappa varkappa lambda mu nu xi omicron pi varpi rho varrho sigma varsigma tau upsilon phi varphi chi psi omega digamma'.split(' '))
  MATH_SYMBOLS[name] = Object.freeze({...MATH_SYMBOLS[name], variant: 'normal'});
for (const name of Object.keys(MATH_SYMBOLS).filter(name => /^var[A-Z]/.test(name)))
  MATH_SYMBOLS[name] = Object.freeze({...MATH_SYMBOLS[name], variant: 'italic'});
mathSymbolGroup('bin', `
pm=± mp=∓ times=× div=÷ cdot=⋅ cdotp=⋅ ast=∗ star=⋆ circ=∘ bullet=∙ diamond=⋄
cap=∩ cup=∪ uplus=⊎ sqcap=⊓ sqcup=⊔ vee/lor=∨ wedge/land=∧ setminus=∖ smallsetminus=∖
oplus=⊕ ominus=⊖ otimes=⊗ oslash=⊘ odot=⊙ bigcirc=◯ dag/dagger=† ddag/ddagger=‡ amalg=⨿
triangleleft=◁ triangleright=▷ lhd=⊲ rhd=⊳ unlhd=⊴ unrhd=⊵ wr=≀
barwedge=⊼ veebar=⊻ doublebarwedge=⩞ curlywedge=⋏ curlyvee=⋎ boxplus=⊞ boxminus=⊟ boxtimes=⊠ boxdot=⊡
ltimes=⋉ rtimes=⋊ leftthreetimes=⋋ rightthreetimes=⋌ dotplus=∔ divideontimes=⋇
circledast=⊛ circledcirc=⊚ circleddash=⊝ intercal=⊺ centerdot=· land=∧ lor=∨ bigtriangleup=△ bigtriangledown=▽
`, {variant: 'roman'});
mathSymbolGroup('rel', `
le/leq=≤ ge/geq=≥ neq/ne=≠ equiv=≡ sim=∼ simeq=≃ approx=≈ cong=≅ asymp=≍ propto=∝
ll=≪ gg=≫ prec=≺ succ=≻ preceq=⪯ succeq=⪰ subset=⊂ supset=⊃ subseteq=⊆ supseteq=⊇
sqsubset=⊏ sqsupset=⊐ sqsubseteq=⊑ sqsupseteq=⊒ in=∈ ni/owns=∋ notin=∉ notni=∌
vdash=⊢ dashv=⊣ models=⊨ perp=⊥ mid=∣ parallel=∥ smile=⌣ frown=⌢ bowtie=⋈ Join=⋈
doteq=≐ dotsim=≐ doteqdot/Doteq=≑ triangleq=≜ bumpeq=≏ Bumpeq=≎ eqcirc=≖ circeq=≗
risingdotseq=≓ fallingdotseq=≒ eqsim=≂ backsim=∽ backsimeq=⋍ approxeq=≊
lesssim=≲ gtrsim=≳ lessapprox=⪅ gtrapprox=⪆ lessdot=⋖ gtrdot=⋗ lesseqgtr=⋚ gtreqless=⋛
lesseqqgtr=⪋ gtreqqless=⪌ lessgtr=≶ gtrless=≷ lll/llless=⋘ ggg/gggtr=⋙
leqq=≦ geqq=≧ leqslant=⩽ geqslant=⩾ eqslantless=⪕ eqslantgtr=⪖
precsim=≾ succsim=≿ precapprox=⪷ succapprox=⪸ preccurlyeq=≼ succcurlyeq=≽ curlyeqprec=⋞ curlyeqsucc=⋟
Subset=⋐ Supset=⋑ subseteqq=⫅ supseteqq=⫆ pitchfork=⋔ between=≬ Vdash=⊩ Vvdash=⊪ vDash=⊨ VDash=⊫
blacktriangleleft=◂ blacktriangleright=▸ vartriangleleft=⊲ vartriangleright=⊳ trianglelefteq=⊴ trianglerighteq=⊵
varpropto=∝ shortmid=∣ shortparallel=∥ smallsmile=⌣ smallfrown=⌢ therefore=∴ because=∵
nless=≮ ngtr=≯ nleq=≰ ngeq=≱ nleqq=≰ ngeqq=≱ nleqslant=≰ ngeqslant=≱ lneq=⪇ gneq=⪈ lneqq=≨ gneqq=≩
lvertneqq=≨ gvertneqq=≩ nsim=≁ ncong=≇ napprox=≉ lnsim=⋦ gnsim=⋧ lnapprox=⪉ gnapprox=⪊
nprec=⊀ nsucc=⊁ npreceq=⋠ nsucceq=⋡ precneqq=⪵ succneqq=⪶ precnsim=⋨ succnsim=⋩ precnapprox=⪹ succnapprox=⪺
nsubset=⊄ nsupset=⊅ nsubseteq=⊈ nsupseteq=⊉ nsubseteqq=⊈ nsupseteqq=⊉ subsetneq=⊊ supsetneq=⊋
varsubsetneq=⊊ varsupsetneq=⊋ subsetneqq=⫋ supsetneqq=⫌ varsubsetneqq=⫋ varsupsetneqq=⫌
nmid=∤ nparallel=∦ nshortmid=∤ nshortparallel=∦ nvdash=⊬ nVdash=⊮ nvDash=⊭ nVDash=⊯
ntriangleleft=⋪ ntriangleright=⋫ ntrianglelefteq=⋬ ntrianglerighteq=⋭ coloneqq/coloneq=≔ eqqcolon=≕
`, {variant: 'roman'});
mathSymbolGroup('rel', `
leftarrow/gets=← rightarrow/to=→ leftrightarrow=↔ Leftarrow=⇐ Rightarrow=⇒ Leftrightarrow=⇔
longleftarrow=⟵ longrightarrow=⟶ longleftrightarrow=⟷ Longleftarrow=⟸ Longrightarrow=⟹ Longleftrightarrow=⟺
mapsto=↦ longmapsto=⟼ hookleftarrow=↩ hookrightarrow=↪ nearrow=↗ searrow=↘ nwarrow=↖ swarrow=↙
uparrow=↑ downarrow=↓ updownarrow=↕ Uparrow=⇑ Downarrow=⇓ Updownarrow=⇕
leftharpoonup=↼ leftharpoondown=↽ rightharpoonup=⇀ rightharpoondown=⇁ rightleftharpoons=⇌ leftrightharpoons=⇋
upharpoonleft=↿ upharpoonright=↾ downharpoonleft=⇃ downharpoonright=⇂ restriction=↾
leftrightarrows=⇆ rightleftarrows=⇄ leftleftarrows=⇇ rightrightarrows=⇉ upuparrows=⇈ downdownarrows=⇊
Lleftarrow=⇚ Rrightarrow=⇛ twoheadleftarrow=↞ twoheadrightarrow=↠ leftarrowtail=↢ rightarrowtail=↣
looparrowleft=↫ looparrowright=↬ leftrightsquigarrow=↭ rightsquigarrow/leadsto=⇝ curvearrowleft=↶ curvearrowright=↷
circlearrowleft=↺ circlearrowright=↻ dashleftarrow=⇠ dashrightarrow=⇢ multimap=⊸
nleftarrow=↚ nrightarrow=↛ nleftrightarrow=↮ nLeftarrow=⇍ nRightarrow=⇏ nLeftrightarrow=⇎
`, {variant: 'roman'});
mathSymbolGroup('op', `
sum=∑ prod=∏ coprod=∐ bigcup=⋃ bigcap=⋂ bigvee=⋁ bigwedge=⋀ biguplus=⨄ bigsqcup=⨆
bigotimes=⨂ bigoplus=⨁ bigodot=⨀ bigamalg=⨿ bigsqcap=⨅
`, {large: true, limits: 'display', variant: 'roman'});
mathSymbolGroup('op', `
int=∫ iint=∬ iiint=∭ iiiint=⨌ oint=∮ oiint=∯ oiiint=∰ intop=∫ smallint=∫
intclockwise=∱ varointclockwise=∲ ointctrclockwise=∳ sumint=⨋
`, {large: true, limits: 'never', variant: 'roman'});
MATH_SYMBOLS.intop = Object.freeze({...MATH_SYMBOLS.intop, limits: 'display'});
MATH_SYMBOLS.smallint = Object.freeze({...MATH_SYMBOLS.smallint, large: false});
mathSymbolGroup('open', 'langle=⟨ lbrace={ lgroup=⟮ lbrack=[ lfloor=⌊ lceil=⌈ lvert=| lVert=‖ lmoustache=⎰', {variant: 'roman'});
mathSymbolGroup('close', 'rangle=⟩ rbrace=} rgroup=⟯ rbrack=] rfloor=⌋ rceil=⌉ rvert=| rVert=‖ rmoustache=⎱', {variant: 'roman'});
mathSymbolGroup('ord', 'vert=| Vert=‖ backslash=∖ slash=/', {variant: 'roman'});
mathSymbolGroup('inner', 'dotsc=… cdots=⋯ dotsb=⋯ dotsm=⋯ dotsi=⋯ dotso=… ddots=⋱ mathellipsis=…', {variant: 'roman'});
mathSymbolGroup('ord', 'vdots=⋮', {variant: 'roman'});
mathSymbolGroup('punct', 'colon=: cdotp=⋅', {variant: 'roman'});
MATH_SYMBOLS.ldots = MATH_SYMBOLS.dots = Object.freeze({type: 'glyph', value: '…', class: 'inner', variant: 'roman'});
for (const [name, symbol] of Object.entries(MATH_SYMBOLS)) {
  const {variant, ...fields} = symbol;
  MATH_SYMBOLS[name] = Object.freeze({...fields, defaultVariant: variant});
}
const MATH_NAMED_OPERATORS = new Set(('arccos arcsin arctan arccot arcsec arccsc cos cosh cot coth csc csch sec sech sin sinh tan tanh exp log ln lg lb det dim gcd hom ker arg deg Pr erf erfc mod').split(' '));
const MATH_LIMIT_OPERATORS = new Set(('lim limsup liminf sup inf max min injlim projlim varlimsup varliminf varinjlim varprojlim').split(' '));
