'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { load, regressionLoad, seedSecret, plain, TIME, VIN } = require('./scriptable.cjs');

const transports = [
  { name: 'JSON', scope: 'telemetry.mobile', headers: { Authorization: 'Bearer synthetic-access' },
    send: (auth, scope, headers) => auth.request(scope, 'https://api.autonomic.ai/v1/telemetry/sources/fordpass/vehicles/' + VIN, 'GET', null, headers) },
  { name: 'image', scope: 'photo.mobile', headers: { 'auth-token': 'synthetic-access' },
    send: (auth, scope, headers) => auth.requestImage(scope, 'https://example.test/photo', headers) }
];
function token(h) {
  seedSecret(h, 'token.autonomic', { access: 'synthetic-access', refresh: null, expires: TIME + 7200000 });
}
async function foreground(h) {
  h.config.runsInApp = true; h.config.runsInWidget = false;
  const store = new h.api.LocalStore(); await store.acquire();
  return { store, auth: new h.api.FordAuthManager(store) };
}

test('FileManager move replaces its destination while copy refuses an existing destination', () => {
  const h = load();
  h.fm.writeString('/mock/source', 'new'); h.fm.writeString('/mock/destination', 'old');
  h.fm.move('/mock/source', '/mock/destination');
  assert.equal(h.fm.readString('/mock/destination'), 'new'); assert.equal(h.fm.fileExists('/mock/source'), false);
  h.fm.writeString('/mock/source', 'source');
  assert.throws(() => h.fm.copy('/mock/source', '/mock/destination'), /existing destination/);
  assert.equal(h.fm.readString('/mock/destination'), 'new'); assert.equal(h.fm.readString('/mock/source'), 'source');
  h.fm.copy('/mock/source', '/mock/new-copy');
  assert.equal(h.fm.readString('/mock/new-copy'), 'source'); assert.equal(h.fm.readString('/mock/source'), 'source');
});

for (const kind of ['foreground', 'background']) {
  test(`${kind}: a competing lease created during the claim cannot be overwritten`, async () => {
    const h = load(), store = new h.api.LocalStore();
    h.fm.createDirectory(store.dir);
    const competitor = { owner: 'synthetic-competing-owner', started: TIME, until: TIME + h.api.SETTINGS.lease, background: false };
    let collided = false;
    for (const operation of ['move', 'copy']) {
      const native = h.fm[operation];
      h.fm[operation] = (from, to) => {
        if (!collided && to === store.lockPath) { collided = true; h.fm.writeString(to, JSON.stringify(competitor)); }
        return native(from, to);
      };
    }
    if (kind === 'foreground') await assert.rejects(store.acquire(), /Another run owns the app session/);
    else {
      h.config.runsInApp = false; h.config.runsInWidget = true;
      assert.equal(store.acquireBackground(), false);
    }
    assert.equal(collided, true); assert.deepEqual(JSON.parse(h.fm.readString(store.lockPath)), competitor);
    assert.equal(store.owner, null); assert.deepEqual([...h.state.files.keys()].filter(file => file.startsWith(store.lockPath + '.')), []);
    assert.equal(h.state.requests.length, 0); assert.equal(h.state.secrets.size, 0);
  });
}

test('a stale lease check cannot write its captured owner over a foreground takeover', async () => {
  const h = load(), old = new h.api.LocalStore();
  h.fm.createDirectory(old.dir); h.config.runsInApp = false; h.config.runsInWidget = true;
  assert.equal(old.acquireBackground(), true);
  const current = new h.api.LocalStore(), read = h.fm.readString;
  let injected = false, claimed, currentLock;
  h.fm.readString = file => {
    const snapshot = read(file);
    if (file === old.lockPath && !injected) {
      injected = true; h.config.runsInApp = true; h.config.runsInWidget = false;
      claimed = current.acquire(); currentLock = read(current.lockPath);
    }
    return snapshot;
  };
  old.assertLease(); // Its snapshot was valid before takeover; it must perform no writeback.
  await claimed;
  assert.equal(injected, true); assert.equal(JSON.parse(read(current.lockPath)).owner, current.owner);
  assert.equal(read(current.lockPath), currentLock, 'A stale check must not restore its captured owner or expiry');
  assert.throws(() => old.assertLease(), /App session expired/);
  current.assertLease(); assert.equal(read(current.lockPath), currentLock);
  assert.equal(h.state.requests.length, 0); assert.equal(h.state.secrets.size, 0); current.release();
});

test('a stale release restores the actual foreground lease instead of deleting it', async () => {
  const h = load(), old = new h.api.LocalStore();
  h.fm.createDirectory(old.dir); h.config.runsInApp = false; h.config.runsInWidget = true;
  assert.equal(old.acquireBackground(), true);
  const current = new h.api.LocalStore(), read = h.fm.readString;
  let injected = false, claimed, currentLock;
  h.fm.readString = file => {
    const snapshot = read(file);
    if (file === old.lockPath && !injected) {
      injected = true; h.config.runsInApp = true; h.config.runsInWidget = false;
      claimed = current.acquire(); currentLock = read(current.lockPath);
    }
    return snapshot;
  };
  old.release(); await claimed;
  assert.equal(injected, true); assert.equal(read(current.lockPath), currentLock);
  assert.equal(JSON.parse(currentLock).owner, current.owner); assert.equal(old.owner, null);
  current.assertLease(); assert.equal(read(current.lockPath), currentLock);
  assert.equal(h.state.requests.length, 0); assert.equal(h.state.secrets.size, 0); current.release();
});

test('Take over approval cannot remove a different owner that claimed the lease while the dialog was open', async () => {
  const h = load(), initial = new h.api.LocalStore(); await initial.acquire();
  const waiting = new h.api.LocalStore(), current = new h.api.LocalStore(), present = h.context.Alert.prototype.presentAlert;
  let injected = false, currentLock;
  h.context.Alert.prototype.presentAlert = async function() {
    const choice = await present.call(this);
    if (this.title === 'FordWidget is already running' && !injected) {
      injected = true; h.state.choices.unshift('Take over'); await current.acquire();
      currentLock = h.fm.readString(current.lockPath);
    }
    return choice;
  };
  h.state.choices.push('Take over');
  await assert.rejects(waiting.acquire(), /Another run owns the app session/);
  assert.equal(injected, true); assert.equal(waiting.owner, null);
  assert.equal(h.fm.readString(current.lockPath), currentLock); current.assertLease();
  assert.equal(h.state.requests.length, 0); assert.equal(h.state.secrets.size, 0); initial.release(); current.release();
});

for (const kind of ['foreground', 'background']) {
  test(`${kind}: expired-lock cleanup preserves a successor created after the expired snapshot was read`, async () => {
    const h = load(), waiting = new h.api.LocalStore(); h.fm.createDirectory(waiting.dir);
    h.fm.writeString(waiting.lockPath, JSON.stringify({ owner: 'synthetic-expired-owner', started: TIME - 900000, until: TIME - 1, background: false }));
    const current = new h.api.LocalStore(), read = h.fm.readString;
    let injected = false, claimed, currentLock;
    h.fm.readString = file => {
      const snapshot = read(file);
      if (file === waiting.lockPath && !injected) {
        injected = true; h.config.runsInApp = true; h.config.runsInWidget = false;
        claimed = current.acquire(); currentLock = read(current.lockPath);
      }
      return snapshot;
    };
    if (kind === 'foreground') await assert.rejects(waiting.acquire(), /Another run owns the app session/);
    else {
      h.config.runsInApp = false; h.config.runsInWidget = true;
      assert.equal(waiting.acquireBackground(), false);
    }
    await claimed;
    assert.equal(injected, true); assert.equal(waiting.owner, null);
    assert.equal(read(current.lockPath), currentLock); current.assertLease();
    assert.equal(h.state.requests.length, 0); assert.equal(h.state.secrets.size, 0); current.release();
  });
}

test('a successor arriving during restoration is never overwritten and the displaced record is retained', async () => {
  const h = load(), old = new h.api.LocalStore();
  h.fm.createDirectory(old.dir); h.config.runsInApp = false; h.config.runsInWidget = true;
  assert.equal(old.acquireBackground(), true);
  const displacedOwner = new h.api.LocalStore(), newest = new h.api.LocalStore(), read = h.fm.readString, copy = h.fm.copy;
  let injected = false, claimed, displacedLock, raced, newestLock, displacedPath;
  h.fm.readString = file => {
    const snapshot = read(file);
    if (file === old.lockPath && !injected) {
      injected = true; h.config.runsInApp = true; h.config.runsInWidget = false;
      claimed = displacedOwner.acquire(); displacedLock = read(displacedOwner.lockPath);
    }
    return snapshot;
  };
  h.fm.copy = (from, to) => {
    if (to === old.lockPath && displacedLock !== undefined && read(from) === displacedLock) {
      displacedPath = from; raced = newest.acquire(); newestLock = read(newest.lockPath);
    }
    return copy(from, to);
  };
  old.release(); await claimed; await raced;
  assert.equal(injected, true); assert.ok(displacedPath, 'The restore attempt must encounter an independently claimed lease');
  assert.equal(read(newest.lockPath), newestLock); assert.equal(JSON.parse(newestLock).owner, newest.owner);
  assert.equal(read(displacedPath), displacedLock, 'A failed no-clobber restore must retain the displaced owner record');
  assert.throws(() => displacedOwner.assertLease(), /App session expired/); newest.assertLease();
  assert.equal(h.state.requests.length, 0); assert.equal(h.state.secrets.size, 0); newest.release();
});

for (const kind of ['foreground', 'background']) {
  test(`${kind}: lease checks never extend the fixed lifetime and fail at its exact expiry`, async () => {
    const h = load(), store = new h.api.LocalStore();
    h.fm.createDirectory(store.dir);
    const lifetime = kind === 'foreground' ? 15 * 60000 : 90000;
    if (kind === 'foreground') await store.acquire();
    else { h.config.runsInApp = false; h.config.runsInWidget = true; assert.equal(store.acquireBackground(), true); }
    const original = h.fm.readString(store.lockPath), lease = JSON.parse(original);
    assert.equal(lease.owner, store.owner); assert.equal(lease.until, TIME + lifetime);
    h.state.clock = lease.until - 1; store.assertLease();
    assert.equal(h.fm.readString(store.lockPath), original, 'Successful checks must keep the original lease expiry');
    h.state.clock = lease.until; assert.throws(() => store.assertLease(), /App session expired/);
    assert.equal(h.fm.readString(store.lockPath), original, 'An expired check must not recreate or extend its lease');
    assert.equal(h.state.requests.length, 0); assert.equal(h.state.secrets.size, 0); store.release();
  });
}

for (const transport of transports) {
  for (const reply of [
    { name: '200 response', value: { status: 200, body: { ok: true } } },
    { name: '429 response', value: { status: 429, headers: { 'Retry-After': '60' } } },
    { name: '401 response', value: { status: 401 } },
    { name: 'transport failure', value: new Error('Synthetic transport failure') }
  ]) {
    test(`${transport.name}: a displaced background ${reply.name} preserves the foreground gate and token`, async () => {
      const h = regressionLoad(), oldStore = new h.api.LocalStore();
      h.fm.createDirectory(oldStore.dir);
      h.config.runsInApp = false; h.config.runsInWidget = true;
      assert.equal(oldStore.acquireBackground(), true);
      const oldAuth = new h.api.FordAuthManager(oldStore);
      token(h);
      let finish;
      const pending = new Promise(resolve => { finish = resolve; });
      h.state.responses.push(() => pending);
      const oldRequest = transport.send(oldAuth, transport.scope, transport.headers);
      const completed = oldRequest.then(value => ({ value }), error => ({ error }));
      assert.equal(h.state.requests.length, 1);

      // Foreground acquisition legitimately supersedes a background lease.
      const current = await foreground(h);
      h.state.responses.push({ status: 429, headers: { 'Retry-After': '3600' } });
      await assert.rejects(transport.send(current.auth, transport.scope, transport.headers), /HTTP 429/);
      const gate = plain(h.api.secretGet('gate.' + transport.scope));
      assert.equal(gate.next, TIME + 3600000);
      const saved = Array.from(h.state.secrets);
      finish(reply.value);
      const outcome = await completed;

      assert.deepEqual(Array.from(h.state.secrets), saved);
      assert.deepEqual(plain(h.api.secretGet('gate.' + transport.scope)), gate);
      assert.equal(h.api.secretGet('token.autonomic').expires, TIME + 7200000);
      assert.match(outcome.error && outcome.error.message || '', /App session expired/);
      assert.equal(h.state.requests.length, 2);
      const previousLease = plain(current.store.readFile(current.store.lockPath));
      h.state.clock += 1000; current.store.assertLease();
      const checked = current.store.readFile(current.store.lockPath);
      assert.equal(checked.owner, current.store.owner); assert.deepEqual(plain(checked), previousLease);
      assert.ok(checked.until > h.state.clock, 'The legitimate owner keeps its fixed, still-valid lease after the stale response settles');
      current.store.release();
    });
  }

  test(`${transport.name}: a displaced transport failure cannot create a new gate`, async () => {
    const h = regressionLoad(), oldStore = new h.api.LocalStore();
    h.fm.createDirectory(oldStore.dir); assert.equal(oldStore.acquireBackground(), true);
    const oldAuth = new h.api.FordAuthManager(oldStore);
    let finish;
    h.state.responses.push(() => new Promise(resolve => { finish = resolve; }));
    const completed = transport.send(oldAuth, transport.scope, transport.headers).then(value => ({ value }), error => ({ error }));
    const current = await foreground(h);
    const saved = Array.from(h.state.secrets);
    finish(new Error('Synthetic transport failure'));
    const outcome = await completed;
    assert.deepEqual(Array.from(h.state.secrets), saved);
    assert.equal(h.api.secretGet('gate.' + transport.scope), null);
    assert.match(outcome.error && outcome.error.message || '', /App session expired/);
    current.store.release();
  });

  test(`${transport.name}: a current owner's successful response clears only its old gate`, async () => {
    const h = regressionLoad(), current = await foreground(h);
    token(h);
    h.api.secretSet('gate.' + transport.scope, { failures: 3, next: TIME - 1 });
    h.api.secretSet('gate.unrelated', { failures: 1, next: TIME + 300000 });
    h.state.responses.push({ status: 200, body: { ok: true }, headers: { 'Content-Type': 'IMAGE/PNG' } });
    const result = await transport.send(current.auth, transport.scope, transport.headers);
    assert.equal(h.api.secretGet('gate.' + transport.scope), null);
    assert.equal(h.api.secretGet('gate.unrelated').next, TIME + 300000);
    assert.equal(h.api.secretGet('token.autonomic').expires, TIME + 7200000);
    if (transport.name === 'JSON') assert.deepEqual(plain(result), { ok: true });
    else { assert.equal(result.type, 'image/png'); assert.deepEqual(plain(result.data), { ok: true }); }
    current.store.release();
  });

  for (const status of [400, 401, 403, 429, 503]) {
    test(`${transport.name}: current HTTP ${status} retains status, retry delay and matching-token rules`, async () => {
      const h = regressionLoad(), current = await foreground(h);
      token(h);
      h.api.secretSet('token.mobile', { access: 'synthetic-unrelated', expires: TIME + 7200000 });
      h.api.secretSet('gate.' + transport.scope, { failures: 2, next: TIME - 1 });
      h.state.responses.push({ status, headers: status === 429 ? { 'rEtRy-AfTeR': '3600' } : {} });
      await assert.rejects(transport.send(current.auth, transport.scope, transport.headers), error => {
        assert.equal(error.status, status); assert.match(error.message, new RegExp('HTTP ' + status)); return true;
      });
      const gate = h.api.secretGet('gate.' + transport.scope);
      const delay = status === 429 ? 3600000 : [400, 401, 403].includes(status) ? 900000 : 240000;
      assert.equal(gate.failures, 3); assert.equal(gate.next, TIME + delay);
      assert.equal(h.api.secretGet('token.autonomic').expires, status === 401 ? 0 : TIME + 7200000);
      assert.equal(h.api.secretGet('token.mobile').expires, TIME + 7200000);
      current.store.release();
    });
  }

  test(`${transport.name}: current transport failure retains the safe error and normal backoff`, async () => {
    const h = regressionLoad(), current = await foreground(h);
    h.state.responses.push(new Error('Synthetic untrusted transport detail'));
    await assert.rejects(transport.send(current.auth, transport.scope, transport.headers), error => {
      assert.equal(error.status, 0); assert.match(error.message, /connection failed or timed out/);
      assert.doesNotMatch(error.message, /untrusted transport detail/); return true;
    });
    assert.deepEqual(plain(h.api.secretGet('gate.' + transport.scope)), { failures: 1, next: TIME + 60000, httpStatus: 0, failedAt: TIME });
    current.store.release();
  });
}

test('a current JSON parse failure retains the safe error and normal backoff', async () => {
  const h = regressionLoad(), current = await foreground(h);
  h.state.responses.push({ status: 200, body: '{invalid' });
  await assert.rejects(current.auth.request('telemetry.mobile', 'https://api.autonomic.ai/v1/telemetry/sources/fordpass/vehicles/' + VIN), error => {
    assert.equal(error.status, 200); assert.match(error.message, /invalid JSON response/); return true;
  });
  assert.deepEqual(plain(h.api.secretGet('gate.telemetry.mobile')), { failures: 1, next: TIME + 60000, httpStatus: 200, failedAt: TIME });
  current.store.release();
});

test('a valid current owner retains HTTP-date Retry-After behavior', async () => {
  const h = regressionLoad(), current = await foreground(h);
  h.state.responses.push({ status: 429, headers: { 'Retry-After': new Date(TIME + 7200000).toUTCString() } });
  await assert.rejects(current.auth.request('telemetry.mobile', 'https://api.autonomic.ai/v1/telemetry/sources/fordpass/vehicles/' + VIN), /HTTP 429/);
  assert.deepEqual(plain(h.api.secretGet('gate.telemetry.mobile')), { failures: 1, next: TIME + 7200000, httpStatus: 429, failedAt: TIME });
  current.store.release();
});

test('built-in offline self-test still passes', () => {
  const h = load(); h.api.selfTest();
  assert.equal(h.state.requests.length, 0);
});
