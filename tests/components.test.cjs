'use strict';
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { regressionLoad: load, prepared, cache, prefs, plain, TIME, VIN } = require('./scriptable.cjs');
const at = seconds => TIME - seconds * 1000;
const entry = (vehicleDoor, value, seconds, extra = {}) => ({ vehicleDoor, value, updateTime: at(seconds), ...extra });
const hood = (value = 'CLOSED', seconds = 600) => ({ value, updateTime: at(seconds) });
const normalize = (h, metrics, source = 'FordPass') => h.api.normalize({ vin: VIN, updateTime: TIME, metrics }, VIN, source, TIME);
const merge = (h, previous, metrics) => h.api.mergeFields(previous, {}, normalize(h, metrics));
const state = (fields, key) => plain(fields[key]);

test('newly closed door replaces Ajar even when an unchanged hood keeps the aggregate time older', () => {
  const h = load();
  let fields = merge(h, {}, { doorStatus: [entry('FRONT_LEFT', 'AJAR', 120)], hoodStatus: hood() });
  assert.equal(fields.doors.value, 'Ajar'); assert.equal(fields.doors.at, at(120));
  fields = merge(h, fields, { doorStatus: [entry('FRONT_LEFT', 'CLOSED', 60)], hoodStatus: hood() });
  assert.equal(fields.doors.value, 'Closed'); assert.equal(fields.doors.at, at(600));
  assert.equal(fields.doors.measurementAt, at(600));
  assert.equal(fields.doors.componentStatus.readings.find(item => item.id === 'FRONT_LEFT').at, at(60));
});

test('individual lock transition is merged before the oldest aggregate timestamp is derived', () => {
  const h = load();
  let fields = merge(h, {}, { doorLockStatus: [entry('FRONT_LEFT', 'UNLOCKED', 120), entry('FRONT_RIGHT', 'LOCKED', 600)] });
  fields = merge(h, fields, { doorLockStatus: [entry('FRONT_LEFT', 'LOCKED', 60), entry('FRONT_RIGHT', 'LOCKED', 600)] });
  assert.equal(fields.lock.value, 'Locked'); assert.equal(fields.lock.at, at(600));
  assert.equal(fields.lock.measurementAt, at(600));
});

test('stale snapshots cannot restore an older open or unlocked component', () => {
  const h = load();
  let fields = merge(h, {}, { doorStatus: [entry('FRONT_LEFT', 'CLOSED', 60)], hoodStatus: hood(), doorLockStatus: [entry('FRONT_LEFT', 'LOCKED', 60)] });
  fields = merge(h, fields, { doorStatus: [entry('FRONT_LEFT', 'AJAR', 120)], hoodStatus: hood(), doorLockStatus: [entry('FRONT_LEFT', 'UNLOCKED', 120)] });
  assert.equal(fields.doors.value, 'Closed'); assert.equal(fields.lock.value, 'Locked');
});

test('a partial snapshot retains every previously observed open component and hood', () => {
  const h = load();
  let fields = merge(h, {}, { doorStatus: [entry('FRONT_LEFT', 'CLOSED', 120), entry('REAR_LEFT', 'AJAR', 120)], hoodStatus: hood() });
  fields = merge(h, fields, { doorStatus: [entry('FRONT_LEFT', 'CLOSED', 60)] });
  assert.equal(fields.doors.value, 'Ajar');
  assert.equal(fields.doors.componentStatus.readings.length, 3);
  fields = merge(h, fields, { doorStatus: [entry('REAR_LEFT', 'CLOSED', 30)] });
  assert.equal(fields.doors.value, 'Closed'); assert.equal(fields.doors.at, at(600));
});

test('known unknown components survive partial data until that same component has a newer valid reading', () => {
  const h = load();
  let fields = merge(h, {}, { doorStatus: [entry('FRONT_LEFT', 'CLOSED', 120)], hoodStatus: hood('UNKNOWN', 120) });
  assert.equal(fields.doors.value, 'Unknown');
  fields = merge(h, fields, { doorStatus: [entry('FRONT_LEFT', 'CLOSED', 60)] });
  assert.equal(fields.doors.value, 'Unknown');
  fields = merge(h, fields, { hoodStatus: hood('CLOSED', 30) });
  assert.equal(fields.doors.value, 'Closed');
});

test('missing door-list or hood coverage cannot establish Closed, and unnamed closed entries stay unknown', () => {
  const h = load();
  for (const metrics of [{ hoodStatus: hood() }, { doorStatus: [entry('FRONT_LEFT', 'CLOSED', 60)] },
    { doorStatus: [{ value: 'CLOSED', updateTime: at(60) }], hoodStatus: hood() }]) {
    const fields = merge(h, {}, metrics); assert.equal(fields.doors.value, 'Unknown');
  }
});

test('legacy Ajar with no component provenance stays incomplete until whole-vehicle evidence resolves it', () => {
  const h = load();
  const legacy = { doors: { value: 'Ajar', at: at(120), source: 'FordPass', fetchedAt: at(100) } };
  let fields = merge(h, legacy, { doorStatus: [entry('FRONT_LEFT', 'CLOSED', 60)], hoodStatus: hood() });
  assert.equal(fields.doors.value, 'Unknown'); assert.equal(fields.doors.at, null); assert.equal(fields.doors.measurementAt, null);
  assert.equal(fields.doors.componentStatus.legacy.value, 'Ajar');
  fields = merge(h, fields, { doorStatus: [entry('FRONT_LEFT', 'AJAR', 30)] });
  assert.equal(fields.doors.value, 'Ajar'); assert.equal(fields.doors.componentStatus.legacy.value, 'Ajar');
  fields = merge(h, fields, { doorStatus: [entry('FRONT_LEFT', 'CLOSED', 10)] });
  assert.equal(fields.doors.value, 'Unknown'); assert.equal(fields.doors.componentStatus.legacy.value, 'Ajar');
  fields = merge(h, fields, { doorStatus: [entry('ALL_DOORS', 'CLOSED', 5)], hoodStatus: hood('CLOSED', 5) });
  assert.equal(fields.doors.value, 'Closed'); assert.equal(fields.doors.componentStatus.legacy, null);
});

test('newer single-door plus hood values cannot attribute an older unknown-provenance Ajar to that door', () => {
  const h = load();
  const fields = merge(h, { doors: { value: 'Ajar', at: at(120), source: 'FordPass' } },
    { doorStatus: [entry('FRONT_LEFT', 'CLOSED', 60)], hoodStatus: hood('CLOSED', 60) });
  assert.equal(fields.doors.value, 'Unknown'); assert.equal(fields.doors.componentStatus.legacy.value, 'Ajar');
});

test('legacy healthy aggregates retain their original reported state and time absent newer contrary evidence', () => {
  const h = load();
  const fields = merge(h, { doors: { value: 'Closed', at: at(120), source: 'FordPass' }, lock: { value: 'Locked', at: at(120), source: 'FordPass' } },
    { doorStatus: [entry('FRONT_LEFT', 'CLOSED', 600)], doorLockStatus: [entry('FRONT_LEFT', 'LOCKED', 600)] });
  assert.equal(fields.doors.value, 'Closed'); assert.equal(fields.doors.at, at(120));
  assert.equal(fields.lock.value, 'Locked'); assert.equal(fields.lock.at, at(120));
  assert.equal(fields.doors.measurementAt, null); assert.equal(fields.lock.measurementAt, null);
});

test('a partial locked component cannot resolve legacy Unlocked of unknown provenance', () => {
  const h = load();
  let fields = merge(h, { lock: { value: 'Unlocked', at: at(120), source: 'FordPass' } },
    { doorLockStatus: [entry('FRONT_LEFT', 'LOCKED', 60)] });
  assert.equal(fields.lock.value, 'Unknown'); assert.equal(fields.lock.componentStatus.legacy.value, 'Unlocked');
  fields = merge(h, fields, { doorLockStatus: [entry('ALL_DOORS', 'LOCKED', 30)] });
  assert.equal(fields.lock.value, 'Locked'); assert.equal(fields.lock.componentStatus.legacy, null);
});

test('ALL_DOORS Locked does not hide a newer individual unlocked or unknown reading', () => {
  const h = load();
  for (const [value, expected] of [['UNLOCKED', 'Unlocked'], ['UNKNOWN', 'Unknown']]) {
    const fields = merge(h, {}, { doorLockStatus: [entry('ALL_DOORS', 'LOCKED', 120), entry('FRONT_LEFT', value, 60)] });
    assert.equal(fields.lock.value, expected); assert.equal(fields.lock.at, at(60));
  }
  const fields = merge(h, {}, { doorLockStatus: [entry('ALL_DOORS', 'LOCKED', 30), entry('FRONT_LEFT', 'UNLOCKED', 120)] });
  assert.equal(fields.lock.value, 'Locked'); assert.equal(fields.lock.at, at(30));
});

test('individual locked readings cannot clear or freshen a whole-vehicle ALL_DOORS aggregate', () => {
  const h = load();
  let fields = merge(h, {}, { doorLockStatus: [entry('ALL_DOORS', 'UNLOCKED', 120), entry('FRONT_LEFT', 'LOCKED', 60), entry('FRONT_RIGHT', 'LOCKED', 600)] });
  assert.equal(fields.lock.value, 'Unlocked');
  fields = merge(h, fields, { doorLockStatus: [entry('FRONT_RIGHT', 'LOCKED', 30)] });
  assert.equal(fields.lock.value, 'Unlocked'); assert.equal(fields.lock.at, at(120));
  fields = merge(h, fields, { doorLockStatus: [entry('ALL_DOORS', 'LOCKED', 10)] });
  assert.equal(fields.lock.value, 'Locked'); assert.equal(fields.lock.at, at(10));
  for (const value of ['LOCKED', 'UNLOCKED', 'UNKNOWN']) {
    const fields = merge(h, {}, { doorLockStatus: [entry('ALL_DOORS', value, 1200), entry('FRONT_LEFT', 'LOCKED', 1)] });
    assert.equal(fields.lock.value, { LOCKED: 'Locked', UNLOCKED: 'Unlocked', UNKNOWN: 'Unknown' }[value]);
    assert.equal(fields.lock.at, at(1200));
  }
});

test('mechanical latches are excluded in both supported schema locations and their classification survives omitted tags', () => {
  const h = load();
  for (const extra of [{ tags: { DOOR_LATCH_TYPE: 'MECHANICAL' } }, { doorLatchType: 'MECHANICAL' }]) {
    let fields = merge(h, {}, { doorLockStatus: [entry('ALL_DOORS', 'LOCKED', 120), entry('TAILGATE', 'UNLOCKED', 60, extra)] });
    assert.equal(fields.lock.value, 'Locked');
    fields = merge(h, fields, { doorLockStatus: [entry('TAILGATE', 'UNLOCKED', 30)] });
    assert.equal(fields.lock.value, 'Locked');
    fields = merge(h, fields, { doorLockStatus: [entry('TAILGATE', 'UNLOCKED', 10, { doorLatchType: 'ELECTRONIC' })] });
    assert.equal(fields.lock.value, 'Unlocked');
  }
});

test('an unnamed mechanical latch cannot clear another unidentified unlocked component', () => {
  const h = load();
  let fields = merge(h, {}, { doorLockStatus: [entry('FRONT_LEFT', 'LOCKED', 120), entry('UNKNOWN_DOOR', 'UNLOCKED', 120, { doorLatchType: 'ELECTRONIC' })] });
  assert.equal(fields.lock.value, 'Unlocked');
  fields = merge(h, plain(fields), { doorLockStatus: [entry('UNSPECIFIED_DOOR', 'UNLOCKED', 60, { doorLatchType: 'MECHANICAL' })] });
  assert.equal(fields.lock.value, 'Unlocked');
});

test('unidentified closed or unknown entries cannot resolve an unidentified open component', () => {
  const h = load();
  for (const value of ['CLOSED', 'UNKNOWN']) {
    let fields = merge(h, {}, { doorStatus: [entry('UNKNOWN_DOOR', 'OPEN', 120)], hoodStatus: hood() });
    fields = merge(h, plain(fields), { doorStatus: [entry('UNSPECIFIED_DOOR', value, 60)] });
    assert.equal(fields.doors.value, 'Ajar'); assert.equal(fields.doors.at, at(120));
  }
});

test('stable selectors survive array reordering, standard position aliases, and optional side tags', () => {
  const h = load();
  let fields = merge(h, {}, { doorStatus: [entry('LEFT_FRONT', 'AJAR', 120, { vehicleSide: 'DRIVER' }), entry('UNSPECIFIED_REAR', 'CLOSED', 120, { vehicleOccupantRole: 'PASSENGER' })], hoodStatus: hood() });
  fields = merge(h, fields, { doorStatus: [entry('UNSPECIFIED_REAR', 'CLOSED', 60, { vehicleSide: 'PASSENGER' }), entry('FRONT_LEFT', 'CLOSED', 60)] });
  assert.equal(fields.doors.value, 'Closed'); assert.equal(fields.doors.componentStatus.readings.length, 3);
});

test('equal-time conflicts keep unsafe evidence rather than overwrite it with a healthy claim', () => {
  const h = load();
  let fields = merge(h, {}, { doorStatus: [entry('FRONT_LEFT', 'AJAR', 60)], hoodStatus: hood() });
  fields = merge(h, fields, { doorStatus: [entry('FRONT_LEFT', 'CLOSED', 60)] });
  assert.equal(fields.doors.value, 'Ajar');
});

test('FordConnect and FordPass readings merge per component, not as whole aggregate candidates', () => {
  const h = load();
  const official = normalize(h, { doorStatus: [entry('FRONT_LEFT', 'CLOSED', 60)], hoodStatus: hood('CLOSED', 600) }, 'FordConnect');
  const mobile = normalize(h, { doorStatus: [entry('FRONT_LEFT', 'AJAR', 120)], hoodStatus: hood('CLOSED', 30) });
  const fields = h.api.mergeFields({}, official, mobile);
  assert.equal(fields.doors.value, 'Closed'); assert.equal(fields.doors.at, at(60));
  assert.equal(fields.doors.componentStatus.readings.find(item => item.id === 'FRONT_LEFT').source, 'FordConnect');
  assert.equal(fields.doors.componentStatus.readings.find(item => item.id === 'HOOD').source, 'FordPass');
});

test('root response time and fetch time never substitute for component measurement time', () => {
  const h = load();
  const fields = merge(h, {}, { doorStatus: [{ vehicleDoor: 'FRONT_LEFT', value: 'CLOSED' }], hoodStatus: { value: 'CLOSED' } });
  assert.equal(fields.doors.at, null); assert.equal(fields.doors.measurementAt, null);
  assert(fields.doors.componentStatus.readings.every(item => item.at === null));
});

test('missing or future contributing component times cannot establish fresh positive security evidence', () => {
  const h = load();
  for (const updateTime of [undefined, TIME + 1000, TIME + 120000]) {
    const door = normalize(h, { doorStatus: [{ vehicleDoor: 'FRONT_LEFT', value: 'CLOSED', updateTime }], hoodStatus: hood('CLOSED', 1) });
    const lock = normalize(h, { doorLockStatus: [{ vehicleDoor: 'FRONT_LEFT', value: 'LOCKED', updateTime }, entry('FRONT_RIGHT', 'LOCKED', 1)] });
    const all = normalize(h, { doorLockStatus: [entry('ALL_DOORS', 'LOCKED', 1), { vehicleDoor: 'FRONT_LEFT', value: 'LOCKED', updateTime }] });
    assert.equal(door.doors.measurementAt, null); assert.equal(lock.lock.measurementAt, null); assert.equal(all.lock.measurementAt, null);
  }
});

test('normalizing and merging component status never mutates inputs', () => {
  const h = load();
  const old = merge(h, {}, { doorStatus: [entry('FRONT_LEFT', 'AJAR', 120)], hoodStatus: hood() });
  const metrics = { doorStatus: [entry('FRONT_LEFT', 'CLOSED', 60)], hoodStatus: hood() };
  const before = JSON.stringify({ old, metrics }); merge(h, old, metrics);
  assert.equal(JSON.stringify({ old, metrics }), before);
});

test('bounded component caches preserve overflow uncertainty and unsafe evidence across JSON round-trips', () => {
  const h = load();
  const names = Array.from({ length: 63 }, (_, i) => 'DOOR_' + String.fromCharCode(65 + Math.floor(i / 26), 65 + i % 26));
  let fields = merge(h, {}, { doorStatus: names.map(name => entry(name, 'CLOSED', 120)), hoodStatus: hood() });
  assert.equal(fields.doors.componentStatus.readings.length, 64); assert.equal(fields.doors.value, 'Closed');
  fields = merge(h, plain(fields), { doorStatus: [entry('EXTRA_DOOR', 'CLOSED', 60)] });
  assert.equal(fields.doors.componentStatus.readings.length, 64); assert.equal(fields.doors.componentStatus.truncated, true); assert.equal(fields.doors.value, 'Unknown');
  fields = merge(h, plain(fields), { doorStatus: [entry('NEW_DOOR', 'OPEN', 30)] });
  assert.equal(fields.doors.value, 'Ajar'); assert.equal(fields.doors.componentStatus.readings.length, 64);
  fields = merge(h, plain(fields), { doorStatus: [entry('ANOTHER_DOOR', 'CLOSED', 10)] });
  assert.equal(fields.doors.value, 'Ajar'); assert.equal(fields.doors.componentStatus.truncated, true);
});

test('unresolved legacy Ajar migration retains the remote-start safety guard without dispatching a command', async () => {
  const h = load();
  const fields = merge(h, { doors: { value: 'Ajar', at: at(120), source: 'FordPass' } },
    { doorStatus: [entry('FRONT_LEFT', 'CLOSED', 60)], hoodStatus: hood() });
  const app = await prepared(h, prefs(), cache({ fields }));
  await assert.rejects(new h.api.FordAPIClient(app.auth, app.store, prefs()).sendCommand(VIN, 'start'), /ajar/i);
  assert.equal(h.state.requests.length, 0); assert.equal(app.store.read().commandAfter, undefined); app.store.release();
});

test('a known component becoming Unknown does not relax a prior Ajar start guard until that component closes', async () => {
  const h = load();
  let fields = merge(h, {}, { doorStatus: [entry('FRONT_LEFT', 'AJAR', 120)], hoodStatus: hood() });
  fields = merge(h, fields, { doorStatus: [entry('FRONT_LEFT', 'UNKNOWN', 60)] });
  assert.equal(fields.doors.value, 'Unknown');
  const app = await prepared(h, prefs(), cache({ fields }));
  await assert.rejects(new h.api.FordAPIClient(app.auth, app.store, prefs()).sendCommand(VIN, 'start'), /ajar/i);
  assert.equal(h.state.requests.length, 0);
  fields = merge(h, plain(fields), { doorStatus: [entry('FRONT_LEFT', 'CLOSED', 30)] });
  assert.equal(fields.doors.value, 'Closed');
  assert(fields.doors.componentStatus.readings.every(reading => !reading.unresolvedUnsafe)); app.store.release();
});

test('future whole-door Closed evidence cannot clear an unsafe legacy barrier or its start guard', async () => {
  const h = load();
  const fields = merge(h, { doors: { value: 'Ajar', at: at(3600), source: 'FordPass' } },
    { doorStatus: [{ vehicleDoor: 'ALL_DOORS', value: 'CLOSED', updateTime: TIME + 1000 }], hoodStatus: { value: 'CLOSED', updateTime: TIME + 1000 } });
  assert.equal(fields.doors.value, 'Unknown'); assert.equal(fields.doors.componentStatus.legacy.value, 'Ajar');
  assert.equal(fields.doors.measurementAt, null);
  const app = await prepared(h, prefs(), cache({ fields }));
  await assert.rejects(new h.api.FordAPIClient(app.auth, app.store, prefs()).sendCommand(VIN, 'start'), /ajar/i);
  assert.equal(h.state.requests.length, 0); app.store.release();
});

test('future Closed or mechanical readings cannot resolve known unsafe component evidence', () => {
  const h = load();
  for (const unknown of [false, true]) {
    let fields = merge(h, {}, { doorStatus: [entry('FRONT_LEFT', 'AJAR', 120)], hoodStatus: hood() });
    if (unknown) fields = merge(h, fields, { doorStatus: [entry('FRONT_LEFT', 'UNKNOWN', 60)] });
    fields = merge(h, plain(fields), { doorStatus: [{ vehicleDoor: 'FRONT_LEFT', value: 'CLOSED', updateTime: TIME + 1000 }] });
    assert.equal(fields.doors.value, unknown ? 'Unknown' : 'Ajar');
    assert.equal(fields.doors.componentStatus.readings.find(reading => reading.id === 'FRONT_LEFT').unresolvedUnsafe, true);
  }
  for (const updateTime of [at(120), undefined]) {
    let fields = merge(h, {}, { doorLockStatus: [{ vehicleDoor: 'TAILGATE', value: 'UNLOCKED', updateTime }] });
    fields = merge(h, fields, { doorLockStatus: [{ vehicleDoor: 'TAILGATE', value: 'UNLOCKED', doorLatchType: 'MECHANICAL', updateTime: TIME + 1000 }] });
    assert.equal(fields.lock.value, 'Unlocked');
  }
});

test('built-in offline self-test passes with explicitly unknown security fields', () => {
  const h = load(); h.api.selfTest(); assert.equal(h.state.requests.length, 0);
});

test('undated unsafe readings are not hidden by dated safe ones, and Unknown does not blank the widget age', () => {
  const h = load();
  let fields = merge(h, {}, { doorLockStatus: [entry('ALL_DOORS', 'LOCKED', 100), { vehicleDoor: 'FRONT_LEFT', value: 'UNLOCKED' }] });
  assert.equal(fields.lock.value, 'Unlocked');
  fields = merge(h, {}, { doorStatus: [entry('FRONT_LEFT', 'CLOSED', 100)], hoodStatus: hood() });
  fields = merge(h, fields, { doorStatus: [{ vehicleDoor: 'FRONT_LEFT', value: 'OPEN' }], hoodStatus: hood() });
  assert.equal(fields.doors.value, 'Ajar');
  fields = merge(h, { fuel: { value: 50, at: at(10), source: 'FordPass' } }, { doorLockStatus: [{ vehicleDoor: 'ALL_DOORS', value: 'WEIRD' }] });
  assert.equal(fields.lock.value, 'Unknown');
  assert.equal(new h.api.WidgetRenderer({}, { fields }).oldest(), at(10));
});
