'use strict';

const assert = require('node:assert/strict');
const vm = require('node:vm');
const {test} = require('node:test');
const {load, prefs, cache, plain, TIME, VIN} = require('./scriptable.cjs');

const iso = at => new Date(at).toISOString();
const sample = (value, at = TIME - 1000, extra = {}) => ({value, updateTime: iso(at), ...extra});
const packet = (metrics, extra = {}) => ({vin: VIN, metrics, ...extra});
const normalize = (h, metrics, extra = {}, source = 'FordPass') => h.api.normalize(packet(metrics, extra), VIN, source, h.state.clock);
const wheel = (vehicleWheel, value, at = TIME - 1000, extra = {}) => sample(value, at, {vehicleWheel, unit: 'psi', ...extra});
const otherTires = () => ['FRONT_RIGHT', 'REAR_LEFT', 'REAR_RIGHT'].map(id => wheel(id, 35));

test('undated or invalid scalar measurement times never borrow root/cloud time or overwrite a dated reading', () => {
  const h = load();
  const before = normalize(h, {outsideTemperature: sample(10, TIME - 60000)});
  for (const updateTime of [undefined, null, 'invalid-time', 0, TIME + 1, TIME + 61000]) {
    const candidate = normalize(h, {outsideTemperature: {value: 30, updateTime}}, {updateTime: iso(TIME)});
    assert.equal(candidate.outsideTemp.at, null);
    assert.equal(candidate.outsideTemp.fetchedAt, TIME);
    const merged = h.api.mergeFields(before, {}, candidate);
    assert.equal(merged.outsideTemp.value, 10);
    assert.equal(merged.outsideTemp.at, TIME - 60000);
  }
  const measured = normalize(h, {outsideTemperature: sample(0, TIME)}, {updateTime: iso(TIME - 30000)});
  assert.equal(measured.outsideTemp.value, 0);
  assert.equal(measured.outsideTemp.at, TIME);
  assert.equal(h.api.mergeFields(before, {}, measured).outsideTemp.value, 0);
  assert.equal(h.state.requests.length, 0);
});

test('undated scalar values remain available as unknown-age data when no dated cache exists', () => {
  const h = load();
  const fields = normalize(h, {fuelLevel: {value: 0}, oilLifeRemaining: {value: 0}, batteryStateOfCharge: {value: 0},
    outsideTemperature: {value: 0}, fuelRange: {value: 0}, odometer: {value: 0}}, {updateTime: iso(TIME)});
  for (const key of ['fuel', 'oil', 'battery', 'outsideTemp', 'range', 'odometer']) {
    assert.equal(fields[key].value, 0, key);
    assert.equal(fields[key].at, null, key);
    assert.equal(h.api.mergeFields({}, {}, fields)[key].at, null, key);
  }
  assert.equal(h.state.requests.length, 0);
});

test('remote-start countdown deadlines require their own valid measurement time', () => {
  const h = load();
  const normalizeCountdown = entry => normalize(h, {fuelLevel: sample(50), remoteStartCountdownTimer: entry}, {updateTime: iso(h.state.clock)});
  for (const updateTime of [undefined, 'invalid-time', 0, TIME + 1]) {
    for (const value of [0, 600]) assert.equal(normalizeCountdown({value, updateTime}).remoteStart, undefined);
  }
  const initial = normalizeCountdown(sample(600, TIME - 60000));
  assert.equal(initial.remoteStart.value.until, TIME + 540000);
  h.state.clock += 120000;
  const repeated = normalizeCountdown(sample(600, TIME - 60000));
  assert.equal(repeated.remoteStart.value.until, initial.remoteStart.value.until);
  const undated = normalizeCountdown({value: 600});
  const merged = h.api.mergeFields(initial, {}, undated);
  assert.equal(merged.remoteStart.value.until, TIME + 540000);
  assert.equal(merged.remoteStart.value.until - h.state.clock, 420000);
  const stopped = normalizeCountdown(sample(0, h.state.clock));
  assert.equal(stopped.remoteStart.value.until, 0);
  assert.equal(h.api.mergeFields(merged, {}, stopped).remoteStart.value.until, 0);
  assert.equal(h.state.requests.length, 0);
});

test('temperature diagnostics report unknown metric time while preserving cloud time as separate evidence', () => {
  const h = load(), diagnostic = vm.runInContext('statusTemperatureDiagnostic', h.context);
  const before = cache({fields: {outsideTemp: {value: 10, at: TIME - 60000, source: 'FordPass'}}});
  const original = JSON.stringify(before);
  for (const updateTime of [undefined, 'invalid-time', TIME + 1]) {
    const report = diagnostic(packet({outsideTemperature: {value: 30, updateTime}}, {updateTime: iso(TIME)}), before, VIN, TIME);
    assert.equal(report.timestampSource, 'unknown');
    assert.equal(report.normalizedCandidate.outsideTemp.at.normalizerAtMs, null);
    assert.equal(report.rootUpdateTime.normalizerAtMs, TIME);
    assert.equal(report.mergeDecision, 'retained_candidate_time_missing');
    assert.equal(report.wouldMerge.outsideTemp.value.numericValue, 10);
  }
  assert.equal(JSON.stringify(before), original);
  assert.equal(h.state.requests.length, 0);
});

test('newest duplicate tire selection is independent of entry order and cannot hide a low tire alert', () => {
  for (const duplicates of [[wheel('FRONT_LEFT', 15), wheel('FRONT_LEFT', 35, TIME - 60000)],
    [wheel('FRONT_LEFT', 35, TIME - 60000), wheel('FRONT_LEFT', 15)]]) {
    const h = load(), fields = normalize(h, {tirePressure: [...otherTires(), ...duplicates]});
    assert.equal(fields.fl.value, 15);
    assert.equal(fields.fl.at, TIME - 1000);
    assert.deepEqual(plain(fields.fl), plain(fields.wheelPressures.value.FRONT_LEFT));
    assert.match(h.api.nightProblems(fields, prefs()).join(' '), /Low tire FL/);
    assert.equal(h.state.requests.length, 0);
  }
});

test('canonical and legacy wheel aliases share newest selection and preserve existing units and numeric strings', () => {
  const h = load(), fields = normalize(h, {tirePressure: [wheel('LEFT_FRONT', '15'), wheel('FRONT_LEFT', 35, TIME - 60000),
    wheel('RIGHT_FRONT', 2, TIME - 1000, {unit: null, unitSymbol: 'bar'}),
    wheel('LEFT_REAR', 241.316505255, TIME - 1000, {unit: null, unitSymbol: null}),
    wheel('RIGHT_REAR', 0), wheel('REAR_LEFT_INNER', '70')]});
  assert.equal(fields.fl.value, 15);
  assert.equal(fields.wheelPressures.value.FRONT_LEFT.value, 15);
  assert(Math.abs(fields.fr.value - 29.0075476) < 1e-8);
  assert(Math.abs(fields.rl.value - 35) < 1e-8);
  assert.equal(fields.rr.value, 0);
  assert.equal(fields.rli, undefined, 'Extra positions retain numeric-only schema validation');
  assert.deepEqual(Object.keys(fields.wheelPressures.value).sort(), ['FRONT_LEFT', 'FRONT_RIGHT', 'REAR_LEFT', 'REAR_RIGHT']);
  assert.equal(h.state.requests.length, 0);
});

test('oversized wheel packets cannot silently hide an unparsed low reading behind fresh healthy tire data', () => {
  const h = load();
  const before = normalize(h, {tirePressure: ['FRONT_LEFT', 'FRONT_RIGHT', 'REAR_LEFT', 'REAR_RIGHT'].map(id => wheel(id, 35, TIME - 60000))});
  const pressureEntries = Array.from({length: 32}, () => wheel('FRONT_LEFT', 35));
  pressureEntries.push(wheel('FRONT_LEFT', 15, TIME));
  const candidate = normalize(h, {fuelLevel: sample(40), tirePressure: pressureEntries});
  assert.equal(candidate.fuel.value, 40);
  assert.equal(candidate.wheelPressures, undefined);
  for (const key of ['fl', 'fr', 'rl', 'rr', 'rli', 'rlo', 'rri', 'rro']) assert.equal(candidate[key], undefined, key);
  const merged = h.api.mergeFields(before, {}, candidate);
  for (const key of ['fl', 'fr', 'rl', 'rr']) assert.equal(merged[key].at, TIME - 60000, key);
  assert.equal(merged.wheelPressures.at, TIME - 60000);
  assert.equal(h.state.requests.length, 0);
});

test('equal-time conflicting tire values choose the lower pressure in either order', () => {
  for (const values of [[15, 35], [35, 15]]) {
    const h = load(), fields = normalize(h, {tirePressure: values.map(value => wheel('FRONT_LEFT', value))});
    assert.equal(fields.fl.value, 15);
    assert.equal(fields.wheelPressures.value.FRONT_LEFT.value, 15);
  }
});

test('undated, future or malformed tire entries cannot replace dated data or introduce unrecognized positions', () => {
  const h = load();
  const fields = normalize(h, {tirePressure: [wheel('FRONT_LEFT', 15), {vehicleWheel: 'FRONT_LEFT', value: 35, unit: 'psi'},
    wheel('FRONT_LEFT', 40, TIME + 1), null, {vehicleWheel: ['RIGHT_FRONT'], value: 1, unit: 'psi'},
    wheel('REAR_LEFT_INNER', 70), wheel('REAR_LEFT_INNER', '75'), wheel('REAR_LEFT_INNER', 80, TIME + 1)]});
  assert.equal(fields.fl.value, 15);
  assert.equal(fields.fr, undefined);
  assert.equal(fields.rli.value, 70);
  assert.equal(fields.wheelPressures.value.REAR_LEFT_INNER.value, 70);
  assert.equal(h.state.requests.length, 0);
});

test('merges keep visible wheel fields synchronized with the chosen inventory reading', () => {
  const h = load();
  const old = normalize(h, {tirePressure: [wheel('FRONT_LEFT', 20, TIME - 60000), wheel('REAR_LEFT_INNER', 70, TIME - 60000)]});
  const official = normalize(h, {tirePressure: [wheel('FRONT_LEFT', 35), wheel('REAR_LEFT_INNER', 80)]}, {}, 'FordConnect');
  const mobile = normalize(h, {tirePressure: [wheel('FRONT_LEFT', 15), wheel('REAR_LEFT_INNER', 65)]});
  const merged = h.api.mergeFields(old, official, mobile);
  assert.equal(merged.fl.value, 15);
  assert.equal(merged.rli.value, 65);
  for (const [wheelID, key] of [['FRONT_LEFT', 'fl'], ['REAR_LEFT_INNER', 'rli']])
    assert.deepEqual(plain(merged[key]), plain(merged.wheelPressures.value[wheelID]));
  const newer = normalize(h, {tirePressure: [wheel('FRONT_LEFT', 35, TIME)]});
  assert.equal(h.api.mergeFields(merged, {}, newer).fl.value, 35, 'A genuinely newer healthy reading can clear the old low value');
});

test('a dated tire from a pre-inventory cache survives an undated incoming wheel packet', () => {
  const h = load();
  const old = {fl: {value: 15, at: TIME - 60000, source: 'FordPass', fetchedAt: TIME - 30000}};
  const candidate = normalize(h, {tirePressure: [{vehicleWheel: 'FRONT_LEFT', value: 35, unit: 'psi'}]});
  const merged = h.api.mergeFields(old, {}, candidate);
  assert.equal(merged.fl.value, 15);
  assert.equal(merged.fl.at, TIME - 60000);
  assert.deepEqual(plain(merged.fl), plain(merged.wheelPressures.value.FRONT_LEFT));
});
