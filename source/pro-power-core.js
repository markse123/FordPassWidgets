// FordWidget Pro Power add-on. Original v1 telemetry and control routes stay intact.
// Raw status IDs live only in this WeakMap, never in the file cache or UI text.
const PPO_WIDGET_SEEN = new WeakMap();
const PPO_WIDGET_STATES = new Set(('REQUESTED DELIVERY_FROM_TMC_QUEUED OEM_CLOUD_DELIVERY_IN_PROGRESS OEM_CLOUD_PROCESSING_IN_PROGRESS DELIVERY_FROM_OEM_CLOUD_QUEUED DEVICE_DELIVERY_IN_PROGRESS RECEIVED_BY_DEVICE DEVICE_COMMAND_VALIDATION_IN_PROGRESS COMMAND_IN_PROGRESS_ON_DEVICE COMMAND_FINISHED_ON_DEVICE COMMAND_SUCCEEDED_ON_DEVICE COMMAND_DELIVERY_FAILURE DEVICE_COMMAND_VALIDATION_FAILURE DEVICE_RESPONSE_PROCESSING_FAILURE COMMAND_FAILED_ON_DEVICE RETRIABLE_COMMAND_DELIVERY_FAILURE EXPIRED CANCELLED').split(' '));
const PPO_WIDGET_SUCCESS = new Set(['COMMAND_FINISHED_ON_DEVICE', 'COMMAND_SUCCEEDED_ON_DEVICE']);
const PPO_WIDGET_FAILURE = new Set(['COMMAND_DELIVERY_FAILURE', 'DEVICE_COMMAND_VALIDATION_FAILURE', 'DEVICE_RESPONSE_PROCESSING_FAILURE', 'COMMAND_FAILED_ON_DEVICE', 'EXPIRED', 'CANCELLED']);
const ppoOwn = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const ppoRecord = o => o !== null && typeof o === 'object' && !Array.isArray(o);
const ppoChild = (o, k) => ppoRecord(o) && ppoOwn(o, k) ? o[k] : undefined;
function ppoRoot(raw) { return ppoRecord(raw) && ppoOwn(raw, 'vehicleStatus') ? raw.vehicleStatus : raw; }
function ppoCommand(raw) { return ppoChild(ppoChild(ppoChild(ppoRoot(raw), 'states'), 'commands'), 'updatePTTBStatusCommand'); }
function ppoID(id) { return typeof id === 'string' && id.length > 0 && id.length <= 256 && !/[\x00-\x20\x7f]/.test(id) ? id : null; }
function ppoValidate(raw, vin) {
  if (typeof vin !== 'string' || vin.length !== 17 || !vinOK(vin) || !ppoRecord(raw) || !ppoRecord(ppoRoot(raw))) throw new APIError('Pro Power: invalid vehicle or response.');
  for (const object of [raw, ppoRoot(raw)]) for (const key of ['vin', 'VIN']) {
    if (ppoOwn(object, key) && (typeof object[key] !== 'string' || object[key].toUpperCase() !== vin)) throw new APIError('Pro Power: response vehicle mismatch.');
  }
}
function ppoAt(value, clock) {
  let n = typeof value === 'number' ? value : typeof value === 'string' && /^\d+(?:\.\d+)?$/.test(value) ? Number(value) : NaN;
  if (Number.isFinite(n)) n = n < 1e11 ? n * 1000 : n;
  else if (typeof value === 'string') n = Date.parse(value);
  return Number.isFinite(n) && n >= 946684800000 && n <= clock + 60000 ? n : null;
}
function ppoTime(object, clock) {
  for (const key of ['updateTime', 'updatedAt', 'timestamp']) {
    const at = ppoAt(ppoChild(object, key), clock);
    if (at !== null) return at;
  }
  return null;
}
function ppoNormalize(raw, vin, fetchedAt) {
  ppoValidate(raw, vin);
  const parsed = parsePttbStatusV2(raw), command = ppoCommand(raw);
  const state = ppoChild(ppoChild(command, 'value'), 'toState');
  const event = ppoChild(ppoChild(ppoChild(ppoRoot(raw), 'events'), 'customEvents'), 'pttb-power-mode-change-event');
  const text = ppoChild(ppoChild(ppoChild(event, 'oemData'), 'current_power_mode'), 'stringValue');
  const mode = typeof text === 'string' ? text.trim().toUpperCase() : null;
  return { version: 1, vin, rawSignals: parsed ? Object.assign({}, parsed.rawSignals) : {},
    rejectedSignals: parsed ? parsed.rejectedSignals.slice() : [],
    commandAt: parsed ? ppoTime(command, fetchedAt) : null,
    commandState: parsed && PPO_WIDGET_STATES.has(state) ? state : null,
    latestMode: { value: ['OFF', 'LOW', 'HIGH'].includes(mode) ? mode : null, at: ppoTime(event, fetchedAt) },
    fetchedAt };
}
function ppoMerge(previous, incoming) {
  if (!previous || previous.version !== 1 || previous.vin !== incoming.vin) return incoming;
  const result = Object.assign({}, previous, { fetchedAt: incoming.fetchedAt });
  // Each raw packet is atomic. Never fill missing fields from another sample.
  if (Object.keys(incoming.rawSignals).length &&
      (previous.commandAt == null || (incoming.commandAt != null && incoming.commandAt >= previous.commandAt))) {
    result.rawSignals = incoming.rawSignals; result.rejectedSignals = incoming.rejectedSignals;
    result.commandAt = incoming.commandAt; result.commandState = incoming.commandState;
  }
  const oldMode = previous.latestMode || { value: null, at: null }, mode = incoming.latestMode;
  if (mode.at != null && (oldMode.at == null || mode.at >= oldMode.at) ||
      oldMode.at == null && mode.at == null && mode.value !== null) result.latestMode = mode;
  return result;
}
function ppoView(snapshot, clock = now()) {
  const signals = snapshot && snapshot.rawSignals || {}, raw = key =>
    typeof signals[key] === 'number' && Number.isFinite(signals[key]) && Math.abs(signals[key]) <= Number.MAX_SAFE_INTEGER ? signals[key] : null;
  const commandAt = snapshot && Number.isFinite(snapshot.commandAt) ? snapshot.commandAt : null;
  const latestMode = snapshot && snapshot.latestMode || { value: null, at: null };
  const seconds = commandAt === null ? null : Math.max(0, Math.floor((clock - commandAt) / 1000));
  const staleReasons = [];
  if (commandAt === null) staleReasons.push('unknown_command_time');
  else if (commandAt > clock) staleReasons.push('future_command_time');
  else if (clock - commandAt > 120000) staleReasons.push('command_older_than_two_minutes');
  if (commandAt !== null && latestMode.value === 'OFF' && latestMode.at > commandAt) staleReasons.push('newer_off_mode');
  const ageText = seconds === null ? 'unknown command age' : seconds < 60 ? seconds + 's' :
    Math.floor(seconds / 60) + 'm ' + seconds % 60 + 's';
  return { rawA: raw('DcacOut1Pw2Dsply'), rawB: raw('DcacOut2Pw2Dsply'), rawCapacity: raw('DcacOutPwDsplyMx'),
    rawSecondary: raw('DcacOutScndPw2Dsply'), rawSecondaryCapacity: raw('DcacOutScndPwDsplyMx'),
    commandAt, commandState: snapshot && snapshot.commandState || null, ageSeconds: seconds, ageText,
    latestMode, fetchedAt: snapshot && snapshot.fetchedAt || null, stale: staleReasons.length > 0, staleReasons,
    units: 'unverified raw signals; no scaling applied', sampleFreshness: 'unverified' };
}
function ppoVIN(client) {
  requireApp(); client.store.assertLease();
  const vin = client.prefs && client.prefs.vin;
  if (typeof vin !== 'string' || vin.length !== 17 || !vinOK(vin)) throw new APIError('Pro Power: configure your vehicle first.');
  return vin;
}
function ppoCache(client, vin, rejectMismatch = false) {
  const cache = client.store.read();
  if (cache && cache.vin !== vin && rejectMismatch) throw new APIError('Pro Power: cache vehicle mismatch.');
  return cache && cache.vin === vin ? cache : { version: 1, vin, fields: {} };
}
function ppoRemember(client, raw, vin) {
  let seen = PPO_WIDGET_SEEN.get(client);
  if (!seen || seen.vin !== vin) { seen = { vin, ids: new Set() }; PPO_WIDGET_SEEN.set(client, seen); }
  const id = ppoID(ppoChild(ppoCommand(raw), 'commandId'));
  if (id) { seen.ids.add(id); if (seen.ids.size > 32) seen.ids.delete(seen.ids.values().next().value); }
}
function ppoSave(client, raw, vin) {
  if (ppoVIN(client) !== vin) throw new APIError('Pro Power: configured vehicle changed.');
  const cache = ppoCache(client, vin);
  cache.proPower = ppoMerge(cache.proPower, ppoNormalize(raw, vin, now()));
  client.store.write(cache); return cache;
}
async function ppoQuery(client, vin, token, deadline = null) {
  if (ppoVIN(client) !== vin) throw new APIError('Pro Power: configured vehicle changed.');
  const before = client.auth.timeout;
  if (deadline !== null) {
    const remaining = deadline - now();
    if (remaining <= 0) throw new APIError('Pro Power: read window ended.');
    client.auth.timeout = Math.min(before || SETTINGS.timeout, remaining / 1000);
  }
  try {
    const raw = await client.auth.request('telemetry.proPower',
      'https://api.autonomic.ai/v1beta/telemetry/sources/fordpass/vehicles/' + vin + ':query',
      'POST', {}, client.auth.mobileHeaders(token));
    if (ppoVIN(client) !== vin) throw new APIError('Pro Power: configured vehicle changed.');
    if (deadline !== null && now() > deadline) throw new APIError('Pro Power: read window ended.');
    ppoValidate(raw, vin); ppoRemember(client, raw, vin); return raw;
  } finally { client.auth.timeout = before; }
}
function ppoRequestResult(client, vin, attemptAt, outcome, message) {
  // The pre-dispatch cooldown survives even if a later lease takeover prevents
  // this outcome update. Never write through another run's lease.
  try {
    if (ppoVIN(client) === vin) { const cache = ppoCache(client, vin, true);
      cache.proPowerRequest = { attemptAt, outcome }; client.store.write(cache); }
  } catch (_) { /* Return the safe outcome without mutating a lost session. */ }
  return { outcome, message };
}
Object.assign(FordAPIClient.prototype, {
  async proPowerSnapshot() {
    const vin = ppoVIN(this), token = await this.auth.token('autonomic');
    return ppoQuery(this, vin, token);
  },
  async readProPower(force = false) {
    const vin = ppoVIN(this); let cache = ppoCache(this, vin);
    if (!force && cache.proPowerReadAfter > now()) return { cache, snapshot: cache.proPower || null, note: 'Pro Power cloud reads are cooling down; showing cached data.' };
    cache.proPowerReadAfter = now() + 300000; this.store.write(cache);
    try {
      cache = ppoSave(this, await this.proPowerSnapshot(), vin);
      return { cache, snapshot: cache.proPower, note: 'Pro Power cloud cache checked. Embedded sample freshness is unverified.' };
    } catch (_) {
      cache = ppoCache(this, vin);
      return { cache, snapshot: cache.proPower || null, note: 'Pro Power cloud read failed or is cooling down; showing cached data.' };
    }
  },
  async requestProPowerStatus(confirmed = false) {
    requireApp();
    if (confirmed !== true) throw new APIError('Confirm the Pro Power status request in the app first.');
    const vin = ppoVIN(this);
    const checkCooldown = () => {
      this.store.assertLease(); this.auth.gate('commands'); this.auth.gate('commands.proPower');
      const cache = ppoCache(this, vin, true);
      if (cache.commandAfter > now() || cache.proPowerRequestAfter > now()) throw new APIError('A vehicle request was just sent. Wait before requesting Pro Power status again.');
      return cache;
    };
    checkCooldown();
    const token = await this.auth.token('autonomic');
    checkCooldown();
    // A mandatory read-only baseline prevents a cached command receipt from
    // being mistaken for completion of this new request.
    let baseline;
    try { baseline = await ppoQuery(this, vin, token); ppoSave(this, baseline, vin); }
    catch (_) { throw new APIError('Pro Power baseline could not be read. No vehicle status request was sent.'); }
    const seen = PPO_WIDGET_SEEN.get(this), historical = new Set(seen ? seen.ids : []);
    const cache = checkCooldown(), attemptAt = now();
    cache.commandAfter = attemptAt + SETTINGS.commandInterval;
    cache.proPowerRequestAfter = attemptAt + 60000;
    cache.proPowerRequest = { attemptAt, outcome: 'dispatching' }; this.store.write(cache);
    let receipt;
    try {
      receipt = await this.auth.request('commands.proPower',
        'https://api.autonomic.ai/v1beta/command/vehicles/' + vin + '/commands', 'POST',
        { type: 'updatePTTBStatusCommand', version: '1.0.0', wakeUp: true, properties: {} }, this.auth.mobileHeaders(token));
      if (ppoVIN(this) !== vin) throw new APIError('Pro Power: configured vehicle changed.');
    } catch (_) {
      return ppoRequestResult(this, vin, attemptAt, 'delivery_uncertain', 'Pro Power request delivery is uncertain. It was not retried. The last cached report was kept; wait before trying again.');
    }
    const id = ppoID(ppoChild(receipt, 'id'));
    if (!id || historical.has(id)) return ppoRequestResult(this, vin, attemptAt, 'accepted_unconfirmed', 'Ford accepted the request, but a new usable receipt was not returned. Device completion is unconfirmed.');
    const deadline = now() + 30000;
    for (let attempt = 0; attempt < 6; attempt++) {
      if (attempt) await new Promise(resolve => Timer.schedule(Math.min(5000, Math.max(0, deadline - now())), false, resolve));
      if (now() >= deadline) break;
      let raw;
      try { raw = await ppoQuery(this, vin, token, deadline); ppoSave(this, raw, vin); }
      catch (_) { break; } // No further query after a transport, backoff or lease error.
      const command = ppoCommand(raw), state = ppoChild(ppoChild(command, 'value'), 'toState');
      if (ppoChild(command, 'commandId') !== id) continue;
      if (PPO_WIDGET_SUCCESS.has(state)) return ppoRequestResult(this, vin, attemptAt, 'device_succeeded', 'Ford reports this Pro Power status request succeeded on the device. Cached readings still need their own freshness check.');
      if (PPO_WIDGET_FAILURE.has(state)) return ppoRequestResult(this, vin, attemptAt, 'device_failed', 'Ford reports this Pro Power status request failed, expired or was canceled. It was not retried.');
    }
    return ppoRequestResult(this, vin, attemptAt, 'accepted_unconfirmed', 'Ford accepted the Pro Power status request; device completion was not confirmed in the read window. It was not retried.');
  }
});
