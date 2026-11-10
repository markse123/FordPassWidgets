'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const { load, prefs, cache, prepared, plain, TIME, VIN } = require('./scriptable.cjs');

const source = fs.readFileSync(path.join(__dirname, '../FordPassWidgets.js'), 'utf8');
const boundary = source.lastIndexOf('try { await new AppController().run(); }');
assert.ok(boundary > 0);
function harness() {
  const exposed = source.slice(0, boundary) + '\nglobalThis.temperatureUnderTest = statusTemperatureDiagnostic;\n' + source.slice(boundary);
  const h = load(exposed); h.diagnostic = h.context.temperatureUnderTest; return h;
}
const iso = value => new Date(value).toISOString();
function saved(value = 20, at = TIME - 3600000) {
  return cache({ fields: { outsideTemp: { value, at, source: 'FordPass' }, fuel: { value: 50, at: TIME - 1000, source: 'FordPass' } } });
}
function packet(entry = { value: 24, updateTime: iso(TIME - 1000) }, extra = {}) {
  return { vin: VIN, metrics: { fuelLevel: { value: 50, updateTime: iso(TIME - 1000) }, ...(entry === undefined ? {} : { outsideTemperature: entry }) }, ...extra };
}
const number = (report, group) => report[group].outsideTemp && report[group].outsideTemp.value.numericValue;

test('temperature diagnostics preserve zero, negative values, decimals and existing numeric-string interpretation', () => {
  const h = harness(), before = saved(), input = JSON.stringify(before);
  for (const value of [0, -10, -59.999, 69.999, 20.25, '0', ' -5 ', '1e1', '0x10']) {
    const raw = packet({ value, unit: '°C', updateTime: iso(TIME - 1000) }), original = JSON.stringify(raw);
    const report = h.diagnostic(raw, before, VIN, TIME);
    assert.equal(report.reason, 'accepted'); assert.equal(report.normalization, 'completed');
    assert.equal(report.raw.outsideTemperature.value.numericValue, Number(value));
    assert.equal(number(report, 'normalizedCandidate'), Number(value)); assert.equal(number(report, 'wouldMerge'), Number(value));
    assert.equal(report.normalizedCandidate.outsideTemp.asDisplayedFahrenheit, Math.round(Number(value) * 9 / 5 + 32));
    assert.equal(report.raw.outsideTemperature.unit.value, '°C'); assert.equal(report.timestampSource, 'metric');
    assert.equal(JSON.stringify(raw), original); assert.equal(JSON.stringify(before), input);
  }
  const unitIgnored = h.diagnostic(packet({ value: 10, unit: 'F', unitSymbol: '°F', updateTime: iso(TIME) }), before, VIN, TIME);
  assert.equal(number(unitIgnored, 'normalizedCandidate'), 10); assert.equal(unitIgnored.normalizedCandidate.outsideTemp.asDisplayedFahrenheit, 50);
  assert.equal(unitIgnored.raw.outsideTemperature.unit.value, 'F'); assert.match(unitIgnored.scope, /assumes Celsius and ignores unit labels/);
  assert.equal(h.state.requests.length, 0); assert.equal(h.state.files.size, 0); assert.equal(h.state.secrets.size, 0);
});

test('missing, malformed and out-of-range temperature metrics expose fixed rejection reasons without inventing aliases', () => {
  const h = harness(), before = saved();
  const cases = [[undefined, 'metric_missing'], [null, 'metric_missing'], [[], 'invalid_metric_shape'], ['20', 'invalid_metric_shape'],
    [{}, 'value_missing'], [{ value: null }, 'value_missing'], [{ value: true }, 'non_numeric'], [{ value: {} }, 'non_numeric'],
    [{ value: [] }, 'non_numeric'], [{ value: '' }, 'non_numeric'], [{ value: '   ' }, 'non_numeric'], [{ value: NaN }, 'non_numeric'],
    [{ value: Infinity }, 'non_numeric'], [{ value: -60 }, 'out_of_parser_range'], [{ value: 70 }, 'out_of_parser_range']];
  for (const [entry, reason] of cases) {
    const raw = packet(null); if (entry === undefined) delete raw.metrics.outsideTemperature; else raw.metrics.outsideTemperature = entry;
    raw.metrics.outsideTemp = { value: 25 }; raw.metrics.ambientTemperature = { value: 25 };
    const report = h.diagnostic(raw, before, VIN, TIME);
    assert.equal(report.reason, reason); assert.equal(report.normalization, 'completed');
    assert.equal(report.normalizedCandidate.outsideTemp, null); assert.equal(report.mergeDecision, 'no_candidate');
    assert.equal(number(report, 'wouldMerge'), 20); assert.equal(report.timestampSource, 'unknown');
    assert.doesNotMatch(JSON.stringify(report), /ambientTemperature/);
  }
  assert.equal(h.state.requests.length, 0);
});

test('temperature diagnostics distinguish same or changed values from older, equal, newer and missing sample times', () => {
  const h = harness(), oldAt = TIME - 3600000;
  const cases = [
    { value: 20, at: oldAt - 1000, decision: 'retained_candidate_older', result: 20, resultAt: oldAt },
    { value: 20, at: oldAt + 1000, decision: 'accepted_not_older', result: 20, resultAt: oldAt + 1000 },
    { value: 24, at: oldAt - 1000, decision: 'retained_candidate_older', result: 20, resultAt: oldAt },
    { value: 24, at: oldAt, decision: 'accepted_not_older', result: 24, resultAt: oldAt },
    { value: 24, at: oldAt + 1000, decision: 'accepted_not_older', result: 24, resultAt: oldAt + 1000 },
    { value: 24, at: null, decision: 'retained_candidate_time_missing', result: 20, resultAt: oldAt },
    { value: 24, at: oldAt + 1000, missingCached: true, decision: 'accepted_no_cached_value', result: 24, resultAt: oldAt + 1000 },
    { value: 24, at: oldAt + 1000, missingCachedTime: true, decision: 'accepted_cached_time_missing', result: 24, resultAt: oldAt + 1000 }
  ];
  for (const scenario of cases) {
    const before = saved(20, scenario.missingCachedTime ? null : oldAt);
    if (scenario.missingCached) delete before.fields.outsideTemp;
    const raw = packet({ value: scenario.value, ...(scenario.at === null ? {} : { updateTime: iso(scenario.at) }) });
    const report = h.diagnostic(raw, before, VIN, TIME);
    assert.equal(report.mergeDecision, scenario.decision); assert.equal(number(report, 'wouldMerge'), scenario.result);
    assert.equal(report.wouldMerge.outsideTemp.at.normalizerAtMs, scenario.resultAt);
    assert.deepEqual(plain(report.cachedAfter), plain(report.before));
    for (const group of ['before', 'normalizedCandidate', 'wouldMerge', 'cachedAfter']) assert.deepEqual(Object.keys(report[group]), ['outsideTemp']);
  }
});

test('metric, root fallback and unknown temperature times follow the existing timestamp parser', () => {
  const h = harness(), before = saved(), metricAt = TIME - 1000, rootAt = TIME - 2000;
  for (const updateTime of [undefined, 'invalid-time', 0, TIME + 61000]) {
    const report = h.diagnostic(packet({ value: 15, updateTime }, { updateTime: iso(rootAt) }), before, VIN, TIME);
    assert.equal(report.timestampSource, 'root'); assert.equal(report.normalizedCandidate.outsideTemp.at.normalizerAtMs, rootAt);
  }
  const own = h.diagnostic(packet({ value: 15, updateTime: iso(metricAt) }, { updateTime: iso(rootAt) }), before, VIN, TIME);
  assert.equal(own.timestampSource, 'metric'); assert.equal(own.normalizedCandidate.outsideTemp.at.normalizerAtMs, metricAt);
  const unknown = h.diagnostic(packet({ value: 15, updateTime: 'invalid-time' }), before, VIN, TIME);
  assert.equal(unknown.timestampSource, 'unknown'); assert.equal(unknown.normalizedCandidate.outsideTemp.at.rawValue, null);
  const seconds = metricAt / 1000, numeric = h.diagnostic(packet({ value: 15, updateTime: seconds }), before, VIN, TIME);
  assert.equal(numeric.raw.outsideTemperature.updateTime.format, 'epoch_seconds');
  assert.equal(numeric.raw.outsideTemperature.updateTime.asEpochSecondsISO, iso(metricAt));
  assert.equal(numeric.normalizedCandidate.outsideTemp.at.normalizerAtMs, seconds, 'The diagnostic must not silently fix the existing literal-millisecond interpretation');
  assert.equal(numeric.mergeDecision, 'retained_candidate_older');
});

test('direct and wrapped temperature responses require matching request, response and cache VINs', () => {
  const h = harness(), before = saved(), direct = packet(), wrapped = { vin: VIN, vehicleStatus: { ...direct, VIN: VIN.toLowerCase() } };
  assert.deepEqual(plain(h.diagnostic(wrapped, before, VIN, TIME)), plain(h.diagnostic(direct, before, VIN, TIME)));
  const other = '1FTFW1E50JFA00002';
  for (const raw of [{ ...direct, vin: other }, { vin: other, vehicleStatus: direct }, { vin: VIN, vehicleStatus: { ...direct, VIN: other } }])
    assert.throws(() => h.diagnostic(raw, before, VIN, TIME), /vehicle mismatch/);
  assert.throws(() => h.diagnostic(direct, before, VIN + '\n', TIME), /vehicle mismatch/);
  assert.throws(() => h.diagnostic(direct, { ...before, vin: other }, VIN, TIME), /cache vehicle mismatch/);
  assert.throws(() => h.diagnostic(direct, before, VIN, TIME, { ...before, vin: other }), /cache vehicle mismatch/);
  for (const raw of [null, [], {}, { vehicleStatus: null }, { metrics: [] }]) assert.throws(() => h.diagnostic(raw, before, VIN, TIME), /mismatch|schema unsupported/);
});

test('temperature diagnostics whitelist typed numeric values, units and times while withholding private fields and oversized scalars', () => {
  const h = harness(), before = saved({ token: 'PRIVATE_CACHED_TOKEN' }, 'PRIVATE_CACHED_TIME');
  before.fields.outsideTemp.source = 'PRIVATE_PROVIDER'; before.fields.position = { value: { lat: 42.12345, lon: -83.12345 } };
  const raw = packet({ value: 'PRIVATE_VALUE', unit: 'PRIVATE_UNIT', unitSymbol: VIN, updateTime: 'PRIVATE_TIME',
    PRIVATE_ENTRY_KEY: 'PRIVATE_ENTRY_VALUE', url: 'https://private.invalid/secret' });
  raw.token = 'PRIVATE_TOKEN'; raw.correlationId = 'PRIVATE_CORRELATION'; raw.metrics.position = { value: { lat: 42.12345, lon: -83.12345 } };
  const input = [JSON.stringify(raw), JSON.stringify(before)], report = h.diagnostic(raw, before, VIN, TIME);
  assert.equal(report.reason, 'non_numeric'); assert.equal(report.raw.outsideTemperature.value.numericValue, null);
  assert.equal(report.raw.outsideTemperature.unit.value, null); assert.equal(report.raw.outsideTemperature.unitSymbol.value, null);
  assert.equal(report.raw.outsideTemperature.updateTime.rawValue, null); assert.equal(report.before.outsideTemp.value.numericValue, null);
  assert.equal(report.before.outsideTemp.asDisplayedFahrenheit, null); assert.equal(report.before.outsideTemp.source, null);
  assert.doesNotMatch(JSON.stringify(report), /PRIVATE_|1FTFW1E50JFA00001|42\.12345|-83\.12345|private\.invalid/);
  assert.deepEqual([JSON.stringify(raw), JSON.stringify(before)], input);
  for (const value of [1000001, -1000001, 1e100, '12345678901234567']) {
    raw.metrics.outsideTemperature.value = value;
    const withheld = h.diagnostic(raw, before, VIN, TIME);
    assert.equal(withheld.raw.outsideTemperature.value.numericValue, null); assert.equal(withheld.raw.outsideTemperature.value.withheldCount, 1);
  }
  assert.equal(h.state.requests.length, 0); assert.equal(h.state.files.size, 0); assert.equal(h.state.secrets.size, 0);
});

test('vehicle diagnostic Preview and Copy reuse one passive read and include temperature decisions without writing saved telemetry', async () => {
  const h = harness(), vehicle = prefs(), before = saved(), app = await prepared(h, vehicle, before);
  const files = [...h.state.files], secrets = [...h.state.secrets]; let writes = 0, tokenCalls = 0;
  app.auth.token = async name => { tokenCalls += 1; assert.equal(name, 'autonomic'); return 'synthetic-temperature-token'; };
  const write = app.store.write.bind(app.store); app.store.write = value => { writes += 1; return write(value); };
  h.state.responses.push({ body: packet({ value: 24, unit: 'C', updateTime: iso(TIME - 1000), token: 'PRIVATE_ENTRY_TOKEN' }) });
  h.state.choices.push('Preview report', 'Copy report', 'OK');
  const report = await app.vehicleStatusDiagnostic(vehicle);
  assert.equal(report.reportVersion, 5); assert.equal(report.cloudReadOutcome, 'succeeded');
  assert.equal(report.temperature.reason, 'accepted'); assert.equal(report.temperature.mergeDecision, 'accepted_not_older');
  assert.equal(number(report.temperature, 'before'), 20); assert.equal(number(report.temperature, 'wouldMerge'), 24);
  assert.equal(number(report.temperature, 'cachedAfter'), 20);
  assert.equal(h.state.requests.length, 1); assert.equal(tokenCalls, 1); assert.equal(writes, 0);
  assert.equal(h.state.requests[0].method, 'GET'); assert.equal(h.state.requests[0].body, undefined);
  assert.equal(h.state.requests[0].url, 'https://api.autonomic.ai/v1/telemetry/sources/fordpass/vehicles/' + VIN);
  assert.equal(h.state.previews.length, 1); assert.equal(h.state.clipboard.length, 1); assert.equal(h.state.previews[0], h.state.clipboard[0]);
  assert.deepEqual(JSON.parse(h.state.clipboard[0]), plain(report)); assert.doesNotMatch(h.state.clipboard[0], /PRIVATE_|1FTFW1E50JFA00001/);
  assert.deepEqual([...h.state.files], files); assert.deepEqual([...h.state.secrets], secrets); app.store.release();
});

test('failed, gated and rejected reads retain safe cached temperature; canceling sends no read', async () => {
  for (const scenario of ['http-error', 'historical-gate', 'wrong-vin', 'cancel']) {
    const h = harness(), vehicle = prefs(), app = await prepared(h, vehicle, saved()), files = [...h.state.files]; let writes = 0, tokenCalls = 0;
    app.auth.token = async () => { tokenCalls += 1; return 'synthetic-temperature-token'; };
    const write = app.store.write.bind(app.store); app.store.write = value => { writes += 1; return write(value); };
    if (scenario === 'http-error') h.state.responses.push({ status: 503, body: { token: 'PRIVATE_ERROR_TOKEN', error: 'PRIVATE_SERVER_ERROR', vin: VIN } });
    if (scenario === 'historical-gate') h.api.secretSet('gate.telemetry.mobile', { failures: 1, next: TIME + 90000 });
    if (scenario === 'wrong-vin') h.state.responses.push({ body: { ...packet(), vin: '1FTFW1E50JFA00002' } });
    h.state.choices.push(...(scenario === 'cancel' ? [-1] : ['Copy report', 'OK']));
    const report = await app.vehicleStatusDiagnostic(vehicle);
    if (scenario === 'cancel') { assert.equal(report, null); assert.equal(tokenCalls, 0); assert.equal(h.state.clipboard.length, 0); }
    else {
      assert.equal(report.reportVersion, 5); assert.equal(report.cloudReadOutcome, scenario === 'wrong-vin' ? 'response_rejected' : 'unavailable');
      assert.equal(report.temperature.reason, 'cloud_unavailable'); assert.equal(report.temperature.normalization, 'not_attempted');
      assert.equal(report.temperature.mergeDecision, 'not_evaluated'); assert.equal(report.temperature.raw, null);
      assert.equal(number(report.temperature, 'before'), 20); assert.equal(number(report.temperature, 'wouldMerge'), 20);
      assert.equal(number(report.temperature, 'cachedAfter'), 20); assert.equal(report.temperature.normalizedCandidate.outsideTemp, null);
      assert.equal(h.state.clipboard.length, 1); assert.doesNotMatch(h.state.clipboard[0], /PRIVATE_|1FTFW1E50JFA0000[12]/);
    }
    assert.equal(h.state.requests.length, ['http-error', 'wrong-vin'].includes(scenario) ? 1 : 0);
    assert.ok(h.state.requests.every(request => request.method === 'GET')); assert.equal(writes, 0);
    assert.deepEqual([...h.state.files], files); assert.equal(h.state.safari.length, 0); app.store.release();
  }
});
