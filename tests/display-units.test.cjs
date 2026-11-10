'use strict';
const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const harness = require('./scriptable.cjs');
const { prefs, cache, prepared, prepareOtherVehicle, seedProfilePreferences, plain, TIME, VIN } = harness;
const script = process.env.FORDWIDGET_UNITS_SCRIPT || process.env.FORDWIDGET_SCRIPT ||
  path.join(__dirname, '../FordPassWidgets.js');
const source = fs.readFileSync(script, 'utf8');
const entry = source.lastIndexOf('try { await new AppController().run(); }');
assert(entry > 0, 'The selected script must have the offline-test entry boundary');
const helpers = ['displayUnitOptions', 'displayUnitThreshold', 'parseDisplayUnitThreshold', 'alertSettings', 'modelPressureInput', 'modelPressureMaximum'];
const exposed = source.slice(0, entry) + '\nglobalThis.DisplayUnitsTest = {' +
  helpers.map(name => name + ': typeof ' + name + " === 'undefined' ? undefined : " + name).join(',') +
  '};\n' + source.slice(entry);
const hasPPO = source.includes('function ppoEstimated(');
const load = () => { const h = harness.regressionLoad(exposed); Object.assign(h.api, h.context.DisplayUnitsTest); return h; };
const PSI_TO_KPA = 6.894757293;
const PPO_KEYS = ['ppoa', 'ppob', 'ppototal', 'ppocapacity'];

function snapshot() {
  const fields = {};
  for (const [key, value] of Object.entries({ fuel: 63, range: 100, odometer: 1000, outsideTemp: 20,
    fl: 35, fr: 36, rl: 35, rr: 29, battery: 84, oil: 72, lock: 'Locked', doors: 'Closed',
    position: { lat: 42.31, lon: -83.21 }, ignition: 'OFF' }))
    fields[key] = { value, at: TIME - 30000, source: 'FordPass' };
  return cache({ fields, proPower: { version: 1, vin: VIN,
    rawSignals: { DcacOut1Pw2Dsply: 1450, DcacOut2Pw2Dsply: 225, DcacOutPwDsplyMx: 7200,
      DcacOutScndPw2Dsply: 0, DcacOutScndPwDsplyMx: 0 }, rejectedSignals: [],
    commandAt: TIME - 180000, commandState: 'COMMAND_SUCCEEDED_ON_DEVICE',
    latestMode: { value: 'HIGH', at: TIME - 60000 }, fetchedAt: TIME } });
}
function nodes(tree) {
  const result = []; const visit = node => { if (!node || typeof node !== 'object') return;
    result.push(node); for (const child of node.children || []) visit(child); };
  visit(tree); return result;
}
const texts = tree => nodes(tree).filter(node => node.kind === 'text').map(node => node.value);
const vehicleURLs = tree => nodes(tree).map(node => node.url || '').filter(url =>
  /[?&]action=(?:lock|unlock|start|stop|refresh|refreshwidget)(?:&|$)/.test(url)).sort();
function cacheFiles(h) {
  const files = [...h.state.files].filter(([name]) => /\/vehicle_[a-f0-9]+_[a-f0-9]+\.json(?:\.bak)?$/.test(name));
  assert(files.length > 0, 'Cache-preservation assertions must inspect actual per-profile cache files'); return files;
}

// Choose actions by visible meaning instead of menu offsets. All UI stays mocked.
async function dialogs(h, plans, run) {
  const pending = [...plans], original = h.context.Alert.prototype.show;
  h.context.Alert.prototype.show = async function(kind) {
    assert(pending.length, 'Unexpected dialog: ' + this.title);
    const plan = pending.shift(); assert.match(this.title || '', plan.title);
    if (plan.capture) plan.capture(this);
    if (plan.input !== undefined) {
      const values = Array.isArray(plan.input) ? plan.input : [plan.input];
      values.forEach((value, index) => { this.fields[index].value = value; });
    }
    const choice = plan.action === null ? -1 : this.actions.findIndex(item =>
      plan.action instanceof RegExp ? plan.action.test(item.title) : item.title === plan.action);
    assert(choice >= 0 || plan.action === null, 'Missing action in ' + this.title);
    h.state.choices.unshift(choice);
    const result = await original.call(this, kind);
    if (plan.after) await plan.after(this);
    return result;
  };
  try { const result = await run(); assert.equal(pending.length, 0, 'Not all expected dialogs appeared'); return result; }
  finally { h.context.Alert.prototype.show = original; }
}
async function metric(h, app, vehicle) {
  await dialogs(h, [{ title: /^Units & formats$/, action: /^Units: US$/ },
    { title: /^Units & formats$/, action: null }], () => app.unitsOptions(vehicle));
  const saved = h.api.secretGet('vehicle'); assert.equal(h.api.displayUnitOptions(saved).units, 'metric'); return saved;
}
async function cyclePressure(h, app, vehicle) {
  await dialogs(h, [{ title: /^Units & formats$/, action: /^Tire pressure:/ },
    { title: /^Units & formats$/, action: null }], () => app.unitsOptions(vehicle));
  return h.api.secretGet('vehicle');
}

test('US defaults and existing explicit bar/psi preferences remain compatible', () => {
  const h = load(), vehicle = prefs();
  assert.deepEqual(plain(h.api.displayUnitOptions(vehicle)), { units: 'us', unit: 'psi', pressureMode: 'auto' });
  assert.equal(new h.api.WidgetRenderer(vehicle, snapshot()).temp(), '68°F');
  for (const unit of ['bar', 'psi']) {
    const legacy = prefs({ widget: { unit } });
    assert.equal(h.api.displayUnitOptions(legacy).unit, unit);
    assert.equal(h.api.displayUnitOptions(legacy, 'metric').unit, unit, 'A preset must not erase explicit legacy pressure');
  }
  assert.equal(new h.api.WidgetRenderer(prefs({ widget: { unit: 'bar' } }), snapshot()).tire('fl'), '2.4');
  assert.equal(h.state.requests.length, 0);
});

test('unit and pressure Parameters override presentation without hiding fields or changing the first accessory view', () => {
  const h = load(), vehicle = prefs();
  for (const parameter of ['metric', 'us', 'metric psi', 'kpa us', 'bar metric'])
    assert.deepEqual(plain(h.api.widgetOptions(vehicle, parameter).show), plain(h.api.widgetOptions(vehicle, '').show));
  for (const [parameter, units, unit] of [['metric', 'metric', 'kpa'], ['metric psi', 'metric', 'psi'],
    ['psi metric', 'metric', 'psi'], ['us kpa', 'us', 'kpa'], ['bar metric', 'metric', 'bar'],
    ['metric bar psi', 'metric', 'psi'], ['kpa us bar', 'us', 'bar']]) {
    const options = h.api.displayUnitOptions(vehicle, parameter); assert.equal(options.units, units); assert.equal(options.unit, unit);
  }
  assert.equal(h.api.widgetOptions(vehicle, 'metric fuel tires').view, 'fuel');
  assert.equal(h.api.widgetOptions(vehicle, 'us tires fuel').view, 'tires');
  assert.deepEqual(plain(h.api.widgetOptions(vehicle, 'metric fuel tires').show), plain(h.api.widgetOptions(vehicle, 'fuel tires').show));
  if (hasPPO) {
    assert.equal(h.api.widgetOptions(vehicle, 'metric ppob fuel').view, 'ppob');
    assert.equal(h.api.widgetOptions(vehicle, 'us fuel ppob').view, 'fuel');
    for (const family of ['accessoryCircular', 'accessoryRectangular', 'accessoryInline']) {
      const a = new h.api.WidgetRenderer(vehicle, snapshot(), 'metric ppob fuel').build(family);
      const b = new h.api.WidgetRenderer(vehicle, snapshot(), 'us ppob fuel').build(family);
      assert.deepEqual(plain(a), plain(b), 'Display units must not change the selected PPO accessory');
    }
  }
});

test('Units & formats persists the app preset and independent Auto/PSI/kPa/bar choices without rewriting telemetry or tokens', async () => {
  const h = load(), vehicle = prefs(), app = await prepared(h, vehicle, snapshot());
  const before = cacheFiles(h), tokens = [...h.state.secrets].filter(([key]) => key.includes('token.'));
  let saved = await metric(h, app, vehicle);
  assert.equal(h.api.displayUnitOptions(saved).unit, 'kpa');
  for (const mode of ['psi', 'kpa', 'bar', 'auto']) {
    saved = await cyclePressure(h, app, vehicle);
    assert.equal(h.api.displayUnitOptions(saved).pressureMode, mode);
  }
  assert.equal(h.api.displayUnitOptions(saved).unit, 'kpa', 'Auto follows the saved Metric preset');
  assert.equal(h.api.displayUnitOptions(saved, 'us').unit, 'psi', 'A widget preset also changes Auto pressure');
  assert.deepEqual(cacheFiles(h), before); assert.deepEqual([...h.state.secrets].filter(([key]) => key.includes('token.')), tokens);
  assert.equal(h.state.requests.length, 0); app.store.release();
});

test('distance, temperature and tire formatting leave canonical normalization and cached values untouched', async () => {
  const h = load(), vehicle = prefs(), app = await prepared(h, vehicle, snapshot());
  const raw = { vin: VIN, metrics: { fuelRange: { value: 160.9344, unit: 'km' }, odometer: { value: 1609.344, unit: 'km' },
    outsideTemperature: { value: 20 }, tirePressure: [{ vehicleWheel: 'FRONT_LEFT', value: 35 * PSI_TO_KPA, unit: 'kPa' }] } };
  const original = plain(h.api.normalize(raw, VIN, 'FordPass', TIME));
  const before = cacheFiles(h), saved = await metric(h, app, vehicle), renderer = new h.api.WidgetRenderer(saved, app.store.read());
  assert.equal(renderer.temp(), '20°C'); assert.match(renderer.tire('fl'), /^241(?:\.3)?$/);
  assert.equal(renderer.number('range', ' mi'), '161 km'); assert.equal(renderer.number('odometer', ' mi'), '1609 km');
  assert.deepEqual(plain(h.api.normalize(raw, VIN, 'FordPass', TIME)), original);
  assert.equal(app.store.read().fields.range.value, 100); assert.equal(app.store.read().fields.outsideTemp.value, 20);
  assert.equal(app.store.read().fields.fl.value, 35); assert.deepEqual(cacheFiles(h), before);
  assert.equal(h.state.requests.length, 0); app.store.release();
});

test('all gallery/widget families retain controls and optional PPO readings while units change', () => {
  const h = load();
  for (const design of ['classic', 'showcase', 'dashboard']) for (const family of
    ['small', 'medium', 'large', 'extraLarge', 'accessoryCircular', 'accessoryRectangular', 'accessoryInline']) {
    const vehicle = prefs({ alerts: { attention: true }, widget: { medium: 'controls',
      design: { small: design, medium: design, large: design }, show: Object.fromEntries(PPO_KEYS.map(key => [key, hasPPO])) } });
    seedProfilePreferences(h, vehicle);
    const c = snapshot(), before = JSON.stringify(c);
    const accessory = family.startsWith('accessory'), baseParameter = accessory ? 'fuel' : '';
    const us = new h.api.WidgetRenderer(vehicle, c, 'us ' + baseParameter).build(family);
    const metricTree = new h.api.WidgetRenderer(vehicle, c, 'metric ' + baseParameter).build(family);
    assert.deepEqual(vehicleURLs(metricTree), vehicleURLs(us), design + '/' + family + ' changed vehicle actions');
    const all = texts(metricTree).join(' '); assert.doesNotMatch(all, /\bmi\b|°F|\bPSI\b|\bpsi\b/);
    const power = tree => texts(tree).filter(value => /~.*(?:kW| W)/.test(value));
    assert.deepEqual(power(metricTree), power(us), 'Units must not scale Pro Power watts');
    if (hasPPO && !accessory) assert(power(metricTree).length > 0, 'Mixed PPO must remain visible');
    assert.equal(JSON.stringify(c), before);
  }
  assert.equal(h.state.requests.length, 0);
});

test('View details converts values and labels together and preserves missing/zero readings', async () => {
  const h = load(), vehicle = prefs(), c = snapshot(); c.fields.outsideTemp.value = 0; delete c.fields.fr;
  const app = await prepared(h, vehicle, c), saved = await metric(h, app, vehicle), before = cacheFiles(h);
  await app.details(saved);
  const text = h.state.alerts.at(-1).message;
  assert.match(text, /Odometer[^\n]*km[^\n]*1609|Odometer[^\n]*1609[^\n]*km/);
  assert.match(text, /DTE[^\n]*km[^\n]*160\.9|DTE[^\n]*160\.9[^\n]*km/);
  assert.match(text, /0°C/); assert.match(text, /Front left[^\n]*kPa[^\n]*241|Front left[^\n]*241[^\n]*kPa/);
  assert.match(text, /Front right[^\n]*Not reported/); assert.match(text, /Tire readings incomplete: FR/);
  assert.doesNotMatch(text, /\(mi\)|\bPSI\b|°F/);
  assert.deepEqual(cacheFiles(h), before); assert.equal(h.state.requests.length, 0); app.store.release();
});

test('tire alerts display selected units but keep PSI comparisons and unchanged threshold saves exact', async () => {
  const h = load(), vehicle = prefs({ alerts: { tire: 30.123456 } }), app = await prepared(h, vehicle, snapshot());
  const saved = await metric(h, app, vehicle), before = cacheFiles(h);
  const problems = h.api.nightProblems(app.store.read().fields, saved);
  assert.equal(problems.length, 1); assert.match(problems[0], /RR\s+200(?:\.0)?\s*kPa/i);
  const atThreshold = Object.fromEntries(['fl', 'fr', 'rl', 'rr'].map(key => [key, {value: 30.123456}]));
  assert.equal(h.api.nightProblems(atThreshold, saved).length, 0, 'Threshold comparison remains canonical PSI');
  let displayed;
  await dialogs(h, [{ title: /^Tires & axle thresholds$/, action: /^Edit front \/ rear thresholds/ },
    { title: /^Low-pressure thresholds$/, action: 'Save', capture: alert => {
      displayed = alert.fields.map(field => field.value); assert.match(alert.message, /kPa/);
    } }, { title: /^Tires & axle thresholds$/, action: null }], () => app.tireOptions(saved));
  assert(displayed.every(value => Number(value) > 200));
  assert.equal(h.api.secretGet('vehicle').tireConfiguration.frontPsi, 30.123456);
  assert.equal(h.api.secretGet('vehicle').tireConfiguration.rearPsi, 30.123456);
  assert.deepEqual(cacheFiles(h), before); assert.equal(h.state.requests.length, 0); app.store.release();
});

test('edited axle pressure thresholds convert once to PSI and invalid input cannot change settings', async () => {
  const h = load(), vehicle = prefs({ alerts: { tire: 30 } }), app = await prepared(h, vehicle, snapshot());
  const saved = await metric(h, app, vehicle), before = cacheFiles(h);
  await dialogs(h, [{ title: /^Tires & axle thresholds$/, action: /^Edit front \/ rear thresholds/ },
    { title: /^Low-pressure thresholds$/, action: 'Save', input: ['200', '220'] },
    { title: /^Tires & axle thresholds$/, action: null }], () => app.tireOptions(saved));
  const canonical = h.api.secretGet('vehicle').tireConfiguration.frontPsi;
  assert(Math.abs(canonical - 200 / PSI_TO_KPA) < 1e-8);
  assert(Math.abs(h.api.secretGet('vehicle').tireConfiguration.rearPsi - 220 / PSI_TO_KPA) < 1e-8);
  for (const input of ['', 'invalid', '0', '-1', '100000', 'Infinity'])
    assert.equal(h.api.modelPressureInput(input, 'kpa'), null);
  assert.equal(h.api.secretGet('vehicle').tireConfiguration.frontPsi, canonical);
  for (const unit of ['psi', 'kpa', 'bar']) {
    let current = h.api.secretGet('vehicle');
    while (h.api.displayUnitOptions(current).pressureMode !== unit) current = await cyclePressure(h, app, current);
    const max = h.api.modelPressureMaximum(unit), over = String(max + 0.001);
    assert.equal(h.api.modelPressureInput(String(max), unit), 150,
      unit + ' must accept its exact advertised maximum despite floating-point conversion');
    assert.equal(h.api.modelPressureInput('0', unit), null, 'Both owner thresholds must be positive before tire alerts can be configured');
    assert.equal(h.api.modelPressureInput(over, unit), null, unit + ' must reject meaningful overflow');
    await dialogs(h, [{ title: /^Tires & axle thresholds$/, action: /^Edit front \/ rear thresholds/ },
      { title: /^Low-pressure thresholds$/, action: 'Save', capture: alert => {
        const advertised = alert.message.match(/up to ([\d.]+)/);
        assert(advertised, 'The threshold input must advertise its maximum');
        assert.equal(Number(advertised[1]), max); alert.fields.forEach(field => { field.value = advertised[1]; });
      } }, { title: /^Tires & axle thresholds$/, action: null }], () => app.tireOptions(current));
    assert.equal(h.api.secretGet('vehicle').tireConfiguration.frontPsi, 150, unit + ' UI must save the advertised maximum as canonical 150 PSI');
    assert.equal(h.api.secretGet('vehicle').tireConfiguration.rearPsi, 150);
    current = h.api.secretGet('vehicle');
    for (const invalid of ['0', over]) {
      const prior = plain(h.api.secretGet('vehicle').tireConfiguration);
      await dialogs(h, [{ title: /^Tires & axle thresholds$/, action: /^Edit front \/ rear thresholds/ },
        { title: /^Low-pressure thresholds$/, action: 'Save', input: [invalid, String(max)] },
        { title: /^Invalid thresholds$/, action: 'OK' },
        { title: /^Tires & axle thresholds$/, action: null }], () => app.tireOptions(current));
      assert.deepEqual(plain(h.api.secretGet('vehicle').tireConfiguration), prior, unit + ' UI must reject an invalid axle without partially saving the other');
    }
  }
  assert.deepEqual(cacheFiles(h), before);
  assert.equal(h.state.requests.length, 0); app.store.release();
});

test('weather prompts change displayed temperature while retaining requests and respecting location opt-out', async () => {
  const requests = [];
  for (const system of ['us', 'metric']) {
    const h = load(), vehicle = prefs(), c = snapshot(), app = await prepared(h, vehicle, c);
    const saved = system === 'metric' ? await metric(h, app, vehicle) : vehicle;
    const sensor = await app.startWeather(saved); assert.match(sensor, system === 'metric' ? /20°C/ : /68°F/);
    assert.doesNotMatch(sensor, /Cold:|Hot:/, 'A Celsius display must not change Fahrenheit hint thresholds');
    assert.equal(h.state.requests.length, 0);
    const cold = app.store.read(); cold.fields.outsideTemp.value = 0; app.store.write(cold);
    const coldPrompt = await app.startWeather(saved); assert.match(coldPrompt, system === 'metric' ? /0°C/ : /32°F/);
    assert.match(coldPrompt, /Cold:/);
    const old = app.store.read(); old.fields.outsideTemp.at = TIME - 3 * 3600000; app.store.write(old);
    const before = cacheFiles(h); h.state.responses.push({ body: { current: { temperature_2m: 68 } } });
    const fallback = await app.startWeather(saved); assert.match(fallback, system === 'metric' ? /20°C/ : /68°F/);
    assert.doesNotMatch(fallback, /Cold:|Hot:/);
    assert.equal(h.state.requests.length, 1); requests.push(plain(h.state.requests[0])); assert.deepEqual(cacheFiles(h), before);
    app.store.release();
  }
  assert.deepEqual(requests[0], requests[1], 'Display settings must not alter the existing weather request');
  assert.match(requests[0].url, /temperature_unit=fahrenheit/);
  const h = load(), vehicle = prefs({ widget: { show: { parked: false } } }), c = snapshot();
  c.fields.outsideTemp.at = TIME - 3 * 3600000;
  const app = await prepared(h, vehicle, c), saved = await metric(h, app, vehicle);
  await app.startWeather(saved); assert.equal(h.state.requests.length, 0); assert.equal(h.state.geocodes.length, 0);
  app.store.release();
});

test('canceling Units & formats and attempting it in a widget perform no settings, cache or transport changes', async () => {
  const h = load(), vehicle = prefs({ widget: { unit: 'bar' } }), app = await prepared(h, vehicle, snapshot());
  const secrets = [...h.state.secrets], files = cacheFiles(h);
  await dialogs(h, [{ title: /^Units & formats$/, action: null }], () => app.unitsOptions(vehicle));
  assert.deepEqual([...h.state.secrets], secrets); assert.deepEqual(cacheFiles(h), files);
  h.config.runsInApp = false; h.config.runsInWidget = true;
  await assert.rejects(app.unitsOptions(vehicle), /Scriptable|app/i);
  assert.deepEqual([...h.state.secrets], secrets); assert.deepEqual(cacheFiles(h), files);
  assert.equal(h.state.requests.length, 0); h.config.runsInApp = true; h.config.runsInWidget = false; app.store.release();
});

test('a stale Units dialog cannot save after a selected profile changes or a lease takeover', async () => {
  for (const scenario of ['profile-switch', 'takeover']) {
    const h = load(), vehicle = prefs(), app = await prepared(h, vehicle, snapshot());
    const other = await prepareOtherVehicle(h, app);
    let successor, savedSecrets, savedFiles;
    const plans = [{ title: /^Units & formats$/, action: /^Units:/, after: async () => {
      if (scenario === 'takeover') { successor = new h.api.LocalStore(); await successor.acquire(); }
      if (scenario === 'profile-switch') h.api.bindVehicleProfile(other.id);
      else {
        const current = Object.assign({}, vehicle, {name: 'Current saved settings'});
        h.api.saveVehicleProfile(current, successor);
        const currentCache = snapshot(); currentCache.fields.fuel.value = 44; successor.write(currentCache);
      }
      savedSecrets = [...h.state.secrets]; savedFiles = [...h.state.files];
    } }];
    if (scenario === 'takeover') plans.push({ title: /already running/, action: 'Take over' });
    await assert.rejects(dialogs(h, plans, () => app.unitsOptions(vehicle)), /session|vehicle/i);
    assert.deepEqual([...h.state.secrets], savedSecrets); assert.deepEqual([...h.state.files], savedFiles);
    assert.equal(h.state.requests.length, 0); assert.equal(h.state.notifications.length, 0);
    if (successor) successor.release(); else app.store.release();
  }
});
