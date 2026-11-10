'use strict';
const assert = require('node:assert/strict');
const {test} = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const site = fs.readFileSync(path.join(root, 'docs/site.js'), 'utf8');
const installer = fs.readFileSync(path.join(root, 'docs/installer.js'), 'utf8');

async function load({reply = installer, ok = true, fetchFails = false, clipboard = true, clipboardFails = false} = {}) {
  const nodes = Object.fromEntries(['copy-installer', 'installer-code', 'installer-details', 'copy-feedback'].map(id => [id, {
    value: '', textContent: '', disabled: id === 'copy-installer', open: false,
    addEventListener(type, handler) {this[type] = handler;},
    focus() {this.focused = true;}, select() {this.selected = true;}
  }]));
  const requests = [], copied = [];
  const context = vm.createContext({document: {getElementById: id => nodes[id]},
    fetch: async (url, options) => {
      requests.push({url, options: JSON.parse(JSON.stringify(options))});
      if (fetchFails) throw new Error('Synthetic transport detail');
      return {ok, text: async () => reply};
    }, navigator: {clipboard: clipboard ? {writeText: async text => {
      if (clipboardFails) throw new Error('Synthetic clipboard rejection'); copied.push(text);
    }} : undefined}});
  // Await the page's actual startup, without running a browser or a downloaded installer.
  await new vm.Script('(async () => {' + site.replace(/loadInstaller\(\);\s*$/, 'await loadInstaller();') + '\n})()').runInContext(context);
  return {nodes, requests, copied};
}

test('the page preloads only its own static installer and copies its exact reviewed text on an explicit tap', async () => {
  const h = await load();
  assert.deepEqual(h.requests, [{url: 'installer.js', options: {cache: 'no-store'}}]);
  assert.equal(h.nodes['copy-installer'].disabled, false); assert.equal(h.nodes['installer-code'].value, installer);
  assert.deepEqual(h.copied, []);
  await h.nodes['copy-installer'].click();
  assert.deepEqual(h.copied, [installer]); assert.match(h.nodes['copy-feedback'].textContent, /Paste into a new Scriptable script/);
});

for (const options of [{clipboard: false}, {clipboardFails: true}]) test('clipboard unavailable/rejected provides selected manual-copy source without another fetch', async () => {
  const h = await load(options); await h.nodes['copy-installer'].click();
  assert.equal(h.nodes['installer-details'].open, true); assert.equal(h.nodes['installer-code'].focused, true);
  assert.equal(h.nodes['installer-code'].selected, true); assert.equal(h.nodes['installer-code'].value, installer);
  assert.match(h.nodes['copy-feedback'].textContent, /manually/); assert.equal(h.requests.length, 1); assert.deepEqual(h.copied, []);
});

test('failed, invalid or oversized installer loads keep copying disabled and expose recovery guidance', async () => {
  for (const options of [{ok: false}, {fetchFails: true}, {reply: '<html>not a script</html>'}, {reply: installer.replace('FordPassWidgets installer', 'FordWidget Pro Power installer')}, {reply: installer + ' '.repeat(60000)}]) {
    const h = await load(options); assert.equal(h.nodes['copy-installer'].disabled, true);
    assert.equal(h.nodes['installer-code'].value, ''); await h.nodes['copy-installer'].click();
    assert.deepEqual(h.copied, []); assert.match(h.nodes['copy-feedback'].textContent, /manual guide/);
    assert.doesNotMatch(h.nodes['copy-feedback'].textContent, /Synthetic/);
  }
});

test('published page has resolvable local links and a script-free manual-install fallback', () => {
  const html = fs.readFileSync(path.join(root, 'docs/index.html'), 'utf8');
  const ids = Array.from(html.matchAll(/\bid="([^"]+)"/g), match => match[1]);
  assert.equal(new Set(ids).size, ids.length, 'HTML IDs must be unique');
  for (const [, url] of html.matchAll(/(?:href|src)="([^"]+)"/g)) {
    if (url.startsWith('#')) {assert.ok(url === '#' || ids.includes(url.slice(1)), 'Unknown anchor ' + url); continue;}
    if (/^https:\/\//.test(url)) continue;
    assert.ok(fs.existsSync(path.join(root, 'docs', url)), 'Missing local page asset ' + url);
  }
  assert.match(html, /<noscript>[\s\S]*?installer\.js[\s\S]*?manual installation guide[\s\S]*?<\/noscript>/);
  assert.match(html, /connect-src 'self'/);
  assert.doesNotMatch(html, /<form\b|<script[^>]*src="https?:|<link[^>]*href="https?:[^>]*rel="stylesheet"/);
});
