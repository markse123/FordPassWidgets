'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { regressionLoad: load, prefs, cache, prepared, plain, TIME, VIN } = require('./scriptable.cjs');

const iso = at => new Date(at).toISOString();
const security = at => ({ lock: { value: 'Locked', at, measurementAt: at, source: 'FordPass' }, doors: { value: 'Closed', at, measurementAt: at, source: 'FordPass' } });
const metrics = (at = TIME - 30000, values = {}) => ({
  fuelLevel: { value: 77, updateTime: iso(TIME) },
  doorLockStatus: [{ vehicleDoor: 'ALL_DOORS', value: values.lock || 'LOCKED', updateTime: iso(at) }],
  doorStatus: [{ vehicleDoor: 'FRONT_LEFT', value: values.doors || 'CLOSED', updateTime: iso(at) }],
  hoodStatus: { vehicleDoor: 'HOOD', value: 'CLOSED', updateTime: iso(at) }
});

async function evening({ fields = {}, responseMetrics = { fuelLevel: { value: 77, updateTime: iso(TIME) } }, responseTime = undefined, notifyOk = true, enabled = true } = {}) {
  const h = load(), vehicle = prefs({ alerts: {enabled: {tires: false}}, night: { enabled, hour: 0, notifyOk } });
  const app = await prepared(h, vehicle, cache({ fields, fetchedAt: TIME - 7200000 }));
  app.store.release(); h.config.runsInWidget = true; h.config.runsInApp = false;
  h.state.responses.push({ body: { vin: VIN, metrics: responseMetrics, ...(responseTime === undefined ? {} : { updateTime: responseTime }) } });
  const result = await app.nightlyCheck(vehicle);
  if (enabled) {
    assert.equal(h.state.requests.length, 1); assert.equal(h.state.requests[0].method, 'GET');
    assert.equal(h.state.requests[0].body, undefined);
    assert.equal(h.state.requests[0].url, 'https://api.autonomic.ai/v1/telemetry/sources/fordpass/vehicles/' + VIN);
    assert.equal(result.fetchedAt, TIME, 'An unrelated fresh fetch must not stand in for fresh security measurements');
    assert.equal(result.night.done, true); assert.equal(app.store.owner, null);
    assert.equal(app.auth.timeout, h.api.SETTINGS.timeout);
  }
  return { h, app, vehicle, result };
}

test('a fresh fuel-only evening read reports limited status without claiming Locked, Closed or All good', async () => {
  const { h, app, vehicle, result } = await evening();
  assert.equal(result.fields.fuel.value, 77); assert.equal(result.night.securityFresh, false);
  assert.deepEqual(plain(result.night.problems), []);
  assert.equal(h.state.notifications.length, 1);
  assert.match(h.state.notifications[0].body, /Current lock\/door status could not be confirmed/);
  assert.doesNotMatch(h.state.notifications[0].body, /Locked|closed|all readings normal/i);
  h.config.runsInApp = true; h.config.runsInWidget = false; const foreground = new h.api.AppController();
  await foreground.attachVehicle(vehicle.id); await foreground.details(vehicle); foreground.releaseContext();
  assert.match(h.state.alerts[0].message, /Evening check: Current security status unconfirmed/);
  assert.doesNotMatch(h.state.alerts[0].message, /Evening check: Locked and closed; no enabled alerts/);
  const requests = h.state.requests.length, notifications = h.state.notifications.length;
  assert.equal(await app.nightlyCheck(vehicle), null);
  assert.equal(h.state.requests.length, requests); assert.equal(h.state.notifications.length, notifications, 'A completed limited check must not introduce a retry loop');
});

test('old, incomplete, unknown or untrusted lock/door readings cannot produce a positive evening status', async () => {
  const cases = [
    security(TIME - 7200000),
    { lock: security(TIME - 1000).lock },
    { ...security(TIME - 1000), lock: { value: 'UNKNOWN', at: TIME - 1000, measurementAt: TIME - 1000 } },
    { ...security(TIME - 1000), lock: { value: 'Locked', at: TIME - 1000, measurementAt: TIME - 300001 } },
    { lock: { value: 'Locked', at: TIME - 1000 }, doors: { value: 'Closed', at: TIME - 1000 } },
    security(null),
    security(String(TIME - 1000)),
    security(TIME + 1000)
  ];
  for (const fields of cases) {
    const { h, result } = await evening({ fields });
    assert.equal(result.night.securityFresh, false);
    assert.equal(h.state.notifications.length, 1); assert.match(h.state.notifications[0].body, /could not be confirmed/);
    assert.doesNotMatch(h.state.notifications[0].body, /Locked and closed|all readings normal/);
  }
});

test('fresh root response times cannot substitute for missing or invalid security measurement timestamps', async () => {
  for (const missing of ['lock', 'doors', 'hood', 'all']) {
    const responseMetrics = metrics();
    if (missing === 'lock' || missing === 'all') delete responseMetrics.doorLockStatus[0].updateTime;
    if (missing === 'doors' || missing === 'all') responseMetrics.doorStatus[0].updateTime = 'invalid-time';
    if (missing === 'hood' || missing === 'all') delete responseMetrics.hoodStatus.updateTime;
    const { h, result } = await evening({ responseMetrics, responseTime: iso(TIME) });
    const field = missing === 'lock' ? 'lock' : 'doors';
    assert.equal(result.fields[field].at, null, 'A missing component time is unknown; the response time never stands in for it');
    assert.equal(result.fields[field].measurementAt, null, 'Security measurement provenance must stay unknown');
    assert.equal(result.night.securityFresh, false);
    assert.match(h.state.notifications[0].body, /could not be confirmed/);
    assert.doesNotMatch(h.state.notifications[0].body, /Locked and closed|all readings normal/);
  }
  for (const component of ['hood', 'individual-lock']) {
    const responseMetrics = metrics(TIME - 1000);
    if (component === 'hood') responseMetrics.hoodStatus.updateTime = iso(TIME + 1000);
    else responseMetrics.doorLockStatus = [
      { vehicleDoor: 'FRONT_LEFT', value: 'LOCKED', updateTime: iso(TIME - 1000) },
      { vehicleDoor: 'FRONT_RIGHT', value: 'LOCKED', updateTime: iso(TIME + 1000) }
    ];
    const { h, result } = await evening({ responseMetrics, responseTime: iso(TIME) });
    const field = component === 'hood' ? 'doors' : 'lock';
    assert.ok(result.fields[field].at === null || result.fields[field].at <= TIME, 'A future component time is never displayed as a measurement');
    assert.equal(result.fields[field].measurementAt, null, 'The earliest aggregate time must not hide an untrusted future component');
    assert.equal(result.night.securityFresh, false); assert.match(h.state.notifications[0].body, /could not be confirmed/);
  }
});

test('explicit Locked and Closed measurements within five minutes permit the optional positive notice', async () => {
  for (const at of [TIME - 30000, TIME - 300000]) {
    const { h, app, vehicle, result } = await evening({ responseMetrics: metrics(at) });
    assert.equal(result.night.securityFresh, true); assert.equal(result.fields.lock.at, at); assert.equal(result.fields.doors.at, at);
    assert.equal(result.fields.lock.measurementAt, at); assert.equal(result.fields.doors.measurementAt, at);
    assert.deepEqual(plain(result.night.problems), []); assert.equal(h.state.notifications.length, 1);
    assert.equal(h.state.notifications[0].body, 'Locked and closed; no problems in the reported readings.');
    h.config.runsInApp = true; h.config.runsInWidget = false; const foreground = new h.api.AppController();
  await foreground.attachVehicle(vehicle.id); await foreground.details(vehicle); foreground.releaseContext();
    assert.match(h.state.alerts[0].message, /Evening check: Locked and closed; no enabled alerts/);
  }
});

test('a hood reading alone is not fresh evidence that the doors are closed', async () => {
  const responseMetrics = metrics(); delete responseMetrics.doorStatus;
  const { h, result } = await evening({ responseMetrics });
  assert.equal(result.fields.doors.value, 'Unknown'); assert.equal(result.fields.doors.measurementAt, null);
  assert.equal(result.night.securityFresh, false); assert.match(h.state.notifications[0].body, /could not be confirmed/);
});

test('known security and low-fuel problems still alert when optional positive notices are off', async () => {
  const securityProblem = await evening({ notifyOk: false, responseMetrics: metrics(TIME - 1000, { lock: 'UNLOCKED', doors: 'AJAR' }) });
  assert.deepEqual(plain(securityProblem.result.night.problems), ['Unlocked', 'Door, hood or tailgate open']);
  assert.equal(securityProblem.h.state.notifications.length, 1);
  assert.equal(securityProblem.h.state.notifications[0].body, 'Unlocked · Door, hood or tailgate open · Check reading ages in FordWidget.');
  const fuelProblem = await evening({ notifyOk: false, responseMetrics: { fuelLevel: { value: 9, updateTime: iso(TIME) } } });
  assert.equal(fuelProblem.result.night.securityFresh, false); assert.deepEqual(plain(fuelProblem.result.night.problems), ['Fuel 9%']);
  assert.equal(fuelProblem.h.state.notifications.length, 1); assert.equal(fuelProblem.h.state.notifications[0].body, 'Fuel 9% · Check reading ages in FordWidget.');
});

test('turning off optional positive notices suppresses fresh and limited notices; disabling the check performs no read', async () => {
  for (const responseMetrics of [{ fuelLevel: { value: 77, updateTime: iso(TIME) } }, metrics()]) {
    const { h, result } = await evening({ notifyOk: false, responseMetrics });
    assert.equal(result.night.done, true); assert.deepEqual(plain(result.night.problems), []);
    assert.equal(h.state.notifications.length, 0);
  }
  const { h, result } = await evening({ enabled: false });
  assert.equal(result, null); assert.equal(h.state.requests.length, 0); assert.equal(h.state.notifications.length, 0);
});

test('the built-in offline self-test still passes without transport', () => {
  const h = load(); h.api.selfTest(); assert.equal(h.state.requests.length, 0);
});
