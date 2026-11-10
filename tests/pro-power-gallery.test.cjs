'use strict';
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { regressionLoad: load, prepared, prefs, cache, plain, TIME, VIN } = require('./scriptable.cjs');
const PPO = ['ppoa', 'ppob', 'ppototal', 'ppocapacity'];
const designs = ['classic', 'showcase', 'dashboard'];
const families = ['small', 'medium', 'large', 'extraLarge'];
function vehicle(design, enabled = true, extra = {}) {
  // Estimated watts below deliberately exercise the corroborated HEV/7200-raw
  // mapping; other vehicle/rating combinations must remain raw-only.
  return prefs({ engineType: 'HEV', transmission: 'AUTOMATIC', ...extra, widget: { design: { small: design, medium: design, large: design },
    show: Object.fromEntries(PPO.map(key => [key, enabled])), ...(extra.widget || {}) } });
}
function snapshot(extra = {}) {
  const fields = {};
  for (const [key, value] of Object.entries({ fuel: 63, range: 304, battery: 84, batteryHealth: 'Good', oil: 72,
    odometer: 32123, fl: 35, fr: 36, rl: 35, rr: 36, lock: 'Locked', doors: 'Closed', outsideTemp: 20,
    position: { lat: 42.31, lon: -83.21 }, ignition: 'OFF' })) fields[key] = { value, at: TIME - 30000, source: 'FordPass' };
  return cache({ fields, proPower: { version: 1, vin: VIN,
    rawSignals: { DcacOut1Pw2Dsply: 1450, DcacOut2Pw2Dsply: 225, DcacOutPwDsplyMx: 7200,
      DcacOutScndPw2Dsply: 0, DcacOutScndPwDsplyMx: 0 }, rejectedSignals: [],
    commandAt: TIME - 180000, commandState: 'COMMAND_SUCCEEDED_ON_DEVICE',
    latestMode: { value: 'HIGH', at: TIME - 60000 }, fetchedAt: TIME }, ...extra });
}
function nodes(tree) {
  const result = []; const walk = node => { if (!node || typeof node !== 'object') return;
    result.push(node); for (const child of node.children || []) walk(child); }; walk(tree); return result;
}
const texts = tree => nodes(tree).filter(node => node.kind === 'text').map(node => node.value);
function count(values) { const result = new Map(); for (const value of values) result.set(value, (result.get(value) || 0) + 1); return result; }
function preservePayload(actual, baseline, label) {
  for (const kind of ['text', 'image', 'date']) {
    const values = tree => nodes(tree).filter(node => node.kind === kind).map(node => JSON.stringify(node.value));
    const available = count(values(actual));
    for (const [value, amount] of count(values(baseline))) assert((available.get(value) || 0) >= amount, label + ' lost ' + kind + ' ' + value);
  }
}
const action = node => new URL(String(node.url || 'scriptable:///run')).searchParams.get('action') || '';
const buttons = tree => nodes(tree).filter(node => node.kind === 'stack' && node.size && texts(node).length === 1 &&
  ['Lock', 'Unlock', 'Start', 'Stop', 'Refresh', 'Fetch'].includes(texts(node)[0]));
const ppoPanels = tree => nodes(tree).filter(node => node.kind === 'stack' && action(node) === 'propower');

// Renderer permissions deliberately use the saved current profile rather than
// trusting a caller's old preference object. This helper prepares that fixture.
function remember(h, profile) {
  const key = 'FordPassWidgets.v1.registry', registry = JSON.parse(h.state.secrets.get(key));
  const index = registry.profiles.findIndex(item => item.id === profile.id);
  assert(index >= 0); registry.profiles[index] = plain(profile); h.state.secrets.set(key, JSON.stringify(registry));
}
function boundLinks(tree, profile) {
  for (const node of nodes(tree)) if (String(node.url || '').startsWith('scriptable:'))
    assert.equal(new URL(node.url).searchParams.get('vehicle'), profile.id, 'Every widget action stays on its selected profile');
}

test('all gallery designs retain selected readings and bound controls, with medium omissions available in details', async () => {
  const h = load();
  for (const design of designs) for (const family of families) {
    const c = snapshot({ startRun: { at: TIME - 10000, until: TIME + 300000, estimated: true } });
    const p = vehicle(design), before = JSON.stringify(c);
    const baseline = new h.api.WidgetRenderer(vehicle(design, false), c).build(family, 'Synthetic source notice');
    const renderer = new h.api.WidgetRenderer(p, c), actual = renderer.build(family, 'Synthetic source notice');
    const all = texts(actual).join(' ');
    assert.match(all, /Fuel 63%/); assert.match(all, /Fuel range 304 mi/);
    if (family !== 'small') {
      for (const pattern of [/12V 84%/, /Locks Locked/, /Doors Closed/,
        /FL 35/, /FR 36/, /RL 35/, /RR 36/]) assert.match(all, pattern, design + '/' + family);
    }
    if (['large', 'extraLarge'].includes(family))
      for (const pattern of [/Oil 72%/, /Odometer 32123 mi/, /Outside 68°F/, /Parked/]) assert.match(all, pattern);
    if (family === 'medium') {
      const cue = nodes(actual).filter(node => action(node) === 'details');
      assert.equal(cue.length, 1); assert.deepEqual(texts(cue[0]), ['More readings →']);
      assert.equal(new URL(cue[0].url).searchParams.get('vehicle'), p.id);
      assert.doesNotMatch(all, /Oil 72%|Odometer 32123 mi|Outside 68°F|Parked ·/);
    }
    assert.equal(renderer.opts.design[family === 'extraLarge' ? 'large' : family], design);
    assert.equal(actual.url, baseline.url); assert.deepEqual(plain(actual.backgroundColor), plain(baseline.backgroundColor));
    assert.equal(ppoPanels(actual).length, 1, design + '/' + family + ' inserts PPO exactly once');
    for (const pattern of [/A\s+~1\.45\s*kW/, /B\s+~225\s*W/, /Total\s+~1\.68\s*kW/, /Cap(?:acity)?\s+~7\.2\s*kW/]) assert.match(all, pattern);
    assert.deepEqual(buttons(actual).map(node => action(node)), buttons(baseline).map(node => action(node)));
    const dateValues = tree => nodes(tree).filter(node => node.kind === 'date').map(node => node.value);
    assert.deepEqual(dateValues(actual), dateValues(baseline)); assert.equal(dateValues(actual).length, 1);
    boundLinks(actual, p); assert.equal(JSON.stringify(c), before, 'Rendering cannot change saved readings');
    if (family === 'medium') {
      const app = await prepared(h, p, plain(c)); await app.action('details', p);
      const details = h.state.alerts.at(-1).message;
      for (const pattern of [/Oil life %: 72/, /Odometer: 32123 mi/, /Outside temp: 68°F/, /Parked location: 42\.3100, -83\.2100/]) assert.match(details, pattern);
      assert.match(details, /FordPass · reported 30s ago/); app.store.release();
    }
  }
  assert.equal(h.state.requests.length, 0);
});

test('large model-aware PPO layouts retain readable cards, per-field ages, unknown fuel and bottom controls', () => {
  const h = load(), c = snapshot();
  delete c.fields.fuel;
  c.fields.lock = { value: 'Unlocked', at: TIME - 7200000, source: 'FordPass' };
  c.fields.doors = { value: 'Ajar', at: TIME - 3600000, source: 'FordPass' };
  for (const family of ['large', 'extraLarge']) {
    const tree = new h.api.WidgetRenderer(vehicle('classic'), c).build(family);
    const all = texts(tree).join(' ');
    assert.match(all, /Fuel —/); assert.match(all, /Reported time unknown/); assert.doesNotMatch(all, /Fuel 100%/);
    assert.match(all, /Locks Unlocked · 2h 0m ago/); assert.match(all, /Doors Ajar · 1h 0m ago/);
    assert.match(all, /Status result 3m ago/); assert.match(all, /sample time unknown/);
    const values = nodes(tree).filter(node => node.kind === 'text' && /^~/.test(node.value));
    assert.equal(values.length, 4); assert(values.every(node => node.font.values[0] >= 16));
    const flat = nodes(tree), panel = ppoPanels(tree)[0], firstButton = buttons(tree)[0];
    assert(flat.indexOf(panel) < flat.indexOf(firstButton)); assert.equal(buttons(tree).length, 4);
  }
});

test('alternate large gallery designs place one compact PPO panel before their own bottom controls', () => {
  const h = load();
  for (const design of ['showcase', 'dashboard']) for (const family of ['large', 'extraLarge']) {
    const tree = new h.api.WidgetRenderer(vehicle(design), snapshot()).build(family);
    const flat = nodes(tree), panel = ppoPanels(tree)[0];
    assert.equal(ppoPanels(tree).length, 1); assert(flat.indexOf(panel) < flat.indexOf(buttons(tree)[0]));
    assert.match(texts(panel).join(' '), /Status result 3m ago/); assert.match(texts(panel).join(' '), /Ford HIGH · 1m ago/);
    assert.match(texts(panel).join(' '), /sample time unknown/);
    const readingNodes = nodes(panel).filter(node => node.kind === 'text' && /~/.test(node.value));
    assert.equal(readingNodes.length, 4); assert(readingNodes.every(node => node.font.values[0] >= 12));
  }
});

test('every gallery design keeps security attention ahead of notices and shows explicit notices when no alert applies', () => {
  const h = load(), c = snapshot(); c.fields.lock.value = 'Unlocked';
  for (const design of designs) {
    const p = vehicle(design, true, { alerts: { attention: true } });
    const actual = new h.api.WidgetRenderer(p, c).build('large', 'Synthetic pinned-vehicle notice');
    assert(texts(actual).some(value => value.startsWith('⚠ ') && value.includes('Unlocked')));
    const safe = snapshot(), plainTree = new h.api.WidgetRenderer(p, safe).build('large', 'Synthetic pinned-vehicle notice');
    assert.equal(texts(plainTree).filter(value => value.includes('Synthetic pinned-vehicle notice')).length, 1);
    assert.equal(ppoPanels(actual).length, 1); assert.equal(ppoPanels(plainTree).length, 1);
  }
  assert.equal(h.state.requests.length, 0);
});

test('compatibility-disabled controls remain hidden in mixed, dedicated PPO and gallery layouts', () => {
  const h = load();
  for (const design of designs) for (const parameter of ['', 'ppoa ppob ppototal ppocapacity']) {
    const p = vehicle(design, true, { compatibility: { commands: { lock: false, unlock: true, start: false, stop: false, refresh: false }, verified: {} } });
    remember(h, p);
    for (const running of [false, true]) {
      const c = snapshot(running ? { startRun: { at: TIME - 10000, until: TIME + 300000, estimated: true } } : {});
      const tree = new h.api.WidgetRenderer(p, c, parameter).build('large');
      assert.deepEqual(buttons(tree).map(node => texts(node)[0]), ['Unlock', 'Fetch']);
      assert.deepEqual(buttons(tree).map(action), ['unlock', 'fetch']);
      boundLinks(tree, p);
    }
  }
});

test('gallery parameters keep focused PPO and original Lock Screen first-view behavior', () => {
  const h = load(), c = snapshot(), p = vehicle('dashboard');
  for (const family of families) {
    const focused = new h.api.WidgetRenderer(p, c, 'showcase ppob').build(family);
    const originalFocused = new h.api.WidgetRenderer(p, c, 'classic ppob').build(family);
    assert.deepEqual(texts(ppoPanels(focused)[0]), texts(ppoPanels(originalFocused)[0]));
    assert.match(texts(focused).join(' '), /B\s+~225\s*W/);
    assert.doesNotMatch(texts(focused).join(' '), /Fuel |Oil |Odometer |Locks |Doors /);
    assert.equal(ppoPanels(focused).length, 1); boundLinks(focused, p);
  }
  for (const family of ['accessoryCircular', 'accessoryRectangular', 'accessoryInline']) {
    const original = new h.api.WidgetRenderer(p, c, 'showcase fuel ppob').build(family);
    const baseline = new h.api.WidgetRenderer(vehicle('showcase', false), c, 'fuel').build(family);
    assert.deepEqual(plain(original), plain(baseline));
    const ppo = new h.api.WidgetRenderer(p, c, 'showcase ppob fuel').build(family);
    assert.match(texts(ppo).join(' '), /225\s*W/); assert.equal(action(ppo), 'propower');
  }
});

test('mixed gallery parameters retain only selected PPO fields and missing B never becomes zero or a total', () => {
  const h = load(), c = snapshot(); delete c.proPower.rawSignals.DcacOut2Pw2Dsply;
  c.proPower.commandAt = TIME - 7200000; c.proPower.latestMode = { value: 'OFF', at: TIME - 60000 };
  for (const design of ['showcase', 'dashboard']) for (const family of families) {
    const p = vehicle(design), tree = new h.api.WidgetRenderer(p, c, design + ' fuel ppob ppocapacity').build(family);
    const panel = ppoPanels(tree)[0], content = texts(panel).join(' ');
    assert.match(content, /B\s+—/); assert.match(content, /Cap(?:acity)?\s+~7\.2\s*kW/);
    assert(!texts(panel).some(value => /^(?:A |Total )/.test(value)));
    const baseline = new h.api.WidgetRenderer(vehicle(design, false), c, design + ' fuel').build(family);
    preservePayload(tree, baseline, design + '/' + family + '/selected');
    const all = new h.api.WidgetRenderer(p, c).build(family);
    assert.match(texts(ppoPanels(all)[0]).join(' '), /B\s+—/);
    assert.match(texts(ppoPanels(all)[0]).join(' '), /Total\s+—/);
    if (['large', 'extraLarge'].includes(family)) {
      assert.match(content, /Status result 2h 0m ago/); assert.match(content, /Ford OFF · 1m ago/);
      assert.match(content, /sample time unknown/);
    }
  }
});

test('gallery rendering keeps caller helpers and cached readings intact on success and failure', () => {
  const h = load(), c = snapshot(), names = ['frame', 'text', 'truck', 'pill', 'buttons', 'tires', '_ppoBeforeControls', '_ppoBeforeFooter'];
  for (const fail of [false, true]) {
    const renderer = new h.api.WidgetRenderer(vehicle('dashboard'), c), calls = [], cachedBefore = JSON.stringify(c);
    renderer._ppoBeforeControls = () => calls.push('controls'); renderer._ppoBeforeFooter = () => calls.push('footer');
    if (fail) renderer.truck = () => { throw new Error('Synthetic render failure'); };
    const before = names.map(name => Object.getOwnPropertyDescriptor(renderer, name));
    if (fail) assert.throws(() => renderer.build('large'), /Synthetic render failure/);
    else { const tree = renderer.build('large'); assert.equal(ppoPanels(tree).length, 1); assert.deepEqual(calls, [], 'Model layouts do not invoke inherited insertion hooks'); }
    names.forEach((name, index) => assert.deepEqual(Object.getOwnPropertyDescriptor(renderer, name), before[index]));
    assert.equal(JSON.stringify(c), cachedBefore);
  }
  assert.equal(h.state.requests.length, 0);
});

test('the compatibility-test argument cannot bypass a disabled owner control', async () => {
  const h = load(), p = vehicle('classic', true, { compatibility: { commands: { lock: false }, verified: {} } });
  const app = await prepared(h, p, snapshot());
  const before = h.state.alerts.length;
  for (const testing of [false, true]) await assert.rejects(app.action('lock', p, testing), /not enabled/);
  assert.equal(h.state.alerts.length, before, 'Disabled controls cannot reach the send confirmation');
  assert.equal(h.state.requests.length, 0); app.store.release();
});

test('PPO opt-out hides cached power from every design and accessory even with stale caller preferences', () => {
  const h = load(), stale = vehicle('dashboard'), current = vehicle('dashboard', true, {features: {proPower: false}});
  remember(h, current);
  for (const design of designs) for (const family of [...families, 'accessoryCircular', 'accessoryRectangular', 'accessoryInline']) {
    const tree = new h.api.WidgetRenderer({...stale, widget: {...stale.widget, design: {small: design, medium: design, large: design}}}, snapshot(), 'fuel ppob').build(family);
    assert.equal(ppoPanels(tree).length, 0); assert.notEqual(action(tree), 'propower');
    assert.doesNotMatch(texts(tree).join(' '), /Pro Power|PPO last|~225/); boundLinks(tree, stale);
  }
  assert.equal(h.state.requests.length, 0);
});
