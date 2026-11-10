const fs = require('fs'), vm = require('vm'), assert = require('assert');
const parser = fs.readFileSync(require('path').join(__dirname, 'pttb-v2.js'), 'utf8');
const moduleSource = fs.readFileSync(require('path').join(__dirname, 'pro-power-core.js'), 'utf8');
const VIN = '1FTFW1E50JFA00001', CLOCK = 1794100000000;
function packet(id = 'PRIVATE_OLD_ID', at = CLOCK - 10000, signals = { DcacOut1Pw2Dsply: 1450, DcacOut2Pw2Dsply: 0, DcacOutPwDsplyMx: 7200 }, mode = null) {
  const raw = { vin: VIN, states: { commands: { updatePTTBStatusCommand: { commandId: id, timestamp: at,
    message: 'PRIVATE_SERVER_MESSAGE', value: { toState: 'COMMAND_SUCCEEDED_ON_DEVICE', oemData: {
      vehicle_common_correlation_id: { stringValue: 'PRIVATE_CORRELATION' }, pttbStatusDataV2: { stringValue: JSON.stringify(signals) }
    } } } } } };
  if (mode) raw.events = { customEvents: { 'pttb-power-mode-change-event': { updateTime: mode.at, oemData: { current_power_mode: { stringValue: mode.value } } } } };
  return raw;
}
const clone = v => JSON.parse(JSON.stringify(v));
function setup(handler = async () => packet(), initial = {}) {
  let clock = CLOCK, app = true, owns = true, cache = { version: 1, vin: VIN, fields: { fuel: { value: 50 } }, ...clone(initial) };
  const calls = [], writes = [], timers = [];
  class APIError extends Error {}
  class FordAPIClient { constructor(auth, store, prefs) { Object.assign(this, { auth, store, prefs }); } originalControl() { return 'original'; } }
  const store = { assertLease() { if (!owns) throw new Error('PRIVATE_LEASE_FAILURE'); }, read() { return clone(cache); },
    write(v) { this.assertLease(); cache = clone(v); writes.push(clone(v)); } };
  const auth = { timeout: 12, blocked: false, blockedNames: new Set(), tokenHook: null, async token() { if (this.tokenHook) this.tokenHook(); return 'PRIVATE_TOKEN'; },
    gate(name) { if (this.blocked || this.blockedNames.has(name)) throw new Error('PRIVATE_BACKOFF'); },
    mobileHeaders(token) { return { Authorization: 'Bearer ' + token, 'Application-Id': 'public-app-id' }; },
    async request(name, url, method, body, headers) { store.assertLease(); this.gate(name);
      const call = { name, url, method, body: clone(body), headers, at: clock, timeout: this.timeout }; calls.push(call);
      return handler(call, calls, { advance: ms => { clock += ms; }, auth, store }); } };
  const context = { FordAPIClient, APIError, now: () => clock, vinOK: v => /^[A-HJ-NPR-Z0-9]{17}$/.test(v || ''),
    requireApp() { if (!app) throw new Error('APP_ONLY'); }, secretGet: () => null,
    SETTINGS: { timeout: 12, commandInterval: 30000, autonomic: 'https://api.autonomic.ai/v1' },
    Timer: { schedule(ms, repeat, callback) { timers.push(ms); clock += ms; callback(); } } };
  const api = vm.runInNewContext(parser + '\n' + moduleSource + '\n({ppoNormalize,ppoMerge,ppoView,FordAPIClient});', context);
  const client = new FordAPIClient(auth, store, { vin: VIN });
  return { api, client, auth, calls, writes, timers, cache: () => clone(cache), clock: () => clock,
    setApp: v => { app = v; }, setLease: v => { owns = v; }, advance: ms => { clock += ms; }, settings: context.SETTINGS };
}
let passed = 0;
async function check(name, fn) { await fn(); passed++; console.log('PASS:', name); }
(async () => {
  await check('normalization retains only approved values and epoch seconds/ms/ISO times', () => {
    const f = setup();
    for (const timestamp of [CLOCK - 10000, (CLOCK - 10000) / 1000, String((CLOCK - 10000) / 1000), new Date(CLOCK - 10000).toISOString()]) {
      const raw = packet(); raw.states.commands.updatePTTBStatusCommand.timestamp = timestamp;
      const model = f.api.ppoNormalize(raw, VIN, CLOCK);
      assert.equal(model.commandAt, CLOCK - 10000); assert.equal(model.rawSignals.DcacOut2Pw2Dsply, 0);
      const text = JSON.stringify(model); for (const hidden of ['PRIVATE_OLD_ID', 'PRIVATE_CORRELATION', 'PRIVATE_SERVER_MESSAGE']) assert(!text.includes(hidden));
    }
    assert.equal(f.client.originalControl(), 'original'); assert.equal(f.settings.autonomic, 'https://api.autonomic.ai/v1');
  });
  await check('mode-only update preserves packet but independently retains newer OFF', () => {
    const f = setup(), previous = f.api.ppoNormalize(packet(), VIN, CLOCK);
    const raw = { events: { customEvents: { 'pttb-power-mode-change-event': { updateTime: CLOCK, oemData: { current_power_mode: { stringValue: 'Off' } } } } } };
    const merged = f.api.ppoMerge(previous, f.api.ppoNormalize(raw, VIN, CLOCK));
    assert.equal(merged.rawSignals.DcacOut1Pw2Dsply, 1450); assert.equal(merged.commandAt, CLOCK - 10000);
    assert.equal(merged.latestMode.value, 'OFF'); assert(f.api.ppoView(merged, CLOCK).staleReasons.includes('newer_off_mode'));
  });
  await check('newer and equal-time partial packets replace atomically with no old B', () => {
    const f = setup(), before = f.api.ppoNormalize(packet(), VIN, CLOCK);
    for (const at of [CLOCK - 10000, CLOCK]) {
      const merged = f.api.ppoMerge(before, f.api.ppoNormalize(packet('new', at, { DcacOut1Pw2Dsply: 0 }), VIN, CLOCK));
      assert.deepEqual(clone(merged.rawSignals), { DcacOut1Pw2Dsply: 0 }); assert.equal(f.api.ppoView(merged, CLOCK).rawB, null);
    }
  });
  await check('older unknown-time and invalid-only packets do not erase dated readings', () => {
    const f = setup(), before = f.api.ppoNormalize(packet(), VIN, CLOCK);
    for (const raw of [packet('old', CLOCK - 20000, { DcacOut1Pw2Dsply: 1 }), packet('unknown', 'not-a-date'), packet('invalid', CLOCK, { DcacOut1Pw2Dsply: null })]) {
      const result = f.api.ppoMerge(before, f.api.ppoNormalize(raw, VIN, CLOCK)); assert.equal(result.rawSignals.DcacOut1Pw2Dsply, 1450);
    }
  });
  await check('fetch time never substitutes for command age or revives stale readings', () => {
    const f = setup(), old = f.api.ppoNormalize(packet('old', CLOCK - 4647000), VIN, CLOCK);
    assert.equal(f.api.ppoView(old, CLOCK).ageSeconds, 4647); assert(f.api.ppoView(old, CLOCK).stale);
    const unknown = f.api.ppoNormalize(packet('old', 'not-a-date'), VIN, CLOCK);
    assert.equal(f.api.ppoView(unknown, CLOCK).commandAt, null); assert(f.api.ppoView(unknown, CLOCK).stale);
    assert.equal(f.api.ppoView(null, CLOCK).rawA, null);
  });
  await check('snapshot is fixed beta read with bearer header and validates wrapped VIN', async () => {
    const f = setup(); await f.client.proPowerSnapshot(); const call = f.calls[0];
    assert.equal(call.url, 'https://api.autonomic.ai/v1beta/telemetry/sources/fordpass/vehicles/' + VIN + ':query');
    assert.equal(call.method, 'POST'); assert.deepEqual(call.body, {}); assert.equal(call.headers.Authorization, 'Bearer PRIVATE_TOKEN');
    assert(!call.url.includes('PRIVATE_TOKEN'));
    const bad = setup(async () => ({ vehicleStatus: { vin: '1FTFW1E50JFA00002' } })); await assert.rejects(bad.client.proPowerSnapshot(), /mismatch/);
  });
  await check('cached read is independent, rate-limited and force bypasses only local read gate', async () => {
    const f = setup(); const first = await f.client.readProPower(); assert.equal(first.snapshot.rawSignals.DcacOut1Pw2Dsply, 1450);
    await f.client.readProPower(); assert.equal(f.calls.length, 1); await f.client.readProPower(true); assert.equal(f.calls.length, 2);
    assert.equal(f.cache().fields.fuel.value, 50); assert(f.cache().proPowerReadAfter > CLOCK);
    f.auth.blocked = true; await f.client.readProPower(true); assert.equal(f.calls.length, 2);
  });
  await check('foreground, strict confirmation, leases and both cooldowns guard commands', async () => {
    const f = setup(); f.setApp(false); await assert.rejects(f.client.readProPower()); await assert.rejects(f.client.requestProPowerStatus(true)); assert.equal(f.calls.length, 0);
    f.setApp(true); for (const confirm of [false, 'true', 1, null]) await assert.rejects(f.client.requestProPowerStatus(confirm));
    f.setLease(false); await assert.rejects(f.client.requestProPowerStatus(true)); assert.equal(f.calls.length, 0);
    for (const initial of [{ commandAfter: CLOCK + 1 }, { proPowerRequestAfter: CLOCK + 1 }]) {
      const g = setup(undefined, initial); await assert.rejects(g.client.requestProPowerStatus(true)); assert.equal(g.calls.length, 0);
    }
  });
  await check('mandatory baseline failure sends zero vehicle commands', async () => {
    const f = setup(async () => { throw new Error('PRIVATE_BODY_TOKEN'); });
    await assert.rejects(f.client.requestProPowerStatus(true), /No vehicle status request was sent/);
    assert.equal(f.calls.length, 1); assert(!f.calls.some(x => x.name === 'commands.proPower')); assert.equal(f.cache().commandAfter, undefined);
  });
  await check('status request persists cooldowns first and sends exact independently spelled body once', async () => {
    let f;
    f = setup(async call => {
      if (call.name === 'commands.proPower') {
        assert.equal(f.cache().commandAfter, CLOCK + 30000); assert.equal(f.cache().proPowerRequestAfter, CLOCK + 60000);
        assert.deepEqual(call.body, JSON.parse('{"type":"updatePTTBStatusCommand","version":"1.0.0","wakeUp":true,"properties":{}}'));
        assert.equal(call.url, 'https://api.autonomic.ai/v1beta/command/vehicles/' + VIN + '/commands');
        return { id: 'PRIVATE_FRESH_ID' };
      }
      return f.calls.some(c => c.name === 'commands.proPower') ? packet('PRIVATE_FRESH_ID') : packet();
    });
    const result = await f.client.requestProPowerStatus(true); assert.equal(result.outcome, 'device_succeeded');
    assert.equal(f.calls.filter(c => c.name === 'commands.proPower').length, 1); assert.equal(f.cache().proPowerRequest.outcome, result.outcome);
    const text = JSON.stringify(f.cache()) + JSON.stringify(result);
    for (const hidden of ['PRIVATE_FRESH_ID', 'PRIVATE_OLD_ID', 'PRIVATE_TOKEN', 'PRIVATE_CORRELATION', 'PRIVATE_SERVER_MESSAGE']) assert(!text.includes(hidden));
  });
  await check('returned historical receipt never becomes new completion and causes no polling', async () => {
    const f = setup(async call => call.name === 'commands.proPower' ? { id: 'PRIVATE_OLD_ID' } : packet());
    assert.equal((await f.client.requestProPowerStatus(true)).outcome, 'accepted_unconfirmed'); assert.equal(f.calls.length, 2);
  });
  await check('lost POST response is delivery-uncertain with no retry or polling', async () => {
    const f = setup(async call => { if (call.name === 'commands.proPower') throw new Error('PRIVATE_RESPONSE_BODY'); return packet(); });
    const result = await f.client.requestProPowerStatus(true); assert.equal(result.outcome, 'delivery_uncertain'); assert.equal(f.calls.length, 2);
    assert(!JSON.stringify(result).includes('PRIVATE_RESPONSE_BODY')); assert(f.cache().proPowerRequestAfter > CLOCK);
  });
  await check('unmatched historical success cannot satisfy a fresh receipt', async () => {
    let polls = 0;
    const f = setup(async (call, calls) => {
      if (call.name === 'commands.proPower') return { id: 'PRIVATE_FRESH_ID' };
      if (!calls.some(c => c.name === 'commands.proPower')) return packet();
      return ++polls === 1 ? packet() : packet('PRIVATE_FRESH_ID');
    });
    assert.equal((await f.client.requestProPowerStatus(true)).outcome, 'device_succeeded'); assert.equal(polls, 2);
  });
  await check('known failure stops; retriable or unknown states stay unconfirmed', async () => {
    for (const state of ['COMMAND_FAILED_ON_DEVICE', 'RETRIABLE_COMMAND_DELIVERY_FAILURE', 'PRIVATE_UNKNOWN_STATE']) {
      const f = setup(async (call, calls) => {
        if (call.name === 'commands.proPower') return { id: 'PRIVATE_FRESH_ID' };
        if (!calls.some(c => c.name === 'commands.proPower')) return packet();
        const raw = packet('PRIVATE_FRESH_ID'); raw.states.commands.updatePTTBStatusCommand.value.toState = state; return raw;
      });
      const result = await f.client.requestProPowerStatus(true);
      assert.equal(result.outcome, state === 'COMMAND_FAILED_ON_DEVICE' ? 'device_failed' : 'accepted_unconfirmed');
      assert(!JSON.stringify(f.cache()).includes('PRIVATE_UNKNOWN_STATE'));
      assert(f.calls.filter(c => c.name === 'telemetry.proPower').length <= 7); assert(f.clock() - CLOCK <= 30000); assert.equal(f.auth.timeout, 12);
    }
  });
  await check('first polling error aborts further reads with accepted-unconfirmed outcome', async () => {
    const f = setup(async (call, calls) => {
      if (call.name === 'commands.proPower') return { id: 'PRIVATE_FRESH_ID' };
      if (calls.some(c => c.name === 'commands.proPower')) throw new Error('PRIVATE_POLL_BODY'); return packet();
    });
    const result = await f.client.requestProPowerStatus(true); assert.equal(result.outcome, 'accepted_unconfirmed'); assert.equal(f.calls.length, 3); assert.equal(f.auth.timeout, 12);
  });
  await check('lease loss after token acquisition prevents baseline and command dispatch', async () => {
    const f = setup(); f.auth.tokenHook = () => f.setLease(false);
    await assert.rejects(f.client.requestProPowerStatus(true)); assert.equal(f.calls.length, 0);
  });
  await check('PPO failures have an isolated gate while the legacy global gate remains mandatory', async () => {
    let f;
    f = setup(async call => {
      if (call.name === 'commands.proPower') { f.auth.blockedNames.add('commands.proPower'); throw new Error('SIMULATED_PPO_HTTP_400'); }
      return packet();
    });
    assert.equal((await f.client.requestProPowerStatus(true)).outcome, 'delivery_uncertain');
    assert.equal(f.calls.filter(c => c.name === 'commands.proPower').length, 1);
    assert.equal(f.calls.filter(c => c.name === 'commands').length, 0);
    assert.doesNotThrow(() => f.auth.gate('commands'));
    assert.throws(() => f.auth.gate('commands.proPower'));
    f.advance(61000); const count = f.calls.length;
    await assert.rejects(f.client.requestProPowerStatus(true)); assert.equal(f.calls.length, count);
    const legacyBlocked = setup(); legacyBlocked.auth.blockedNames.add('commands');
    await assert.rejects(legacyBlocked.client.requestProPowerStatus(true)); assert.equal(legacyBlocked.calls.length, 0);
    assert.equal(legacyBlocked.client.originalControl(), 'original');
  });
  console.log(passed + ' Pro Power core checks passed. Fake transport only; no network calls.');
})().catch(error => { console.error(error); process.exit(1); });
