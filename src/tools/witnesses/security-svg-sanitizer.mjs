// sanitizeSvgText (images/assets.mjs, in Node) strips HTML-in-SVG, handler/listener, src/data/srcdoc and nested
// SVG data images; a Draw SVG passes byte for byte; font data URLs are the font restorer's business.
import {sanitizeSvgText} from '../../images/assets.mjs';
import * as assets from '../../images/assets.mjs';
import assert from 'node:assert/strict';
import * as core from '../../draw/core.mjs';

const IMPORTED = `<?xml version="1.0"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="240" height="160" viewBox="0 0 240 160">
  <!-- Retain the imported drawing's spelling and spacing. -->
  <defs><linearGradient id='shade' gradientTransform="rotate(15)"><stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="#222"/></linearGradient><clipPath id="clip"><rect x="0" y="0" width="200" height="130"/></clipPath></defs>
  <g id="scene" transform='translate(7 11)' clip-path="url(#clip)">
    <path id="outline" d='M 0 0 L 80 0 L 80 60 Z' fill="url(#shade)" style='stroke : #123456; /* keep */ stroke-width: 2; opacity: .8'/>
    <text id="caption" x='8' y="30">Keep <tspan id="word">these &amp; words</tspan> here</text>
    <use id="echo" xlink:href="#outline" x="100"/>
  </g>
</svg>`;

async function importedNodeCells() {
  const bytes = new TextEncoder().encode(IMPORTED), original = await assets.createAsset(bytes, null, {codec:'image/svg+xml'});
  assert.deepEqual(original.bytes, bytes, 'the imported fixture must already be the editor-accepted SVG');
  const inspected = assets.inspectSVG(original.bytes, {nodes:true});
  assert(Array.isArray(inspected.nodes), 'an imported SVG must disclose its editable node identities');
  const byId = name => inspected.nodes.find(node => node.attributes.id === name);
  const outline = byId('outline'), word = byId('word'), caption = byId('caption'), echo = byId('echo');
  assert(outline && word && caption && echo, 'inspection must retain the actual imported SVG nodes');
  assert.equal(word.text, 'these & words', 'node inspection must decode authored character data');
  assert.equal(word.parentId, caption.id, 'nested text retains its actual parent identity');
  assert.equal(outline.style['stroke-width'], '2', 'inline style is inspectable document data');
  assert.equal(outline.geometry.d, 'M 0 0 L 80 0 L 80 60 Z', 'path geometry is inspectable document data');
  const edits = [
    {nodeId:word.id, text:'fresh <words> & snow ☃'},
    {nodeId:outline.id, geometry:{d:'M 0 0 L 90 0 L 90 70 Z'}, attributes:{'data-note':'a "quote"'}, style:{'stroke-width':'3',opacity:null}},
    {nodeId:echo.id, geometry:{x:105}},
  ];
  const changed = assets.editSVGNodes(original.bytes, edits), text = new TextDecoder().decode(changed);
  const expected = IMPORTED.replace('these &amp; words', 'fresh &lt;words&gt; &amp; snow ☃')
    .replace("d='M 0 0 L 80 0 L 80 60 Z'", "d='M 0 0 L 90 0 L 90 70 Z'")
    .replace('stroke-width: 2', 'stroke-width: 3').replace(' opacity: .8', '')
    .replace("style='stroke : #123456; /* keep */ stroke-width: 3;'/>", "style='stroke : #123456; /* keep */ stroke-width: 3;' data-note=\"a &quot;quote&quot;\"/>")
    .replace('x="100"', 'x="105"');
  assert.equal(text, expected, 'only edited text, attributes, style declarations and geometry may change bytes');
  const saved = await assets.createAsset(changed, null, {codec:'image/svg+xml'});
  assert.deepEqual(saved.bytes, changed, 'the editor asset writer must accept the exact edited SVG bytes');
  const reopened = assets.inspectSVG(saved.bytes, {nodes:true});
  assert.deepEqual(reopened.nodes.map(node => node.id), inspected.nodes.map(node => node.id), 'value edits keep inspected object identities stable');
  assert.equal(reopened.nodes.find(node => node.id === word.id).text, 'fresh <words> & snow ☃');
  assert.deepEqual(assets.editSVGNodes(changed, [{nodeId:word.id,text:'fresh <words> & snow ☃'}]), changed, 'an exact no-op keeps original escaped bytes');
  const refused = [
    [{nodeId:outline.id, attributes:{onclick:'alert(1)'}}, 'attributes.onclick'],
    [{nodeId:outline.id, attributes:{'evil:href':'#outline'}}, 'attributes.evil:href'],
    [{nodeId:outline.id, attributes:{xmlns:'http://www.w3.org/1999/xhtml'}}, 'attributes.xmlns'],
    [{nodeId:outline.id, attributes:{'xmlns:evil':'http://example.invalid/ns'}}, 'attributes.xmlns:evil'],
    [{nodeId:echo.id, attributes:{href:'javascript:alert(1)'}}, 'attributes.href'],
    [{nodeId:echo.id, attributes:{'xlink:href':'https://example.invalid/picture.svg'}}, 'attributes.xlink:href'],
    [{nodeId:outline.id, attributes:{style:'fill:red; background:url(https://example.invalid/a)'}}, 'attributes.style'],
    [{nodeId:outline.id, style:{fill:'u\\72l(https://example.invalid/a)'}}, 'style.fill'],
    [{nodeId:outline.id, style:{stroke:'red; fill:blue'}}, 'style.stroke'],
    [{nodeId:outline.id, geometry:{d:'M 0 0 L Infinity 1'}}, 'geometry.d'],
    [{nodeId:caption.id, text:'discard the tspan'}, 'text'],
    [{nodeId:outline.id, element:'script'}, 'element'],
  ];
  for (const [edit, field] of refused) {
    assert.throws(() => assets.editSVGNodes(original.bytes, [edit]), error => error.field === 'svgNodeEdits[0].' + field,
      'a refused SVG edit must name its exact input field: ' + field);
    assert.deepEqual(original.bytes, bytes, 'a refused SVG edit cannot mutate the imported bytes');
  }
  const large = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><desc>' + 'x'.repeat(17000) + '</desc>' + '<path d="M 0 0 L 1 1"/>'.repeat(300) + '</svg>');
  const bounded = assets.inspectSVG(large, {nodes:true});
  assert(bounded.truncated && bounded.totalNodes === 302 && bounded.nodes.length <= 256, 'the node tree must disclose that its bounded inspection omitted source');
  assert(!bounded.nodes.some(node => node.element === 'desc'), 'an oversized node must be omitted whole, never partially disclosed');
  assert(JSON.stringify(bounded).length <= 262144, 'the inspected tree must stay within the document handle budget');
  const edgeFailures = [], edge = (name, run) => { try { run(); } catch (error) { edgeFailures.push(name + ': ' + error.message); } };
  edge('empty namespace stays outside SVG authority', () => {
    const foreign = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><g xmlns=""><text>outside</text></g></svg>');
    const node = assets.inspectSVG(foreign,{nodes:true}).nodes.find(node => node.element === 'text');
    assert.throws(() => assets.editSVGNodes(foreign,[{nodeId:node.id,text:'changed'}]), error => error.field === 'svgNodeEdits[0].nodeId');
  });
  edge('duplicate id outside inspected nodes is refused', () => {
    const distant = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><path id="first" d="M 0 0 L 1 1"/>' + '<path d="M 0 0 L 1 1"/>'.repeat(260) + '<path id="taken" d="M 0 0 L 1 1"/></svg>');
    const node = assets.inspectSVG(distant,{nodes:true}).nodes.find(node => node.attributes.id === 'first');
    assert.throws(() => assets.editSVGNodes(distant,[{nodeId:node.id,attributes:{id:'taken'}}]), error => error.field === 'svgNodeEdits[0].attributes.id');
  });
  edge('missing local style reference names its property', () => {
    assert.throws(() => assets.editSVGNodes(bytes,[{nodeId:outline.id,style:{fill:'url(#missing)'}}]), error => error.field === 'svgNodeEdits[0].style.fill');
  });
  edge('a split CSS identifier cannot consume the next property', () => {
    const comment = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><path d="M 0 0 L 1 1" style="st/*keep*/roke-width:2;fill:red"/></svg>');
    const node = assets.inspectSVG(comment,{nodes:true}).nodes.find(node => node.element === 'path');
    const changed = assets.editSVGNodes(comment,[{nodeId:node.id,style:{'stroke-width':null}}]);
    assert(new TextDecoder().decode(changed).includes('fill:red'), 'the untouched fill declaration must survive');
    const style = assets.inspectSVG(changed,{nodes:true}).nodes.find(candidate => candidate.id === node.id).attributes.style;
    assert(/(?:^|;)fill:red$/.test(style), 'deleting one style must not join its prefix onto the next property');
  });
  edge('the source BOM cannot disappear outside the edit', () => {
    const bom = new Uint8Array(bytes.length + 3); bom.set([0xef,0xbb,0xbf]); bom.set(bytes,3);
    assert.throws(() => assets.editSVGNodes(bom,[{nodeId:word.id,text:'updated'}]), error => error.field === 'svgNodeEdits');
  });
  edge('root sizing cannot be silently restored', () => {
    assert.throws(() => assets.editSVGNodes(bytes,[{nodeId:inspected.nodes[0].id,geometry:{width:null}}]), error => error.field === 'svgNodeEdits[0].geometry.width');
  });
  edge('an undefined field cannot delete an attribute', () => {
    assert.throws(() => assets.editSVGNodes(bytes,[{nodeId:outline.id,attributes:{fill:undefined}}]), error => error.field === 'svgNodeEdits[0].attributes.fill');
  });
  if (edgeFailures.length) { for (const failure of edgeFailures) console.error(failure); assert.fail(edgeFailures.join('\n')); }
  return 'imported SVG nodes keep untouched bytes through inspection, edits and the asset writer; ' + refused.length + ' unsafe or destructive fields refused';
}

const HOSTILE = [
	['iframe javascript', '<svg xmlns="http://www.w3.org/2000/svg"><iframe xmlns="http://www.w3.org/1999/xhtml" src="javascript:alert(1)"></iframe></svg>', /iframe|javascript/i],
	['iframe data html', '<svg xmlns="http://www.w3.org/2000/svg"><iframe src="data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg=="/></svg>', /iframe|data:text/i],
	['embed', '<svg xmlns="http://www.w3.org/2000/svg"><embed src="javascript:alert(1)"/></svg>', /embed|javascript/i],
	['object', '<svg xmlns="http://www.w3.org/2000/svg"><object data="data:text/html;base64,PHNjcmlwdD4="/></svg>', /object|data:text/i],
	['handler', '<svg xmlns="http://www.w3.org/2000/svg"><handler type="application/ecmascript" ev:event="load">alert(1)</handler></svg>', /handler|alert/i],
	['listener', '<svg xmlns="http://www.w3.org/2000/svg"><listener event="load" handler="#h"/><handler id="h">alert(1)</handler></svg>', /listener|handler|alert/i],
	['nested svg image', '<svg xmlns="http://www.w3.org/2000/svg"><image href="data:image/svg+xml;base64,PHN2Zz48c2NyaXB0PmFsZXJ0KDEpPC9zY3JpcHQ+PC9zdmc+"/></svg>', /svg\+xml/i],
	['feImage nested svg', '<svg xmlns="http://www.w3.org/2000/svg"><filter id="f"><feImage href="data:image/svg+xml,%3Csvg%3E"/></filter></svg>', /svg\+xml/i],
	['video src', '<svg xmlns="http://www.w3.org/2000/svg"><video src="https://example.invalid/a.mp4"/></svg>', /video|example\.invalid/i],
	['srcdoc on image', '<svg xmlns="http://www.w3.org/2000/svg"><image srcdoc="<script>alert(1)</script>" href="#x"/></svg>', /srcdoc|alert/i],
];
const HONEST = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><metadata id="rapier-draw">{}</metadata><g data-shape-id="s1"><image data-rapier-paint="s1" x="0" y="0" width="4" height="4" preserveAspectRatio="none" transform="matrix(1 0 0 1 2 2)" href="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=="/></g><use href="#s1"/></svg>';

export default async function (page, t) {
	const failures = [];
	let imported = '';
	try { imported = await importedNodeCells(); } catch (error) { failures.push(error.stack); }
	for (const [name, text, forbidden] of HOSTILE) {
		const out = sanitizeSvgText(text);
		if (forbidden.test(out)) failures.push(name + ' -> ' + out);
	}
	const honest = sanitizeSvgText(HONEST);
	if (honest !== HONEST) failures.push('a Draw SVG with a paint layer changed: ' + honest);
	// The pressed letter (draw/text.mjs `pressed`): whatever a recipe carries, the filter an exported drawing hands a viewer is
	// Rapier's own primitives and numbers under an id of the writer's own minting, nothing fetched or run, and the sanitizer
	// passes it whole, so the effect reaches every viewer.
	const recipe = {version: core.RAPIER_DRAW_VERSION, canvas: {w: 400, h: 200}, strokes: [], shapes: [{id: 'x"><script>alert(1)</script><feImage href="https://example.invalid/a.svg"', recognized: 'text',
		geom: {cx: 200, cy: 100}, label: '<img src=x onerror=alert(1)> & "quoted" url(https://example.invalid/x)', textSize: 28, textEffect: 'pressed'}]};
	const pressed = core._rapierDrawBuildSVG(recipe);
	// Only the markup is scanned for references: the label's own words stand escaped in a text node.
	const markup = pressed.replace(/>[^<]*</g, '><');
	const filter = /<filter id="([^"]*)"/.exec(markup)?.[1] || '', urls = markup.match(/url\([^)]*\)/g) || [];
	const primitives = (pressed.match(/<fe[A-Z][A-Za-z]*/g) || []).filter((tag, i, all) => all.indexOf(tag) === i).sort();
	const allowed = ['<feColorMatrix', '<feComposite', '<feDisplacementMap', '<feGaussianBlur', '<feMerge', '<feMergeNode', '<feOffset', '<feTurbulence'];
	if (!/^rapier-pressed-[\w-]+$/.test(filter) || urls.join() !== 'url(#' + filter + ')' || /href|<script|<img|example\.invalid|<!ENTITY/.test(markup) || !/&lt;img src=x onerror=alert\(1\)&gt; &amp; /.test(pressed) ||
			primitives.some(tag => !allowed.includes(tag)) || sanitizeSvgText(pressed) !== pressed) {
		failures.push('the pressed letter\'s filter is not inert or does not survive the sanitizer: ' + JSON.stringify({filter, urls, primitives, same: sanitizeSvgText(pressed) === pressed}) + ' ' + pressed.slice(0, 400));
	}
	// Both copier scopes consume the retained source. Hostile ids and words must never become
	// resource references or code, and sanitizing the saved file must keep all author settings.
	for (const preset of core.COPIER_PRESETS) {
		const effect = core.copierPreset(preset.id), drawing = core._rapierDrawBuildSVG({...recipe, effect, shapes: recipe.shapes.map(shape => ({...shape, effect}))});
		const clean = sanitizeSvgText(drawing), tags = drawing.replace(/>[^<]*</g, '><');
		const references = tags.match(/url\([^)]*\)/g) || [];
		if (!drawing || clean !== drawing || references.some(url => !/^url\(#rapier-(?:copy|pressed)-[\w-]+\)$/.test(url)) || /href|<script|<img|example\.invalid|<!ENTITY/.test(tags) || !core._rapierDrawReadRecipeFromSVGText(clean)?.effect) failures.push('copier source or inertness lost: ' + preset.id);
	}
	if (failures.length) return t.fail(failures.join('\n'));
	return t.pass(imported + '; ' + HOSTILE.length + ' hostile SVG payloads stripped; ' + core.COPIER_PRESETS.length + ' copier presets at both scopes retain inert source through the sanitizer; a Draw PNG and fragment href pass unchanged; pressed text writes ' + primitives.length + ' inert primitives under its own id, no href, and escapes its label');
}
