// SPDX-License-Identifier: MIT

export function js(acorn) {
  return (text, {language} = {}) => {
    if (language != null && !/^(?:js|javascript|mjs|cjs|ecmascript|html?|xhtml)$/i.test(language)) return null;
    const parts = [], links = [], uses = [], annex = [], evals = [], members = new Map(), roots = new Set(), identities = new Map();
    const identity = name => { const n = identities.get(name) || 0; identities.set(name, n + 1); return '@' + name + (n ? '~' + n : ''); };
    const scope = (parent, label = '', variable = false, strict = false, owner = '') => {
      const ordinal = parent ? parent.id + '/s' + parent.scopes++ : 's0';
      const row = {parent, label, id: owner ? identity(owner) : ordinal,
        names: new Map(), scopes: 0, bindings: 0, strict: strict || !!parent?.strict};
      row.variable = variable || !parent ? row : parent.variable;
      return row;
    };
    const root = scope(null, '', true);
    const named = (s, name) => s.label ? s.label + '/' + name : name;
    let offset = 0;
    const span = node => [offset + node.start, offset + node.end];
    const part = (node, kind, name, into, nameNode) => {
      const [start, end] = span(node), row = {start, end, kind, name, children: []};
      if (nameNode) row.nameAt = span(nameNode);
      into.push(row);
      return row;
    };
    const binding = (node, s, into, whole = node, kind = 'declaration') => {
      if (!node) return;
      if (node.type !== 'Identifier') {
        for (const child of pattern(node)) binding(child, s, into);
        return;
      }
      let found = s.names.get(node.name);
      if (found?.part) {
        links.push({at: span(node), to: found.part.name, key: found.part.key});
        return whole !== node ? part(whole, kind, named(s, node.name), into, node) : found.part;
      }
      const row = part(whole, kind, named(s, node.name), into, node);
      row.key = s.id + '/b' + s.bindings++;
      s.names.set(node.name, {part: row});
      return row;
    };
    function pattern(node) {
      if (!node) return [];
      if (node.type === 'Identifier') return [node];
      if (node.type === 'RestElement') return pattern(node.argument);
      if (node.type === 'AssignmentPattern') return pattern(node.left);
      if (node.type === 'ArrayPattern') return node.elements.flatMap(pattern);
      if (node.type === 'ObjectPattern') return node.properties.flatMap(p => pattern(p.type === 'RestElement' ? p.argument : p.value));
      return [];
    }
    function patternExpressions(node, s, into) {
      if (!node || node.type === 'Identifier') return;
      if (node.type === 'AssignmentPattern') { patternExpressions(node.left, s, into); walk(node.right, s, into); }
      else if (node.type === 'RestElement') patternExpressions(node.argument, s, into);
      else if (node.type === 'ArrayPattern') node.elements.forEach(n => patternExpressions(n, s, into));
      else if (node.type === 'ObjectPattern') for (const p of node.properties) {
        if (p.computed) walk(p.key, s, into);
        patternExpressions(p.type === 'RestElement' ? p.argument : p.value, s, into);
      }
    }
    function parameterExpression(node) {
      if (!node) return false;
      if (node.type === 'AssignmentPattern') return true;
      if (node.type === 'RestElement') return parameterExpression(node.argument);
      if (node.type === 'ArrayPattern') return node.elements.some(parameterExpression);
      if (node.type === 'ObjectPattern') return node.properties.some(p => p.computed || parameterExpression(p.type === 'RestElement' ? p.argument : p.value));
      return false;
    }
    const lookup = (s, name) => {
      for (; s; s = s.parent) {
        const found = s.names.get(name);
        if (found) return found;
        if (s.dynamic) return {ambiguous: true};
      }
      return null;
    };
    const strictBody = node => {
      for (const n of Array.isArray(node?.body) ? node.body : []) {
        if (!n.directive) break;
        if (n.directive === 'use strict') return true;
      }
      return false;
    };
    const accessor = (member, name, label, accessors, into) => {
      const first = !member.computed && /^[gs]et$/.test(member.kind) && accessors.get(name);
      if (first?.kind === member.kind || !first) {
        const p = part(member, 'declaration', name, into, member.computed ? null : member.key);
        if (/^[gs]et$/.test(member.kind) && !member.computed) accessors.set(name, {kind: member.kind, part: p});
        return p;
      }
      links.push({at: span(member.key), to: name, key: first.part.key});
      return part(member, 'declaration', label + member.kind + ':' + keyText(member.key), into);
    };
    const keyText = (node, computed) => !computed && (node.type === 'Identifier' || node.type === 'PrivateIdentifier')
      ? (node.type === 'PrivateIdentifier' ? '#' : '') + node.name
      : node.type === 'Literal' ? String(node.value) : '[' + text.slice(...span(node)) + ']';
    const expressionName = node => node.type === 'Identifier' ? node.name
      : node.type === 'ThisExpression' ? 'this'
      : node.type === 'Super' ? 'super'
      : node.type === 'MemberExpression' ? expressionName(node.object) + '.' + keyText(node.property, node.computed) : '';
    function functionBody(node, outer, into, owner) {
      let names = outer;
      if (node.type === 'FunctionExpression' && node.id) {
        names = scope(outer, (owner || named(outer, node.id.name)) + '/{name}', false, false, owner && owner + '/name');
        binding(node.id, names, into);
      }
      const args = scope(names, owner || named(outer, '(function:' + outer.scopes + ')'), true, strictBody(node.body), owner && owner + '/parameters');
      for (const p of node.params) for (const id of pattern(p)) binding(id, args, into);
      if (node.type !== 'ArrowFunctionExpression' && !args.names.has('arguments')) args.names.set('arguments', {part: null});
      for (const p of node.params) patternExpressions(p, args, into);
      const body = scope(args, args.label + '/{body}', true);
      if (!node.params.some(parameterExpression)) {
        for (const [name, value] of args.names) body.names.set(name, value);
      }
      body.self = node.type === 'ArrowFunctionExpression' || outer.method ? outer.self : null;
      if (node.body.type === 'BlockStatement') for (const n of node.body.body) walk(n, body, into);
      else walk(node.body, body, into);
    }
    function classBody(node, outer, into, owner) {
      const s = scope(outer, owner || named(outer, '(class:' + outer.scopes + ')'), false, true, owner && owner + '/class');
      roots.add(s.label + '/').add(s.label + '/static:');
      if (node.id) {
        const existing = node.type === 'ClassDeclaration' ? lookup(outer, node.id.name) : null;
        if (existing) s.names.set(node.id.name, existing);
        else binding(node.id, s, into);
      }
      if (node.superClass) walk(node.superClass, s, into);
      const accessors = new Map();
      for (const member of node.body.body) {
        if (member.type === 'StaticBlock') {
          const p = part(member, 'scope', s.label + '/static', into);
          const block = scope(s, p.name, true, true);
          block.self = s.label + '/static:';
          for (const n of member.body) walk(n, block, p.children);
          continue;
        }
        const label = s.label + '/' + (member.static ? 'static:' : ''), name = label + keyText(member.key, member.computed);
        const p = accessor(member, name, label, accessors, into);
        if (member.computed) walk(member.key, s, p.children);
        p.key = s.id + '/b' + s.bindings++;
        members.set(p.name, p);
        if (member.value) {
          const own = scope(s, name);
          own.self = s.label + '/' + (member.static ? 'static:' : ''); own.method = true;
          value(member.value, own, p.children, name);
        }
      }
    }
    function value(node, s, into, owner) {
      if (/^(?:FunctionExpression|ArrowFunctionExpression)$/.test(node.type)) functionBody(node, s, into, owner);
      else if (node.type === 'ClassExpression') classBody(node, s, into, owner);
      else if (node.type === 'ObjectExpression' && owner) {
        const id = identity(owner + '/object');
        roots.add(owner + '/');
        let index = 0;
        const accessors = new Map();
        for (const property of node.properties) {
          if (property.type === 'SpreadElement') { walk(property.argument, s, into); continue; }
          const name = owner + '/' + keyText(property.key, property.computed);
          const p = accessor(property, name, owner + '/', accessors, into);
          if (property.computed) walk(property.key, s, p.children);
          p.key = id + '/property' + index++;
          members.set(p.name, p);
          const own = property.value.type === 'FunctionExpression' ? scope(s, name) : s;
          if (own !== s) { own.self = owner + '/'; own.method = true; }
          value(property.value, own, p.children, name);
        }
      } else walk(node, s, into);
    }
    function walk(node, s, into) {
      if (!node) return;
      const type = node.type;
      if (type === 'Identifier') { uses.push({node, s, at: span(node)}); return; }
      if (type === 'PrivateIdentifier') return;
      if (type === 'FunctionDeclaration') {
        const p = node.id ? binding(node.id, s, into, node) : part(node, 'declaration', named(s, 'default'), into);
        if (p && node.id && !s.strict && s !== s.variable) annex.push({s, name: node.id.name, part: p});
        functionBody(node, s, p?.children || into, p?.name);
        return;
      }
      if (type === 'ClassDeclaration') {
        const p = node.id ? binding(node.id, s, into, node) : part(node, 'declaration', named(s, 'default'), into);
        classBody(node, s, p?.children || into, p?.name);
        return;
      }
      if (type === 'FunctionExpression' || type === 'ArrowFunctionExpression') { functionBody(node, s, into); return; }
      if (type === 'ClassExpression') { classBody(node, s, into); return; }
      if (type === 'VariableDeclaration') {
        const lone = node.declarations.length === 1, group = lone ? into
          : part(node, 'statement', node.declarations.map(d => text.slice(...span(d.id))).join(', '), into).children;
        for (const declarator of node.declarations) {
          const target = node.kind === 'var' ? s.variable : s, whole = lone ? node : declarator;
          const p = declarator.id.type === 'Identifier'
            ? binding(declarator.id, target, group, whole)
            : part(whole, 'declaration', named(s, text.slice(...span(declarator.id))), group);
          if (declarator.id.type !== 'Identifier') for (const id of pattern(declarator.id)) binding(id, target, p.children);
          patternExpressions(declarator.id, s, p?.children || group);
          if (declarator.init) value(declarator.init, s, p?.children || group, p?.name);
        }
        return;
      }
      if (type === 'ImportDeclaration') {
        const importedNames = node.specifiers.map(spec => spec.type === 'ImportDefaultSpecifier' ? 'default'
          : spec.type === 'ImportNamespaceSpecifier' ? '*' : spec.imported.name ?? spec.imported.value);
        const p = part(node, 'import', String(node.source.value) + ':' + importedNames.join(','), into);
        for (const spec of node.specifiers) {
          binding(spec.local, s, p.children, spec);
          const exported = spec.type === 'ImportDefaultSpecifier' ? 'default'
            : spec.type === 'ImportNamespaceSpecifier' ? '*' : spec.imported.name ?? spec.imported.value;
          links.push({at: span(spec.imported || spec.local), to: String(node.source.value) + '#' + exported});
        }
        return;
      }
      if (type.startsWith('Export')) {
        const name = type === 'ExportDefaultDeclaration' ? 'default'
          : node.declaration ? node.declaration.id?.name || node.declaration.declarations?.flatMap(d => pattern(d.id).map(n => n.name)).join(',') || '*'
          : node.exported?.name ?? node.exported?.value ?? node.specifiers?.map(spec => spec.exported.name ?? spec.exported.value).join(',') ?? '*';
        const p = part(node, 'export', named(s, 'export:' + name), into);
        if (node.declaration) walk(node.declaration, s, p.children);
        for (const spec of node.specifiers || []) {
          const exported = part(spec, 'export', named(s, 'export:' + (spec.exported.name ?? spec.exported.value)), p.children, spec.exported);
          if (node.source) links.push({at: span(spec.local), to: String(node.source.value) + '#' + (spec.local.name ?? spec.local.value)});
          else walk(spec.local, s, exported.children);
        }
        if (node.source && type === 'ExportAllDeclaration') links.push({at: span(node.source), to: String(node.source.value) + '#*'});
        return;
      }
      if (type === 'BlockStatement' || type === 'StaticBlock') {
        const p = part(node, 'scope', named(s, '{block:' + s.scopes + '}'), into);
        const child = scope(s, p.name, type === 'StaticBlock');
        child.self = s.self;
        for (const n of node.body) walk(n, child, p.children);
        return;
      }
      if (type === 'CatchClause') {
        const p = part(node, 'scope', named(s, '{catch:' + s.scopes + '}'), into), child = scope(s, p.name);
        for (const id of pattern(node.param)) binding(id, child, p.children);
        patternExpressions(node.param, child, p.children);
        walk(node.body, child, p.children);
        return;
      }
      if (type === 'ForStatement' || type === 'ForInStatement' || type === 'ForOfStatement' || type === 'SwitchStatement') {
        const p = part(node, 'scope', named(s, '{' + (type === 'SwitchStatement' ? 'switch:' : 'loop:') + s.scopes + '}'), into);
        if (type === 'SwitchStatement') walk(node.discriminant, s, p.children);
        const child = scope(s, p.name);
        child.self = s.self;
        for (const key of ['init', 'left', 'right', 'test', 'update', 'body']) if (node[key]) walk(node[key], child, p.children);
        for (const c of node.cases || []) { walk(c.test, child, p.children); for (const n of c.consequent) walk(n, child, p.children); }
        return;
      }
      if (type === 'WithStatement') {
        walk(node.object, s, into);
        const child = scope(s, s.label); child.dynamic = true;
        walk(node.body, child, into);
        return;
      }
      if (type === 'MemberExpression') {
        walk(node.object, s, into);
        if (node.computed) walk(node.property, s, into);
        if (!node.computed || node.property.type === 'Literal') uses.push({node, s, at: span(node.property), member: true});
        return;
      }
      if (type === 'CallExpression' || type === 'NewExpression') {
        const p = part(node, 'call', 'call ' + expressionName(node.callee), into);
        if (type === 'CallExpression' && !node.optional && node.callee.type === 'Identifier' && node.callee.name === 'eval') evals.push(s);
        walk(node.callee, s, p.children);
        for (const a of node.arguments) walk(a, s, p.children);
        return;
      }
      if (type === 'Property') {
        if (node.computed) walk(node.key, s, into);
        walk(node.value, s, into);
        return;
      }
      if (type === 'LabeledStatement') { walk(node.body, s, into); return; }
      if (type === 'BreakStatement' || type === 'ContinueStatement' || type === 'MetaProperty') return;
      for (const key of Object.keys(node)) {
        const child = node[key];
        if (Array.isArray(child)) { for (const n of child) if (n?.type) walk(n, s, into); }
        else if (child?.type) walk(child, s, into);
      }
    }
    const meaning = [];
    const semantic = function (key, value) {
      if (/^(start|end|loc|range)$/.test(key) || key === 'raw' && this.type === 'Literal') return;
      return typeof value === 'number' && !Number.isFinite(value) ? {number: String(value)}
        : typeof value === 'bigint' ? String(value) : value;
    };
    const parse = (source, type) => {
      const comments = [];
      const tree = acorn.parse(source, {ecmaVersion: 'latest', sourceType: type, allowHashBang: true,
        onComment: (block, value) => comments.push([block, value])});
      tree.comments = comments;
      return tree;
    };
    let ast;
    if (!/^\s*</.test(text)) {
      try { ast = parse(text, 'script'); }
      catch (first) { try { ast = parse(text, 'module'); } catch { throw first; } }
    }
    if (ast) {
      meaning.push(ast);
      root.strict = ast.sourceType === 'module' || strictBody(ast);
      for (const node of ast.body) walk(node, root, parts);
    } else {
      const tags = /<(!--[\s\S]*?--|\/?([A-Za-z][\w:-]*)\b(?:"[^"]*"|'[^']*'|[^'">])*)>/g;
      let tag, serial = 0, template = 0, last = 0;
      while ((tag = tags.exec(text))) {
        const name = (tag[2] || '').toLowerCase(), closing = tag[1][0] === '/';
        if (name === 'template') { template += closing ? -Math.min(1, template) : 1; continue; }
        if (closing || !/^(script|style|textarea|title|xmp|iframe|noembed|noframes|noscript)$/.test(name)) continue;
        const close = new RegExp('</' + name + '\\s*>', 'ig'); close.lastIndex = tags.lastIndex;
        const end = close.exec(text), from = tags.lastIndex, to = end ? end.index : text.length;
        tags.lastIndex = end ? close.lastIndex : text.length;
        if (name !== 'script' || template) continue;
        const attrs = new Map();
        for (const m of tag[1].slice(name.length).matchAll(/([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g)) {
          if (!attrs.has(m[1].toLowerCase())) attrs.set(m[1].toLowerCase(), m[2] ?? m[3] ?? m[4] ?? '');
        }
        const type = (attrs.get('type') || '').trim().toLowerCase().split(';')[0];
        if (attrs.has('src') || type && type !== 'module' && !/^(text|application)\/(javascript|ecmascript)$/.test(type)) continue;
        const p = {start: tag.index, end: tags.lastIndex, kind: 'script', name: 'script:' + ++serial, children: []};
        parts.push(p);
        offset = from;
        const parsed = parse(text.slice(from, to), type === 'module' ? 'module' : 'script');
        meaning.push(text.slice(last, from), parsed); last = to;
        const s = type === 'module' ? scope(root, p.name, true, true) : root;
        if (strictBody(parsed)) s.strict = true;
        for (const node of parsed.body) walk(node, s, p.children);
      }
      if (!serial) throw new SyntaxError('No JavaScript');
      meaning.push(text.slice(last));
    }
    function memberName(node, s) {
      if (node.type === 'Identifier') return lookup(s, node.name)?.part?.name || node.name;
      if (node.type === 'ThisExpression') { for (; s; s = s.parent) if (Object.hasOwn(s, 'self')) return s.self || ''; return ''; }
      if (node.type !== 'MemberExpression' || node.computed && node.property.type !== 'Literal') return '';
      const base = memberName(node.object, s), suffix = keyText(node.property, node.computed);
      return base.endsWith('/') || base.endsWith(':') ? base + suffix : base + '/' + suffix;
    }
    for (const row of annex) {
      let blocked = false;
      for (let s = row.s.parent; s; s = s.parent) {
        if (s.names.has(row.name)) { blocked = true; break; }
        if (s === row.s.variable) break;
      }
      if (!blocked) row.s.variable.names.set(row.name, {part: row.part});
    }
    for (const s of evals) if (!s.strict && !lookup(s, 'eval')) s.variable.dynamic = true;
    for (const use of uses) {
      const resolved = use.member ? null : lookup(use.s, use.node.name);
      if (resolved?.ambiguous) continue;
      const base = use.member && memberName(use.node.object, use.s), name = use.member ? memberName(use.node, use.s) : use.node.name;
      const found = use.member ? members.get(name) || members.get(base + '/static:' + keyText(use.node.property, use.node.computed)) : resolved?.part;
      if (!use.member || found || name && roots.has(/[/:]$/.test(base) ? base : base + '/'))
        links.push({at: use.at, to: found?.name || name, ...(found?.key ? {key: found.key} : {})});
    }
    const tidy = rows => { rows.sort((a, b) => a.start - b.start || b.end - a.end); for (const row of rows) { tidy(row.children); if (!row.children.length) delete row.children; } };
    tidy(parts);
    links.sort((a, b) => a.at[0] - b.at[0] || a.at[1] - b.at[1]);
    return {parts, links, meaning: JSON.stringify(meaning, semantic)};
  };
}
