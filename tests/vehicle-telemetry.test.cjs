'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const { load, plain, VIN, TIME } = require('./scriptable.cjs');
function fixture() {
  let code = fs.readFileSync(path.join(__dirname, '../source/fordwidget-base.js'), 'utf8');
  for (const patch of JSON.parse(fs.readFileSync(path.join(__dirname, '../source/telemetry-patches.json'), 'utf8')).patches) {
    assert.equal(code.split(patch.before).length - 1, 1, patch.label); code = code.replace(patch.before, patch.after);
  }
  const module = fs.readFileSync(path.join(__dirname, '../source/vehicle-telemetry.js'), 'utf8');
  code = code.replace('function selfTest() {', module + '\nglobalThis.VehicleTelemetryTest = { vehicleUnscaledReadings };\nfunction selfTest() {');
  const h = load(code); Object.assign(h.api, h.context.VehicleTelemetryTest); return h;
}
const sample = (value, at = TIME - 30000, extra = {}) => Object.assign({ value, updateTime: new Date(at).toISOString() }, extra);
const raw = metrics => ({ vin: VIN, metrics, updateTime: new Date(TIME).toISOString() });
const normalize = (h, metrics, source = 'FordPass') => h.api.normalize(raw(metrics), VIN, source, TIME);

test('EV SOC/range are independent from fuel/12V and retain explicit zero with own measurement times', () => {
  const h = fixture(), fields = normalize(h, { fuelLevel: sample(55), batteryStateOfCharge: sample(81),
    xevBatteryStateOfCharge: sample(0), xevBatteryRange: sample(100), xevPlugChargerStatus: sample('CONNECTED'),
    xevBatteryChargeDisplayStatus: sample('IN_PROGRESS') });
  assert.equal(fields.fuel.value, 55); assert.equal(fields.battery.value, 81); assert.equal(fields.evSoc.value, 0);
  assert.equal(fields.evRange.value, 100 * 0.621371192); assert.equal(fields.plugStatus.value, 'CONNECTED');
  assert.equal(fields.chargeStatus.value, 'IN_PROGRESS'); assert.equal(fields.evSoc.at, TIME - 30000);
  assert.equal(fields.evSoc.source, 'FordPass'); assert.equal(fields.evSoc.fetchedAt, TIME);
  assert.equal(normalize(h, { xevBatteryRange: sample(0) }).evRange.value, 0); assert.equal(h.state.requests.length, 0);
});
test('optional EV readings reject malformed values, misleading units and near-match enum strings', () => {
  const h = fixture();
  for (const value of [null, true, false, '50', {}, [], NaN, Infinity, -1, 100.001]) {
    const fields = normalize(h, { fuelLevel: sample(50), xevBatteryStateOfCharge: sample(value) });
    assert.equal(fields.evSoc, undefined);
  }
  for (const metric of [{ xevBatteryRange: sample(100, TIME - 1, { unit: 'mi' }) },
    { xevBatteryStateOfCharge: sample(50, TIME - 1, { unit: 'kPa' }) },
    { xevPlugChargerStatus: sample('connected') }, { xevBatteryChargeDisplayStatus: sample('CHARGING') }])
    assert.deepEqual(Object.keys(normalize(h, Object.assign({ fuelLevel: sample(50) }, metric))), ['fuel']);
  for (const state of ['COMPLETED', 'DISCHARGING', 'UNKNOWN']) assert.equal(normalize(h, { xevBatteryChargeDisplayStatus: sample(state) }).chargeStatus.value, state);
});
test('new fields never borrow root/fetch timestamps and stale or undated candidates preserve newer readings', () => {
  const h = fixture(), before = normalize(h, { xevBatteryStateOfCharge: sample(70) });
  for (const entry of [{ value: 10 }, { value: 10, updateTime: 'PRIVATE_TIME' }, sample(10, TIME + 1)]) {
    const candidate = normalize(h, { xevBatteryStateOfCharge: entry }); assert.equal(candidate.evSoc.at, null);
    assert.equal(h.api.mergeFields(before, {}, candidate).evSoc.value, 70);
  }
  assert.equal(h.api.mergeFields(before, {}, normalize(h, { xevBatteryStateOfCharge: sample(20, TIME - 60000) })).evSoc.value, 70);
  assert.equal(h.api.mergeFields(before, {}, normalize(h, { xevBatteryStateOfCharge: sample(20, TIME - 1000) })).evSoc.value, 20);
});
test('absolute charge-end events remain dates, and unproved countdown durations are ignored', () => {
  const h = fixture(), payload = raw({ xevBatteryTimeToFullCharge: sample(25) });
  payload.events = { xevBatteryChargeEvent: { updateTime: new Date(TIME - 20000).toISOString(),
    tags: { chargeEndTime: new Date(TIME + 3600000).toISOString() } } };
  const fields = h.api.normalize(payload, VIN, 'FordPass', TIME);
  assert.equal(fields.chargeEndTime.value, TIME + 3600000); assert.equal(fields.chargeEndTime.at, TIME - 20000);
  assert.equal(Object.keys(fields).length, 1);
  delete payload.events.xevBatteryChargeEvent.updateTime;
  assert.equal(h.api.normalize(payload, VIN, 'FordPass', TIME).chargeEndTime.at, null);
  payload.events.xevBatteryChargeEvent.tags.chargeEndTime = 'PRIVATE_INVALID_DATE';
  assert.throws(() => h.api.normalize(payload, VIN, 'FordPass', TIME), /no supported/);
});
test('six-wheel inventory retains inner/outer identities, PSI units and per-wheel timestamps', () => {
  const h = fixture(), ids = ['FRONT_LEFT', 'FRONT_RIGHT', 'REAR_LEFT_INNER', 'REAR_LEFT_OUTER', 'REAR_RIGHT_INNER', 'REAR_RIGHT_OUTER'];
  const fields = normalize(h, { tirePressure: ids.map((vehicleWheel, index) => sample(index === 0 ? 0 : 80, TIME - index * 1000, { vehicleWheel, unit: 'psi' })) });
  assert.deepEqual(Object.keys(fields.wheelPressures.value), ids);
  assert.equal(fields.wheelPressures.value.FRONT_LEFT.value, 0); assert.equal(fields.rli.value, 80);
  assert.equal(fields.rlo.at, TIME - 3000); assert.equal(fields.rri.value, 80); assert.equal(fields.rro.value, 80);
  assert.equal(fields.wheelPressures.at, TIME - 5000);
  assert(Math.abs(normalize(h, { tirePressure: [sample(241.316505255, TIME - 1, { vehicleWheel: 'REAR_LEFT_INNER' })] }).rli.value - 35) < 1e-10);
});
test('partial or older wheel packets cannot overwrite another wheel or erase existing readings', () => {
  const h = fixture(), before = normalize(h, { tirePressure: [sample(80, TIME - 30000, { vehicleWheel: 'REAR_LEFT_INNER', unit: 'psi' }),
    sample(79, TIME - 30000, { vehicleWheel: 'REAR_RIGHT_OUTER', unit: 'psi' })] });
  const old = normalize(h, { tirePressure: [sample(60, TIME - 60000, { vehicleWheel: 'REAR_LEFT_INNER', unit: 'psi' })] });
  const next = normalize(h, { tirePressure: [sample(78, TIME - 1000, { vehicleWheel: 'REAR_RIGHT_OUTER', unit: 'psi' })] });
  const merged = h.api.mergeFields(before, old, next);
  assert.equal(merged.rli.value, 80); assert.equal(merged.rro.value, 78);
  assert.equal(merged.wheelPressures.value.REAR_LEFT_INNER.value, 80);
  assert.equal(merged.wheelPressures.value.REAR_RIGHT_OUTER.value, 78);
  assert.equal(merged.wheelPressures.value.REAR_LEFT_INNER.at, TIME - 30000);
  const invalid = normalize(h, { fuelLevel: sample(1), tirePressure: [sample('80', TIME, { vehicleWheel: 'REAR_LEFT_INNER' }),
    sample(30, TIME, { vehicleWheel: 'PRIVATE_WHEEL' }), sample(30, TIME, { vehicleWheel: 'REAR_LEFT_INNER', unit: 'PRIVATE_UNIT' })] });
  assert.equal(invalid.wheelPressures, undefined); assert.equal(invalid.rli, undefined);
  assert.deepEqual(plain(h.api.mergeFields(before, {}, invalid).wheelPressures), plain(before.wheelPressures));
});
test('new fields neither weaken conservative door merges nor alter existing combustion readings', () => {
  const h = fixture(), input = raw({ fuelLevel: sample(103.2), oilLifeRemaining: sample(70), batteryStateOfCharge: sample(80),
    doorStatus: [sample('AJAR', TIME - 1000, { vehicleDoor: 'FRONT_LEFT' })], xevBatteryStateOfCharge: sample(50) });
  const before = JSON.stringify(input), fields = h.api.normalize(input, VIN, 'FordPass', TIME);
  assert.equal(fields.fuel.value, 100); assert.equal(fields.oil.value, 70); assert.equal(fields.battery.value, 80);
  const safe = normalize(h, { doorStatus: [sample('CLOSED', TIME - 2000, { vehicleDoor: 'FRONT_LEFT' })] });
  assert.equal(h.api.mergeFields(fields, {}, safe).doors.value, 'Ajar'); assert.equal(JSON.stringify(input), before);
  assert.doesNotThrow(() => h.api.selfTest()); assert.equal(h.state.requests.length, 0);
});
test('wrong response VINs, invalid wrappers and inherited optional fields are rejected or ignored', () => {
  const h = fixture(), other = '1FTFW1E50JFA00002', payload = raw({ xevBatteryStateOfCharge: sample(50) });
  for (const value of [{ vin: other, vehicleStatus: payload }, { vehicleStatus: Object.assign({}, payload, { VIN: other }) },
    { vin: VIN, vehicleStatus: null, metrics: payload.metrics }]) assert.throws(() => h.api.normalize(value, VIN, 'FordPass', TIME), /VIN|response/);
  assert.throws(() => h.api.normalize(payload, VIN + '\n', 'FordPass', TIME), /vehicle/);
  const inherited = Object.create({ xevBatteryStateOfCharge: sample(50) }); inherited.fuelLevel = sample(20);
  assert.equal(h.api.normalize(raw(inherited), VIN, 'FordPass', TIME).evSoc, undefined);
});
test('DEF/trailer evidence stays unscaled and excludes identifiers, arbitrary values and metadata', () => {
  const h = fixture(), payload = raw({ dieselExhaustFluidLevel: sample(103.2, TIME - 5000, { unit: 'PRIVATE_UNIT', token: 'PRIVATE_TOKEN' }),
    dieselExhaustFluidLevelRangeRemaining: sample(1200), trailerLightCheckStatus: sample('IN_PROGRESS'), secret: sample('PRIVATE_SECRET') });
  const evidence = h.api.vehicleUnscaledReadings(payload, VIN, 'FordPass', TIME), text = JSON.stringify(evidence);
  assert.equal(evidence.dieselExhaustFluidLevel.value, 103.2); assert.equal(evidence.dieselExhaustFluidLevel.unit, 'unverified');
  assert.equal(evidence.dieselExhaustFluidLevelRangeRemaining.value, 1200); assert.equal(evidence.trailerLightCheckStatus.value, 'IN_PROGRESS');
  assert.doesNotMatch(text, /PRIVATE_|1FTFW|oemCorrelation/); assert.equal(h.state.requests.length, 0);
});
