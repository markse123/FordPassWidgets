'use strict';
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { regressionLoad: load, prefs, cache, prepared, plain, TIME, VIN } = require('./scriptable.cjs');

function running(extra = {}) {
  return cache({ fields: { remoteStart: { value: { until: TIME + 600000 }, at: TIME - 10000, source: 'FordPass' } }, ...extra });
}
function actions(tree) {
  const result = [];
  const walk = node => {
    if (!node || typeof node !== 'object') return;
    const match = String(node.url || '').match(/[?&]action=([^&]*)/);
    if (match) result.push(decodeURIComponent(match[1]));
    for (const child of node.children || []) walk(child);
  };
  walk(tree); return result;
}
function assertStopAvailable(h, vehicle, saved) {
  for (const family of ['medium', 'large']) {
    const renderer = new h.api.WidgetRenderer(vehicle, saved);
    assert.ok(renderer.remote(), family + ' must retain the known running countdown');
    const links = actions(renderer.build(family));
    assert.ok(links.includes('stop'), family + ' must retain Stop access');
    assert.ok(!links.includes('start'), family + ' must not project an unconfirmed engine stop');
  }
}

test('accepted Stop preserves Ford running telemetry and Stop controls without polling', async () => {
  for (const status of ['accepted', 'success']) {
    const h = load(), vehicle = prefs({ widget: { medium: 'controls' } }), initial = running();
    const app = await prepared(h, vehicle, initial), api = new h.api.FordAPIClient(app.auth, app.store, vehicle);
    h.state.responses.push({ body: { id: 'synthetic-stop-receipt', status } });
    const result = await api.sendCommand(VIN, 'stop'), saved = app.store.read();
    assert.match(result, /Vehicle completion is unverified/);
    assert.equal(h.state.requests.length, 1, 'Stop must not introduce a polling or retry loop');
    assert.equal(h.state.requests[0].url, 'https://api.autonomic.ai/v1/command/vehicles/' + VIN + '/commands');
    assert.deepEqual(JSON.parse(h.state.requests[0].body), { properties: {}, tags: {}, type: 'cancelRemoteStart', wakeUp: true });
    assert.deepEqual(plain(saved.fields.remoteStart), initial.fields.remoteStart);
    assert.equal(saved.startRun, undefined, 'Acceptance must not create an engine-off estimate');
    assert.equal(saved.lastCommand.action, 'stop');
    assert.equal(saved.lastCommand.outcome, 'Accepted; completion unverified');
    assertStopAvailable(h, vehicle, saved);
    h.state.clock = TIME + 600001;
    assert.equal(new h.api.WidgetRenderer(vehicle, saved).remote(), null, 'The original countdown still expires');
    app.store.release();
  }
});

test('Stop retains a positive start estimate until newer Ford stopped telemetry arrives', async () => {
  const h = load(), vehicle = prefs({ widget: { medium: 'controls' } });
  const initial = running({ startRun: { at: TIME - 5000, until: TIME + 900000, estimated: true } });
  const app = await prepared(h, vehicle, initial), api = new h.api.FordAPIClient(app.auth, app.store, vehicle);
  h.state.responses.push({ body: { id: 'synthetic-stop-receipt', status: 'accepted' } });
  await api.sendCommand(VIN, 'stop');
  assert.deepEqual(plain(app.store.read().startRun), initial.startRun);
  assertStopAvailable(h, vehicle, app.store.read());
  h.state.clock += 31000;
  h.state.responses.push({ body: { vin: VIN, metrics: { remoteStartCountdownTimer: { value: 0, updateTime: new Date(h.state.clock).toISOString() } } } });
  await api.getVehicleStatus();
  const renderer = new h.api.WidgetRenderer(vehicle, app.store.read());
  assert.equal(renderer.remote(), null, 'A newer Ford zero countdown must override the older estimate');
  const links = actions(renderer.build('large'));
  assert.ok(links.includes('start')); assert.ok(!links.includes('stop'));
  assert.equal(h.state.requests.length, 2, 'The only follow-up read is the explicit telemetry fetch');
  app.store.release();
});

test('a rejected or failed Stop keeps known running evidence without retrying', async () => {
  for (const response of [{ body: { id: 'synthetic-rejected-stop', status: 'failed' } },
    { status: 503, body: { error: 'synthetic failure' } }, new Error('synthetic transport failure')]) {
    const h = load(), vehicle = prefs({ widget: { medium: 'controls' } });
    const initial = running({ startRun: { at: TIME - 5000, until: TIME + 900000, estimated: true } });
    const app = await prepared(h, vehicle, initial), api = new h.api.FordAPIClient(app.auth, app.store, vehicle);
    h.state.responses.push(response);
    await assert.rejects(api.sendCommand(VIN, 'stop'));
    assert.equal(h.state.requests.length, 1);
    assert.deepEqual(plain(app.store.read().startRun), initial.startRun);
    assert.deepEqual(plain(app.store.read().fields.remoteStart), initial.fields.remoteStart);
    assertStopAvailable(h, vehicle, app.store.read());
    app.store.release();
  }
});

test('canceling Stop confirmation changes no cached running state and sends nothing', async () => {
  const h = load(), vehicle = prefs({ widget: { medium: 'controls' } }), app = await prepared(h, vehicle, running());
  const before = plain(app.store.read()); h.state.choices.push(-1);
  await app.action('stop', vehicle);
  assert.equal(h.state.requests.length, 0);
  assert.deepEqual(plain(app.store.read()), before);
  assertStopAvailable(h, vehicle, app.store.read());
  app.store.release();
});

test('legacy optimistic Stop markers cannot hide still-valid Ford countdowns', () => {
  const h = load(), vehicle = prefs({ widget: { medium: 'controls' } });
  assertStopAvailable(h, vehicle, running({ startRun: { at: TIME - 500, until: 0 } }));
  const expiredEstimate = running({ startRun: { at: TIME - 500, until: TIME - 1, estimated: true } });
  assert.equal(new h.api.WidgetRenderer(vehicle, expiredEstimate).remote(), null, 'A positive start estimate keeps its original expiry');
});

test('built-in offline self-tests pass without transport', () => {
  const h = load(); h.api.selfTest(); assert.equal(h.state.requests.length, 0);
});
