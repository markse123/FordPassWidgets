'use strict';
const assert = require('node:assert/strict');
const {test} = require('node:test');
const {regressionLoad: load, prefs, prepared, TIME, VIN} = require('./scriptable.cjs');
const baseline = {vin: VIN, metrics: {fuelLevel: {value: 70, updateTime: new Date(TIME).toISOString()}},
  states: {statusRefreshCommand: {commandId: 'synthetic-old', value: {toState: 'SUCCESS'}}}};

async function reopen(h, previous) {
  previous.store.release();
  const app = new h.api.AppController(); await app.attachVehicle(h.api.activeVehicleProfile().id);
  return app;
}

test('legacy Wake honors the combined refresh Retry-After after its local timer expires', async () => {
  const h = load(), vehicle = prefs(), app = await prepared(h, vehicle);
  const client = new h.api.FordAPIClient(app.auth, app.store, vehicle);
  h.state.responses.push({body: baseline}, {status: 429, headers: {'Retry-After': '3600'}, body: {}});
  const result = await client.requestGeneralStatus(true);
  assert.equal(result.outcome, 'delivery_uncertain');
  assert.equal(h.api.secretGet('gate.commands.generalStatus').next, TIME + 3600000);
  h.state.clock += 900001;
  const next = await reopen(h, app), api = new h.api.FordAPIClient(next.auth, next.store, vehicle);
  const before = h.state.requests.length;
  await assert.rejects(api.sendCommand(VIN, 'refresh'), /cooling down/);
  assert.equal(h.state.requests.length, before);
  assert.ok(h.api.secretGet('gate.commands.generalStatus').next > h.state.clock);
  next.store.release();
});

test('combined refresh honors legacy Wake Retry-After under the same operation gate', async () => {
  const h = load(), vehicle = prefs(), app = await prepared(h, vehicle);
  const client = new h.api.FordAPIClient(app.auth, app.store, vehicle);
  h.state.responses.push({status: 429, headers: {'Retry-After': '3600'}, body: {}});
  await assert.rejects(client.sendCommand(VIN, 'refresh'), /HTTP 429/);
  assert.equal(h.api.secretGet('gate.commands.generalStatus').next, TIME + 3600000);
  h.state.clock += 900001;
  const next = await reopen(h, app), api = new h.api.FordAPIClient(next.auth, next.store, vehicle);
  const before = h.state.requests.length;
  const result = await api.requestGeneralStatus(true);
  assert.equal(result.outcome, 'cooldown'); assert.equal(result.dispatched, false);
  assert.equal(h.state.requests.length, before);
  next.store.release();
});

test('general status backoff leaves unrelated confirmed lock available after shared spacing', async () => {
  const h = load(), vehicle = prefs(), app = await prepared(h, vehicle);
  const client = new h.api.FordAPIClient(app.auth, app.store, vehicle);
  h.state.responses.push({body: baseline}, {status: 429, headers: {'Retry-After': '3600'}, body: {}});
  await client.requestGeneralStatus(true);
  assert.equal(h.api.secretGet('gate.commands'), null);
  h.state.clock += 30001;
  h.state.responses.push({body: {id: 'synthetic-lock', status: 'accepted'}});
  await client.sendCommand(VIN, 'lock');
  const post = h.state.requests.at(-1);
  assert.equal(JSON.parse(post.body).type, 'lock');
  assert.ok(h.api.secretGet('gate.commands.generalStatus').next > h.state.clock);
  app.store.release();
});

test('existing global command backoff still blocks both general-status paths', async () => {
  const h = load(), vehicle = prefs(), app = await prepared(h, vehicle);
  const client = new h.api.FordAPIClient(app.auth, app.store, vehicle);
  h.api.secretSet('gate.commands', {next: TIME + 3600000, failures: 1});
  await assert.rejects(client.sendCommand(VIN, 'refresh'), /cooling down/);
  const result = await client.requestGeneralStatus(true);
  assert.equal(result.outcome, 'cooldown'); assert.equal(result.dispatched, false);
  assert.equal(h.state.requests.length, 0);
  app.store.release();
});
