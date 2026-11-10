'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { regressionLoad: load, prefs, cache, prepared, boundCache, plain, TIME, VIN } = require('./scriptable.cjs');

function located(extra = {}) {
  return cache(Object.assign({ fields: {
    fuel: { value: 53, at: TIME - 10000, source: 'FordPass' },
    outsideTemp: { value: 10, at: TIME - 3 * 3600000, source: 'FordPass' },
    position: { value: { lat: 42.12345, lon: -83.12345 }, at: TIME - 10000, source: 'FordPass' }
  }, place: { lat: 42.12345, lon: -83.12345, label: 'Synthetic street' } }, extra));
}
function seedCopies(h, app, snapshot = located()) {
  for (const suffix of ['', '.bak']) h.state.files.set(app.store.path + suffix, JSON.stringify(boundCache(app.store, snapshot)));
}
function noLocation(snapshot) {
  assert.ok(snapshot);
  assert.equal(Object.hasOwn(snapshot.fields, 'position'), false);
  assert.equal(Object.hasOwn(snapshot, 'place'), false);
}
function cleanCopies(h, app) {
  for (const suffix of ['', '.bak']) {
    const text = h.state.files.get(app.store.path + suffix);
    if (text !== undefined) noLocation(JSON.parse(text));
  }
}

test('turning Parked location off immediately clears both copies and canceled Start sends no location', async () => {
  const h = load(), vehicle = prefs({ home: { lat: 42.12345, lon: -83.12345 } });
  const app = await prepared(h, vehicle, located());
  seedCopies(h, app);
  const tokens = [...h.state.secrets].filter(([key]) => key.includes('token.'));
  h.state.choices.push('✓ Parked location', -1);
  await app.customize(vehicle);
  assert.equal(h.api.widgetOptions(h.api.secretGet('vehicle'), '').show.parked, false);
  cleanCopies(h, app);
  for (const suffix of ['', '.bak']) {
    const saved = JSON.parse(h.state.files.get(app.store.path + suffix));
    assert.equal(saved.fields.fuel.value, 53);
    assert.equal(saved.fields.outsideTemp.value, 10);
  }
  assert.deepEqual([...h.state.secrets].filter(([key]) => key.includes('token.')), tokens);
  assert.deepEqual(plain(h.api.secretGet('vehicle').home), { lat: 42.12345, lon: -83.12345 });
  h.state.choices.push(-1);
  await app.action('start', vehicle);
  assert.equal(h.state.requests.length, 0);
  assert.match(h.state.alerts.at(-1).title, /^START/);
  assert.match(h.state.alerts.at(-1).message, /vehicle sensor/);
  assert.equal(h.state.alerts.at(-1).cancel, 'Cancel');
  app.store.release();
});

test('location opt-out persists and purges both raw copies before the next Customize prompt', async () => {
  for (const alreadyOff of [false, true]) {
    const h = load(), vehicle = prefs({widget: {show: {parked: !alreadyOff}}}), app = await prepared(h, vehicle, located());
    seedCopies(h, app);
    let prompts = 0;
    const present = h.context.Alert.prototype.presentSheet;
    h.context.Alert.prototype.presentSheet = async function() {
      if (this.title === 'Customize widgets' && ++prompts === 2) cleanCopies(h, app);
      return present.call(this);
    };
    // Re-saving another preference while already opted out must still purge
    // stale raw files, even without a telemetry fetch or location toggle.
    h.state.choices.push(alreadyOff ? '✓ Oil life' : '✓ Parked location', -1);
    await app.customize(vehicle);
    assert.equal(h.api.widgetOptions(h.api.secretGet('vehicle'), '').show.parked, false);
    cleanCopies(h, app);
    assert.equal(app.store.read().fields.fuel.value, 53);
    assert.equal(h.state.requests.length + h.state.geocodes.length + h.state.safari.length, 0);
    app.store.release();
  }
});

test('disabled location is hidden on primary and backup reads and cannot be re-enabled by a widget parameter', async () => {
  const h = load(), vehicle = prefs({ widget: { show: { parked: false } } });
  const app = await prepared(h, vehicle);
  seedCopies(h, app);
  noLocation(app.store.read());
  h.state.files.set(app.store.path, '{invalid cache');
  noLocation(app.store.read());
  assert.equal(h.api.widgetOptions(vehicle, 'parked').show.parked, false);
  const renderer = new h.api.WidgetRenderer(vehicle, located(), 'parked');
  assert.equal(renderer.place(), null);
  await new h.api.FordAPIClient(app.auth, app.store, vehicle).updatePlace();
  await app.startWeather(vehicle);
  await app.startWeather();
  await app.details(vehicle);
  await app.parked(vehicle);
  assert.equal(h.state.requests.length, 0);
  assert.equal(h.state.geocodes.length, 0);
  assert.equal(h.state.safari.length, 0);
  assert.doesNotMatch(JSON.stringify(h.state.alerts), /42\.12345|-83\.12345|Synthetic street/);
  app.store.release();
});

test('every disabled-location write sanitizes new data and old backups without losing other fields', async () => {
  const h = load(), vehicle = prefs({ widget: { show: { parked: false } } });
  const app = await prepared(h, vehicle);
  seedCopies(h, app);
  const stale = located();
  const originalInput = plain(stale);
  app.store.write(stale);
  assert.deepEqual(stale, originalInput, 'Writing a scoped cache must not mutate the caller-owned input');
  cleanCopies(h, app);
  app.store.write(located({ commandAfter: TIME + 30000 }));
  cleanCopies(h, app);
  assert.equal(app.store.read().commandAfter, TIME + 30000);
  assert.equal(app.store.read().fields.fuel.value, 53);
  h.state.files.set(app.store.path, '{broken');
  noLocation(app.store.read());
  app.store.release();
});

test('re-enabling location keeps old coordinates erased and allows a newly fetched position', async () => {
  const h = load(), vehicle = prefs(), app = await prepared(h, vehicle, located());
  seedCopies(h, app);
  h.state.choices.push('✓ Parked location', '○ Parked location', -1);
  await app.customize(vehicle);
  assert.equal(h.api.widgetOptions(h.api.secretGet('vehicle'), '').show.parked, true);
  cleanCopies(h, app);
  assert.equal(new h.api.WidgetRenderer(vehicle, app.store.read()).place(), null);
  h.state.responses.push({ body: { vin: VIN, metrics: {
    position: { value: { location: { lat: 42.98765, lon: -83.98765 } }, updateTime: new Date(TIME).toISOString() }
  } } });
  const result = await new h.api.FordAPIClient(app.auth, app.store, vehicle).getVehicleStatus();
  assert.equal(result.cache.fields.position.value.lat, 42.98765);
  assert.equal(app.store.read().fields.position.value.lon, -83.98765);
  app.store.release();
});

for (const outcome of ['cooldown', 'failure', 'success']) {
  test('disabled location stays purged through telemetry ' + outcome, async () => {
    const h = load(), vehicle = prefs({ widget: { show: { parked: false } } });
    const app = await prepared(h, vehicle);
    seedCopies(h, app, located(outcome === 'cooldown' ? { nextFetch: TIME + 60000 } : {}));
    if (outcome === 'failure') h.state.responses.push(new Error('Synthetic offline failure'));
    if (outcome === 'success') h.state.responses.push({ body: { vin: VIN, metrics: {
      fuelLevel: { value: 61, updateTime: new Date(TIME).toISOString() },
      position: { value: { location: { lat: 42.98765, lon: -83.98765 } }, updateTime: new Date(TIME).toISOString() }
    } } });
    const result = await new h.api.FordAPIClient(app.auth, app.store, vehicle).getVehicleStatus();
    noLocation(result.cache);
    cleanCopies(h, app);
    assert.equal(result.cache.fields.fuel.value, outcome === 'success' ? 61 : 53);
    assert.equal(h.state.requests.length, outcome === 'cooldown' ? 0 : 1);
    app.store.release();
  });
}

test('opening the app cleans old disabled-location caches including a malformed primary', async () => {
  const h = load(), vehicle = prefs({ widget: { show: { parked: false } } });
  const app = await prepared(h, vehicle);
  seedCopies(h, app);
  h.state.files.set(app.store.path, '{broken');
  app.store.release();
  const cachePath = app.store.path;
  h.args.queryParameters.action = 'start'; h.args.queryParameters.vehicle = vehicle.id;
  h.state.choices.push(-1);
  const reopened = new h.api.AppController(); await reopened.run();
  assert.equal(reopened.store, null, 'Finished app runs release their vehicle context');
  assert.equal(h.state.files.has(cachePath), false);
  noLocation(JSON.parse(h.state.files.get(cachePath + '.bak')));
  assert.equal(h.state.requests.length, 0);
});

test('a cache that cannot be rewritten is removed when location is disabled', async () => {
  const h = load(), vehicle = prefs(), app = await prepared(h, vehicle, located());
  seedCopies(h, app);
  const write = h.fm.writeString;
  h.fm.writeString = (file, value) => {
    if ([app.store.path, app.store.path + '.bak'].includes(file)) throw new Error('Synthetic write failure');
    return write(file, value);
  };
  h.state.choices.push('✓ Parked location', -1);
  await app.customize(vehicle);
  assert.equal(h.state.files.has(app.store.path), false);
  assert.equal(h.state.files.has(app.store.path + '.bak'), false);
  assert.equal(h.api.widgetOptions(h.api.secretGet('vehicle'), '').show.parked, false);
  app.store.release();
});

test('failed removal reports failure, cleans the other copy and keeps location use disabled', async () => {
  const h = load(), vehicle = prefs(), app = await prepared(h, vehicle, located());
  seedCopies(h, app);
  const write = h.fm.writeString, remove = h.fm.remove;
  h.fm.writeString = (file, value) => {
    if (file === app.store.path) throw new Error('Synthetic write failure');
    return write(file, value);
  };
  h.fm.remove = file => {
    if (file === app.store.path) throw new Error('Synthetic remove failure');
    return remove(file);
  };
  h.state.choices.push('✓ Parked location');
  await assert.rejects(app.customize(vehicle), /Saved location could not be removed/);
  noLocation(JSON.parse(h.state.files.get(app.store.path + '.bak')));
  noLocation(app.store.read());
  h.state.choices.push(-1);
  await app.action('start', vehicle);
  assert.equal(h.state.requests.length, 0);
  app.store.release();
});

test('both failed cache rewrites still delete the backup when primary removal also fails', async () => {
  const h = load(), vehicle = prefs({ widget: { show: { parked: false } } }), app = await prepared(h, vehicle);
  seedCopies(h, app);
  const write = h.fm.writeString, remove = h.fm.remove;
  h.fm.writeString = (file, value) => {
    if ([app.store.path, app.store.path + '.bak'].includes(file)) throw new Error('Synthetic rewrite failure');
    return write(file, value);
  };
  h.fm.remove = file => {
    if (file === app.store.path) throw new Error('Synthetic primary removal failure');
    return remove(file);
  };
  assert.throws(() => app.store.purgeLocation(), /Saved location could not be removed/);
  assert.equal(h.state.files.has(app.store.path + '.bak'), false);
  noLocation(app.store.read());
  assert.equal(h.state.requests.length, 0); assert.equal(h.state.geocodes.length, 0);
  app.store.release();
});

test('enabled location retains geocoding, map links and the rounded weather fallback', async () => {
  const h = load(), vehicle = prefs(), app = await prepared(h, vehicle, located());
  const client = new h.api.FordAPIClient(app.auth, app.store, vehicle);
  const snapshot = app.store.read(); delete snapshot.place; app.store.write(snapshot);
  await client.updatePlace();
  assert.equal(h.state.geocodes.length, 1);
  assert.ok(new h.api.WidgetRenderer(vehicle, app.store.read(), 'parked').place().url.startsWith('https://maps.apple.com/'));
  h.state.responses.push({ body: { current: { temperature_2m: 45 } } });
  h.state.choices.push(-1);
  await app.action('start', vehicle);
  assert.equal(h.state.requests.length, 1);
  const url = new URL(h.state.requests[0].url);
  assert.equal(url.origin, 'https://api.open-meteo.com');
  assert.equal(url.searchParams.get('latitude'), '42.12');
  assert.equal(url.searchParams.get('longitude'), '-83.12');
  assert.match(h.state.alerts.at(-1).message, /Open-Meteo/);
  app.store.release();
});

test('the built-in self-test stays offline', () => {
  const h = load();
  h.api.selfTest();
  assert.equal(h.state.requests.length, 0);
});
