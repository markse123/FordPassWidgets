'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {test} = require('node:test');
const {load, plain, TIME, VIN} = require('./scriptable.cjs');
const OTHER = '1FTFW1E50JFA00002';
function fixture() {
  const source = fs.readFileSync(path.join(__dirname, '../FordPassWidgets.js'), 'utf8');
  const marker = 'try { await new AppController().run(); }';
  const exposed = 'globalThis.VehicleAppTest = {appSelectedVehicle, appAssertProfile, appProPowerEnabled, validateManualVehicle};\n';
  const h = load(source.replace(marker, exposed + marker));
  Object.assign(h.api, h.context.VehicleAppTest); return h;
}
const garage = () => [VIN, OTHER].map((vin, index) => ({vin, nickName: 'Synthetic ' + (index + 1),
  profile: {engineType: index ? 'BEV' : 'HEV', transmission: 'AUTOMATIC', supportsStatusRefresh: true},
  capabilities: {remoteLock: 'Display', remoteStart: index ? 'NoDisplay' : 'Display', proPowerOnBoard: 'Display'}}));
async function account(h) {
  const app = new h.api.AppController(); await app.attachAccount(); h.api.beginAccountSession(app.store);
  h.api.secretSet('token.mobile', {access: 'synthetic-cat', expires: TIME + 3600000});
  h.api.secretSet('token.autonomic', {access: 'synthetic-autonomic', expires: TIME + 3600000});
  h.api.completeAccountSession(app.store);
  const profiles = h.api.authorizeGarageVehicles(garage(), app.store); return {app, profiles};
}
async function bound(h, options = {}) {
  const {app, profiles} = await account(h); let prefs = await app.attachVehicle(profiles[0].id);
  prefs = h.api.saveVehicleProfile(Object.assign({}, prefs, {imageMode: 'off', night: {enabled: false},
    features: {proPower: options.power === true, engineControl: true},
    compatibility: {commands: Object.assign({lock: false, unlock: false, start: false, stop: false, refresh: false}, options.commands || {}), verified: {}}}), app.store);
  return {app, prefs, profiles};
}
const text = node => [node && node.kind === 'text' ? node.value : '', ...(node && node.children || []).map(text)].join('\n');
async function takeover(h, profile) {
  h.api.bindVehicleProfile(profile.id); const successor = new h.api.LocalStore();
  h.state.choices.unshift(0); await successor.acquire(); return successor;
}

test('first run connects FordPass before discovering or choosing a vehicle', async () => {
  const h = fixture(), sequence = [];
  assert.equal(new h.api.AppController().store, null);
  h.api.FordAuthManager.prototype.connectMobile = async function() {
    sequence.push('login'); h.api.secretSet('token.mobile', {access: 'synthetic-cat', expires: TIME + 3600000});
  };
  h.state.responses.push(request => {
    sequence.push('garage'); assert.equal(request.method, 'GET');
    assert.equal(request.headers['auth-token'], 'synthetic-cat');
    assert.equal(request.headers['Application-Id'], h.api.SETTINGS.applicationId);
    assert.equal(request.headers.countryCode, 'USA'); assert.equal(request.headers.locale, 'en-US');
    assert.equal(request.headers.Authorization, undefined); return {body: garage()};
  });
  h.state.choices.push(0, 0, -1);
  await new h.api.AppController().run();
  assert.deepEqual(sequence, ['login', 'garage']);
  assert.equal(h.state.alerts[0].title, 'Connect FordPass');
  assert.equal(h.state.alerts[1].title, 'Vehicles');
  assert.equal(h.state.requests.length, 1);
  assert(h.api.readVehicleRegistry().profiles.every(p => Object.values(p.compatibility.commands).every(v => v === false)));
});
test('fixed widget IDs select independent vehicles while browsing leaves the default unchanged', async () => {
  const h = fixture(), {app, profiles} = await account(h), originalDefault = h.api.readVehicleRegistry().defaultVehicleId;
  await app.attachVehicle(profiles[1].id); app.releaseContext();
  h.config.runsInApp = false; h.config.runsInWidget = true;
  h.args.widgetParameter = 'vehicle=' + profiles[1].id + ' lock';
  await new h.api.AppController().run();
  const selected = h.api.activeVehicleProfile(); assert.equal(selected.id, profiles[1].id);
  assert.match(h.state.widgets[0].url, new RegExp('vehicle=' + profiles[1].id));
  assert.equal(h.api.readVehicleRegistry().defaultVehicleId, originalDefault);
  h.args.widgetParameter = ''; await new h.api.AppController().run();
  assert.equal(h.api.activeVehicleProfile().id, profiles[0].id); assert.equal(h.state.requests.length, 0);
});
test('invalid, conflicting and unauthorized explicit vehicle selectors never fall back to the default', async () => {
  const h = fixture(), {app, profiles} = await account(h); app.releaseContext();
  h.config.runsInApp = false; h.config.runsInWidget = true;
  for (const parameter of ['vehicle=bad', 'vehicle=' + 'f'.repeat(32), 'vehicle=' + profiles[0].id + ' vehicle=' + profiles[1].id]) {
    h.args.widgetParameter = parameter; const controller = new h.api.AppController(); await controller.run();
    assert.equal(controller.store, null); assert.match(text(h.state.widgets.at(-1)), /unavailable/);
  }
  h.args.widgetParameter = 'vehicle=' + profiles[0].id; h.args.queryParameters.vehicle = profiles[1].id;
  const controller = new h.api.AppController(); await controller.run(); assert.equal(controller.store, null);
  assert.equal(h.state.requests.length, 0);
});
test('legacy VIN parameters only pin the already selected vehicle and mismatches perform no cache or background read', async () => {
  const h = fixture(), {app, profiles} = await account(h);
  await app.attachVehicle(profiles[0].id); app.releaseContext();
  h.config.runsInApp = false; h.config.runsInWidget = true;
  h.args.widgetParameter = VIN + ' lock';
  const matching = new h.api.AppController(); await matching.run();
  assert(matching.store); assert.equal(h.api.activeVehicleProfile().id, profiles[0].id);
  let cacheReads = 0, eveningReads = 0;
  const read = h.api.LocalStore.prototype.read;
  h.api.LocalStore.prototype.read = function() { cacheReads++; return read.call(this); };
  h.api.AppController.prototype.nightlyCheck = async () => { eveningReads++; throw new Error('Unexpected background read'); };
  h.args.widgetParameter = OTHER + ' lock';
  const mismatched = new h.api.AppController(); await mismatched.run();
  assert.equal(mismatched.store, null); assert.match(text(h.state.widgets.at(-1)), /does not match/);
  assert.equal(h.api.activeVehicleProfile().id, profiles[0].id, 'A VIN never selects a different profile');
  assert.equal(cacheReads, 0); assert.equal(eveningReads, 0); assert.equal(h.state.requests.length, 0);
});
test('profile menu retains settings and separates browsing, widget binding, default and Pro Power opt-in', async () => {
  const h = fixture(), {app, prefs, profiles} = await bound(h);
  h.state.choices.push(-1); await app.profileMenu(prefs);
  const labels = h.state.alerts.at(-1).actions.map(a => a.title);
  for (const label of ['Fetch telemetry', 'Customize widgets', 'Units & formats', 'Widget gallery', 'Tires & alerts', 'Vehicle photo', 'Troubleshooting', 'Vehicle features', 'Copy widget parameter', 'Make default vehicle', 'Vehicles']) assert(labels.includes(label), label);
  assert(!labels.includes('Pro Power')); assert(!labels.includes('Remote start')); assert(!labels.includes('Lock'));
  await app.copyVehicleParameter(prefs); assert.equal(h.state.clipboard.at(-1), 'vehicle=' + prefs.id);
  h.state.choices.push(1); assert.equal(await app.chooseVehicle(), profiles[1].id);
  assert.equal(h.api.readVehicleRegistry().defaultVehicleId, prefs.id);
  app.releaseContext();
});
test('direct vehicle commands and every Pro Power entry point honor owner permissions before transport', async () => {
  const h = fixture(), {app, prefs} = await bound(h), api = new h.api.FordAPIClient(app.auth, app.store, prefs);
  for (const action of ['lock','unlock','start','stop','refresh']) await assert.rejects(api.sendCommand(prefs.vin, action), /not enabled/);
  await assert.rejects(api.postCommand(prefs.vin, 'lock', 'synthetic'), /not enabled/);
  await assert.rejects(api.requestGeneralStatus(true), /not enabled/);
  await assert.rejects(api.proPowerSnapshot(), /not enabled/);
  await assert.rejects(api.requestProPowerStatus(true), /not enabled/);
  const before = JSON.stringify(app.store.read()); await api.readProPower(true);
  assert.equal(JSON.stringify(app.store.read()), before);
  await assert.rejects(app.action('ppostatus', prefs), /not enabled/);
  assert.equal(h.state.requests.length, 0); app.releaseContext();
});
test('remote start retains its explicitly confirmed lock prerequisite without enabling standalone Lock', async () => {
  const h = fixture(), {app, prefs} = await bound(h, {commands: {start: true}});
  const api = new h.api.FordAPIClient(app.auth, app.store, prefs);
  h.state.responses.push({body: {id: 'synthetic-lock-receipt', status: 'success'}}, {body: {id: 'synthetic-start-receipt', status: 'accepted'}});
  await api.sendCommand(prefs.vin, 'start');
  assert.deepEqual(h.state.requests.map(r => JSON.parse(r.body).type), ['lock', 'remoteStart']);
  assert.equal(app.auth._appStartIntent, undefined);
  await assert.rejects(api.postCommand(prefs.vin, 'lock', 'synthetic'), /not enabled/);
  assert.equal(h.state.requests.length, 2); app.releaseContext();
});
test('powertrain and transmission hard guards block enabled engine controls on BEV, manual and unknown vehicles', async () => {
  const h = fixture(), {app, prefs} = await bound(h, {commands: {start: true, stop: true}});
  for (const patch of [{engineType: 'BEV'}, {transmission: 'MANUAL'}, {transmission: 'UNKNOWN'}, {engineType: 'UNKNOWN'}]) {
    const current = h.api.saveVehicleProfile(Object.assign({}, prefs, patch), app.store);
    const api = new h.api.FordAPIClient(app.auth, app.store, current);
    await assert.rejects(api.sendCommand(current.vin, 'start'), /not enabled/);
    await assert.rejects(api.sendCommand(current.vin, 'stop'), /not enabled/);
  }
  assert.equal(h.state.requests.length, 0); app.releaseContext();
});
test('full refresh is general-only while Pro Power is opted out, and cancellation sends nothing', async () => {
  const h = fixture(), {app, prefs} = await bound(h, {commands: {refresh: true}}), calls = [];
  h.api.FordAPIClient.prototype.requestGeneralStatus = async () => { calls.push('general'); return {outcome: 'device_succeeded', dispatched: true}; };
  h.api.FordAPIClient.prototype.getVehicleStatus = async function(force) { assert.equal(force, true); calls.push('telemetry'); return {cache: this.store.read(), note: 'Cloud telemetry saved.'}; };
  h.api.FordAPIClient.prototype.requestProPowerStatus = async () => { throw new Error('PPO must not be requested'); };
  h.api.FordAPIClient.prototype.readProPower = async () => { throw new Error('PPO must not be read'); };
  h.api.FordAPIClient.prototype.updatePlace = async () => calls.push('place');
  h.state.choices.push(-1); assert.equal((await app.refreshWidget(prefs)).outcome, 'cancelled'); assert.deepEqual(calls, []);
  h.state.choices.push(0); const result = await app.refreshWidget(prefs);
  assert.equal(result.outcome, 'completed'); assert.deepEqual(calls.slice(0, 2), ['general', 'telemetry']);
  assert.equal(result.steps.proPowerRequest, 'not_enabled'); assert.equal(result.steps.proPowerRead, 'not_enabled');
  assert.doesNotMatch(result.message, /Pro Power/); assert.match(h.state.alerts.find(a => /Refresh Synthetic/.test(a.title)).message, /0001/);
  assert.equal(h.state.requests.length, 0); app.releaseContext();
});
test('fresh consent is rechecked at the request boundary after an asynchronous token operation', async () => {
  const h = fixture(), {app, prefs} = await bound(h, {power: true});
  app.auth.token = async () => {
    h.api.saveVehicleProfile(Object.assign({}, prefs, {features: {proPower: false, engineControl: true}}), app.store);
    return 'synthetic-token';
  };
  await assert.rejects(new h.api.FordAPIClient(app.auth, app.store, prefs).proPowerSnapshot(), /not enabled/);
  assert.equal(h.state.requests.length, 0); app.releaseContext();
});
test('photo and parked dialog callbacks cannot mutate a successor vehicle profile', async () => {
  for (const flow of ['photo', 'parked']) {
    const h = fixture(), {app, prefs, profiles} = await bound(h);
    const cache = app.store.read(); cache.fields.position = {value: {lat: 42.31, lon: -83.21}, at: TIME - 30000};
    prefs.widget = {show: {parked: true}}; h.api.saveVehicleProfile(prefs, app.store); app.store.write(cache);
    let successor;
    const original = h.context.Alert.prototype.presentSheet, originalAlert = h.context.Alert.prototype.presentAlert;
    if (flow === 'photo') h.context.Alert.prototype.presentSheet = async function() {
      const result = await original.call(this); if (this.title === 'Vehicle photo') successor = await takeover(h, profiles[1]); return result;
    };
    else h.context.Alert.prototype.presentAlert = async function() {
      const result = await originalAlert.call(this); if (/^Parked/.test(this.title)) successor = await takeover(h, profiles[1]); return result;
    };
    h.state.choices.push(flow === 'photo' ? 3 : 1);
    const before = plain(h.api.readVehicleRegistry());
    await assert.rejects(flow === 'photo' ? app.truckPhoto(prefs) : app.parked(prefs), /expired|changed/);
    await assert.rejects(app.attachAccount(), /expired|changed/);
    successor.assertLease();
    assert.deepEqual(plain(h.api.readVehicleRegistry()), before); assert.equal(h.state.requests.length, 0); successor.release();
  }
});
test('reconnect invalidates old profile data until this session authorizes that VIN', async () => {
  const h = fixture(), {app, prefs, profiles} = await bound(h);
  const oldStore = app.store; await app.attachAccount(); h.api.beginAccountSession(app.store);
  assert.throws(() => oldStore.assertLease(), /expired|changed/); assert.equal(oldStore.read(), null);
  assert.equal(h.api.appSelectedVehicle().invalid, false); assert.equal(h.api.appSelectedVehicle().id, null);
  h.api.secretSet('token.mobile', {access: 'synthetic-next-cat', expires: TIME + 3600000}); h.api.completeAccountSession(app.store);
  h.api.authorizeGarageVehicles([garage()[1]], app.store);
  h.args.queryParameters.vehicle = prefs.id; assert.equal(h.api.appSelectedVehicle().invalid, true);
  assert.equal(h.api.readVehicleRegistry().profiles.find(p => p.id === profiles[1].id).authorizedSession, h.api.readVehicleRegistry().account.session);
  app.releaseContext(); assert.equal(h.state.requests.length, 0);
});
test('sign-out confirms the current account, clears access to every profile, and rejects a displaced confirmation', async () => {
  const h = fixture(), {app, prefs} = await bound(h), session = h.api.readVehicleRegistry().account.session;
  h.state.choices.push(-1); assert.equal(await app.signOut(), false);
  assert.equal(h.api.readVehicleRegistry().account.session, session);
  h.state.choices.push(0); assert.equal(await app.signOut(), true);
  const registry = h.api.readVehicleRegistry();
  assert.equal(registry.account.connected, false); assert.notEqual(registry.account.session, session);
  assert(registry.profiles.every(p => p.authorizedSession === null));
  assert.match(text(h.state.widgets.at(-1)), /authorize/); assert.equal(h.api.secretGet('token.mobile'), null);
  h.args.queryParameters.vehicle = prefs.id; assert.equal(h.api.appSelectedVehicle().invalid, true); app.releaseContext();

  const other = fixture(), setup = await bound(other), before = plain(other.api.readVehicleRegistry()); let successor;
  const original = other.context.Alert.prototype.presentAlert;
  other.context.Alert.prototype.presentAlert = async function() {
    const result = await original.call(this);
    if (this.title === 'Sign out of FordPass') successor = await takeover(other, setup.profiles[1]); return result;
  };
  other.state.choices.push(0); await assert.rejects(setup.app.signOut(), /changed|expired/);
  assert.deepEqual(plain(other.api.readVehicleRegistry()), before); assert.equal(other.state.requests.length, 0); successor.release();
});
test('manual VIN fallback requires an explicit matching passive response before authorization', async () => {
  const h = fixture(), {app} = await account(h), pending = h.api.addVehicleProfile({vin: '1FTFW1E50JFA00003', name: 'Synthetic manual'}, app.store);
  const prefs = await app.attachVehicle(pending.id, {allowUnauthorized: true});
  for (const raw of [{metrics: {fuelLevel: {value: 50}}}, {vin: VIN, metrics: {fuelLevel: {value: 50}}}, {vin: prefs.vin, vehicleStatus: {vin: VIN, metrics: {}}}])
    assert.throws(() => h.api.validateManualVehicle(prefs.id, raw, app.store), /VIN|verify/);
  assert.equal(h.api.activeVehicleProfile(), null); assert.equal(app.store.read(), null);
  const verified = h.api.validateManualVehicle(prefs.id, {vin: prefs.vin, metrics: {fuelLevel: {value: 50}}}, app.store);
  assert.equal(verified.id, prefs.id); assert.equal(h.api.activeVehicleProfile().id, prefs.id);
  assert.equal(h.state.requests.length, 0); app.releaseContext();
});
