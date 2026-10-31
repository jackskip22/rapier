/*! The eight markdown-it plugins as published; their licences are in NOTICE.txt. */
export function createMarkdownPlugins(Math) {
if (!Math || typeof Math.ceil !== 'function' || typeof Math.random !== 'function') throw new TypeError('Markdown plugins need a Math context.');
const root = {};
{
const globalThis = root, window = root, global = root, self = root;
const exports = undefined, module = undefined, define = undefined;
/*! markdown-it-task-lists 2.1.0 https://github.com/revin/markdown-it-task-lists#readme by @license ISC */
(function(f){if(typeof exports==="object"&&typeof module!=="undefined"){module.exports=f()}else if(typeof define==="function"&&define.amd){define([],f)}else{var g;if(typeof window!=="undefined"){g=window}else if(typeof global!=="undefined"){g=global}else if(typeof self!=="undefined"){g=self}else{g=this}g.markdownitTaskLists = f()}})(function(){var define,module,exports;return (function(){function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s}return e})()({1:[function(require,module,exports){

var disableCheckboxes = true;
var useLabelWrapper = false;
var useLabelAfter = false;

module.exports = function(md, options) {
	if (options) {
		disableCheckboxes = !options.enabled;
		useLabelWrapper = !!options.label;
		useLabelAfter = !!options.labelAfter;
	}

	md.core.ruler.after('inline', 'github-task-lists', function(state) {
		var tokens = state.tokens;
		for (var i = 2; i < tokens.length; i++) {
			if (isTodoItem(tokens, i)) {
				todoify(tokens[i], state.Token);
				attrSet(tokens[i-2], 'class', 'task-list-item' + (!disableCheckboxes ? ' enabled' : ''));
				attrSet(tokens[parentToken(tokens, i-2)], 'class', 'contains-task-list');
			}
		}
	});
};

function attrSet(token, name, value) {
	var index = token.attrIndex(name);
	var attr = [name, value];

	if (index < 0) {
		token.attrPush(attr);
	} else {
		token.attrs[index] = attr;
	}
}

function parentToken(tokens, index) {
	var targetLevel = tokens[index].level - 1;
	for (var i = index - 1; i >= 0; i--) {
		if (tokens[i].level === targetLevel) {
			return i;
		}
	}
	return -1;
}

function isTodoItem(tokens, index) {
	return isInline(tokens[index]) &&
	       isParagraph(tokens[index - 1]) &&
	       isListItem(tokens[index - 2]) &&
	       startsWithTodoMarkdown(tokens[index]);
}

function todoify(token, TokenConstructor) {
	token.children.unshift(makeCheckbox(token, TokenConstructor));
	token.children[1].content = token.children[1].content.slice(3);
	token.content = token.content.slice(3);

	if (useLabelWrapper) {
		if (useLabelAfter) {
			token.children.pop();

			var id = 'task-item-' + Math.ceil(Math.random() * (10000 * 1000) - 1000);
			token.children[0].content = token.children[0].content.slice(0, -1) + ' id="' + id + '">';
			token.children.push(afterLabel(token.content, id, TokenConstructor));
		} else {
			token.children.unshift(beginLabel(TokenConstructor));
			token.children.push(endLabel(TokenConstructor));
		}
	}
}

function makeCheckbox(token, TokenConstructor) {
	var checkbox = new TokenConstructor('html_inline', '', 0);
	var disabledAttr = disableCheckboxes ? ' disabled="" ' : '';
	if (token.content.indexOf('[ ] ') === 0) {
		checkbox.content = '<input class="task-list-item-checkbox"' + disabledAttr + 'type="checkbox">';
	} else if (token.content.indexOf('[x] ') === 0 || token.content.indexOf('[X] ') === 0) {
		checkbox.content = '<input class="task-list-item-checkbox" checked=""' + disabledAttr + 'type="checkbox">';
	}
	return checkbox;
}

function beginLabel(TokenConstructor) {
	var token = new TokenConstructor('html_inline', '', 0);
	token.content = '<label>';
	return token;
}

function endLabel(TokenConstructor) {
	var token = new TokenConstructor('html_inline', '', 0);
	token.content = '</label>';
	return token;
}

function afterLabel(content, id, TokenConstructor) {
	var token = new TokenConstructor('html_inline', '', 0);
	token.content = '<label class="task-list-item-label" for="' + id + '">' + content + '</label>';
	token.attrs = [{for: id}];
	return token;
}

function isInline(token) { return token.type === 'inline'; }
function isParagraph(token) { return token.type === 'paragraph_open'; }
function isListItem(token) { return token.type === 'list_item_open'; }

function startsWithTodoMarkdown(token) {
	return token.content.indexOf('[ ] ') === 0 || token.content.indexOf('[x] ') === 0 || token.content.indexOf('[X] ') === 0;
}

},{}]},{},[1])(1)
});
/*! markdown-it-footnote 4.0.0 https://github.com/markdown-it/markdown-it-footnote @license MIT */
(function(global, factory) {
  typeof exports === "object" && typeof module !== "undefined" ? module.exports = factory() : typeof define === "function" && define.amd ? define(factory) : (global = typeof globalThis !== "undefined" ? globalThis : global || self, 
  global.markdownitFootnote = factory());
})(this, (function() {
  "use strict";
  
    function render_footnote_anchor_name(tokens, idx, options, env ) {
    const n = Number(tokens[idx].meta.id + 1).toString();
    let prefix = "";
    if (typeof env.docId === "string") prefix = "-" + env.docId + "-";
    return prefix + n;
  }
  function render_footnote_caption(tokens, idx ) {
    let n = Number(tokens[idx].meta.id + 1).toString();
    if (tokens[idx].meta.subId > 0) n += `:${tokens[idx].meta.subId}`;
    return `[${n}]`;
  }
  function render_footnote_ref(tokens, idx, options, env, slf) {
    const id = slf.rules.footnote_anchor_name(tokens, idx, options, env, slf);
    const caption = slf.rules.footnote_caption(tokens, idx, options, env, slf);
    let refid = id;
    if (tokens[idx].meta.subId > 0) refid += `:${tokens[idx].meta.subId}`;
    return `<sup class="footnote-ref"><a href="#fn${id}" id="fnref${refid}">${caption}</a></sup>`;
  }
  function render_footnote_block_open(tokens, idx, options) {
    return (options.xhtmlOut ? '<hr class="footnotes-sep" />\n' : '<hr class="footnotes-sep">\n') + '<section class="footnotes">\n' + '<ol class="footnotes-list">\n';
  }
  function render_footnote_block_close() {
    return "</ol>\n</section>\n";
  }
  function render_footnote_open(tokens, idx, options, env, slf) {
    let id = slf.rules.footnote_anchor_name(tokens, idx, options, env, slf);
    if (tokens[idx].meta.subId > 0) id += `:${tokens[idx].meta.subId}`;
    return `<li id="fn${id}" class="footnote-item">`;
  }
  function render_footnote_close() {
    return "</li>\n";
  }
  function render_footnote_anchor(tokens, idx, options, env, slf) {
    let id = slf.rules.footnote_anchor_name(tokens, idx, options, env, slf);
    if (tokens[idx].meta.subId > 0) id += `:${tokens[idx].meta.subId}`
    ;
    return ` <a href="#fnref${id}" class="footnote-backref">\u21a9\ufe0e</a>`;
  }
  function footnote_plugin(md) {
    const parseLinkLabel = md.helpers.parseLinkLabel;
    const isSpace = md.utils.isSpace;
    md.renderer.rules.footnote_ref = render_footnote_ref;
    md.renderer.rules.footnote_block_open = render_footnote_block_open;
    md.renderer.rules.footnote_block_close = render_footnote_block_close;
    md.renderer.rules.footnote_open = render_footnote_open;
    md.renderer.rules.footnote_close = render_footnote_close;
    md.renderer.rules.footnote_anchor = render_footnote_anchor;
        md.renderer.rules.footnote_caption = render_footnote_caption;
    md.renderer.rules.footnote_anchor_name = render_footnote_anchor_name;
        function footnote_def(state, startLine, endLine, silent) {
      const start = state.bMarks[startLine] + state.tShift[startLine];
      const max = state.eMarks[startLine];
            if (start + 4 > max) return false;
      if (state.src.charCodeAt(start) !== 91 ) return false;
      if (state.src.charCodeAt(start + 1) !== 94 ) return false;
      let pos;
      for (pos = start + 2; pos < max; pos++) {
        if (state.src.charCodeAt(pos) === 32) return false;
        if (state.src.charCodeAt(pos) === 93 ) {
          break;
        }
      }
      if (pos === start + 2) return false;
            if (pos + 1 >= max || state.src.charCodeAt(++pos) !== 58 ) return false;
      if (silent) return true;
      pos++;
      if (!state.env.footnotes) state.env.footnotes = {};
      if (!state.env.footnotes.refs) state.env.footnotes.refs = {};
      const label = state.src.slice(start + 2, pos - 2);
      state.env.footnotes.refs[`:${label}`] = -1;
      const token_fref_o = new state.Token("footnote_reference_open", "", 1);
      token_fref_o.meta = {
        label: label
      };
      token_fref_o.level = state.level++;
      state.tokens.push(token_fref_o);
      const oldBMark = state.bMarks[startLine];
      const oldTShift = state.tShift[startLine];
      const oldSCount = state.sCount[startLine];
      const oldParentType = state.parentType;
      const posAfterColon = pos;
      const initial = state.sCount[startLine] + pos - (state.bMarks[startLine] + state.tShift[startLine]);
      let offset = initial;
      while (pos < max) {
        const ch = state.src.charCodeAt(pos);
        if (isSpace(ch)) {
          if (ch === 9) {
            offset += 4 - offset % 4;
          } else {
            offset++;
          }
        } else {
          break;
        }
        pos++;
      }
      state.tShift[startLine] = pos - posAfterColon;
      state.sCount[startLine] = offset - initial;
      state.bMarks[startLine] = posAfterColon;
      state.blkIndent += 4;
      state.parentType = "footnote";
      if (state.sCount[startLine] < state.blkIndent) {
        state.sCount[startLine] += state.blkIndent;
      }
      state.md.block.tokenize(state, startLine, endLine, true);
      state.parentType = oldParentType;
      state.blkIndent -= 4;
      state.tShift[startLine] = oldTShift;
      state.sCount[startLine] = oldSCount;
      state.bMarks[startLine] = oldBMark;
      const token_fref_c = new state.Token("footnote_reference_close", "", -1);
      token_fref_c.level = --state.level;
      state.tokens.push(token_fref_c);
      return true;
    }
        function footnote_inline(state, silent) {
      const max = state.posMax;
      const start = state.pos;
      if (start + 2 >= max) return false;
      if (state.src.charCodeAt(start) !== 94 ) return false;
      if (state.src.charCodeAt(start + 1) !== 91 ) return false;
      const labelStart = start + 2;
      const labelEnd = parseLinkLabel(state, start + 1);
            if (labelEnd < 0) return false;
      
            if (!silent) {
        if (!state.env.footnotes) state.env.footnotes = {};
        if (!state.env.footnotes.list) state.env.footnotes.list = [];
        const footnoteId = state.env.footnotes.list.length;
        const tokens = [];
        state.md.inline.parse(state.src.slice(labelStart, labelEnd), state.md, state.env, tokens);
        const token = state.push("footnote_ref", "", 0);
        token.meta = {
          id: footnoteId
        };
        state.env.footnotes.list[footnoteId] = {
          content: state.src.slice(labelStart, labelEnd),
          tokens: tokens
        };
      }
      state.pos = labelEnd + 1;
      state.posMax = max;
      return true;
    }
        function footnote_ref(state, silent) {
      const max = state.posMax;
      const start = state.pos;
            if (start + 3 > max) return false;
      if (!state.env.footnotes || !state.env.footnotes.refs) return false;
      if (state.src.charCodeAt(start) !== 91 ) return false;
      if (state.src.charCodeAt(start + 1) !== 94 ) return false;
      let pos;
      for (pos = start + 2; pos < max; pos++) {
        if (state.src.charCodeAt(pos) === 32) return false;
        if (state.src.charCodeAt(pos) === 10) return false;
        if (state.src.charCodeAt(pos) === 93 ) {
          break;
        }
      }
      if (pos === start + 2) return false;
            if (pos >= max) return false;
      pos++;
      const label = state.src.slice(start + 2, pos - 1);
      if (typeof state.env.footnotes.refs[`:${label}`] === "undefined") return false;
      if (!silent) {
        if (!state.env.footnotes.list) state.env.footnotes.list = [];
        let footnoteId;
        if (state.env.footnotes.refs[`:${label}`] < 0) {
          footnoteId = state.env.footnotes.list.length;
          state.env.footnotes.list[footnoteId] = {
            label: label,
            count: 0
          };
          state.env.footnotes.refs[`:${label}`] = footnoteId;
        } else {
          footnoteId = state.env.footnotes.refs[`:${label}`];
        }
        const footnoteSubId = state.env.footnotes.list[footnoteId].count;
        state.env.footnotes.list[footnoteId].count++;
        const token = state.push("footnote_ref", "", 0);
        token.meta = {
          id: footnoteId,
          subId: footnoteSubId,
          label: label
        };
      }
      state.pos = pos;
      state.posMax = max;
      return true;
    }
        function footnote_tail(state) {
      let tokens;
      let current;
      let currentLabel;
      let insideRef = false;
      const refTokens = {};
      if (!state.env.footnotes) {
        return;
      }
      state.tokens = state.tokens.filter((function(tok) {
        if (tok.type === "footnote_reference_open") {
          insideRef = true;
          current = [];
          currentLabel = tok.meta.label;
          return false;
        }
        if (tok.type === "footnote_reference_close") {
          insideRef = false;
                    refTokens[":" + currentLabel] = current;
          return false;
        }
        if (insideRef) {
          current.push(tok);
        }
        return !insideRef;
      }));
      if (!state.env.footnotes.list) {
        return;
      }
      const list = state.env.footnotes.list;
      state.tokens.push(new state.Token("footnote_block_open", "", 1));
      for (let i = 0, l = list.length; i < l; i++) {
        const token_fo = new state.Token("footnote_open", "", 1);
        token_fo.meta = {
          id: i,
          label: list[i].label
        };
        state.tokens.push(token_fo);
        if (list[i].tokens) {
          tokens = [];
          const token_po = new state.Token("paragraph_open", "p", 1);
          token_po.block = true;
          tokens.push(token_po);
          const token_i = new state.Token("inline", "", 0);
          token_i.children = list[i].tokens;
          token_i.content = list[i].content;
          tokens.push(token_i);
          const token_pc = new state.Token("paragraph_close", "p", -1);
          token_pc.block = true;
          tokens.push(token_pc);
        } else if (list[i].label) {
          tokens = refTokens[`:${list[i].label}`];
        }
        if (tokens) state.tokens = state.tokens.concat(tokens);
        let lastParagraph;
        if (state.tokens[state.tokens.length - 1].type === "paragraph_close") {
          lastParagraph = state.tokens.pop();
        } else {
          lastParagraph = null;
        }
        const t = list[i].count > 0 ? list[i].count : 1;
        for (let j = 0; j < t; j++) {
          const token_a = new state.Token("footnote_anchor", "", 0);
          token_a.meta = {
            id: i,
            subId: j,
            label: list[i].label
          };
          state.tokens.push(token_a);
        }
        if (lastParagraph) {
          state.tokens.push(lastParagraph);
        }
        state.tokens.push(new state.Token("footnote_close", "", -1));
      }
      state.tokens.push(new state.Token("footnote_block_close", "", -1));
    }
    md.block.ruler.before("reference", "footnote_def", footnote_def, {
      alt: [ "paragraph", "reference" ]
    });
    md.inline.ruler.after("image", "footnote_inline", footnote_inline);
    md.inline.ruler.after("footnote_inline", "footnote_ref", footnote_ref);
    md.core.ruler.after("inline", "footnote_tail", footnote_tail);
  }
  return footnote_plugin;
}));
/*! markdown-it-mark 4.0.0 https://github.com/markdown-it/markdown-it-mark @license MIT */
(function(global, factory) {
  typeof exports === "object" && typeof module !== "undefined" ? module.exports = factory() : typeof define === "function" && define.amd ? define(factory) : (global = typeof globalThis !== "undefined" ? globalThis : global || self, 
  global.markdownitMark = factory());
})(this, (function() {
  "use strict";
  function ins_plugin(md) {
    function tokenize(state, silent) {
      const start = state.pos;
      const marker = state.src.charCodeAt(start);
      if (silent) {
        return false;
      }
      if (marker !== 61 ) {
        return false;
      }
      const scanned = state.scanDelims(state.pos, true);
      let len = scanned.length;
      const ch = String.fromCharCode(marker);
      if (len < 2) {
        return false;
      }
      if (len % 2) {
        const token = state.push("text", "", 0);
        token.content = ch;
        len--;
      }
      for (let i = 0; i < len; i += 2) {
        const token = state.push("text", "", 0);
        token.content = ch + ch;
        if (!scanned.can_open && !scanned.can_close) {
          continue;
        }
        state.delimiters.push({
          marker: marker,
          length: 0,
          jump: i / 2,
          token: state.tokens.length - 1,
          end: -1,
          open: scanned.can_open,
          close: scanned.can_close
        });
      }
      state.pos += scanned.length;
      return true;
    }
    
        function postProcess(state, delimiters) {
      const loneMarkers = [];
      const max = delimiters.length;
      for (let i = 0; i < max; i++) {
        const startDelim = delimiters[i];
        if (startDelim.marker !== 61 ) {
          continue;
        }
        if (startDelim.end === -1) {
          continue;
        }
        const endDelim = delimiters[startDelim.end];
        const token_o = state.tokens[startDelim.token];
        token_o.type = "mark_open";
        token_o.tag = "mark";
        token_o.nesting = 1;
        token_o.markup = "==";
        token_o.content = "";
        const token_c = state.tokens[endDelim.token];
        token_c.type = "mark_close";
        token_c.tag = "mark";
        token_c.nesting = -1;
        token_c.markup = "==";
        token_c.content = "";
        if (state.tokens[endDelim.token - 1].type === "text" && state.tokens[endDelim.token - 1].content === "=") {
          loneMarkers.push(endDelim.token - 1);
        }
      }
      
      
            while (loneMarkers.length) {
        const i = loneMarkers.pop();
        let j = i + 1;
        while (j < state.tokens.length && state.tokens[j].type === "mark_close") {
          j++;
        }
        j--;
        if (i !== j) {
          const token = state.tokens[j];
          state.tokens[j] = state.tokens[i];
          state.tokens[i] = token;
        }
      }
    }
    md.inline.ruler.before("emphasis", "mark", tokenize);
    md.inline.ruler2.before("emphasis", "mark", (function(state) {
      let curr;
      const tokens_meta = state.tokens_meta;
      const max = (state.tokens_meta || []).length;
      postProcess(state, state.delimiters);
      for (curr = 0; curr < max; curr++) {
        if (tokens_meta[curr] && tokens_meta[curr].delimiters) {
          postProcess(state, tokens_meta[curr].delimiters);
        }
      }
    }));
  }
  return ins_plugin;
}));
/*! markdown-it-sup 2.0.0 https://github.com/markdown-it/markdown-it-sup @license MIT */
(function(global, factory) {
  typeof exports === "object" && typeof module !== "undefined" ? module.exports = factory() : typeof define === "function" && define.amd ? define(factory) : (global = typeof globalThis !== "undefined" ? globalThis : global || self, 
  global.markdownitSup = factory());
})(this, (function() {
  "use strict";
    const UNESCAPE_RE = /\\([ \\!"#$%&'()*+,./:;<=>?@[\]^_`{|}~-])/g;
  function superscript(state, silent) {
    const max = state.posMax;
    const start = state.pos;
    if (state.src.charCodeAt(start) !== 94 ) {
      return false;
    }
    if (silent) {
      return false;
    }
        if (start + 2 >= max) {
      return false;
    }
    state.pos = start + 1;
    let found = false;
    while (state.pos < max) {
      if (state.src.charCodeAt(state.pos) === 94 ) {
        found = true;
        break;
      }
      state.md.inline.skipToken(state);
    }
    if (!found || start + 1 === state.pos) {
      state.pos = start;
      return false;
    }
    const content = state.src.slice(start + 1, state.pos);
        if (content.match(/(^|[^\\])(\\\\)*\s/)) {
      state.pos = start;
      return false;
    }
        state.posMax = state.pos;
    state.pos = start + 1;
        const token_so = state.push("sup_open", "sup", 1);
    token_so.markup = "^";
    const token_t = state.push("text", "", 0);
    token_t.content = content.replace(UNESCAPE_RE, "$1");
    const token_sc = state.push("sup_close", "sup", -1);
    token_sc.markup = "^";
    state.pos = state.posMax + 1;
    state.posMax = max;
    return true;
  }
  function sup_plugin(md) {
    md.inline.ruler.after("emphasis", "sup", superscript);
  }
  return sup_plugin;
}));
/*! markdown-it-emoji 3.1.0 https://github.com/[object Object] @license MIT */
(function (global, factory) {
  typeof exports === 'object' && typeof module !== 'undefined' ? module.exports = factory() :
  typeof define === 'function' && define.amd ? define(factory) :
  (global = typeof globalThis !== 'undefined' ? globalThis : global || self, global.markdownitEmoji = factory());
})(this, (function () { 'use strict';

  var emojies_defs = {
    "grinning": "😀",
    "smiley": "😃",
    "smile": "😄",
    "grin": "😁",
    "laughing": "😆",
    "satisfied": "😆",
    "sweat_smile": "😅",
    "joy": "😂",
    "wink": "😉",
    "blush": "😊",
    "innocent": "😇",
    "heart_eyes": "😍",
    "kissing_heart": "😘",
    "kissing": "😗",
    "kissing_closed_eyes": "😚",
    "kissing_smiling_eyes": "😙",
    "yum": "😋",
    "stuck_out_tongue": "😛",
    "stuck_out_tongue_winking_eye": "😜",
    "stuck_out_tongue_closed_eyes": "😝",
    "neutral_face": "😐",
    "expressionless": "😑",
    "no_mouth": "😶",
    "smirk": "😏",
    "unamused": "😒",
    "relieved": "😌",
    "pensive": "😔",
    "sleepy": "😪",
    "sleeping": "😴",
    "mask": "😷",
    "dizzy_face": "😵",
    "sunglasses": "😎",
    "confused": "😕",
    "worried": "😟",
    "open_mouth": "😮",
    "hushed": "😯",
    "astonished": "😲",
    "flushed": "😳",
    "frowning": "😦",
    "anguished": "😧",
    "fearful": "😨",
    "cold_sweat": "😰",
    "disappointed_relieved": "😥",
    "cry": "😢",
    "sob": "😭",
    "scream": "😱",
    "confounded": "😖",
    "persevere": "😣",
    "disappointed": "😞",
    "sweat": "😓",
    "weary": "😩",
    "tired_face": "😫",
    "rage": "😡",
    "pout": "😡",
    "angry": "😠",
    "smiling_imp": "😈",
    "smiley_cat": "😺",
    "smile_cat": "😸",
    "joy_cat": "😹",
    "heart_eyes_cat": "😻",
    "smirk_cat": "😼",
    "kissing_cat": "😽",
    "scream_cat": "🙀",
    "crying_cat_face": "😿",
    "pouting_cat": "😾",
    "heart": "❤️",
    "hand": "✋",
    "raised_hand": "✋",
    "v": "✌️",
    "point_up": "☝️",
    "fist_raised": "✊",
    "fist": "✊",
    "monkey_face": "🐵",
    "cat": "🐱",
    "cow": "🐮",
    "mouse": "🐭",
    "coffee": "☕",
    "hotsprings": "♨️",
    "anchor": "⚓",
    "airplane": "✈️",
    "hourglass": "⌛",
    "watch": "⌚",
    "sunny": "☀️",
    "star": "⭐",
    "cloud": "☁️",
    "umbrella": "☔",
    "zap": "⚡",
    "snowflake": "❄️",
    "sparkles": "✨",
    "black_joker": "🃏",
    "mahjong": "🀄",
    "phone": "☎️",
    "telephone": "☎️",
    "envelope": "✉️",
    "pencil2": "✏️",
    "black_nib": "✒️",
    "scissors": "✂️",
    "wheelchair": "♿",
    "warning": "⚠️",
    "aries": "♈",
    "taurus": "♉",
    "gemini": "♊",
    "cancer": "♋",
    "leo": "♌",
    "virgo": "♍",
    "libra": "♎",
    "scorpius": "♏",
    "sagittarius": "♐",
    "capricorn": "♑",
    "aquarius": "♒",
    "pisces": "♓",
    "heavy_multiplication_x": "✖️",
    "heavy_plus_sign": "➕",
    "heavy_minus_sign": "➖",
    "heavy_division_sign": "➗",
    "bangbang": "‼️",
    "interrobang": "⁉️",
    "question": "❓",
    "grey_question": "❔",
    "grey_exclamation": "❕",
    "exclamation": "❗",
    "heavy_exclamation_mark": "❗",
    "wavy_dash": "〰️",
    "recycle": "♻️",
    "white_check_mark": "✅",
    "ballot_box_with_check": "☑️",
    "heavy_check_mark": "✔️",
    "x": "❌",
    "negative_squared_cross_mark": "❎",
    "curly_loop": "➰",
    "loop": "➿",
    "part_alternation_mark": "〽️",
    "eight_spoked_asterisk": "✳️",
    "eight_pointed_black_star": "✴️",
    "sparkle": "❇️",
    "copyright": "©️",
    "registered": "®️",
    "tm": "™️",
    "information_source": "ℹ️",
    "m": "Ⓜ️",
    "black_circle": "⚫",
    "white_circle": "⚪",
    "black_large_square": "⬛",
    "white_large_square": "⬜",
    "black_medium_square": "◼️",
    "white_medium_square": "◻️",
    "black_medium_small_square": "◾",
    "white_medium_small_square": "◽",
    "black_small_square": "▪️",
    "white_small_square": "▫️"
  };


  /* eslint-disable key-spacing */

  var emojies_shortcuts = {
    angry:            ['>:(', '>:-('],
    blush:            [':")', ':-")'],
    broken_heart:     ['</3', '<\\3'],
    confused:         [':/', ':-/'],
    cry:              [":'(", ":'-(", ':,(', ':,-('],
    frowning:         [':(', ':-('],
    heart:            ['<3'],
    imp:              [']:(', ']:-('],
    innocent:         ['o:)', 'O:)', 'o:-)', 'O:-)', '0:)', '0:-)'],
    joy:              [":')", ":'-)", ':,)', ':,-)', ":'D", ":'-D", ':,D', ':,-D'],
    kissing:          [':*', ':-*'],
    laughing:         ['x-)', 'X-)'],
    neutral_face:     [':|', ':-|'],
    open_mouth:       [':o', ':-o', ':O', ':-O'],
    rage:             [':@', ':-@'],
    smile:            [':D', ':-D'],
    smiley:           [':)', ':-)'],
    smiling_imp:      [']:)', ']:-)'],
    sob:              [":,'(", ":,'-(", ';(', ';-('],
    stuck_out_tongue: [':P', ':-P'],
    sunglasses:       ['8-)', 'B-)'],
    sweat:            [',:(', ',:-('],
    sweat_smile:      [',:)', ',:-)'],
    unamused:         [':s', ':-S', ':z', ':-Z', ':$', ':-$'],
    wink:             [';)', ';-)']
  };

  function emoji_html (tokens, idx ) {
    return tokens[idx].content
  }

  function create_rule (md, emojies, shortcuts, scanRE, replaceRE) {
    const arrayReplaceAt = md.utils.arrayReplaceAt;
    const ucm = md.utils.lib.ucmicro;
    const ZPCc = new RegExp([ucm.Z.source, ucm.P.source, ucm.Cc.source].join('|'));

    function splitTextToken (text, level, Token) {
      let last_pos = 0;
      const nodes = [];

      text.replace(replaceRE, function (match, offset, src) {
        let emoji_name;
        if (Object.prototype.hasOwnProperty.call(shortcuts, match)) {
          emoji_name = shortcuts[match];

          if (offset > 0 && !ZPCc.test(src[offset - 1])) return

          if (offset + match.length < src.length && !ZPCc.test(src[offset + match.length])) {
            return
          }
        } else {
          emoji_name = match.slice(1, -1);
        }

        if (offset > last_pos) {
          const token = new Token('text', '', 0);
          token.content = text.slice(last_pos, offset);
          nodes.push(token);
        }

        const token = new Token('emoji', '', 0);
        token.markup = emoji_name;
        token.content = emojies[emoji_name];
        nodes.push(token);

        last_pos = offset + match.length;
      });

      if (last_pos < text.length) {
        const token = new Token('text', '', 0);
        token.content = text.slice(last_pos);
        nodes.push(token);
      }

      return nodes
    }

    return function emoji_replace (state) {
      let token;
      const blockTokens = state.tokens;
      let autolinkLevel = 0;

      for (let j = 0, l = blockTokens.length; j < l; j++) {
        if (blockTokens[j].type !== 'inline') { continue }
        let tokens = blockTokens[j].children;

        for (let i = tokens.length - 1; i >= 0; i--) {
          token = tokens[i];

          if (token.type === 'link_open' || token.type === 'link_close') {
            if (token.info === 'auto') { autolinkLevel -= token.nesting; }
          }

          if (token.type === 'text' && autolinkLevel === 0 && scanRE.test(token.content)) {
            blockTokens[j].children = tokens = arrayReplaceAt(
              tokens, i, splitTextToken(token.content, token.level, state.Token)
            );
          }
        }
      }
    }
  }


  function quoteRE (str) {
    return str.replace(/[.?*+^$[\]\\(){}|-]/g, '\\$&')
  }

  function normalize_opts (options) {
    let emojies = options.defs;

    if (options.enabled.length) {
      emojies = Object.keys(emojies).reduce((acc, key) => {
        if (options.enabled.indexOf(key) >= 0) acc[key] = emojies[key];
        return acc
      }, {});
    }

    const shortcuts = Object.keys(options.shortcuts).reduce((acc, key) => {
      if (!emojies[key]) return acc

      if (Array.isArray(options.shortcuts[key])) {
        options.shortcuts[key].forEach(alias => { acc[alias] = key; });
        return acc
      }

      acc[options.shortcuts[key]] = key;
      return acc
    }, {});

    const keys = Object.keys(emojies);
    let names;

    if (keys.length === 0) {
      names = '^$';
    } else {
      names = keys
        .map(name => { return `:${name}:` })
        .concat(Object.keys(shortcuts))
        .sort()
        .reverse()
        .map(name => { return quoteRE(name) })
        .join('|');
    }
    const scanRE = RegExp(names);
    const replaceRE = RegExp(names, 'g');

    return {
      defs: emojies,
      shortcuts,
      scanRE,
      replaceRE
    }
  }

  function emoji_plugin$1 (md, options) {
    const defaults = {
      defs: {},
      shortcuts: {},
      enabled: []
    };

    const opts = normalize_opts(Object.assign({}, defaults, options || {}));

    md.renderer.rules.emoji = emoji_html;

    md.core.ruler.after(
      'linkify',
      'emoji',
      create_rule(md, opts.defs, opts.shortcuts, opts.scanRE, opts.replaceRE)
    );
  }

  function emoji_plugin (md, options) {
    const defaults = {
      defs: emojies_defs,
      shortcuts: emojies_shortcuts,
      enabled: []
    };

    const opts = Object.assign({}, defaults, options || {});

    emoji_plugin$1(md, opts);
  }

  return emoji_plugin;

}));
/*! markdown-it-abbr 2.0.0 https://github.com/markdown-it/markdown-it-abbr @license MIT */
(function(global, factory) {
  typeof exports === "object" && typeof module !== "undefined" ? module.exports = factory() : typeof define === "function" && define.amd ? define(factory) : (global = typeof globalThis !== "undefined" ? globalThis : global || self, 
  global.markdownitAbbr = factory());
})(this, (function() {
  "use strict";
  
    function abbr_plugin(md) {
    const escapeRE = md.utils.escapeRE;
    const arrayReplaceAt = md.utils.arrayReplaceAt;
        const OTHER_CHARS = " \r\n$+<=>^`|~";
    const UNICODE_PUNCT_RE = md.utils.lib.ucmicro.P.source;
    const UNICODE_SPACE_RE = md.utils.lib.ucmicro.Z.source;
    function abbr_def(state, startLine, endLine, silent) {
      let labelEnd;
      let pos = state.bMarks[startLine] + state.tShift[startLine];
      const max = state.eMarks[startLine];
      if (pos + 2 >= max) {
        return false;
      }
      if (state.src.charCodeAt(pos++) !== 42 ) {
        return false;
      }
      if (state.src.charCodeAt(pos++) !== 91 ) {
        return false;
      }
      const labelStart = pos;
      for (;pos < max; pos++) {
        const ch = state.src.charCodeAt(pos);
        if (ch === 91 ) {
          return false;
        } else if (ch === 93 ) {
          labelEnd = pos;
          break;
        } else if (ch === 92 ) {
          pos++;
        }
      }
      if (labelEnd < 0 || state.src.charCodeAt(labelEnd + 1) !== 58 ) {
        return false;
      }
      if (silent) {
        return true;
      }
      const label = state.src.slice(labelStart, labelEnd).replace(/\\(.)/g, "$1");
      const title = state.src.slice(labelEnd + 2, max).trim();
      if (label.length === 0) {
        return false;
      }
      if (title.length === 0) {
        return false;
      }
      if (!state.env.abbreviations) {
        state.env.abbreviations = {};
      }
            if (typeof state.env.abbreviations[":" + label] === "undefined") {
        state.env.abbreviations[":" + label] = title;
      }
      state.line = startLine + 1;
      return true;
    }
    function abbr_replace(state) {
      const blockTokens = state.tokens;
      if (!state.env.abbreviations) {
        return;
      }
      const regSimple = new RegExp("(?:" + Object.keys(state.env.abbreviations).map((function(x) {
        return x.substr(1);
      })).sort((function(a, b) {
        return b.length - a.length;
      })).map(escapeRE).join("|") + ")");
      const regText = "(^|" + UNICODE_PUNCT_RE + "|" + UNICODE_SPACE_RE + "|[" + OTHER_CHARS.split("").map(escapeRE).join("") + "])" + "(" + Object.keys(state.env.abbreviations).map((function(x) {
        return x.substr(1);
      })).sort((function(a, b) {
        return b.length - a.length;
      })).map(escapeRE).join("|") + ")" + "($|" + UNICODE_PUNCT_RE + "|" + UNICODE_SPACE_RE + "|[" + OTHER_CHARS.split("").map(escapeRE).join("") + "])";
      const reg = new RegExp(regText, "g");
      for (let j = 0, l = blockTokens.length; j < l; j++) {
        if (blockTokens[j].type !== "inline") {
          continue;
        }
        let tokens = blockTokens[j].children;
                for (let i = tokens.length - 1; i >= 0; i--) {
          const currentToken = tokens[i];
          if (currentToken.type !== "text") {
            continue;
          }
          let pos = 0;
          const text = currentToken.content;
          reg.lastIndex = 0;
          const nodes = [];
                    if (!regSimple.test(text)) {
            continue;
          }
          let m;
          while (m = reg.exec(text)) {
            if (m.index > 0 || m[1].length > 0) {
              const token = new state.Token("text", "", 0);
              token.content = text.slice(pos, m.index + m[1].length);
              nodes.push(token);
            }
            const token_o = new state.Token("abbr_open", "abbr", 1);
            token_o.attrs = [ [ "title", state.env.abbreviations[":" + m[2]] ] ];
            nodes.push(token_o);
            const token_t = new state.Token("text", "", 0);
            token_t.content = m[2];
            nodes.push(token_t);
            const token_c = new state.Token("abbr_close", "abbr", -1);
            nodes.push(token_c);
            reg.lastIndex -= m[3].length;
            pos = reg.lastIndex;
          }
          if (!nodes.length) {
            continue;
          }
          if (pos < text.length) {
            const token = new state.Token("text", "", 0);
            token.content = text.slice(pos);
            nodes.push(token);
          }
                    blockTokens[j].children = tokens = arrayReplaceAt(tokens, i, nodes);
        }
      }
    }
    md.block.ruler.before("reference", "abbr_def", abbr_def, {
      alt: [ "paragraph", "reference" ]
    });
    md.core.ruler.after("linkify", "abbr_replace", abbr_replace);
  }
  return abbr_plugin;
}));
/*! markdown-it-ins 4.0.0 https://github.com/markdown-it/markdown-it-ins @license MIT */
(function(global, factory) {
  typeof exports === "object" && typeof module !== "undefined" ? module.exports = factory() : typeof define === "function" && define.amd ? define(factory) : (global = typeof globalThis !== "undefined" ? globalThis : global || self, 
  global.markdownitIns = factory());
})(this, (function() {
  "use strict";
  function ins_plugin(md) {
    function tokenize(state, silent) {
      const start = state.pos;
      const marker = state.src.charCodeAt(start);
      if (silent) {
        return false;
      }
      if (marker !== 43 ) {
        return false;
      }
      const scanned = state.scanDelims(state.pos, true);
      let len = scanned.length;
      const ch = String.fromCharCode(marker);
      if (len < 2) {
        return false;
      }
      if (len % 2) {
        const token = state.push("text", "", 0);
        token.content = ch;
        len--;
      }
      for (let i = 0; i < len; i += 2) {
        const token = state.push("text", "", 0);
        token.content = ch + ch;
        if (!scanned.can_open && !scanned.can_close) {
          continue;
        }
        state.delimiters.push({
          marker: marker,
          length: 0,
          jump: i / 2,
          token: state.tokens.length - 1,
          end: -1,
          open: scanned.can_open,
          close: scanned.can_close
        });
      }
      state.pos += scanned.length;
      return true;
    }
    
        function postProcess(state, delimiters) {
      let token;
      const loneMarkers = [];
      const max = delimiters.length;
      for (let i = 0; i < max; i++) {
        const startDelim = delimiters[i];
        if (startDelim.marker !== 43 ) {
          continue;
        }
        if (startDelim.end === -1) {
          continue;
        }
        const endDelim = delimiters[startDelim.end];
        token = state.tokens[startDelim.token];
        token.type = "ins_open";
        token.tag = "ins";
        token.nesting = 1;
        token.markup = "++";
        token.content = "";
        token = state.tokens[endDelim.token];
        token.type = "ins_close";
        token.tag = "ins";
        token.nesting = -1;
        token.markup = "++";
        token.content = "";
        if (state.tokens[endDelim.token - 1].type === "text" && state.tokens[endDelim.token - 1].content === "+") {
          loneMarkers.push(endDelim.token - 1);
        }
      }
      
      
            while (loneMarkers.length) {
        const i = loneMarkers.pop();
        let j = i + 1;
        while (j < state.tokens.length && state.tokens[j].type === "ins_close") {
          j++;
        }
        j--;
        if (i !== j) {
          token = state.tokens[j];
          state.tokens[j] = state.tokens[i];
          state.tokens[i] = token;
        }
      }
    }
    md.inline.ruler.before("emphasis", "ins", tokenize);
    md.inline.ruler2.before("emphasis", "ins", (function(state) {
      const tokens_meta = state.tokens_meta;
      const max = (state.tokens_meta || []).length;
      postProcess(state, state.delimiters);
      for (let curr = 0; curr < max; curr++) {
        if (tokens_meta[curr] && tokens_meta[curr].delimiters) {
          postProcess(state, tokens_meta[curr].delimiters);
        }
      }
    }));
  }
  return ins_plugin;
}));
/*! markdown-it-deflist 4.0.0 https://github.com/markdown-it/markdown-it-deflist.git @license MIT */
(function(global, factory) {
  typeof exports === "object" && typeof module !== "undefined" ? module.exports = factory() : typeof define === "function" && define.amd ? define(factory) : (global = typeof globalThis !== "undefined" ? globalThis : global || self, 
  global.markdownitDeflist = factory());
})(this, function() {
  "use strict";
  
    const ddDepthKey = Symbol("markdown-it-deflist.ddDepth");
  function deflist_plugin(md) {
    const isSpace = md.utils.isSpace;
        function skipMarker(state, line) {
      let start = state.bMarks[line] + state.tShift[line];
      const max = state.eMarks[line];
      if (start >= max) {
        return -1;
      }
      if (state.sCount[line] - state.blkIndent >= 4) {
        return -1;
      }
            const marker = state.src.charCodeAt(start++);
      if (marker !== 126  && marker !== 58 ) {
        return -1;
      }
      const pos = state.skipSpaces(start);
            if (start < max && start === pos) {
        return -1;
      }
      return start;
    }
    function markTightParagraph(state, start, end, level) {
      let block = -1;
      for (let i = start; i < end; i++) {
        const token = state.tokens[i];
        if (token.level !== level || !token.block || token.nesting < 0) {
          continue;
        }
        if (block >= 0) {
          return;
        }
        block = i;
      }
      if (block < 0 || state.tokens[block].type !== "paragraph_open") {
        return;
      }
      state.tokens[block + 2].hidden = true;
      state.tokens[block].hidden = true;
    }
    function deflist(state, startLine, endLine, silent) {
      if (silent) {
        if (!state.env[ddDepthKey]) {
          return false;
        }
        const markerPos = skipMarker(state, startLine);
        return markerPos >= 0 && state.sCount[startLine] < state.blkIndent;
      }
      let nextLine = startLine + 1;
      if (nextLine >= endLine) {
        return false;
      }
      let termIsTight = true;
      if (state.isEmpty(nextLine)) {
        nextLine++;
        termIsTight = false;
        if (nextLine >= endLine) {
          return false;
        }
      }
      if (state.sCount[nextLine] < state.blkIndent) {
        return false;
      }
      let contentStart = skipMarker(state, nextLine);
      if (contentStart < 0) {
        return false;
      }
      const token_dl_o = state.push("dl_open", "dl", 1);
      const listLines = [ startLine, 0 ];
      token_dl_o.map = listLines;
      
      
            let dtLine = startLine;
      let ddLine = nextLine;
      
      
      /* eslint no-labels:0,block-scoped-var:0 */      OUTER: for (;;) {
        const token_dt_o = state.push("dt_open", "dt", 1);
        token_dt_o.map = [ dtLine, dtLine ];
        const token_i = state.push("inline", "", 0);
        token_i.map = [ dtLine, dtLine ];
        token_i.content = state.getLines(dtLine, dtLine + 1, state.blkIndent, false).trim();
        token_i.children = [];
        state.push("dt_close", "dt", -1);
        for (;;) {
          const itemTokIdx = state.tokens.length;
          const token_dd_o = state.push("dd_open", "dd", 1);
          const itemLines = [ nextLine, 0 ];
          token_dd_o.map = itemLines;
          let pos = contentStart;
          const max = state.eMarks[ddLine];
          let offset = state.sCount[ddLine] + contentStart - (state.bMarks[ddLine] + state.tShift[ddLine]);
          while (pos < max) {
            const ch = state.src.charCodeAt(pos);
            if (isSpace(ch)) {
              if (ch === 9) {
                offset += 4 - offset % 4;
              } else {
                offset++;
              }
            } else {
              break;
            }
            pos++;
          }
          contentStart = pos;
          const oldTight = state.tight;
          const oldIndent = state.blkIndent;
          const oldTShift = state.tShift[ddLine];
          const oldSCount = state.sCount[ddLine];
          const oldParentType = state.parentType;
          state.blkIndent = state.sCount[ddLine] + 2;
          state.tShift[ddLine] = contentStart - state.bMarks[ddLine];
          state.sCount[ddLine] = offset;
          state.tight = true;
          state.parentType = "deflist";
          state.env[ddDepthKey] = (state.env[ddDepthKey] || 0) + 1;
          state.md.block.tokenize(state, ddLine, endLine, true);
          state.env[ddDepthKey]--;
          if (termIsTight) {
            markTightParagraph(state, itemTokIdx, state.tokens.length, token_dd_o.level + 1);
          }
          state.tShift[ddLine] = oldTShift;
          state.sCount[ddLine] = oldSCount;
          state.tight = oldTight;
          state.parentType = oldParentType;
          state.blkIndent = oldIndent;
          state.push("dd_close", "dd", -1);
          itemLines[1] = nextLine = state.line;
          if (nextLine >= endLine) {
            break OUTER;
          }
          if (state.sCount[nextLine] < state.blkIndent) {
            break OUTER;
          }
          contentStart = skipMarker(state, nextLine);
          if (contentStart < 0) {
            break;
          }
          ddLine = nextLine;
                }
                if (nextLine >= endLine) {
          break;
        }
        dtLine = nextLine;
        if (state.isEmpty(dtLine)) {
          break;
        }
        if (state.sCount[dtLine] < state.blkIndent) {
          break;
        }
        ddLine = dtLine + 1;
        if (ddLine >= endLine) {
          break;
        }
        const skippedEmptyLine = state.isEmpty(ddLine);
        if (skippedEmptyLine) {
          ddLine++;
        }
                if (ddLine >= endLine) {
          break;
        }
                if (state.sCount[ddLine] < state.blkIndent) {
          break;
        }
        contentStart = skipMarker(state, ddLine);
        if (contentStart < 0) {
          break;
        }
        termIsTight = !skippedEmptyLine;
            }
            state.push("dl_close", "dl", -1);
      listLines[1] = nextLine;
      state.line = nextLine;
      return true;
    }
    md.block.ruler.before("paragraph", "deflist", deflist, {
      alt: [ "paragraph", "reference", "blockquote" ]
    });
  }
  return deflist_plugin;
});
}
return Object.freeze(root);
}
