'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const { regressionLoad, prefs, cache, prepared, plain, TIME, VIN } = require('./scriptable.cjs');

function load() {
  let source = fs.readFileSync(path.join(__dirname, '../FordPassWidgets.js'), 'utf8');
  const entry = 'try { await new AppController().run(); }';
  const boundary = source.lastIndexOf(entry);
  assert.ok(boundary > 0);
  source = source.slice(0, boundary) + 'globalThis.CoverageTests = {componentCoverageEvidence, componentStatusText, componentLockIcon, nightSecurityFresh};\n' + source.slice(boundary);
  const h = regressionLoad(source); Object.assign(h.api, h.context.CoverageTests); return h;
}
const at = age => TIME - age;
const entry = (vehicleDoor, value, age = 1000) => ({ vehicleDoor, value, updateTime: at(age) });
const metrics = (aggregate = false, age = 1000) => ({
  doorLockStatus: [entry(aggregate ? 'ALL_DOORS' : 'FRONT_LEFT', 'LOCKED', age)],
  doorStatus: [entry(aggregate ? 'ALL_DOORS' : 'FRONT_LEFT', 'CLOSED', age)],
  hoodStatus: { value: 'CLOSED', updateTime: at(age) }
});
const normalize = (h, data) => h.api.normalize({ vin: VIN, metrics: data }, VIN, 'FordPass', TIME);
const merge = (h, previous, data) => h.api.mergeFields(previous, {}, normalize(h, data));
function nodes(tree) { return [tree, ...(tree.children || []).flatMap(nodes)]; }
function texts(tree) { return nodes(tree).filter(node => node.kind === 'text').map(node => node.value); }
function height(node) {
  if (node.kind === 'text' || node.kind === 'date') return (node.font && node.font.values[0] || 12) * 1.2;
  if (node.kind === 'image') return node.imageSize && node.imageSize.height || 0;
  if (node.kind === 'spacer') return node.size || 0;
  const children = node.children || [], sizes = children.map(height), padding = node.padding || [0, 0, 0, 0];
  const content = node.kind === 'widget' || node.layout === 'vertical' ? sizes.reduce((a, b) => a + b, 0) + (node.spacing || 0) * Math.max(0, children.length - 1) : Math.max(0, ...sizes);
  return Math.max(node.size && node.size.height || 0, content + padding[0] + padding[2]);
}

test('one healthy driver-door and hood reading stays partial without changing raw enums or provenance', () => {
  const h = load(), fields = normalize(h, metrics());
  assert.equal(fields.lock.value, 'Locked'); assert.equal(fields.doors.value, 'Closed');
  assert.deepEqual(plain(fields.lock.componentStatus.readings.map(item => item.id)), ['FRONT_LEFT']);
  assert.deepEqual(plain(fields.doors.componentStatus.readings.map(item => item.id)), ['FRONT_LEFT', 'HOOD']);
  assert.equal(h.api.componentStatusText(fields.lock, 'lock'), 'Locked (partial)');
  assert.equal(h.api.componentStatusText(fields.doors, 'doors'), 'Closed (partial)');
  assert.equal(h.api.componentLockIcon(fields.lock), 'questionmark');
  assert.equal(h.api.nightSecurityFresh(fields), false);
  assert.equal(h.state.requests.length, 0);
});

test('fresh explicit ALL_DOORS with a closed hood supplies aggregate coverage and optional all-clear evidence', () => {
  const h = load(), fields = normalize(h, metrics(true));
  assert.equal(h.api.componentStatusText(fields.lock, 'lock'), 'Locked');
  assert.equal(h.api.componentStatusText(fields.doors, 'doors'), 'Closed');
  assert.equal(h.api.componentLockIcon(fields.lock), 'lock.fill');
  assert.ok(h.api.componentCoverageEvidence('lock', fields.lock));
  assert.ok(h.api.componentCoverageEvidence('doors', fields.doors));
  assert.equal(h.api.nightSecurityFresh(fields), true);
  fields.lock.measurementAt = TIME; fields.doors.measurementAt = TIME;
  h.state.clock = TIME + 300001;
  assert.equal(h.api.nightSecurityFresh(fields), false, 'Cached freshness flags cannot freshen the retained Ford measurements');
  assert.equal(h.state.requests.length, 0);
});

test('legacy healthy caches and invented coverage flags stay partial', () => {
  const h = load(), legacy = {
    lock: { value: 'Locked', at: at(1000), measurementAt: at(1000), source: 'FordPass', coverage: 'complete', complete: true },
    doors: { value: 'Closed', at: at(1000), measurementAt: at(1000), source: 'FordPass', coverage: { complete: true } }
  };
  for (const fields of [legacy, merge(h, legacy, metrics())]) {
    assert.equal(h.api.componentStatusText(fields.lock, 'lock'), 'Locked (partial)');
    assert.equal(h.api.componentStatusText(fields.doors, 'doors'), 'Closed (partial)');
    assert.equal(h.api.nightSecurityFresh(fields), false);
  }
  assert.equal(h.state.requests.length, 0);
});

test('malformed, truncated, legacy or unsupported component packets cannot establish whole-vehicle coverage', () => {
  const h = load(), original = plain(normalize(h, metrics(true)));
  const cases = [
    fields => { fields.doors.componentStatus.truncated = true; },
    fields => { fields.doors.componentStatus.legacy = { value: 'Ajar', at: at(2000) }; },
    fields => { delete fields.doors.componentStatus.hood; },
    fields => { fields.doors.componentStatus.hood = 'true'; },
    fields => { fields.doors.componentStatus.readings = fields.doors.componentStatus.readings.filter(item => item.id !== 'HOOD'); },
    fields => { fields.doors.componentStatus.readings[0].source = 'Unverified'; },
    fields => { fields.doors.componentStatus.readings[0].at = String(at(1000)); },
    fields => { fields.doors.componentStatus.readings[0].at = TIME + 1000; },
    fields => { fields.doors.componentStatus.readings.push(fields.doors.componentStatus.readings[0]); },
    fields => { fields.lock.componentStatus.version = 2; },
    fields => { fields.lock.componentStatus.readings[0].latch = 'MECHANICAL'; },
    fields => { fields.lock.componentStatus = Object.create(fields.lock.componentStatus); },
    fields => { fields.lock.componentStatus.readings[0] = Object.create(fields.lock.componentStatus.readings[0]); }
  ];
  for (const change of cases) {
    const fields = plain(original); change(fields);
    assert.equal(h.api.nightSecurityFresh(fields), false);
    assert.ok(h.api.componentStatusText(fields.lock, 'lock').endsWith('(partial)') || h.api.componentStatusText(fields.doors, 'doors').endsWith('(partial)'));
  }
  assert.equal(h.state.requests.length, 0);
});

test('unsafe readings still alert, block known-Ajar start and survive stale contrary snapshots', async () => {
  const h = load(), vehicle = prefs({ alerts: { enabled: { tires: false } } });
  let fields = normalize(h, { doorLockStatus: [entry('FRONT_LEFT', 'UNLOCKED')], doorStatus: [entry('FRONT_LEFT', 'AJAR')], hoodStatus: metrics().hoodStatus });
  assert.equal(h.api.componentStatusText(fields.lock, 'lock'), 'Unlocked');
  assert.equal(h.api.componentStatusText(fields.doors, 'doors'), 'Ajar');
  assert.equal(h.api.componentLockIcon(fields.lock), 'lock.open.fill');
  assert.deepEqual(plain(h.api.nightProblems(fields, vehicle)), ['Unlocked', 'Door, hood or tailgate open']);
  fields = merge(h, fields, metrics(true, 60000));
  assert.equal(fields.lock.value, 'Unlocked'); assert.equal(fields.doors.value, 'Ajar');
  assert.equal(h.api.nightSecurityFresh(fields), false);
  const app = await prepared(h, vehicle, cache({ fields }));
  await assert.rejects(new h.api.FordAPIClient(app.auth, app.store, vehicle).sendCommand(VIN, 'start'), /ajar|unresolved/i);
  assert.equal(h.state.requests.length, 0); app.store.release();
});

test('every design, size, lock accessory and details marks partial healthy coverage within bounded layouts', async () => {
  const h = load(), vehicle = prefs({ features: { proPower: false }, widget: { show: { photo: false } } });
  const fields = normalize(h, metrics()), saved = cache({ fields });
  const limits = { small: 155, medium: 152, large: 345, extraLarge: 345 };
  for (const design of ['classic', 'showcase', 'dashboard']) for (const family of Object.keys(limits)) {
    const widget = new h.api.WidgetRenderer(vehicle, saved, design + ' lock doors').build(family);
    const text = texts(widget).join('\n');
    assert.match(text, /Locked \(partial\)/, design + ' ' + family);
    if (family !== 'small') assert.match(text, /Closed \(partial\)/, design + ' ' + family);
    assert.ok(height(widget) <= limits[family], design + ' ' + family + ' height ' + height(widget));
    assert.ok(nodes(widget).filter(node => node.kind === 'text').every(node => node.lineLimit === 1));
  }
  for (const family of ['accessoryInline', 'accessoryCircular', 'accessoryRectangular']) for (const key of ['lock', 'doors']) {
    const widget = new h.api.WidgetRenderer(vehicle, saved, key).build(family);
    assert.match(texts(widget).join('\n'), key === 'lock' ? /Locked \(partial\)/ : /Closed \(partial\)/);
    assert.ok(nodes(widget).filter(node => node.kind === 'text').every(node => node.lineLimit === 1));
    assert.ok(!nodes(widget).some(node => node.kind === 'image' && node.value.symbol === 'lock.fill'));
  }
  const app = await prepared(h, vehicle, saved); await app.details(vehicle);
  assert.match(h.state.alerts.at(-1).message, /Locks: Locked \(partial\)/);
  assert.match(h.state.alerts.at(-1).message, /Doors \/ hood: Closed \(partial\)/);
  assert.equal(h.state.requests.length, 0); app.store.release();
});

test('historical cached evening flags cannot preserve an unsupported all-clear in details', async () => {
  for (const coverage of ['partial', 'legacy', 'aggregate', 'unknown-check-time']) {
    const h = load(), vehicle = prefs({ night: { enabled: true } });
    let fields = normalize(h, metrics(coverage === 'aggregate' || coverage === 'unknown-check-time'));
    if (coverage === 'legacy') fields = {
      lock: { value: 'Locked', at: at(1000), measurementAt: at(1000), source: 'FordPass' },
      doors: { value: 'Closed', at: at(1000), measurementAt: at(1000), source: 'FordPass' }
    };
    const night = { done: true, at: coverage === 'unknown-check-time' ? null : at(500), problems: [], securityFresh: true };
    const app = await prepared(h, vehicle, cache({ fields, night })); await app.details(vehicle);
    const text = h.state.alerts.at(-1).message;
    if (coverage === 'aggregate') assert.match(text, /Evening check: Locked and closed; no enabled alerts/);
    else {
      assert.match(text, /Evening check: Current security status unconfirmed/);
      assert.doesNotMatch(text, /Locked and closed|All good/);
    }
    assert.equal(h.state.requests.length, 0); app.store.release();
  }
});
