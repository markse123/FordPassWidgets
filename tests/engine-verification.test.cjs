'use strict';
const assert = require('node:assert/strict');
const {test} = require('node:test');
const {regressionLoad: load, prefs, prepared, VIN} = require('./scriptable.cjs');

test('supported engine capability does not substitute for explicit owner verification', async () => {
  for (const verification of [false, undefined, 'true', 1]) {
    const h = load(), vehicle = prefs({features: {engineControl: verification}});
    const app = await prepared(h, vehicle);
    try {
      assert.equal(h.api.vehicleCapabilities(vehicle).engineControl, 'supported');
      assert.equal(h.api.engineControlAllowed(vehicle), false);
      for (const action of ['start', 'stop']) {
        assert.equal(h.api.vehicleCommandAllowed(vehicle, action), false);
        await assert.rejects(app.action(action, vehicle), /not enabled/);
      }
      assert.equal(h.state.requests.length, 0);
      assert.equal(h.state.alerts.length, 0, 'Disabled controls never reach command confirmation');
    } finally { app.releaseContext(); }
  }
});

test('verified engine support still requires the individual control opt-in', async () => {
  const h = load(), vehicle = prefs({compatibility: {commands: {start: false, stop: false}}});
  const app = await prepared(h, vehicle);
  try {
    assert.equal(h.api.engineControlAllowed(vehicle), true);
    for (const action of ['start', 'stop']) {
      assert.equal(h.api.vehicleCommandAllowed(vehicle, action), false);
      await assert.rejects(app.action(action, vehicle), /not enabled/);
    }
    assert.equal(h.state.requests.length, 0);
  } finally { app.releaseContext(); }
});

test('a missing verification preference object fails closed', async () => {
  const h = load(), vehicle = prefs();
  delete vehicle.features;
  const app = await prepared(h, vehicle);
  try {
    assert.equal(h.api.engineControlAllowed(vehicle), false);
    assert.equal(h.api.vehicleCommandAllowed(vehicle, 'start'), false);
    assert.equal(h.api.vehicleCommandAllowed(vehicle, 'stop'), false);
    await assert.rejects(app.action('start', vehicle), /not enabled/);
    assert.equal(h.state.requests.length, 0);
  } finally { app.releaseContext(); }
});

test('owner verification does not override vehicle eligibility or a disabled backend capability', async () => {
  for (const patch of [{engineType: 'BEV'}, {engineType: 'UNKNOWN'}, {transmission: 'MANUAL'},
    {transmission: 'UNKNOWN'}, {capabilities: {engineControl: 'unsupported'}},
    {capabilities: {engineControl: 'disabled'}}]) {
    const h = load(), vehicle = prefs(patch), app = await prepared(h, vehicle);
    try {
      assert.equal(vehicle.features.engineControl, true);
      assert.equal(h.api.engineControlAllowed(vehicle), false);
      for (const action of ['start', 'stop']) await assert.rejects(app.action(action, vehicle), /not enabled/);
      assert.equal(h.state.requests.length, 0);
    } finally { app.releaseContext(); }
  }
});

test('verified and individually enabled engine controls retain confirmation and normal dispatch', async () => {
  for (const action of ['start', 'stop']) {
    const h = load(), vehicle = prefs(), app = await prepared(h, vehicle);
    try {
      assert.equal(h.api.vehicleCommandAllowed(vehicle, action), true);
      h.state.choices.push(-1);
      assert.equal(await app.action(action, vehicle), undefined);
      assert.equal(h.state.requests.length, 0, 'Canceling the confirmation sends nothing');

      if (action === 'start') h.state.responses.push({body: {id: 'synthetic-lock', status: 'success'}});
      h.state.responses.push({body: {id: 'synthetic-engine-command', status: 'accepted'}});
      h.state.choices.push('Send command');
      assert.equal(await app.action(action, vehicle), true);
      assert.deepEqual(h.state.requests.filter(r => r.method === 'POST').map(r => JSON.parse(r.body).type),
        action === 'start' ? ['lock', 'remoteStart'] : ['cancelRemoteStart']);
    } finally { app.releaseContext(); }
  }
});

test('clearing verification takes effect even when an action holds older enabled preferences', async () => {
  const h = load(), vehicle = prefs(), app = await prepared(h, vehicle);
  try {
    assert.equal(h.api.vehicleCommandAllowed(vehicle, 'start'), true);
    h.api.saveVehicleProfile(Object.assign({}, vehicle, {features: Object.assign({}, vehicle.features, {engineControl: false})}), app.store);
    assert.equal(vehicle.features.engineControl, true, 'The caller still holds its original preferences');
    assert.equal(h.api.vehicleCommandAllowed(vehicle, 'start'), false);
    await assert.rejects(app.action('start', vehicle), /not enabled/);
    assert.equal(h.state.requests.length, 0);
  } finally { app.releaseContext(); }
});

test('verification revoked during asynchronous token acquisition prevents engine dispatch', async () => {
  for (const action of ['start', 'stop']) {
    const h = load(), vehicle = prefs({compatibility: {commands: {lock: false}}}), app = await prepared(h, vehicle);
    try {
      const api = new h.api.FordAPIClient(app.auth, app.store, vehicle);
      app.auth.token = async () => {
        h.api.saveVehicleProfile(Object.assign({}, vehicle, {features: Object.assign({}, vehicle.features, {engineControl: false})}), app.store);
        return 'synthetic-token';
      };
      await assert.rejects(api.sendCommand(VIN, action), /not enabled/);
      assert.equal(h.state.requests.length, 0);
    } finally { app.releaseContext(); }
  }
});

test('revoking engine verification prevents remoteStart even when standalone Lock remains enabled', async () => {
  const h = load(), vehicle = prefs(), app = await prepared(h, vehicle);
  try {
    const api = new h.api.FordAPIClient(app.auth, app.store, vehicle);
    app.auth.token = async () => {
      h.api.saveVehicleProfile(Object.assign({}, vehicle, {features: Object.assign({}, vehicle.features, {engineControl: false})}), app.store);
      return 'synthetic-token';
    };
    h.state.responses.push({body: {id: 'synthetic-lock', status: 'success'}});
    await assert.rejects(api.sendCommand(VIN, 'start'), /not enabled/);
    assert.deepEqual(h.state.requests.map(r => JSON.parse(r.body).type), ['lock']);
    assert.equal(h.api.vehicleCommandAllowed(vehicle, 'lock'), true);
    assert.equal(h.api.vehicleCommandAllowed(vehicle, 'start'), false);
  } finally { app.releaseContext(); }
});
