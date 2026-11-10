// Additional OEM telemetry. Canonical units remain miles, PSI and EV SOC percent.
// New fields use their own measurement time; receipt/root times never date them.
const VEHICLE_EV_CHARGE_STATES = Object.freeze(['UNKNOWN', 'NOT_PLUGGED_IN', 'FAULT',
  'STATION_NOT_COMPATIBLE', 'STATION_NOT_DETECTED', 'IN_PROGRESS', 'SCHEDULED',
  'COMPLETED', 'DISCHARGING', 'NOT_READY', 'PAUSED', 'STOPPED']);
const VEHICLE_PLUG_STATES = Object.freeze(['UNKNOWN', 'DISCONNECTED', 'CONNECTED']);
const VEHICLE_WHEEL_IDS = Object.freeze(['FRONT_LEFT', 'FRONT_RIGHT', 'REAR_LEFT', 'REAR_RIGHT',
  'REAR_LEFT_INNER', 'REAR_LEFT_OUTER', 'REAR_RIGHT_INNER', 'REAR_RIGHT_OUTER']);
const VEHICLE_EXTRA_WHEELS = Object.freeze({ REAR_LEFT_INNER: 'rli', REAR_LEFT_OUTER: 'rlo',
  REAR_RIGHT_INNER: 'rri', REAR_RIGHT_OUTER: 'rro' });
const vehicleRecord = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const vehicleOwn = (value, key) => vehicleRecord(value) && Object.prototype.hasOwnProperty.call(value, key);
const vehicleChild = (value, key) => vehicleOwn(value, key) ? value[key] : undefined;
const vehicleNumber = (value, max) => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= max ? value : null;

function vehicleTelemetryRoot(payload, vin) {
  if (typeof vin !== 'string' || vin.length !== 17 || !vinOK(vin) || !vehicleRecord(payload))
    throw new Error('Invalid telemetry vehicle or response.');
  const root = vehicleOwn(payload, 'vehicleStatus') ? payload.vehicleStatus : payload;
  if (!vehicleRecord(root)) throw new Error('Unsupported telemetry response.');
  for (const object of [payload, root]) for (const key of ['vin', 'VIN']) {
    if (vehicleOwn(object, key) && (typeof object[key] !== 'string' || object[key].toUpperCase() !== vin))
      throw new Error('Telemetry VIN does not match configured vehicle.');
  }
  return root;
}
function vehicleAbsoluteTime(value) {
  if (typeof value === 'number') return Number.isFinite(value) && value >= 1e11 && value <= 8.64e15 ? value : null;
  if (typeof value !== 'string' || value.length > 40 || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/.test(value)) return null;
  const parsed = Date.parse(value); return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}
function vehicleMeasurementTime(entry) {
  const at = vehicleAbsoluteTime(vehicleChild(entry, 'updateTime'));
  return at !== null && at <= now() ? at : null;
}
function vehicleTelemetryReading(value, entry, source, fetchedAt) {
  return { value, at: vehicleMeasurementTime(entry), source: ['FordPass', 'FordConnect'].includes(source) ? source : null,
    fetchedAt: typeof fetchedAt === 'number' && Number.isFinite(fetchedAt) && fetchedAt > 0 && fetchedAt <= now() ? fetchedAt : null };
}
function vehicleTelemetryUnits(entry, allowed) {
  return ['unit', 'unitSymbol'].every(key => !vehicleOwn(entry, key) ||
    typeof entry[key] === 'string' && allowed.includes(entry[key].toLowerCase()));
}
function vehicleWheelSummary(readings) {
  const entries = Object.values(readings); if (!entries.length) return null;
  const sources = new Set(entries.map(entry => entry.source));
  return { value: readings, at: entries.every(entry => entry.at) ? Math.min(...entries.map(entry => entry.at)) : null,
    source: sources.size === 1 ? entries[0].source : null,
    fetchedAt: Math.max(...entries.map(entry => entry.fetchedAt || 0)) || null };
}
function vehicleTelemetryExtras(root, vin, source, fetchedAt, out) {
  const metrics = vehicleChild(root, 'metrics'); if (!vehicleRecord(metrics)) return;
  const put = (key, value, entry) => { if (value !== null && value !== undefined) out[key] = vehicleTelemetryReading(value, entry, source, fetchedAt); };
  const soc = vehicleChild(metrics, 'xevBatteryStateOfCharge');
  if (vehicleTelemetryUnits(soc, ['%', 'percent'])) put('evSoc', vehicleNumber(vehicleChild(soc, 'value'), 100), soc);
  const range = vehicleChild(metrics, 'xevBatteryRange');
  if (vehicleTelemetryUnits(range, ['km', 'kilometer', 'kilometers'])) {
    const kilometers = vehicleNumber(vehicleChild(range, 'value'), 1e8);
    put('evRange', kilometers === null ? null : kilometers * 0.621371192, range);
  }
  for (const [key, metric, allowed] of [['plugStatus', 'xevPlugChargerStatus', VEHICLE_PLUG_STATES],
    ['chargeStatus', 'xevBatteryChargeDisplayStatus', VEHICLE_EV_CHARGE_STATES]]) {
    const entry = vehicleChild(metrics, metric), value = vehicleChild(entry, 'value');
    if (typeof value === 'string' && allowed.includes(value)) put(key, value, entry);
  }
  const event = vehicleChild(vehicleChild(root, 'events'), 'xevBatteryChargeEvent');
  put('chargeEndTime', vehicleAbsoluteTime(vehicleChild(vehicleChild(event, 'tags'), 'chargeEndTime')), event);
  const pressures = vehicleChild(metrics, 'tirePressure'), readings = Object.create(null);
  for (const entry of Array.isArray(pressures) ? pressures.slice(0, 32) : []) {
    const wheel = vehicleChild(entry, 'vehicleWheel'), value = vehicleNumber(vehicleChild(entry, 'value'), 2000);
    if (!VEHICLE_WHEEL_IDS.includes(wheel) || value === null || !vehicleTelemetryUnits(entry, ['kpa', 'bar', 'psi'])) continue;
    const unit = String(vehicleChild(entry, 'unit') || vehicleChild(entry, 'unitSymbol') || 'kPa').toLowerCase();
    if (vehicleOwn(entry, 'unit') && vehicleOwn(entry, 'unitSymbol') && entry.unit.toLowerCase() !== entry.unitSymbol.toLowerCase()) continue;
    const psi = vehicleNumber(value * (unit === 'bar' ? 14.5037738 : unit === 'psi' ? 1 : 1 / 6.894757293), 150);
    if (psi === null) continue;
    const reading = vehicleTelemetryReading(psi, entry, source, fetchedAt), old = readings[wheel];
    if (!old || !old.at || reading.at && reading.at >= old.at) readings[wheel] = reading;
  }
  const inventory = vehicleWheelSummary(readings);
  if (inventory) out.wheelPressures = inventory;
  for (const [wheel, key] of Object.entries(VEHICLE_EXTRA_WHEELS)) if (readings[wheel]) out[key] = readings[wheel];
}
function vehicleMergeWheelPressures(previous, official, mobile) {
  const readings = Object.create(null);
  for (const packet of [previous, official, mobile]) {
    const values = vehicleChild(packet, 'value'); if (!vehicleRecord(values)) continue;
    for (const wheel of VEHICLE_WHEEL_IDS) {
      const entry = vehicleChild(values, wheel); if (!vehicleRecord(entry) || vehicleNumber(entry.value, 150) === null) continue;
      const at = vehicleAbsoluteTime(entry.at), reading = { value: entry.value, at: at !== null && at <= now() ? at : null,
        source: ['FordPass', 'FordConnect'].includes(entry.source) ? entry.source : null,
        fetchedAt: typeof entry.fetchedAt === 'number' && Number.isFinite(entry.fetchedAt) && entry.fetchedAt > 0 && entry.fetchedAt <= now() ? entry.fetchedAt : null };
      const old = readings[wheel]; if (!old || !old.at || reading.at && reading.at >= old.at) readings[wheel] = reading;
    }
  }
  return vehicleWheelSummary(readings);
}
// Evidence only: these scalar values deliberately have no claimed unit or scaling.
function vehicleUnscaledReadings(payload, vin, source, fetchedAt) {
  const root = vehicleTelemetryRoot(payload, vin), metrics = vehicleChild(root, 'metrics'), out = {};
  for (const key of ['dieselExhaustFluidLevel', 'dieselExhaustFluidLevelRangeRemaining']) {
    const entry = vehicleChild(metrics, key), value = vehicleChild(entry, 'value');
    if (typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= 1e6)
      out[key] = Object.assign(vehicleTelemetryReading(value, entry, source, fetchedAt), { unit: 'unverified' });
  }
  const trailer = vehicleChild(metrics, 'trailerLightCheckStatus'), value = vehicleChild(trailer, 'value');
  if (['UNKNOWN', 'IN_PROGRESS', 'STOPPED', 'COMPLETE'].includes(value)) out.trailerLightCheckStatus = vehicleTelemetryReading(value, trailer, source, fetchedAt);
  return out;
}
