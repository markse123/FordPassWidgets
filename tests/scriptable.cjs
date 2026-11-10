'use strict';
// Offline Scriptable mocks. Every network request requires an explicit fake response.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const TIME = Date.parse('2026-11-08T14:00:00.000Z');
const VIN = '1FTFW1E50JFA00001'; // Synthetic fixture, never used on a network.
const plain = value => JSON.parse(JSON.stringify(value));
function load(source = fs.readFileSync(path.join(__dirname, '../FordPassWidgets.js'), 'utf8')) {
  const boundary = source.lastIndexOf('try { await new AppController().run(); }');
  assert.ok(boundary > 0, 'Scriptable entry boundary is required');
  const state = { clock: TIME, files: new Map(), secrets: new Map(), requests: [], responses: [],
    alerts: [], choices: [], notifications: [], widgets: [], logs: [], uuid: 0, geocodes: [], previews: [], clipboard: [], safari: [] };
  class FixedDate extends Date {
    constructor(...args) { super(...(args.length ? args : [state.clock])); }
    static now() { return state.clock; }
  }
  class Color {
    constructor(hex, alpha = 1) { this.hex = hex; this.alpha = alpha; }
    static dynamic(light, dark) { return { light, dark }; }
    static white() { return new Color('white'); }
    static black() { return new Color('black'); }
    static gray() { return new Color('gray'); }
    static red() { return new Color('red'); }
  }
  class Size { constructor(width, height) { this.width = width; this.height = height; } }
  class Point { constructor(x, y) { this.x = x; this.y = y; } }
  class Rect { constructor(x, y, width, height) { Object.assign(this, { x, y, width, height }); } }
  class Node {
    constructor(kind, value) { this.kind = kind; this.children = []; if (value !== undefined) this.value = value; }
    addStack() { const n = new Node('stack'); this.children.push(n); return n; }
    addText(text) { const n = new Node('text', String(text)); this.children.push(n); return n; }
    addImage(image) { const n = new Node('image', image); this.children.push(n); return n; }
    addDate(date) { const n = new Node('date', date.toISOString()); this.children.push(n); return n; }
    addSpacer(size) { this.children.push({ kind: 'spacer', size: size === undefined ? null : size }); }
    setPadding(...padding) { this.padding = padding; }
    layoutHorizontally() { this.layout = 'horizontal'; }
    layoutVertically() { this.layout = 'vertical'; }
    centerAlignContent() { this.contentAlignment = 'center'; }
    topAlignContent() { this.contentAlignment = 'top'; }
    bottomAlignContent() { this.contentAlignment = 'bottom'; }
    centerAlignText() { this.textAlignment = 'center'; }
    leftAlignText() { this.textAlignment = 'left'; }
    rightAlignText() { this.textAlignment = 'right'; }
    applyTimerStyle() { this.dateStyle = 'timer'; }
    applyTimeStyle() { this.dateStyle = 'time'; }
    applyDateStyle() { this.dateStyle = 'date'; }
    useDefaultPadding() { this.padding = 'default'; }
    async presentSmall() { state.widgets.push(this); }
    async presentMedium() { state.widgets.push(this); }
    async presentLarge() { state.widgets.push(this); }
  }
  class ListWidget extends Node { constructor() { super('widget'); } }
  class DrawContext {
    constructor() { this.operations = []; }
    setFillColor(...args) { this.operations.push(['setFillColor', ...args]); }
    fillRect(...args) { this.operations.push(['fillRect', ...args]); }
    addPath(...args) { this.operations.push(['addPath', ...args]); }
    setStrokeColor(...args) { this.operations.push(['setStrokeColor', ...args]); }
    setLineWidth(...args) { this.operations.push(['setLineWidth', ...args]); }
    strokePath(...args) { this.operations.push(['strokePath', ...args]); }
    drawImageInRect(...args) { this.operations.push(['drawImageInRect', ...args]); }
    getImage() { return { kind: 'drawing', size: this.size, operations: this.operations, opaque: this.opaque, respectScreenScale: this.respectScreenScale }; }
  }
  class Path {
    constructor() { this.operations = []; }
    move(point) { this.operations.push(['move', point]); }
    addLine(point) { this.operations.push(['addLine', point]); }
  }
  const fm = {
    documentsDirectory: () => '/mock/documents', joinPath: (a, b) => a + '/' + b,
    fileExists: p => state.files.has(p), createDirectory: p => state.files.set(p, { directory: true }),
    readString: p => { if (!state.files.has(p)) throw new Error('Missing mock file'); return state.files.get(p); },
    writeString: (p, value) => state.files.set(p, String(value)), remove: p => state.files.delete(p),
    // Scriptable: move replaces an existing destination; copy refuses one.
    // https://docs.scriptable.app/filemanager/#-move
    move: (from, to) => { assert.ok(state.files.has(from)); state.files.set(to, state.files.get(from)); state.files.delete(from); },
    copy: (from, to) => { assert.ok(state.files.has(from)); assert.ok(!state.files.has(to), 'Native copy refuses an existing destination'); state.files.set(to, state.files.get(from)); },
    readImage: p => state.files.get(p), writeImage: (p, img) => state.files.set(p, img),
  };
  class Alert {
    constructor() { this.actions = []; this.fields = []; }
    addAction(title) { this.actions.push({ title, type: 'normal' }); }
    addDestructiveAction(title) { this.actions.push({ title, type: 'destructive' }); }
    addCancelAction(title) { this.cancel = title; }
    addTextField(label, value = '') { this.fields.push({ label, value }); }
    addSecureTextField(label, value = '') { this.fields.push({ label, value, secret: true }); }
    textFieldValue(i) { return this.fields[i].value; }
    async show(kind) {
      state.alerts.push({ kind, title: this.title, message: this.message, actions: this.actions, cancel: this.cancel });
      const choice = state.choices.length ? state.choices.shift() : -1;
      if (typeof choice !== 'string') return choice;
      const index = this.actions.findIndex(action => action.title === choice);
      assert.ok(index >= 0, 'No such mocked alert action: ' + choice);
      return index;
    }
    async presentAlert() { return this.show('alert'); }
    async presentSheet() { return this.show('sheet'); }
  }
  class Request {
    constructor(url) { this.url = url; this.method = 'GET'; this.headers = {}; }
    async responseBody() {
      state.requests.push({ url: this.url, method: this.method, headers: plain(this.headers), body: this.body });
      assert.ok(state.responses.length, 'Unexpected mocked request: ' + this.url);
      const next = state.responses.shift();
      const reply = typeof next === 'function' ? await next(this) : next;
      if (reply instanceof Error) throw reply;
      this.response = { statusCode: reply.status === undefined ? 200 : reply.status, headers: reply.headers || {} };
      return reply.body === undefined ? {} : reply.body;
    }
    async loadString() { const body = await this.responseBody(); return typeof body === 'string' ? body : JSON.stringify(body); }
    async loadJSON() { const body = await this.responseBody(); return typeof body === 'string' ? JSON.parse(body) : body; }
    async load() { return this.responseBody(); }
  }
  class Notification { async schedule() { state.notifications.push({ title: this.title, body: this.body, openURL: this.openURL }); } }
  const config = { runsInApp: true, runsInWidget: false, widgetFamily: 'medium' };
  const args = { queryParameters: {}, widgetParameter: '' };
  const sandbox = { Date: FixedDate, Color, Size, Point, Rect, ListWidget, DrawContext, Path, Request, Notification, Alert,
    Font: new Proxy({}, { get: (_, name) => (...values) => ({ font: String(name), values }) }),
    SFSymbol: { named: name => ({ image: { symbol: name }, applyFont() {} }) },
    FileManager: { local: () => fm },
    Keychain: { contains: k => state.secrets.has(k), get: k => state.secrets.get(k), set: (k, v) => state.secrets.set(k, v), remove: k => state.secrets.delete(k) },
    UUID: { string: () => '00000000-0000-4000-8000-' + String(++state.uuid).padStart(12, '0') },
    Timer: { schedule: (ms, repeats, callback) => { assert.equal(repeats, false); state.clock += ms; callback(); return { invalidate() {} }; } },
    Script: { name: () => 'FordPassWidgets Test', setWidget: w => state.widgets.push(w), complete() {} },
    Location: { reverseGeocode: async (...p) => { state.geocodes.push(p); return []; } },
    Photos: { fromLibrary: async () => ({ kind: 'synthetic-photo', size: { width: 640, height: 320 } }) },
    Data: { fromBase64String: text => ({ base64: text }) }, Image: { fromData: () => ({ kind: 'synthetic-image', size: { width: 640, height: 320 } }) },
    Safari: { openInApp: async (...values) => { state.safari.push({ method: 'openInApp', values }); }, open: async (...values) => { state.safari.push({ method: 'open', values }); } },
    Clipboard: { copyString: () => {}, pasteString: () => '' },
    Pasteboard: { copyString: value => state.clipboard.push(value) }, QuickLook: { present: async value => state.previews.push(value) },
    console: { log: (...values) => state.logs.push(values.join(' ')), warn: () => {}, error: () => {} }, config, args,
  };
  const names = ['SETTINGS', 'COMMANDS', 'FIELD_NAMES', 'METRICS', 'METRIC_ALIASES', 'ACCESSORY_VIEWS', 'LocalStore', 'FordAuthManager', 'FordAPIClient', 'WidgetRenderer', 'AppController', 'normalize', 'mergeFields', 'nightSettings', 'nightProblems', 'widgetOptions', 'secretGet', 'secretSet', 'secretRemove', 'secretKey', 'timestamp', 'now', 'selfTest', 'findVehicleImageUrl', 'findImageRef', 'isFordHost', 'downscale', 'challenge', 'fordFuelPercent', 'ppoNormalize', 'ppoView', 'ppoEstimated', 'statusDiagnosticReport', 'statusFuelDiagnostic', 'widgetDiagnosticContext', 'PPO_DASHBOARD_ORIGINAL_BUILD', 'readVehicleRegistry', 'activeVehicleProfile', 'bindVehicleProfile', 'addVehicleProfile', 'saveVehicleProfile', 'setDefaultVehicle', 'beginAccountSession', 'completeAccountSession', 'authorizeGarageVehicles', 'endAccountSession', 'vehicleBindingCurrent', 'vehicleParameter', 'captureVehicleBinding', 'vehicleCapabilities', 'vehicleCommandAllowed', 'proPowerEnabled', 'engineControlAllowed', 'ppoRedactedReport', 'ppoPowerText', 'ppoModeLine', 'ppoUIAt', 'ppoCommandAge', 'ppoShortAge', 'ppoShortMode', 'ppoStaleText', 'ppoSnapshotFor', 'ppoRawSignals', 'ppoStatusRequestView', 'ppoRequestLine', 'ppoUIError'];
  const expose = '\nglobalThis.TestAPI = {' + names.map(n => n + ': typeof ' + n + " === 'undefined' ? undefined : " + n).join(',') + '};';
  const context = vm.createContext(sandbox);
  new vm.Script(source.slice(0, boundary) + expose, { filename: 'FordPassWidgets.js' }).runInContext(context);
  return { api: context.TestAPI, state, config, args, context, fm };
}

const FIXTURE_ACCOUNT = 'a'.repeat(32), FIXTURE_SESSION = 'b'.repeat(32), FIXTURE_PROFILE = 'c'.repeat(32);
// Existing regressions explicitly model an authorized HEV/automatic vehicle with
// owner-enabled controls and PPO. New-account/default tests must use load() and
// production add/authorize helpers rather than this legacy-regression fixture.
function prefs(extra = {}) {
  return Object.assign({ id: FIXTURE_PROFILE, accountId: FIXTURE_ACCOUNT, authorizedSession: FIXTURE_SESSION,
    tireConfiguration: {layout: 'four', frontPsi: extra.alerts && extra.alerts.tire || 30, rearPsi: extra.alerts && extra.alerts.tire || 30, configured: true},
    vin: VIN, name: 'Synthetic vehicle', engineType: 'HEV', transmission: 'AUTOMATIC', imageMode: 'off', night: {enabled: false} }, extra, {
    features: Object.assign({proPower: true, engineControl: true}, extra.features || {}),
    capabilities: Object.assign({lock: 'supported', unlock: 'supported', refresh: 'supported', engineControl: 'supported', proPower: 'supported', evCharge: 'unsupported'}, extra.capabilities || {}),
    compatibility: Object.assign({}, extra.compatibility, {commands: Object.assign({lock: true, unlock: true, start: true, stop: true, refresh: true}, extra.compatibility && extra.compatibility.commands), verified: Object.assign({}, extra.compatibility && extra.compatibility.verified)}),
    alerts: Object.assign({configured: true}, extra.alerts, {enabled: Object.assign({lock: true, doors: true, tires: true, fuel: true, oil: true, battery: true, engine: true}, extra.alerts && extra.alerts.enabled)})
  });
}
function cache(extra = {}) { return Object.assign({version: 1, vin: VIN, fields: {}, fetchedAt: TIME - 30000}, extra); }
function regressionLoad(source) {
  const h = source === undefined ? load() : load(source);
  if (h.api.bindVehicleProfile) {
    h.state.secrets.set('FordPassWidgets.v1.registry', JSON.stringify({version: 1,
      account: {id: FIXTURE_ACCOUNT, session: FIXTURE_SESSION, connected: true},
      profiles: [prefs()], defaultVehicleId: FIXTURE_PROFILE}));
    h.api.bindVehicleProfile(FIXTURE_PROFILE); h.regressionFixture = true;
  }
  return h;
}
async function prepared(h, vehicle = prefs(), snapshot = cache()) {
  if (h.api.bindVehicleProfile) {
    h.api.bindVehicleProfile(null);
    const account = new h.api.LocalStore(); await account.acquire();
    if (!h.regressionFixture) h.api.beginAccountSession(account);
    h.api.secretSet('token.mobile', {access: 'synthetic-cat', refresh: null, expires: TIME + 3600000});
    h.api.secretSet('token.autonomic', {access: 'synthetic-autonomic', refresh: null, expires: TIME + 3600000});
    h.api.completeAccountSession(account);
    const profiles = h.api.authorizeGarageVehicles([{vin: vehicle.vin, profile: {engineType: vehicle.engineType, transmission: vehicle.transmission}}], account);
    account.release();
    const profile = profiles.find(item => item.vin === vehicle.vin);
    assert.ok(profile, 'The synthetic garage must authorize the fixture VIN');
    Object.assign(vehicle, {id: profile.id, accountId: profile.accountId, authorizedSession: profile.authorizedSession});
    h.api.bindVehicleProfile(profile.id);
    const app = new h.api.AppController();
    app.store = new h.api.LocalStore(); app.auth = new h.api.FordAuthManager(app.store);
    await app.store.acquire(); h.api.saveVehicleProfile(vehicle, app.store);
    Object.assign(snapshot, {profileId: profile.id, accountId: profile.accountId}); app.store.write(snapshot);
    return app;
  }
  h.api.secretSet('vehicle', vehicle);
  h.api.secretSet('token.mobile', {access: 'synthetic-cat', refresh: null, expires: TIME + 3600000});
  h.api.secretSet('token.autonomic', {access: 'synthetic-autonomic', refresh: null, expires: TIME + 3600000});
  const app = new h.api.AppController(); await app.store.acquire(); app.store.write(snapshot); return app;
}
function boundCache(store, snapshot) {
  const binding = store.profileBinding;
  return binding ? Object.assign({}, snapshot, {profileId: binding.profileId, accountId: binding.accountId}) : snapshot;
}
async function prepareOtherVehicle(h, app, vehicle = prefs({vin:'1FTFW1E50JFA00002',name:'Other synthetic vehicle'}), snapshot = cache({vin:vehicle.vin})) {
  const first = h.api.activeVehicleProfile();
  assert.ok(first, 'Select fixture A before authorizing fixture B');
  await app.attachAccount();
  const garage = [first, vehicle].map(item => ({vin:item.vin,profile:{engineType:item.engineType,transmission:item.transmission}}));
  const profiles = h.api.authorizeGarageVehicles(garage, app.store);
  const other = profiles.find(item => item.vin === vehicle.vin);
  Object.assign(vehicle,{id:other.id,accountId:other.accountId,authorizedSession:other.authorizedSession});
  await app.attachVehicle(other.id); h.api.saveVehicleProfile(vehicle, app.store); app.store.write(snapshot);
  await app.attachVehicle(first.id);
  return vehicle;
}
function seedSecret(h, name, value) { h.state.secrets.set(h.api.secretKey(name),JSON.stringify(value)); }
function seedProfilePreferences(h, vehicle) {
  // Pure renderer fixtures only. Behavioral settings tests use the guarded API.
  const registry = h.api.readVehicleRegistry();
  const index = registry.profiles.findIndex(item => item.id === vehicle.id && item.vin === vehicle.vin);
  assert.ok(index >= 0, 'Rendering fixtures may not change vehicle identity');
  registry.profiles[index] = plain(vehicle);
  h.state.secrets.set('FordPassWidgets.v1.registry',JSON.stringify(registry));
}
module.exports = {load, regressionLoad, prefs, cache, prepared, boundCache, prepareOtherVehicle, seedSecret, seedProfilePreferences, plain, TIME, VIN};
