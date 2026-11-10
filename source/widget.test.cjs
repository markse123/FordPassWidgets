'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { test } = require('node:test');

const root = path.resolve(__dirname, '..');
const pinnedSource = fs.readFileSync(path.join(__dirname, 'fordwidget-base.js'), 'utf8');
const baselineSource = pinnedSource;
const appVersion = JSON.parse(fs.readFileSync(path.join(__dirname, "version.json"), "utf8")).version;
const widgetPath = process.argv[2] || process.env.FORDWIDGET_SCRIPT || path.join(root, 'FordPassWidgets.js');
const widgetSource = fs.readFileSync(widgetPath, 'utf8');
const entryMarker = '// __FORDWIDGET_ENTRY__';
assert.ok(widgetSource.includes(entryMarker), 'The widget must expose its offline entry boundary');
const VIN = '1FTFW1E50JFA00001'; // Synthetic test vehicle, never used on a network.
const TIME = Date.parse('2026-11-08T14:00:00.000Z');
const families = ['small', 'medium', 'large', 'accessoryCircular', 'accessoryRectangular', 'accessoryInline'];
const plain = value => JSON.parse(JSON.stringify(value));

const sharedHarness = require('../tests/scriptable.cjs');
function scriptable(source) { return sharedHarness.regressionLoad(source); }

function prefs(extra = {}) { return sharedHarness.prefs(Object.assign({ name: 'Synthetic F-150', home: { lat: 42.31, lon: -83.21 } }, extra)); }
function cache(extra = {}) {
  const fields = {};
  for (const [key, value] of Object.entries({ fuel: 63, range: 304, battery: 84, batteryHealth: 'Good', oil: 72,
    odometer: 32123, fl: 35, fr: 36, rl: 35, rr: 36, lock: 'Locked', doors: 'Closed', outsideTemp: 20,
    position: { lat: 42.31, lon: -83.21 }, ignition: 'OFF' })) fields[key] = { value, at: TIME - 30000, source: 'FordPass' };
  return Object.assign({ version: 1, vin: VIN, fields, fetchedAt: TIME - 30000 }, extra);
}
function ppoSnapshot(rawSignals, extra = {}) { return Object.assign({ version: 1, vin: VIN, rawSignals, rejectedSignals: [],
  commandAt: TIME - 300000, commandState: 'COMMAND_SUCCEEDED_ON_DEVICE', latestMode: { value: 'HIGH', at: TIME - 301000 }, fetchedAt: TIME }, extra); }
function commandFrame(rawSignals, id = 'synthetic-status-receipt', time = TIME - 30000) {
  return { vin: VIN, states: { commands: { updatePTTBStatusCommand: { commandId: id, timestamp: time,
    value: { toState: 'COMMAND_SUCCEEDED_ON_DEVICE', oemData: { pttbStatusDataV2: { stringValue: JSON.stringify(rawSignals) } } } } } } };
}
function generalFrame(id = 'synthetic-general-receipt', state = 'SUCCESS') {
  return { vin: VIN, metrics: { fuelLevel: { value: 63, updateTime: new Date(TIME).toISOString() } },
    states: { statusRefreshCommand: { commandId: id, value: { toState: state } } } };
}
function statusFixture() {
  const old = TIME - 3600000, quiet = TIME - 10800000, fresh = TIME - 60000;
  const iso = value => new Date(value).toISOString();
  const before = cache();
  before.fields.lock = { value: 'Unlocked', at: old, source: 'FordPass' };
  before.fields.doors = { value: 'Ajar', at: old, source: 'FordPass' };
  const raw = { vin: VIN, updateTime: iso(TIME), metrics: {
    fuelLevel: { value: 63, updateTime: iso(fresh) },
    doorLockStatus: [{ vehicleDoor: 'FRONT_LEFT', value: 'LOCKED', updateTime: iso(fresh) }, { vehicleDoor: 'FRONT_RIGHT', value: 'LOCKED', updateTime: iso(quiet) }],
    doorStatus: [{ vehicleDoor: 'FRONT_LEFT', value: 'CLOSED', updateTime: iso(fresh) }, { vehicleDoor: 'FRONT_RIGHT', value: 'CLOSED', updateTime: iso(fresh) }],
    hoodStatus: { vehicleDoor: 'HOOD', value: 'CLOSED', updateTime: iso(quiet) }
  } };
  return { raw, before, old, quiet, fresh, iso };
}
function texts(tree) { const result = []; const walk = node => { if (!node || typeof node !== 'object') return; if (node.kind === 'text') result.push(node.value); for (const child of node.children || []) walk(child); }; walk(tree); return result; }
function nodes(tree) { const result = []; const walk = node => { if (!node || typeof node !== 'object') return; result.push(node); for (const child of node.children || []) walk(child); }; walk(tree); return result; }
function counts(values) { const result = {}; for (const value of values) result[value] = (result[value] || 0) + 1; return result; }
function actionOf(node) { const match = String(node.url || '').match(/[?&]action=([^&]*)/); return match ? decodeURIComponent(match[1]) : ''; }
function isOriginalRefreshButton(node) { return node.kind === 'stack' && node.size && texts(node).length === 1 && texts(node)[0] === 'Refresh'; }
function legacyControlCounts(tree) {
  return counts(nodes(tree).map(node => isOriginalRefreshButton(node) && actionOf(node) === 'refreshwidget' ? 'refresh' : actionOf(node))
    .filter(action => ['lock', 'unlock', 'start', 'stop', 'refresh'].includes(action)));
}
async function prepared(h, vehicle = prefs(), snapshot = cache()) { return sharedHarness.prepared(h, vehicle, snapshot); }

test('immutable base provenance, unchanged pure helpers and current module digests match the assembled artifact', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, 'build-manifest.json'), 'utf8'));
  assert.equal(crypto.createHash('sha256').update(pinnedSource).digest('hex'), 'f865ea1480ccf65d5409cd418525fb4c4e1c7a91a5ccabef228769344f52f808');
  assert.equal(manifest.baseSHA256, crypto.createHash('sha256').update(pinnedSource).digest('hex'));
  assert.equal(manifest.outputSHA256, crypto.createHash('sha256').update(widgetSource).digest('hex'));
  assert.equal(manifest.version, appVersion);
  for (const name of ['pttb-v2.js', 'pro-power-core.js', 'pro-power-ui.js']) {
    const module = fs.readFileSync(path.join(__dirname, name), 'utf8').trim();
    assert.ok(pinnedSource.includes(module), name + ' pure checks must exercise the exact reviewed embedded base');
    if (name !== 'pro-power-ui.js') assert.ok(widgetSource.includes(module), name + ' must remain embedded in the current application');
  }
  // Legacy pure UI tests retain their reviewed baseline; compare the helpers
  // still used unchanged in this application separately from replaced widgets.
  const base = sharedHarness.load(pinnedSource), current = sharedHarness.load(widgetSource);
  for (const name of ['ppoEstimated', 'ppoPowerText', 'ppoModeLine', 'ppoUIAt', 'ppoCommandAge', 'ppoShortAge', 'ppoShortMode', 'ppoStaleText', 'ppoSnapshotFor', 'ppoRawSignals', 'ppoStatusRequestView', 'ppoRequestLine', 'ppoUIError'])
    assert.equal(current.api[name].toString(), base.api[name].toString(), name + ' pure fixture parity');
  for (const [name, digest] of Object.entries(manifest.modules)) {
    const module = fs.readFileSync(path.join(__dirname, name), 'utf8');
    assert.equal(crypto.createHash('sha256').update(module).digest('hex'), digest, name);
    assert.ok(widgetSource.includes(module.trim()), name + ' current module must be embedded');
  }
});

test('reviewed base and current built-in self-tests pass without transport', () => {
  for (const source of [pinnedSource, widgetSource]) {
    const h = sharedHarness.load(source); h.api.selfTest(); assert.equal(h.state.requests.length, 0);
  }
});

test('legacy command names, routes, limits and measurement labels remain explicit alongside new model fields', () => {
  const b = sharedHarness.load(pinnedSource), h = sharedHarness.load(widgetSource);
  assert.deepEqual(plain(h.api.COMMANDS), plain(b.api.COMMANDS));
  assert.deepEqual(plain(h.api.SETTINGS), plain(b.api.SETTINGS));
  for (const [key, label] of Object.entries(b.api.FIELD_NAMES)) assert.equal(h.api.FIELD_NAMES[key], label, key);
  for (const key of ['evSoc', 'evRange', 'plugStatus', 'chargeStatus', 'rli', 'rlo', 'rri', 'rro']) assert.equal(typeof h.api.FIELD_NAMES[key], 'string', key);
  assert.equal(h.api.SETTINGS.autonomic, 'https://api.autonomic.ai/v1');
  for (const key of ['ppoa', 'ppob', 'ppototal', 'ppocapacity']) assert.equal(h.api.widgetOptions(sharedHarness.prefs({features:{proPower:false}}), '').show[key], false);
  for (const name of ['findVehicleImageUrl', 'findImageRef', 'isFordHost', 'downscale', 'challenge']) assert.equal(h.api[name].toString(), b.api[name].toString(), name);
  assert.equal(h.state.requests.length, 0);
});

test('the independent application never imports legacy account secrets, photos or telemetry', () => {
  const h = sharedHarness.load(widgetSource), legacyPrefix = 'FordWidget.ProPowerPreview.v1.';
  const legacyDirectory = '/mock/documents/FordWidget Pro Power Preview';
  const vehicle = prefs({ imageMode: 'custom', widget: { show: { fuel: true, ppob: true } } });
  h.state.secrets.set(legacyPrefix + 'vehicle', JSON.stringify(vehicle));
  h.state.secrets.set(legacyPrefix + 'token.mobile', JSON.stringify({ access: 'synthetic-legacy-mobile', expires: TIME + 3600000 }));
  h.state.secrets.set(legacyPrefix + 'token.autonomic', JSON.stringify({ access: 'synthetic-legacy-autonomic', expires: TIME + 3600000 }));
  h.state.files.set(legacyDirectory, { directory: true });
  h.state.files.set(legacyDirectory + '/ford_vehicle_cache.json', JSON.stringify(cache({ proPower: ppoSnapshot({ DcacOut1Pw2Dsply: 500 }) })));
  h.state.files.set(legacyDirectory + '/vehicle_' + VIN + '_custom.png', { kind: 'synthetic-legacy-photo', size: { width: 640, height: 320 } });
  const secrets = [...h.state.secrets], files = [...h.state.files];
  const store = new h.api.LocalStore();
  assert.ok(h.api.secretKey('token.mobile').startsWith('FordPassWidgets.v1.'));
  assert.ok(store.dir.startsWith('/mock/documents/FordPassWidgets'));
  assert.equal(h.api.secretGet('vehicle'), null); assert.equal(h.api.secretGet('token.mobile'), null);
  assert.equal(h.api.secretGet('token.autonomic'), null); assert.equal(store.read(), null);
  assert.equal(store.vehicleImage(vehicle), null);
  assert.deepEqual([...h.state.secrets], secrets); assert.deepEqual([...h.state.files], files);
  assert.equal(h.state.requests.length, 0); assert.equal(h.state.safari.length, 0); assert.equal(h.state.alerts.length, 0);
  assert.match(widgetSource.slice(0, 180), new RegExp('FordPassWidgets ' + appVersion.replaceAll('.', '\\.')));
});


for (const family of families) {
  test('profile-bound ' + family + ' widgets keep cached PPO hidden until owner opt-in and retain measurement ages', () => {
    const h = scriptable(widgetSource), vehicle = prefs({features:{proPower:false}});
    const c = cache({proPower:ppoSnapshot({DcacOut1Pw2Dsply:1450,DcacOut2Pw2Dsply:225,DcacOutPwDsplyMx:7200})});
    const before = JSON.stringify(c), renderer = new h.api.WidgetRenderer(vehicle,c,'fuel tires lock');
    const widget = renderer.build(family), all = texts(widget).join(' ');
    assert.ok(all.includes('63') || all.includes('304'), all);
    assert.doesNotMatch(all,/Pro Power|PPO|~.*(?:kW| W)/);
    assert.match(all,/ago|unknown/);
    assert.equal(new URL(widget.url).searchParams.get('vehicle'),vehicle.id);
    assert.equal(JSON.stringify(c),before); assert.equal(h.state.requests.length,0);
  });
}

for (const family of ['small','medium','large','extraLarge']) {
  test('owner-enabled PPO remains additive and profile-bound in ' + family, () => {
    const h=scriptable(widgetSource), vehicle=prefs({widget:{medium:'controls',show:{ppoa:true,ppob:true,ppototal:true,ppocapacity:true}}});
    const c=cache({proPower:ppoSnapshot({DcacOut1Pw2Dsply:1450,DcacOut2Pw2Dsply:225,DcacOutPwDsplyMx:7200,DcacOutScndPw2Dsply:0,DcacOutScndPwDsplyMx:0})});
    const original=JSON.stringify(c),widget=new h.api.WidgetRenderer(vehicle,c).build(family),all=texts(widget).join(' ');
    assert.match(all,/63/);assert.match(all,/304/);assert.match(all,/PPO|Pro Power/);assert.match(all,/sample(?: time)? unknown/i);
    assert.match(all,/~.*(?:kW| W)/);assert.equal(JSON.stringify(c),original);
    const actions=nodes(widget).filter(node=>/[?&]action=/.test(node.url||''));
    for(const node of actions) assert.equal(new URL(node.url).searchParams.get('vehicle'),vehicle.id);
    if(family!=='small')assert.deepEqual(legacyControlCounts(widget),{lock:1,unlock:1,start:1,refresh:1});
    assert.equal(h.state.requests.length,0);
  });
}

test('cached security values and their independent ages remain visible; missing fuel is never invented', () => {
  const h=scriptable(widgetSource),vehicle=prefs(),c=cache();
  c.fields.lock={value:'Unlocked',at:TIME-3600000,source:'FordPass'};
  c.fields.doors={value:'Ajar',at:TIME-60000,source:'FordPass'};delete c.fields.fuel;
  const widget=new h.api.WidgetRenderer(vehicle,c).build('large'),all=texts(widget).join(' ');
  assert.match(all,/Unlocked/);assert.match(all,/Ajar/);assert.match(all,/1h 0m ago/);assert.match(all,/1m ago/);
  assert.match(all,/Not reported|—/);assert.doesNotMatch(all,/Fuel 0%/);assert.equal(h.state.requests.length,0);
});

test('model rendering preserves selected fields and input/method state even after an interrupted render', () => {
  const h=scriptable(widgetSource),vehicle=prefs({widget:{show:{ppoa:true}}}),c=cache({proPower:ppoSnapshot({DcacOut1Pw2Dsply:1450,DcacOut2Pw2Dsply:0,DcacOutPwDsplyMx:7200,DcacOutScndPw2Dsply:0,DcacOutScndPwDsplyMx:0})});
  const renderer=new h.api.WidgetRenderer(vehicle,c),before=JSON.stringify(c),number=renderer.number,tire=renderer.tire,originalText=renderer.text;
  let failed=false;renderer.text=function(...args){if(!failed){failed=true;throw new Error('Synthetic interrupted render');}return originalText.apply(this,args);};
  assert.throws(()=>renderer.build('large'),/Synthetic interrupted render/);renderer.text=originalText;
  const widget=renderer.build('large');assert.match(texts(widget).join(' '),/1450|1\.5|1\.45/);
  assert.equal(renderer.number,number);assert.equal(renderer.tire,tire);assert.equal(JSON.stringify(c),before);assert.equal(h.state.requests.length,0);
});

test('legacy vehicle commands still delegate through the augmented foreground action', async () => {
  for (const action of ['lock', 'unlock', 'start', 'stop', 'refresh']) {
    const h = scriptable(widgetSource), app = await prepared(h), sent = [];
    h.api.FordAPIClient.prototype.sendCommand = async (vin, command) => { sent.push({ vin, command }); return 'Synthetic confirmation'; };
    h.state.choices.push(0);
    await app.action(action, prefs());
    assert.deepEqual(sent, [{ vin: VIN, command: action }]);
    assert.equal(h.state.notifications.length, 1);
    assert.equal(h.state.notifications[0].title, 'FordPassWidgets · Synthetic F-150 · 0001');
    assert.equal(h.state.requests.length, 0);
    app.store.release();
  }
});

test('legacy lock command retains its original v1 wire format', async () => {
  const h = scriptable(widgetSource), app = await prepared(h);
  h.state.responses.push({ body: { id: 'synthetic-lock-receipt', status: 'accepted' } });
  const api = new h.api.FordAPIClient(app.auth, app.store, prefs());
  await api.postCommand(VIN, 'lock', 'synthetic-autonomic');
  assert.equal(h.state.requests.length, 1);
  const request = h.state.requests[0];
  assert.equal(request.url, 'https://api.autonomic.ai/v1/command/vehicles/' + VIN + '/commands');
  assert.deepEqual(JSON.parse(request.body), { properties: {}, tags: {}, type: 'lock', wakeUp: true });
  app.store.release();
});

test('canceling the Pro Power status confirmation sends no request', async () => {
  const h = scriptable(widgetSource), app = await prepared(h);
  h.state.choices.push(-1);
  await app.action('ppostatus', prefs());
  assert.equal(h.state.requests.length, 0);
  assert.ok(h.state.alerts.some(a => /Pro Power/i.test(a.title || '') && a.cancel), 'The new action must display explicit confirmation');
  app.store.release();
});

test('a Pro Power status deep link still requires the foreground confirmation', async () => {
  const h = scriptable(widgetSource), app = await prepared(h); app.releaseContext();
  h.args.queryParameters.action = 'ppostatus'; h.state.choices.push(-1);
  await app.run();
  assert.equal(h.state.requests.length, 0);
  assert.ok(h.state.alerts.some(a => /Pro Power/i.test(a.title || '') && a.cancel));
});

test('PPO widget rendering with evening checks off sends no commands or network requests', async () => {
  for (const family of families) for (const action of ['ppostatus', 'refreshwidget']) {
    const h = scriptable(widgetSource), vehicle = prefs({ widget: { show: { ppoa: true } } });
    const c = cache({ proPower: ppoSnapshot({ DcacOut1Pw2Dsply: 1500, DcacOut2Pw2Dsply: 0, DcacOutPwDsplyMx: 7200 }) });
    const app = await prepared(h, vehicle, c); app.releaseContext();
    h.config.runsInApp = false; h.config.runsInWidget = true; h.config.widgetFamily = family;
    h.args.widgetParameter = 'ppoa'; h.args.queryParameters.action = action;
    await app.run();
    assert.equal(h.state.requests.length, 0, family); assert.equal(h.state.alerts.length, 0, family); assert.equal(h.state.widgets.length, 1, family);
    assert.match(texts(h.state.widgets[0]).join(' '), /PPO|Pro Power/i, family);
  }
});

test('a failed original telemetry read still permits the independent foreground PPO cache read', async () => {
  const h = scriptable(widgetSource), app = await prepared(h);
  h.state.responses.push({ status: 503, body: {} }, { body: commandFrame({ DcacOut1Pw2Dsply: 1500, DcacOut2Pw2Dsply: 0, DcacOutPwDsplyMx: 7200 }) });
  await app.action('fetch', prefs());
  assert.equal(h.state.requests.length, 2);
  assert.equal(h.state.requests[0].url, 'https://api.autonomic.ai/v1/telemetry/sources/fordpass/vehicles/' + VIN);
  assert.equal(h.state.requests[0].method, 'GET');
  assert.equal(h.state.requests[1].url, 'https://api.autonomic.ai/v1beta/telemetry/sources/fordpass/vehicles/' + VIN + ':query');
  assert.equal(h.state.requests[1].method, 'POST'); assert.deepEqual(JSON.parse(h.state.requests[1].body), {});
  const saved = app.store.read();
  assert.equal(saved.fields.fuel.value, 63);
  assert.equal(saved.proPower.rawSignals.DcacOut1Pw2Dsply, 1500);
  assert.ok(!JSON.stringify(saved).includes('synthetic-status-receipt'), 'Raw command IDs must not enter the file cache');
  app.store.release();
});

test('unsupported PPO endpoint backoff does not disable original vehicle controls', async () => {
  const h = scriptable(widgetSource), app = await prepared(h);
  const api = new h.api.FordAPIClient(app.auth, app.store, prefs());
  h.state.responses.push(
    { body: commandFrame({ DcacOut1Pw2Dsply: 1500, DcacOut2Pw2Dsply: 0, DcacOutPwDsplyMx: 7200 }) },
    { status: 400, body: { error: 'synthetic_unsupported_ppo' } }
  );
  const result = await api.requestProPowerStatus(true);
  assert.equal(result.outcome, 'delivery_uncertain');
  assert.equal(h.state.requests.length, 2);
  assert.equal(h.api.secretGet('gate.commands'), null);
  assert.ok(h.api.secretGet('gate.commands.proPower').next > h.state.clock);
  assert.equal(app.store.read().commandAfter, TIME + 30000);
  h.state.clock += 30001;
  h.state.responses.push({ body: { id: 'synthetic-lock-after-ppo', status: 'accepted' } });
  await api.sendCommand(VIN, 'lock');
  assert.equal(h.state.requests.length, 3);
  assert.equal(h.state.requests[2].url, 'https://api.autonomic.ai/v1/command/vehicles/' + VIN + '/commands');
  assert.equal(JSON.parse(h.state.requests[2].body).type, 'lock');
  await assert.rejects(api.requestProPowerStatus(true), /cooling down|just sent/);
  assert.equal(h.state.requests.length, 3, 'PPO backoff must stop even another baseline read');
  app.store.release();
});

test('estimates preserve zero and reject missing B, sentinel values and energy-as-power', () => {
  const h = scriptable(widgetSource), estimate = raw => h.api.ppoEstimated(ppoSnapshot(raw));
  const rated = { DcacOutPwDsplyMx: 7200, DcacOutScndPw2Dsply: 0, DcacOutScndPwDsplyMx: 0 };
  const zero = estimate({ ...rated, DcacOut1Pw2Dsply: 0, DcacOut2Pw2Dsply: 0 });
  assert.equal(zero.a, 0); assert.equal(zero.b, 0); assert.equal(zero.abTotal, 0); assert.equal(zero.total, 0);
  const partial = estimate({ ...rated, DcacOut1Pw2Dsply: 1500 });
  assert.equal(partial.a, 1500); assert.equal(partial.b, null); assert.equal(partial.abTotal, null); assert.equal(partial.total, null);
  for (const value of [-1, 65535, 4294967295]) {
    const invalid = estimate({ ...rated, DcacOut1Pw2Dsply: value, DcacOut2Pw2Dsply: 0 });
    assert.equal(invalid.a, null); assert.equal(invalid.abTotal, null); assert.equal(invalid.total, null);
  }
  const energy = estimate({ ...rated, DcacOutETot: 87654321 });
  assert.equal(energy.a, null); assert.equal(energy.b, null); assert.equal(energy.total, null);
});

test('secondary output is included only with known scope and complete usage', () => {
  const h = scriptable(widgetSource), estimate = raw => h.api.ppoEstimated(ppoSnapshot(raw));
  const main = { DcacOut1Pw2Dsply: 1200, DcacOut2Pw2Dsply: 300, DcacOutPwDsplyMx: 7200 };
  const split = estimate({ ...main, DcacOutScndPw2Dsply: 100, DcacOutScndPwDsplyMx: 2400 });
  assert.equal(split.abTotal, 1500); assert.equal(split.secondary, 100); assert.equal(split.total, 1600); assert.equal(split.capacity, 9600);
  assert.equal(split.secondaryScopeKnown, true); assert.equal(split.capacityScope, 'Combined capacity');
  const unknownScope = estimate({ ...main, DcacOutScndPw2Dsply: 100 });
  assert.equal(unknownScope.abTotal, 1500); assert.equal(unknownScope.secondary, null); assert.equal(unknownScope.total, null);
  assert.equal(unknownScope.capacity, 7200); assert.equal(unknownScope.capacityScope, 'A+B capacity');
  const missingSecondary = estimate({ ...main, DcacOutScndPwDsplyMx: 2400 });
  assert.equal(missingSecondary.capacity, 9600); assert.equal(missingSecondary.total, null);
});

for (const family of families) {
  test('PPO-enabled ' + family + ' exposes report age/mode age and keeps missing B unknown', () => {
    const h = scriptable(widgetSource);
    const snapshot = ppoSnapshot({ DcacOut1Pw2Dsply: 1500, DcacOutPwDsplyMx: 7200,
      DcacOutScndPw2Dsply: 0, DcacOutScndPwDsplyMx: 0 }, { latestMode: { value: 'OFF', at: TIME - 1000 } });
    const c = cache({ proPower: snapshot });
    const text = texts(new h.api.WidgetRenderer(prefs(), c, 'ppob').build(family)).join(' ');
    assert.match(text, family === 'accessoryInline' ? /^PPO · Ford/ : /last/i);
    assert.match(text, /(?:Status result|status|result)\s*5m(?: ago)?/i);
    assert.match(text, /Ford(?: mode)? OFF\s*(?:·\s*)?1s ago/i);
    assert.match(text, /sample(?: time)? unknown/i);
    assert.match(text, /—/); assert.doesNotMatch(text, /~0\s*W/);
    assert.equal(h.api.ppoView(snapshot).stale, true);
    assert.ok(h.api.ppoView(snapshot).staleReasons.includes('newer_off_mode'));
    const known = cache({ proPower: ppoSnapshot({ DcacOut1Pw2Dsply: 1500, DcacOut2Pw2Dsply: 0,
      DcacOutPwDsplyMx: 7200, DcacOutETot: 87654321, DcacOutScndPw2Dsply: 0, DcacOutScndPwDsplyMx: 0 }) });
    const estimateText = texts(new h.api.WidgetRenderer(prefs(), known, 'ppoa').build(family)).join(' ');
    assert.match(estimateText, /~1\.50?\s*kW/); assert.doesNotMatch(estimateText, /87654321/);
    assert.equal(h.state.requests.length, 0);
  });
}

test('embedded PPO report preserves whitelisted raw energy evidence without exposing identifiers or private fields', () => {
  const h = scriptable(widgetSource);
  const snapshot = ppoSnapshot({DcacOut1Pw2Dsply:0,DcacOutPwDsplyMx:7200,DcacOutETot:87654321,PRIVATE_EXTRA:987654},
    {privateReceipt:'PRIVATE_RECEIPT',latestMode:{value:'PRIVATE_MODE',at:TIME-1000}});
  const report = plain(h.api.ppoRedactedReport(snapshot,{attemptAt:TIME-9000,outcome:'accepted_unconfirmed',id:'PRIVATE_REQUEST'}));
  assert.equal(report.rawSignals.DcacOutETot,87654321);
  assert.equal(report.estimates.a,0);assert.equal(report.estimates.b,null);assert.equal(report.estimates.total,null);
  assert.equal(report.embeddedSampleAgeSeconds,null);assert.equal(report.latestFordMode.value,null);
  assert.equal(report.lastStatusRequest.outcome,'accepted_unconfirmed');assert.equal(report.lastStatusRequest.attemptAgeSeconds,9);
  assert.doesNotMatch(JSON.stringify(report),/PRIVATE_|987654|1FTFW1E50JFA00001/);
  assert.equal(h.state.requests.length,0);
});

test('profile menus keep optional cached and passive reports under Troubleshooting', async () => {
  for (const route of ['Pro Power','Troubleshooting']) {
    const h=scriptable(widgetSource),app=await prepared(h,prefs(),cache({proPower:ppoSnapshot({DcacOut1Pw2Dsply:0})}));
    const selectedPath=app.store.path,before=h.state.files.get(selectedPath),secrets=[...h.state.secrets];
    app.releaseContext();h.state.choices.push(route,-1,-1);await app.run();
    const main=h.state.alerts[0],labels=main.actions.map(action=>action.title);
    assert.deepEqual(labels,['Fetch telemetry','Refresh vehicle data','Lock','Unlock','Remote start','Remote stop','Wake vehicle','View details','Customize widgets','Units & formats','Widget gallery','Tires & alerts','Vehicle photo','Parked location','Troubleshooting','Pro Power','Vehicle features','Copy widget parameter','Make default vehicle','Vehicles','Reconnect FordPass','Connect FordConnect','Sign out','Run self-test']);
    assert.doesNotMatch(labels.join(' '),/raw signals|redacted|report|diagnostic/i);
    assert.match(main.title,/Synthetic F-150/);assert.match(main.title,/0001/);
    const submenu=h.state.alerts[1];
    assert.deepEqual(submenu.actions.map(action=>action.title),route==='Pro Power'?['Read cached Pro Power','Request status once…','View raw signals','Copy redacted report']:['Model support report','Vehicle data report','Pro Power report']);
    assert.equal(submenu.title,route==='Pro Power'?'Pro Power · last reported':'Troubleshooting');
    if(route==='Troubleshooting')assert.match(submenu.message,/Nothing is uploaded automatically/);
    assert.equal(h.state.requests.length,0);assert.equal(h.state.safari.length,0);assert.equal(h.state.previews.length,0);assert.equal(h.state.clipboard.length,0);
    // Invocation may release its own lease but never rewrites selected telemetry or credentials.
    assert.equal(h.state.files.get(selectedPath),before);assert.deepEqual([...h.state.secrets],secrets);
  }
});

test('cached Model support report is reviewed before copying and contains no private identity or location', async () => {
  for(const choice of [-1,'Copy report']){
    const h=scriptable(widgetSource),app=await prepared(h,prefs({name:'PRIVATE_NAME'}),cache());
    const before=h.state.files.get(app.store.path),secrets=[...h.state.secrets];
    h.state.choices.push(choice);await app.modelSupportReport(h.api.activeVehicleProfile());
    assert.equal(h.state.previews.length,1);assert.equal(h.state.clipboard.length,choice==='Copy report'?1:0);
    const report=JSON.parse(h.state.previews[0]);
    assert.equal(report.tool,'FordPassWidgets model support report');assert.equal(report.readOnly,true);assert.equal(report.cachedOnly,true);
    assert.equal(report.appVersion,appVersion);assert.equal(report.readings.fuel.value,63);assert.equal(report.readings.fuel.sampleAgeSeconds,30);
    assert.equal(report.readings.lock.value,'Locked');assert.equal(report.vehicle.engineType,'HEV');
    assert.doesNotMatch(h.state.previews[0],/PRIVATE_|1FTFW1E50JFA00001|42\.31|-83\.21|synthetic-cat|synthetic-autonomic/);
    if(choice==='Copy report')assert.equal(h.state.clipboard[0],h.state.previews[0]);
    assert.ok(h.state.alerts.some(alert=>alert.title==='Model support report'&&alert.cancel==='Close'));
    assert.equal(h.state.requests.length,0);assert.equal(h.state.safari.length,0);assert.equal(h.state.files.get(app.store.path),before);assert.deepEqual([...h.state.secrets],secrets);
    app.store.release();
  }
});

test('closing Troubleshooting or canceling report consent performs no read, upload, copy or telemetry write', async () => {
  for(const choices of [[-1],['Vehicle data report',-1,-1],['Model support report',-1,-1]]){
    const h=scriptable(widgetSource),app=await prepared(h),before=h.state.files.get(app.store.path),secrets=[...h.state.secrets];
    let tokens=0,writes=0;app.auth.token=async()=>{tokens++;throw new Error('Unexpected authentication');};
    const write=app.store.write.bind(app.store);app.store.write=value=>{writes++;return write(value);};
    h.state.choices.push(...choices);await app.troubleshooting(prefs());
    assert.equal(h.state.choices.length,0);assert.equal(tokens,0);assert.equal(writes,0);
    assert.equal(h.state.requests.length,0);assert.equal(h.state.safari.length,0);assert.equal(h.state.clipboard.length,0);assert.equal(h.state.notifications.length,0);
    assert.equal(h.state.previews.length,choices[0]==='Model support report'?1:0);
    assert.equal(h.state.files.get(app.store.path),before);assert.deepEqual([...h.state.secrets],secrets);
    if(choices[0]==='Vehicle data report')assert.ok(h.state.alerts.some(alert=>alert.title==='Vehicle data diagnostic'&&alert.cancel==='Cancel'));
    app.store.release();
  }
});

test('Troubleshooting and cached-report awaits reject a different authorized profile, account session or expired lease', async () => {
  for(const scenario of ['entry','menu','preview','review','session','lease']){
    const h=scriptable(widgetSource),app=await prepared(h),other=await sharedHarness.prepareOtherVehicle(h,app);
    const vehicle=h.api.activeVehicleProfile(),path=app.store.path,before=h.state.files.get(path);
    const change=()=>h.api.bindVehicleProfile(other.id);
    if(scenario==='entry')change();
    if(scenario==='menu'){
      const show=h.context.Alert.prototype.presentSheet;
      h.context.Alert.prototype.presentSheet=async function(){const choice=await show.call(this);if(this.title==='Troubleshooting')change();return choice;};
    }
    if(scenario==='preview'){
      const show=h.context.QuickLook.present;h.context.QuickLook.present=async value=>{await show(value);change();};
    }
    if(['review','session','lease'].includes(scenario)){
      const show=h.context.Alert.prototype.presentAlert;
      h.context.Alert.prototype.presentAlert=async function(){const choice=await show.call(this);if(this.title==='Model support report'){
        if(scenario==='lease')app.store.release();
        else if(scenario==='session'){const registry=h.api.readVehicleRegistry();registry.account.session='d'.repeat(32);h.state.secrets.set('FordPassWidgets.v1.registry',JSON.stringify(registry));}
        else change();
      }return choice;};
    }
    h.state.choices.push('Model support report','Copy report');
    await assert.rejects(app.troubleshooting(vehicle),/vehicle|account session|App session expired/i);
    assert.equal(h.state.clipboard.length,0);assert.equal(h.state.previews.length,['preview','review','session','lease'].includes(scenario)?1:0);
    assert.equal(h.state.alerts.filter(alert=>alert.title==='Troubleshooting').length,scenario==='entry'?0:1);
    assert.equal(h.state.requests.length,0);assert.equal(h.state.safari.length,0);assert.equal(h.state.notifications.length,0);assert.equal(h.state.files.get(path),before);
    app.store.release();
  }
});

test('cached refresh diagnostics expose only fixed gate names, relative timing and safe current-stage metadata without I/O', () => {
  const h = scriptable(widgetSource), c = cache({
    widgetRefreshAfter: TIME + 60001, commandAfter: TIME - 1, wakeAfter: TIME + 900000,
    proPowerRequestAfter: TIME + 120000, proPowerReadAfter: TIME + 30000, nextFetch: 'PRIVATE_TIMER', PRIVATE_COOLDOWN: TIME + 999999,
    proPower: ppoSnapshot({}, { commandAt: TIME - 5400000, fetchedAt: TIME - 4000, id: 'PRIVATE_PPO_RECEIPT' }),
    generalStatusRequest: { attemptAt: TIME - 3000, outcome: 'device_succeeded', id: 'PRIVATE_GENERAL_ID' },
    proPowerRequest: { attemptAt: TIME - 2000, outcome: 'accepted_unconfirmed', id: 'PRIVATE_PPO_ID' },
    widgetRefreshLast: { attemptAt: TIME - 5000, outcome: 'in_progress', steps: {
      generalStatus: 'cooldown', telemetry: 'saved', proPowerRequest: 'accepted_unconfirmed', proPowerRead: 'PRIVATE_STAGE_VALUE',
      place: 'checked', photo: 'skipped', PRIVATE_STAGE_KEY: 'failed' }, message: 'PRIVATE_MESSAGE', vin: VIN }
  });
  c.fields.fuel = { value: 101.2, rawValue: 103.25, source: 'FordPass', at: TIME - 90000, PRIVATE_EXTRA: 'PRIVATE_FUEL' };
  sharedHarness.seedSecret(h, 'gate.commands', { next: TIME + 61001, failures: 2, httpStatus: 409, failedAt: TIME - 3000, headers: { authorization: 'PRIVATE_HEADER' } });
  sharedHarness.seedSecret(h, 'gate.commands.proPower', { next: TIME + 90000, failures: 1 }); // Historical record: no observed status.
  sharedHarness.seedSecret(h, 'gate.telemetry.proPower', { next: TIME + 60000, failures: 1, httpStatus: 0, failedAt: TIME - 1000 });
  sharedHarness.seedSecret(h, 'gate.telemetry.mobile', { next: TIME - 1000, failures: 1, httpStatus: 503, failedAt: TIME - 62000 });
  sharedHarness.seedSecret(h, 'gate.auth.mobile', { next: 'PRIVATE_NEXT', failures: '2', httpStatus: 1e100, failedAt: 'PRIVATE_FAILURE_TIME' });
  sharedHarness.seedSecret(h, 'gate.PRIVATE_UNKNOWN_SCOPE', { next: TIME + 999999, failures: 1, token: 'PRIVATE_UNKNOWN_TOKEN' });
  sharedHarness.seedSecret(h, 'token.mobile', { access: 'PRIVATE_TOKEN' });
  const input = JSON.stringify(c), secrets = Array.from(h.state.secrets), reads = [];
  const allowedGateReads = new Set(['FordPassWidgets.v1.registry', ...['commands','commands.generalStatus','commands.proPower','telemetry.mobile','telemetry.proPower','auth.mobile','auth.autonomic'].map(scope => h.api.secretKey('gate.' + scope))]);
  const get = h.context.Keychain.get; h.context.Keychain.get = key => { reads.push(key); return get(key); };
  const report = plain(h.api.widgetDiagnosticContext(c, TIME));
  assert.equal(report.appVersion, appVersion);
  assert.equal(Object.hasOwn(report, 'previewVersion'), false);
  assert.deepEqual(Object.keys(report.gates), ['commands', 'commands.generalStatus', 'commands.proPower', 'telemetry.mobile', 'telemetry.proPower', 'auth.mobile', 'auth.autonomic']);
  assert.deepEqual(report.gates.commands, { active: true, secondsRemaining: 62, failures: 2, httpStatus: 409, failedAgeSeconds: 3 });
  assert.deepEqual(report.gates['commands.proPower'], { active: true, secondsRemaining: 90, failures: 1, httpStatus: null, failedAgeSeconds: null });
  assert.equal(report.gates['telemetry.proPower'].httpStatus, 0, 'A future no-response observation is distinct from missing historical HTTP metadata');
  assert.equal(report.gates['telemetry.proPower'].failedAgeSeconds, 1);
  assert.equal(report.gates['telemetry.mobile'].active, false); assert.equal(report.gates['telemetry.mobile'].secondsRemaining, 0);
  assert.deepEqual(report.gates['auth.mobile'], { active: null, secondsRemaining: null, failures: null, httpStatus: null, failedAgeSeconds: null });
  assert.deepEqual(report.cooldowns, { widgetRefreshAfter: 61, commandAfter: 0, wakeAfter: 900, proPowerRequestAfter: 120, proPowerReadAfter: 30, nextFetch: null });
  assert.deepEqual(report.cachedProPower, { commandAgeSeconds: 5400, fetchedAgeSeconds: 4 });
  assert.deepEqual(report.cachedFuel, { value: 101.2, rawValue: 103.25, atMs: TIME - 90000, ageSeconds: 90, source: 'FordPass' });
  assert.deepEqual(report.lastGeneralStatusRequest, { outcome: 'device_succeeded', attemptAgeSeconds: 3 });
  assert.deepEqual(report.lastProPowerStatusRequest, { outcome: 'accepted_unconfirmed', attemptAgeSeconds: 2 });
  assert.deepEqual(report.lastFullRefresh, { attemptAgeSeconds: 5, outcome: 'in_progress', steps: {
    generalStatus: 'cooldown', proPowerRequest: 'accepted_unconfirmed', telemetry: 'saved', place: 'checked', photo: 'skipped' } });
  assert.doesNotMatch(JSON.stringify(report), /PRIVATE_|1FTFW1E50JFA00001|42\.31|-83\.21|1e\+100/);
  assert.ok(reads.every(key => allowedGateReads.has(key)), 'Context may resolve the bound registry and fixed gate scopes, never read tokens or arbitrary scopes');
  assert.ok(!reads.some(key => /token\./.test(key)));
  assert.equal(JSON.stringify(c), input); assert.deepEqual(Array.from(h.state.secrets), secrets);
  c.fields.fuel.value = '101.2';
  assert.equal(h.api.widgetDiagnosticContext(c, TIME).cachedFuel.value, 101.2, 'Cached numeric text is exported only as a number');
  c.fields.fuel.value = 'PRIVATE_CACHED_FUEL';
  assert.equal(h.api.widgetDiagnosticContext(c, TIME).cachedFuel.value, null);
  c.fields.fuel.rawValue = { token: 'PRIVATE_RAW_FUEL' };
  assert.equal(h.api.widgetDiagnosticContext(c, TIME).cachedFuel.rawValue, null);
  assert.equal(h.state.requests.length, 0); assert.equal(h.state.files.size, 0);
});

test('passive status diagnostic reports component merging, legacy uncertainty and raw time/history evidence without saving data', () => {
  const h = scriptable(widgetSource), f = statusFixture();
  const beforeJSON = JSON.stringify(f.before), rawJSON = JSON.stringify(f.raw);
  const report = h.api.statusDiagnosticReport(f.raw, f.before, VIN, TIME);
  assert.equal(report.normalizedCandidate.lock.value.value, 'Locked');
  assert.equal(report.normalizedCandidate.doors.value.value, 'Closed');
  assert.equal(report.normalizedCandidate.doors.at.normalizerAtMs, f.quiet);
  assert.equal(report.wouldMerge.lock.value.value, 'Unknown'); assert.equal(report.wouldMerge.doors.value.value, 'Unknown',
    'Partial healthy readings cannot attribute an old aggregate-only unsafe state to one component');
  assert.deepEqual(plain(report.cachedAfter), plain(report.before));
  assert.equal(JSON.stringify(f.before), beforeJSON); assert.equal(JSON.stringify(f.raw), rawJSON);

  const knownBefore = plain(f.before), previousRaw = plain(f.raw);
  previousRaw.metrics.doorLockStatus[0] = { vehicleDoor: 'FRONT_LEFT', value: 'UNLOCKED', updateTime: f.iso(f.old) };
  previousRaw.metrics.doorStatus[0] = { vehicleDoor: 'FRONT_LEFT', value: 'AJAR', updateTime: f.iso(f.old) };
  const knownFields = h.api.normalize(previousRaw, VIN, 'FordPass', TIME);
  knownBefore.fields.lock = knownFields.lock; knownBefore.fields.doors = knownFields.doors;
  const knownJSON = JSON.stringify(knownBefore);
  const corrected = h.api.statusDiagnosticReport(f.raw, knownBefore, VIN, TIME);
  assert.equal(corrected.wouldMerge.lock.value.value, 'Locked'); assert.equal(corrected.wouldMerge.doors.value.value, 'Closed');
  assert.equal(corrected.wouldMerge.doors.at.normalizerAtMs, f.quiet, 'An unchanged old hood no longer freezes a newer door transition');
  assert.equal(JSON.stringify(knownBefore), knownJSON); assert.deepEqual(plain(corrected.cachedAfter), plain(corrected.before));

  const seconds = f.fresh / 1000, numeric = plain(f.raw);
  numeric.updateTime = seconds;
  numeric.metrics.doorLockStatus = [{ vehicleDoor: 'ALL_DOORS', value: 'LOCKED', updateTime: seconds }];
  numeric.metrics.doorStatus = [{ vehicleDoor: 'FRONT_LEFT', value: 'CLOSED', updateTime: seconds }];
  delete numeric.metrics.hoodStatus;
  const numericReport = h.api.statusDiagnosticReport(numeric, f.before, VIN, TIME);
  const time = numericReport.raw.doorLockStatus.items[0].updateTime;
  assert.equal(time.rawValue, seconds); assert.equal(time.format, 'epoch_seconds');
  assert.match(time.asMillisecondsISO, /^1970-/); assert.equal(time.asEpochSecondsISO, f.iso(f.fresh));
  assert.equal(numericReport.wouldMerge.lock.value.value, 'Unknown');

  const unknown = plain(f.raw);
  unknown.metrics.doorLockStatus = [{ vehicleDoor: 'ALL_DOORS', value: 'UNKNOWN', updateTime: f.iso(f.fresh) }];
  unknown.metrics.doorStatus = [{ vehicleDoor: 'FRONT_LEFT', value: 'UNKNOWN', updateTime: f.iso(f.fresh) }];
  unknown.metrics.hoodStatus.value = 'UNKNOWN';
  const unknownReport = h.api.statusDiagnosticReport(unknown, f.before, VIN, TIME);
  assert.equal(unknownReport.normalizedCandidate.lock.value.value, 'Unknown'); assert.equal(unknownReport.normalizedCandidate.doors.value.value, 'Unknown');
  assert.equal(unknownReport.raw.doorStatus.items[0].value.value, 'UNKNOWN');
  assert.equal(unknownReport.wouldMerge.doors.value.value, 'Unknown');

  const history = plain(f.raw);
  history.metrics.doorLockStatus = [{ vehicleDoor: 'ALL_DOORS', value: 'UNLOCKED', updateTime: f.iso(f.old) }, { vehicleDoor: 'ALL_DOORS', value: 'LOCKED', updateTime: f.iso(f.fresh) }];
  history.metrics.doorStatus = [{ vehicleDoor: 'FRONT_LEFT', value: 'OPEN', updateTime: f.iso(f.old) }, { vehicleDoor: 'FRONT_LEFT', value: 'CLOSED', updateTime: f.iso(f.fresh) }];
  const historyReport = h.api.statusDiagnosticReport(history, f.before, VIN, TIME);
  assert.deepEqual(plain(historyReport.raw.doorStatus.items.map(item => item.value.value)), ['OPEN', 'CLOSED']);
  assert.equal(historyReport.normalizedCandidate.doors.value.value, 'Closed'); assert.equal(historyReport.normalizedCandidate.lock.value.value, 'Locked',
    'Newer values replace history only for the same identified component');
  assert.equal(h.state.requests.length, 0);
});

test('fuel diagnostic retains typed raw evidence while showing the current fuel normalization and merge decision', () => {
  const h = sharedHarness.load(widgetSource), before = cache(), after = plain(before);
  before.fields.fuel = { value: 101.2, source: 'FordPass', at: TIME - 90000 };
  after.fields.fuel = plain(before.fields.fuel);
  const raw = { vin: VIN, updateTime: new Date(TIME).toISOString(), metrics: {
    fuelLevel: { value: '101.2', unit: '%', unitSymbol: 'percent', updateTime: new Date(TIME - 1000).toISOString(), PRIVATE_EXTRA: 'PRIVATE_VALUE' },
    fuelRange: { value: '500.25', unit: 'km', unitSymbol: 'km', updateTime: (TIME - 1000) / 1000 },
    fuelPercent: { value: 82 }, position: { value: { lat: 42.12345, lon: -83.12345 } }
  }, token: 'PRIVATE_TOKEN', correlationId: 'PRIVATE_CORRELATION' };
  const originals = [raw, before, after].map(value => JSON.stringify(value));
  const report = h.api.statusFuelDiagnostic(raw, before, VIN, TIME, after);
  assert.equal(report.readOnly, true); assert.equal(report.reason, 'clamped_to_100');
  assert.deepEqual(plain(report.raw.fuelLevel.value), { inputType: 'string', numericValue: 101.2, withheldCount: 0 });
  assert.equal(report.raw.fuelRange.value.numericValue, 500.25);
  assert.equal(report.raw.fuelRange.updateTime.format, 'epoch_seconds');
  assert.equal(report.before.fuel.value.numericValue, 101.2); assert.equal(report.normalizedCandidate.fuel.value.numericValue, 100);
  assert.equal(report.wouldMerge.fuel.value.numericValue, 100); assert.deepEqual(plain(report.cachedAfter), plain(report.before));
  assert.doesNotMatch(JSON.stringify(report), /PRIVATE_|1FTFW1E50JFA00001|42\.12345|-83\.12345|fuelPercent/);
  for (const group of ['before', 'normalizedCandidate', 'wouldMerge', 'cachedAfter']) assert.deepEqual(Object.keys(report[group]), ['fuel']);
  assert.deepEqual([raw, before, after].map(value => JSON.stringify(value)), originals);

  raw.metrics.fuelLevel.value = '82.5';
  const accepted = h.api.statusFuelDiagnostic(raw, before, VIN, TIME, after);
  assert.equal(accepted.reason, 'accepted'); assert.equal(accepted.normalizedCandidate.fuel.value.numericValue, 82.5);
  assert.equal(accepted.wouldMerge.fuel.value.numericValue, 82.5);
  delete raw.metrics.fuelLevel;
  assert.equal(h.api.statusFuelDiagnostic(raw, before, VIN, TIME).reason, 'fuel_missing', 'An unrelated fuelPercent alias must not be invented');

  before.fields.fuel = { value: { token: 'PRIVATE_CACHED_TOKEN' }, rawValue: 'PRIVATE_RAW_FUEL', source: 'PRIVATE_PROVIDER', at: 'PRIVATE_TIME' };
  raw.metrics.fuelLevel = { value: 'PRIVATE_NUMERIC_TEXT', unit: 'PRIVATE_UNIT', unitSymbol: VIN, updateTime: 'PRIVATE_TIMESTAMP' };
  raw.metrics.fuelRange = { value: { token: 'PRIVATE_RANGE_TOKEN' }, unit: 'PRIVATE_RANGE_UNIT', updateTime: 1e100 };
  const withheld = h.api.statusFuelDiagnostic(raw, before, VIN, TIME, before);
  assert.equal(withheld.reason, 'non_numeric'); assert.equal(withheld.raw.fuelLevel.value.numericValue, null);
  assert.equal(withheld.raw.fuelRange.value.numericValue, null); assert.equal(withheld.before.fuel.value.numericValue, null);
  assert.equal(withheld.before.fuel.rawValue.numericValue, null);
  assert.equal(withheld.before.fuel.source, null);
  assert.doesNotMatch(JSON.stringify(withheld), /PRIVATE_|1FTFW1E50JFA00001|1e\+100/);
  for (const value of [true, [], {}, 1000001, -1000001]) {
    raw.metrics.fuelLevel.value = value;
    const unsafe = h.api.statusFuelDiagnostic(raw, before, VIN, TIME, before);
    assert.equal(unsafe.raw.fuelLevel.value.numericValue, null);
    assert.equal(unsafe.raw.fuelLevel.value.withheldCount, 1);
  }
  assert.throws(() => h.api.statusFuelDiagnostic(raw, before, VIN + '\n', TIME), /vehicle mismatch/);
  assert.equal(h.state.requests.length, 0); assert.equal(h.state.files.size, 0); assert.equal(h.state.secrets.size, 0);
});

test('synthetic unitless fuel over-read now fills a missing cached percentage with 100 while preserving its timestamp and raw evidence', () => {
  const h = sharedHarness.load(widgetSource), original = scriptable(baselineSource), before = cache();
  delete before.fields.fuel;
  const at = TIME - 10000, raw = { vin: VIN, updateTime: new Date(TIME - 1000).toISOString(), metrics: {
    fuelLevel: { value: 103.25, updateTime: new Date(at).toISOString(), PRIVATE_EXTRA: 'PRIVATE_FUEL_EXTRA' },
    fuelRange: { value: 304, unit: 'mi', updateTime: new Date(at).toISOString() },
    oilLifeRemaining: { value: 103.25, updateTime: new Date(at).toISOString() },
    batteryStateOfCharge: { value: 103.25, updateTime: new Date(at).toISOString() }
  }, token: 'PRIVATE_TOKEN', correlationId: 'PRIVATE_CORRELATION' };
  const rawText = JSON.stringify(raw), beforeText = JSON.stringify(before);
  assert.equal(original.api.normalize(raw, VIN, 'FordPass', TIME).fuel.value, 100, 'The reviewed base already retains the approved bounded fuel value');
  const normalized = h.api.normalize(raw, VIN, 'FordPass', TIME);
  assert.equal(normalized.fuel.value, 100); assert.equal(normalized.fuel.at, at);
  assert.equal(normalized.fuel.source, 'FordPass'); assert.equal(normalized.fuel.fetchedAt, TIME);
  assert.equal(normalized.fuel.rawValue, 103.25);
  assert.equal(normalized.oil, undefined); assert.equal(normalized.battery, undefined, 'Fuel clamping must not relax another metric bound');
  const saved = { ...before, fields: h.api.mergeFields(before.fields, {}, normalized), proPower: ppoSnapshot({ DcacOut1Pw2Dsply: 0, DcacOut2Pw2Dsply: 0, DcacOutPwDsplyMx: 7200 }) };
  assert.equal(saved.fields.fuel.value, 100); assert.equal(saved.fields.fuel.at, at);
  const tree = new h.api.WidgetRenderer(prefs({ widget: { show: { ppoa: true } } }), saved, 'fuel ppoa status').build('large');
  assert.match(texts(tree).join(' '), /Fuel 100%/); assert.doesNotMatch(texts(tree).join(' '), /Fuel unavailable|Fuel 103%/);
  const report = h.api.statusFuelDiagnostic(raw, before, VIN, TIME, before);
  assert.equal(report.reason, 'clamped_to_100'); assert.equal(report.raw.fuelLevel.value.numericValue, 103.25);
  assert.equal(report.raw.fuelLevel.unit.value, null); assert.equal(report.raw.fuelLevel.unitSymbol.value, null);
  assert.equal(report.before.fuel, null); assert.equal(report.cachedAfter.fuel, null, 'A diagnostic compares without saving its candidate');
  assert.equal(report.normalizedCandidate.fuel.value.numericValue, 100); assert.equal(report.wouldMerge.fuel.value.numericValue, 100);
  assert.equal(report.normalizedCandidate.fuel.rawValue.numericValue, 103.25); assert.equal(report.wouldMerge.fuel.rawValue.numericValue, 103.25);
  assert.equal(report.normalizedCandidate.fuel.at.normalizerAtMs, at);
  assert.doesNotMatch(JSON.stringify({ normalized, report }), /PRIVATE_|1FTFW1E50JFA00001/);
  assert.throws(() => h.api.normalize(raw, '1FTFW1E50JFA00002', 'FordPass', TIME), /VIN/);
  assert.equal(JSON.stringify(raw), rawText); assert.equal(JSON.stringify(before), beforeText);

  for (const [input, expected] of [[0, 0], ['0', 0], [75.5, 75.5], ['75.5', 75.5], [100, 100], ['103.25', 100], [103.25, 100],
    [-0.1, null], ['-1', null], [true, null], [false, null], [null, null], [undefined, null], [[], null], [{ value: 75 }, null], ['', null], ['   ', null], [NaN, null], [Infinity, null], ['PRIVATE_NUMBER', null]]) {
    assert.equal(h.api.fordFuelPercent(input), expected, 'Unexpected fuel conversion for ' + String(input));
  }
  raw.metrics.fuelLevel.value = 75.5;
  const ordinary = h.api.normalize(raw, VIN, 'FordPass', TIME).fuel;
  assert.equal(ordinary.value, 75.5); assert.equal(ordinary.at, at); assert.equal(ordinary.source, 'FordPass');
  assert.equal(h.state.requests.length, 0); assert.equal(original.state.requests.length, 0);
  assert.equal(h.state.files.size, 0); assert.equal(h.state.secrets.size, 0);
});

test('status diagnostic strictly whitelists fields, enum text and timestamps while bounding raw arrays', () => {
  const h = scriptable(widgetSource), f = statusFixture();
  f.before.fields.lock.source = 'PRIVATE_PROVIDER';
  const entry = { vehicleDoor: VIN, value: 'PRIVATE_STATE', updateTime: 'PRIVATE_TIMESTAMP',
    tags: { DOOR_LATCH_TYPE: 'PRIVATE_LATCH', PRIVATE_TAG: 'PRIVATE_TAG_VALUE' }, PRIVATE_CUSTOM_KEY: 'PRIVATE_CUSTOM_VALUE',
    doorLatchType: 'PRIVATE_DIRECT_LATCH', vehicleSide: VIN, vehicleOccupantRole: 'PRIVATE_OCCUPANT' };
  f.raw.metrics.doorLockStatus = Array.from({ length: 70 }, () => plain(entry));
  f.raw.metrics.doorStatus = Array.from({ length: 70 }, () => ({ vehicleDoor: 'FRONT_LEFT', value: 'Closed', updateTime: f.iso(f.fresh) }));
  const provenComponents = ['FRUNK', 'INNER_TAILGATE', 'REAR_CARGO_LEFT', 'REAR_CARGO_RIGHT', 'SLIDING_LEFT', 'SLIDING_RIGHT',
    'UNKNOWN_DOOR', 'UNSPECIFIED_DOOR', 'UNSPECIFIED_FRONT', 'UNSPECIFIED_REAR'];
  for (const [index, component] of provenComponents.entries()) Object.assign(f.raw.metrics.doorStatus[index], {
    vehicleDoor: component, vehicleSide: 'DRIVER', vehicleOccupantRole: 'PASSENGER', doorLatchType: 'ELECTRONIC', tags: { DOOR_LATCH_TYPE: 'UNKNOWN' } });
  f.raw.metrics.hoodStatus = { vehicleDoor: 'HOOD', value: 'PRIVATE_HOOD', updateTime: 1e100 };
  f.raw.metrics.position = { value: { location: { lat: 42.12345, lon: -83.12345 } } };
  f.raw.token = 'PRIVATE_TOKEN'; f.raw.correlationId = 'PRIVATE_CORRELATION'; f.raw.custom = 'PRIVATE_ROOT';
  f.before.generalStatusRequest = { attemptAt: TIME - 5000, outcome: 'device_succeeded', id: 'PRIVATE_GENERAL_RECEIPT', privateExtra: 'PRIVATE_GENERAL_EXTRA' };
  const report = h.api.statusDiagnosticReport(f.raw, f.before, VIN, TIME), text = JSON.stringify(report);
  assert.equal(report.raw.doorLockStatus.items.length, 32); assert.equal(report.raw.doorLockStatus.count, 70); assert.equal(report.raw.doorLockStatus.omittedCount, 38);
  assert.equal(report.raw.doorStatus.items.length, 32); assert.equal(report.raw.doorStatus.omittedCount, 38);
  assert.equal(report.raw.doorLockStatus.items[0].component.value, null); assert.equal(report.raw.doorLockStatus.items[0].value.value, null);
  assert.equal(report.raw.doorLockStatus.items[0].updateTime.rawValue, null);
  for (const key of ['doorLatchType', 'directDoorLatchType', 'vehicleSide', 'vehicleOccupantRole']) assert.equal(report.raw.doorLockStatus.items[0][key].value, null);
  for (const [index, component] of provenComponents.entries()) {
    const item = report.raw.doorStatus.items[index];
    assert.deepEqual(plain(item.component), { value: component, exactEnumMatch: true, withheldCount: 0 });
    assert.equal(item.vehicleSide.value, 'DRIVER'); assert.equal(item.vehicleOccupantRole.value, 'PASSENGER');
    assert.equal(item.directDoorLatchType.value, 'ELECTRONIC'); assert.equal(item.doorLatchType.value, 'UNKNOWN');
  }
  assert.equal(report.raw.doorStatus.items[0].value.value, 'Closed'); assert.equal(report.raw.doorStatus.items[0].value.exactEnumMatch, false);
  assert.doesNotMatch(text, /PRIVATE_|1FTFW1E50JFA00001|42\.12345|-83\.12345|1e\+100/);
  assert.equal(report.reportVersion, 2); assert.deepEqual(plain(report.lastGeneralStatusRequest), { outcome: 'device_succeeded', attemptAgeSeconds: 5 });
  f.before.generalStatusRequest.outcome = 'PRIVATE_UNKNOWN_OUTCOME';
  assert.equal(h.api.statusDiagnosticReport(f.raw, f.before, VIN, TIME).lastGeneralStatusRequest.outcome, null);
  for (const group of ['before', 'normalizedCandidate', 'wouldMerge', 'cachedAfter']) assert.deepEqual(Object.keys(report[group]).sort(), ['doors', 'lock']);
  assert.throws(() => h.api.statusDiagnosticReport({ ...f.raw, vin: '1FTFW1E50JFA00002' }, f.before, VIN, TIME), /vehicle mismatch/);
  assert.throws(() => h.api.statusDiagnosticReport(f.raw, f.before, VIN + '\n', TIME), /vehicle mismatch/);
  assert.equal(h.state.requests.length, 0);
});

test('status diagnostic cancellation and missing sign-in refuse the passive GET before authentication or cache writes', async () => {
  for (const scenario of ['cancel', 'signed-out']) {
    const h = scriptable(widgetSource), app = await prepared(h), before = h.state.files.get(app.store.path);
    let tokenCalls = 0, writes = 0;
    app.auth.token = async () => { tokenCalls += 1; return 'PRIVATE_DIAGNOSTIC_TOKEN'; };
    const originalWrite = app.store.write.bind(app.store); app.store.write = value => { writes += 1; return originalWrite(value); };
    if (scenario === 'signed-out') h.state.secrets.delete(h.api.secretKey('token.mobile'));
    h.state.choices.push(-1);
    assert.equal(await app.vehicleStatusDiagnostic(prefs()), null);
    assert.equal(h.state.requests.length, 0); assert.equal(tokenCalls, 0); assert.equal(writes, 0);
    assert.equal(h.state.files.get(app.store.path), before);
    if (scenario === 'signed-out') assert.ok(h.state.alerts.some(alert => /Connect FordPass first/.test(alert.message || '')));
    app.store.release();
  }
});

test('status diagnostic Preview then Copy reuses one passive v1 GET and leaves the telemetry cache byte-identical', async () => {
  const h = scriptable(widgetSource), f = statusFixture(), app = await prepared(h, prefs(), f.before);
  const before = h.state.files.get(app.store.path); let writes = 0, tokenCalls = 0;
  app.auth.token = async name => { tokenCalls += 1; assert.equal(name, 'autonomic'); return 'PRIVATE_DIAGNOSTIC_TOKEN'; };
  const originalWrite = app.store.write.bind(app.store); app.store.write = value => { writes += 1; return originalWrite(value); };
  h.state.responses.push(() => {
    assert.ok(h.state.alerts.some(alert => alert.title === 'Vehicle data diagnostic' && alert.actions.some(action => action.title === 'Preview report')),
      'The diagnostic consent must already be visible before transport');
    return { body: f.raw };
  });
  h.state.choices.push('Preview report', 'Copy report', -1);
  const report = await app.vehicleStatusDiagnostic(prefs());
  assert.equal(report.readOnly, true); assert.equal(h.state.requests.length, 1); assert.equal(tokenCalls, 1);
  assert.equal(report.reportVersion, 5); assert.equal(report.appVersion, appVersion); assert.equal(report.cloudReadOutcome, 'succeeded');
  assert.equal(Object.hasOwn(report, 'previewVersion'), false);
  assert.equal(report.fuel.raw.fuelLevel.value.numericValue, 63);
  assert.equal(report.fuel.normalizedCandidate.fuel.value.numericValue, 63);
  assert.equal(report.refreshDiagnostics.appVersion, appVersion);
  assert.equal(report.refreshDiagnostics.cachedFuel.value, 63);
  const request = h.state.requests[0];
  assert.equal(request.method, 'GET'); assert.equal(request.url, 'https://api.autonomic.ai/v1/telemetry/sources/fordpass/vehicles/' + VIN);
  assert.equal(request.body, undefined); assert.equal(writes, 0); assert.equal(h.state.files.get(app.store.path), before);
  assert.equal(h.state.previews.length, 1); assert.equal(h.state.clipboard.length, 1); assert.equal(h.state.previews[0], h.state.clipboard[0]);
  assert.deepEqual(JSON.parse(h.state.clipboard[0]), plain(report));
  assert.doesNotMatch(h.state.clipboard[0], /PRIVATE_|1FTFW1E50JFA00001/);
  assert.deepEqual(plain(report.cachedAfter), plain(report.before));
  app.store.release();
});

test('a failed or gated passive diagnostic returns safe cached context without retry, telemetry writes or raw errors', async () => {
  for (const scenario of ['http-error', 'historical-gate']) {
    const h = scriptable(widgetSource), app = await prepared(h), before = h.state.files.get(app.store.path); let writes = 0;
    app.auth.token = async () => 'PRIVATE_DIAGNOSTIC_TOKEN';
    const originalWrite = app.store.write.bind(app.store); app.store.write = value => { writes += 1; return originalWrite(value); };
    if (scenario === 'http-error') h.state.responses.push({ status: 503, body: { token: 'PRIVATE_RESPONSE_TOKEN', vin: VIN, error: 'PRIVATE_SERVER_ERROR' } });
    else h.api.secretSet('gate.telemetry.mobile', { failures: 1, next: TIME + 90000 });
    h.state.choices.push('Preview report', -1);
    const report = await app.vehicleStatusDiagnostic(prefs());
    assert.equal(report.reportVersion, 5); assert.equal(report.cloudReadOutcome, 'unavailable'); assert.equal(report.fuel, null);
    assert.equal(h.state.requests.length, scenario === 'http-error' ? 1 : 0, 'A failed GET is attempted once; a historical gate permits no request');
    if (h.state.requests.length) assert.equal(h.state.requests[0].method, 'GET');
    const gate = report.refreshDiagnostics.gates['telemetry.mobile'];
    assert.equal(gate.httpStatus, scenario === 'http-error' ? 503 : null);
    assert.equal(gate.secondsRemaining, scenario === 'http-error' ? 60 : 90);
    assert.equal(gate.failedAgeSeconds, scenario === 'http-error' ? 0 : null);
    assert.equal(writes, 0); assert.equal(h.state.files.get(app.store.path), before);
    assert.equal(h.state.previews.length, 1); assert.equal(h.state.clipboard.length, 0);
    assert.deepEqual(JSON.parse(h.state.previews[0]), plain(report));
    assert.doesNotMatch(JSON.stringify({ report, alerts: h.state.alerts, logs: h.state.logs }), /PRIVATE_|1FTFW1E50JFA00001/);
    app.store.release();
  }
});

test('the existing widget Refresh button routes directly to the combined refresh in original and PPO views', () => {
  for (const family of ['medium', 'large']) for (const parameter of ['controls', 'ppoa controls']) {
    const h = scriptable(widgetSource), c = cache({ proPower: ppoSnapshot({ DcacOut1Pw2Dsply: 1500, DcacOut2Pw2Dsply: 0, DcacOutPwDsplyMx: 7200 }) });
    const tree = new h.api.WidgetRenderer(prefs(), c, parameter).build(family);
    const buttons = nodes(tree).filter(isOriginalRefreshButton);
    assert.equal(buttons.length, 1); assert.equal(actionOf(buttons[0]), 'refreshwidget');
    assert.equal(h.api.COMMANDS.refresh, 'statusRefresh', 'The original app Wake command keeps its separate wire operation');
    assert.equal(h.state.requests.length, 0);
  }
});

test('disabled Vehicle features refresh cannot be bypassed by a widget deep link or direct refresh call', async () => {
  for (const path of ['action', 'direct']) {
    const h = scriptable(widgetSource), vehicle = prefs({ compatibility: { commands: { refresh: false }, verified: {} } });
    const controller = await prepared(h, vehicle);
    const beforeFiles = Array.from(h.state.files), beforeSecrets = Array.from(h.state.secrets);
    await assert.rejects(path === 'action' ? controller.action('refreshwidget', vehicle) : controller.refreshWidget(vehicle), /not enabled/);
    assert.equal(h.state.alerts.length, 0); assert.equal(h.state.requests.length, 0);
    assert.deepEqual(Array.from(h.state.files), beforeFiles); assert.deepEqual(Array.from(h.state.secrets), beforeSecrets);
    controller.store.release();
  }
});

test('canceling the combined widget refresh has no transport, telemetry-cache write or completion side effect', async () => {
  const h = scriptable(widgetSource), prior = { attemptAt: TIME - 3600000, outcome: 'completed', steps: { telemetry: 'saved' } };
  const app = await prepared(h, prefs(), cache({ widgetRefreshLast: prior })), before = h.state.files.get(app.store.path);
  let writes = 0;
  const originalWrite = app.store.write.bind(app.store); app.store.write = value => { writes += 1; return originalWrite(value); };
  h.state.choices.push(-1);
  const result = await app.action('refreshwidget', prefs());
  assert.equal(result.outcome, 'cancelled'); assert.equal(h.state.requests.length, 0); assert.equal(writes, 0);
  assert.equal(h.state.files.get(app.store.path), before); assert.equal(app.store.read().widgetRefreshAfter, undefined);
  assert.deepEqual(plain(app.store.read().widgetRefreshLast), prior, 'Cancel must retain the prior completed attempt');
  assert.equal(h.state.widgets.length, 0); assert.equal(h.state.notifications.length, 0);
  assert.equal(h.state.alerts.length, 1); assert.equal(h.state.alerts[0].title, 'Refresh Synthetic F-150 · 0001?');
  assert.equal(h.state.alerts[0].kind, 'alert');
  app.store.release();
});

test('forced ordinary telemetry bypasses the local interval but continues to respect server backoff', async () => {
  const h = scriptable(widgetSource), app = await prepared(h, prefs(), cache({ nextFetch: TIME + 900000 }));
  const api = new h.api.FordAPIClient(app.auth, app.store, prefs());
  await api.getVehicleStatus(); assert.equal(h.state.requests.length, 0, 'The default local read interval remains intact');
  const backoff = { next: TIME + 3600000, failures: 1 };
  h.api.secretSet('gate.telemetry.mobile', backoff);
  const blocked = await api.getVehicleStatus(true);
  assert.equal(h.state.requests.length, 0, 'Force must not bypass the authentication/server gate');
  assert.match(blocked.note, /cooling down/); assert.equal(app.store.read().fields.fuel.value, 63);
  assert.deepEqual(plain(h.api.secretGet('gate.telemetry.mobile')), backoff);
  app.store.release();
});

test('future backoff observations retain original delays and distinguish no response from an observed HTTP status', async () => {
  for (const status of [0, 400, 401, 403, 409, 429, 500]) {
    const b = scriptable(baselineSource), p = scriptable(widgetSource);
    const original = new b.api.FordAuthManager(new b.api.LocalStore()), changed = new p.api.FordAuthManager(new p.api.LocalStore());
    await original.store.acquire(); await changed.store.acquire();
    for (const auth of [original, changed]) auth.backoff('commands.generalStatus', status, { response: { headers: {} } }, {});
    const oldGate = plain(b.api.secretGet('gate.commands.generalStatus')), newGate = plain(p.api.secretGet('gate.commands.generalStatus'));
    assert.deepEqual({ failures: newGate.failures, next: newGate.next }, { failures: oldGate.failures, next: oldGate.next }, 'Original backoff changed for status ' + status);
    assert.equal(newGate.next - TIME, [400, 401, 403].includes(status) ? 900000 : 60000);
    assert.equal(newGate.httpStatus, status); assert.equal(newGate.failedAt, TIME);
    assert.equal(p.state.requests.length, 0); assert.equal(b.state.requests.length, 0);
    original.store.release(); changed.store.release();
  }
  const b = scriptable(baselineSource), p = scriptable(widgetSource);
  const original = new b.api.FordAuthManager(new b.api.LocalStore()), changed = new p.api.FordAuthManager(new p.api.LocalStore());
  await original.store.acquire(); await changed.store.acquire();
  for (let failure = 0; failure < 12; failure += 1) for (const auth of [original, changed]) auth.backoff('commands.generalStatus', 429, { response: { headers: {} } }, {});
  assert.equal(p.api.secretGet('gate.commands.generalStatus').failures, 10);
  assert.equal(p.api.secretGet('gate.commands.generalStatus').next - TIME, 21600000);
  assert.equal(p.api.secretGet('gate.commands.generalStatus').next, b.api.secretGet('gate.commands.generalStatus').next);
  for (const auth of [original, changed]) auth.backoff('commands.generalStatus', 429, { response: { headers: { 'rEtRy-AfTeR': '86400' } } }, {});
  assert.equal(p.api.secretGet('gate.commands.generalStatus').next - TIME, 86400000, 'Retry-After may exceed the six-hour exponential base cap');
  assert.equal(p.api.secretGet('gate.commands.generalStatus').next, b.api.secretGet('gate.commands.generalStatus').next);
  original.store.release(); changed.store.release();

  for (const scenario of ['timeout', 'http', 'invalid-json']) {
    const h = scriptable(widgetSource), app = await prepared(h);
    h.state.responses.push(scenario === 'timeout' ? new Error('PRIVATE_TIMEOUT') :
      scenario === 'http' ? { status: 503, body: { error: 'PRIVATE_SERVER_ERROR' } } : { status: 200, body: 'PRIVATE_INVALID_JSON' });
    await assert.rejects(app.auth.request('telemetry.proPower', 'https://api.autonomic.ai/v1beta/telemetry/sources/fordpass/vehicles/' + VIN + ':query', 'POST', {fields:[]}));
    const gate = plain(h.api.secretGet('gate.telemetry.proPower'));
    assert.equal(gate.httpStatus, scenario === 'timeout' ? 0 : scenario === 'http' ? 503 : 200);
    assert.equal(gate.failedAt, TIME); assert.equal(gate.failures, 1); assert.equal(gate.next, TIME + 60000);
    assert.equal(h.api.widgetDiagnosticContext(app.store.read(), TIME).gates['telemetry.proPower'].httpStatus, gate.httpStatus,
      'Exports must preserve an observed status, including a 200 response that failed JSON validation');
    const count = h.state.requests.length;
    await assert.rejects(app.auth.request('telemetry.proPower', 'https://api.autonomic.ai/v1beta/telemetry/sources/fordpass/vehicles/' + VIN + ':query', 'POST', {fields:[]}), /cooling down/);
    assert.equal(h.state.requests.length, count); assert.deepEqual(plain(h.api.secretGet('gate.telemetry.proPower')), gate, 'A gated tap must not replace the observed failure or increase its count');
    assert.doesNotMatch(JSON.stringify(gate), /PRIVATE_|synthetic\.invalid/);
    app.store.release();
  }
});

test('general status refresh uses the original wire body and only a matching terminal SUCCESS confirms completion', async () => {
  const h = scriptable(widgetSource), app = await prepared(h), api = new h.api.FordAPIClient(app.auth, app.store, prefs());
  h.state.responses.push({ body: generalFrame('PRIVATE_HISTORICAL_GENERAL', 'SUCCESS') }, { body: { id: 'PRIVATE_CURRENT_GENERAL' } },
    { body: generalFrame('PRIVATE_UNRELATED_GENERAL', 'SUCCESS') }, { body: generalFrame('PRIVATE_CURRENT_GENERAL', 'SUCCEEDED_ON_DEVICE') },
    { body: generalFrame('PRIVATE_CURRENT_GENERAL', 'SUCCESS') });
  const result = await api.requestGeneralStatus(true);
  assert.equal(result.outcome, 'device_succeeded'); assert.equal(result.dispatched, true);
  assert.equal(h.state.requests.length, 5, 'Unrelated success and nonterminal on-device state must not end polling');
  const commands = h.state.requests.filter(request => request.method === 'POST'); assert.equal(commands.length, 1);
  assert.equal(commands[0].url, 'https://api.autonomic.ai/v1/command/vehicles/' + VIN + '/commands');
  assert.deepEqual(JSON.parse(commands[0].body), { properties: {}, tags: {}, type: 'statusRefresh', wakeUp: true });
  assert.ok(h.state.clock <= TIME + 40000); assert.equal(app.auth.timeout, h.api.SETTINGS.timeout);
  assert.doesNotMatch(JSON.stringify({ result, cache: app.store.read() }), /PRIVATE_/);
  app.store.release();
  for (const state of ['FAILURE', 'CANCELLED', 'EXPIRED']) {
    const f = scriptable(widgetSource), controller = await prepared(f), client = new f.api.FordAPIClient(controller.auth, controller.store, prefs());
    f.state.responses.push({ body: generalFrame('old', 'SUCCESS') }, { body: { id: 'fresh' } }, { body: generalFrame('fresh', state) });
    const failed = await client.requestGeneralStatus(true);
    assert.equal(failed.outcome, 'device_failed'); assert.equal(failed.dispatched, true);
    assert.equal(f.state.requests.filter(request => request.method === 'POST').length, 1);
    controller.store.release();
  }
});

test('general refresh refuses missing confirmation, unusable baselines, historical receipts and late success', async () => {
  const refused = scriptable(widgetSource), app = await prepared(refused), api = new refused.api.FordAPIClient(app.auth, app.store, prefs());
  await assert.rejects(api.requestGeneralStatus(false), /Confirm/); assert.equal(refused.state.requests.length, 0);
  assert.throws(() => new refused.api.FordAPIClient(app.auth, app.store, { ...prefs(), vin: VIN + '\n' }), /vehicle|profile|binding/i); assert.equal(refused.state.requests.length, 0); app.store.release();
  for (const body of [{ error: 'PRIVATE_BASELINE_ERROR' }, null]) {
    const h = scriptable(widgetSource), controller = await prepared(h), client = new h.api.FordAPIClient(controller.auth, controller.store, prefs());
    h.state.responses.push(body === null ? { status: 503, body: {} } : { body });
    const result = await client.requestGeneralStatus(true);
    assert.equal(result.outcome, 'baseline_unavailable'); assert.equal(result.dispatched, false);
    assert.equal(h.state.requests.length, 1); assert.equal(h.state.requests[0].method, 'GET');
    assert.equal(controller.store.read().commandAfter, undefined); controller.store.release();
  }
  for (const mode of ['historical', 'late']) {
    const h = scriptable(widgetSource), controller = await prepared(h), client = new h.api.FordAPIClient(controller.auth, controller.store, prefs());
    h.state.responses.push({ body: generalFrame('old', 'SUCCESS') }, { body: { id: mode === 'historical' ? 'old' : 'fresh' } });
    if (mode === 'late') h.state.responses.push(() => { h.state.clock += 50000; return { body: generalFrame('fresh', 'SUCCESS') }; });
    const result = await client.requestGeneralStatus(true);
    assert.equal(result.outcome, 'accepted_unconfirmed'); assert.equal(result.dispatched, true);
    assert.equal(h.state.requests.length, mode === 'historical' ? 2 : 3);
    assert.equal(h.state.requests.filter(request => request.method === 'POST').length, 1); controller.store.release();
  }
});

test('general-refresh backoff preserves the original lock control after shared spacing', async () => {
  const h = scriptable(widgetSource), app = await prepared(h), api = new h.api.FordAPIClient(app.auth, app.store, prefs());
  h.state.responses.push({ body: generalFrame('old', 'SUCCESS') }, { status: 400, body: { error: 'PRIVATE_GENERAL_FAILURE' } });
  const result = await api.requestGeneralStatus(true);
  assert.equal(result.outcome, 'delivery_uncertain'); assert.equal(result.dispatched, true);
  assert.equal(h.api.secretGet('gate.commands'), null); assert.ok(h.api.secretGet('gate.commands.generalStatus').next > h.state.clock);
  assert.equal(app.store.read().wakeAfter, TIME + h.api.SETTINGS.wakeInterval);
  assert.equal(app.store.read().commandAfter, TIME + h.api.SETTINGS.commandInterval);
  h.state.clock += 30001; h.state.responses.push({ body: { id: 'synthetic-lock-after-general', status: 'accepted' } });
  await api.sendCommand(VIN, 'lock');
  assert.equal(h.state.requests.length, 3); assert.equal(JSON.parse(h.state.requests[2].body).type, 'lock');
  const blocked = await api.requestGeneralStatus(true);
  assert.equal(blocked.outcome, 'cooldown'); assert.equal(blocked.dispatched, false); assert.equal(h.state.requests.length, 3);
  app.store.release();
});

test('one confirmed widget refresh independently updates available sources and preserves PPO/cache cooldown across partial failures', async () => {
  for (const scenario of ['ppo-command-fails', 'ordinary-telemetry-fails', 'general-command-fails', 'general-cooldown', 'server-backoff']) {
    const h = scriptable(widgetSource), vehicle = prefs({ imageMode: 'auto' });
    const initial = cache({ nextFetch: TIME + 900000, proPower: ppoSnapshot({ DcacOut1Pw2Dsply: 800, DcacOut2Pw2Dsply: 0, DcacOutPwDsplyMx: 7200 }) });
    if (scenario === 'general-cooldown') initial.wakeAfter = TIME + 900000;
    const app = await prepared(h, vehicle, initial), localWork = [], events = [];
    h.api.FordAPIClient.prototype.updatePlace = async () => { localWork.push('place'); };
    h.api.FordAPIClient.prototype.updateVehicleImage = async force => { assert.equal(force, false); localWork.push('photo'); return 'synthetic-photo-source'; };
    const backoff = { next: TIME + 3600000, failures: 1 };
    if (scenario === 'server-backoff') { h.api.secretSet('gate.commands.proPower', backoff); h.api.secretSet('gate.telemetry.mobile', backoff); }
    let betaReads = 0, lastPPOValue = 800, generalDispatched = false, generalDone = false, ppoStarted = false, generalAttemptAt = null;
    const respond = request => {
      assert.ok(h.state.alerts.some(alert => alert.title === 'Refresh Synthetic F-150 · 0001?'), 'Combined consent must precede every request');
      assert.ok(app.store.read().widgetRefreshAfter >= TIME + 60000, 'Own cooldown must be persisted before dispatch');
      assert.equal(app.store.read().widgetRefreshLast.attemptAt, TIME, 'The current attempt must be recorded before any I/O');
      assert.equal(app.store.read().widgetRefreshLast.outcome, 'in_progress');
      if (request.url === 'https://api.autonomic.ai/v1beta/telemetry/sources/fordpass/vehicles/' + VIN + ':query') {
        ppoStarted = true;
        betaReads += 1; lastPPOValue = betaReads === 1 ? 1100 : 1520;
        return { body: commandFrame({ DcacOut1Pw2Dsply: lastPPOValue, DcacOut2Pw2Dsply: 0, DcacOutPwDsplyMx: 7200,
          DcacOutScndPw2Dsply: 0, DcacOutScndPwDsplyMx: 0 }, betaReads === 1 ? 'synthetic-previous-ppo-receipt' : 'synthetic-widget-refresh-receipt', h.state.clock) };
      }
      if (request.url === 'https://api.autonomic.ai/v1beta/command/vehicles/' + VIN + '/commands') {
        events.push({ phase: 'ppo-command', index: h.state.requests.length - 1, at: h.state.clock });
        if (generalDispatched) assert.ok(h.state.clock >= generalAttemptAt + 30000, 'Shared command spacing must precede PPO');
        assert.deepEqual(JSON.parse(request.body), { type: 'updatePTTBStatusCommand', version: '1.0.0', wakeUp: true, properties: {} });
        return scenario === 'ppo-command-fails' ? { status: 400, body: { error: 'PRIVATE_PPO_FAILURE' } } : { body: { id: 'synthetic-widget-refresh-receipt' } };
      }
      if (request.url === 'https://api.autonomic.ai/v1/command/vehicles/' + VIN + '/commands') {
        assert.deepEqual(JSON.parse(request.body), { properties: {}, tags: {}, type: 'statusRefresh', wakeUp: true });
        generalDispatched = true; generalAttemptAt = h.state.clock;
        events.push({ phase: 'general-command', index: h.state.requests.length - 1, at: h.state.clock });
        if (scenario === 'general-command-fails') { generalDone = true; return { status: 400, body: { error: 'PRIVATE_GENERAL_FAILURE' } }; }
        return { body: { id: 'synthetic-general-refresh-receipt' } };
      }
      assert.equal(request.url, 'https://api.autonomic.ai/v1/telemetry/sources/fordpass/vehicles/' + VIN);
      assert.equal(request.method, 'GET');
      if (!ppoStarted && !generalDispatched) { events.push({ phase: 'general-baseline', index: h.state.requests.length - 1 }); return { body: generalFrame('synthetic-old-general', 'SUCCESS') }; }
      if (!ppoStarted && generalDispatched && !generalDone) { generalDone = true; events.push({ phase: 'general-poll', index: h.state.requests.length - 1 }); return { body: generalFrame('synthetic-general-refresh-receipt', 'SUCCESS') }; }
      events.push({ phase: 'ordinary', index: h.state.requests.length - 1 });
      return scenario === 'ordinary-telemetry-fails' ? { status: 503, body: { error: 'PRIVATE_TELEMETRY_FAILURE' } } :
        { body: { vin: VIN, metrics: { fuelLevel: { value: 77, updateTime: new Date(h.state.clock).toISOString() } } } };
    };
    h.state.responses.push(...Array(12).fill(respond));
    h.state.choices.push('Refresh widget');
    const result = await app.action('refreshwidget', vehicle);
    assert.equal(result.outcome, 'completed');
    const commands = h.state.requests.filter(request => /\/command\/vehicles\//.test(request.url));
    const ppoCommands = commands.filter(request => JSON.parse(request.body).type === 'updatePTTBStatusCommand');
    const generalCommands = commands.filter(request => JSON.parse(request.body).type === 'statusRefresh');
    const ordinary = events.filter(event => event.phase === 'ordinary');
    if (scenario === 'server-backoff') {
      assert.equal(commands.length, 0); assert.equal(ordinary.length, 0); assert.equal(h.state.clock, TIME, 'No spacing wait may occur without this run dispatching general status');
      assert.deepEqual(plain(h.api.secretGet('gate.commands.proPower')), backoff);
      assert.deepEqual(plain(h.api.secretGet('gate.telemetry.mobile')), backoff);
    } else {
      assert.equal(ppoCommands.length, 1, 'The full flow sends at most its single confirmed PPO command');
      assert.equal(generalCommands.length, scenario === 'general-cooldown' ? 0 : 1);
      assert.equal(ordinary.length, 1, 'Ordinary telemetry must still be read after the PPO attempt');
      const ppoEvent = events.find(event => event.phase === 'ppo-command');
      assert.ok(ordinary[0].index > ppoEvent.index, 'Standard telemetry is read after the PPO status attempt');
      if (generalCommands.length) assert.ok(events.find(event => event.phase === 'general-command').index < ppoEvent.index);
      else assert.equal(h.state.clock, TIME, 'A preexisting general wake cooldown must not delay PPO or ordinary reads');
    }
    const saved = app.store.read();
    assert.equal(saved.fields.fuel.value, ['ordinary-telemetry-fails', 'server-backoff'].includes(scenario) ? 63 : 77);
    assert.equal(saved.proPower.rawSignals.DcacOut1Pw2Dsply, lastPPOValue, 'Ordinary telemetry writes must not discard newly saved PPO');
    assert.ok(saved.widgetRefreshAfter >= TIME + 60000, 'PPO and ordinary writes must retain the full-refresh cooldown');
    assert.deepEqual(plain(saved.widgetRefreshLast), { attemptAt: TIME, outcome: 'completed', steps: plain(result.steps) },
      'Safe stage checkpoints must retain the full current result without clobbering the telemetry or PPO writes');
    assert.deepEqual(Object.keys(saved.widgetRefreshLast).sort(), ['attemptAt', 'outcome', 'steps']);
    assert.doesNotMatch(JSON.stringify(saved), /synthetic-widget-refresh-receipt|synthetic-previous-ppo-receipt|synthetic-general-refresh-receipt|synthetic-old-general|PRIVATE_/);
    assert.deepEqual(localWork, ['place', 'photo']);
    assert.equal(h.state.widgets.length, 1); assert.equal(h.state.notifications.length, 1);
    assert.equal(h.state.alerts.filter(alert => alert.title === 'Refresh Synthetic F-150 · 0001?').length, 1);
    assert.equal(h.state.alerts.filter(alert => alert.kind === 'sheet').length, 0, 'A widget refresh must not enter a menu/details loop');
    const requestCount = h.state.requests.length;
    const repeated = await app.action('refreshwidget', vehicle);
    assert.equal(repeated.outcome, 'cooldown'); assert.equal(h.state.requests.length, requestCount, 'An immediate second tap must not repeat any cloud work');
    assert.deepEqual(plain(app.store.read().widgetRefreshLast), plain(saved.widgetRefreshLast), 'A cooldown tap must retain the completed attempt rather than mislabel it as new work');
    app.store.release();
  }
});
