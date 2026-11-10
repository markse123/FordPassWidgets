// Variables used by Scriptable.
// icon-color: blue; icon-glyph: car;
/*
FordPassWidgets 0.1.0
An independent FordPass vehicle widget for Scriptable.
Derived from rushilpunu/FordWidget and markse123/FordWidget.
Contributor credits: https://github.com/markse123/FordPassWidgets/blob/main/CREDITS.md
Base: markse123/FordWidget commit d83436970a1051c21ecc73092eedd06035c9c50d.
Separate account storage; per-vehicle widgets; optional Pro Power monitoring.
Vehicle capabilities and measurement times remain explicit.

MIT License

Copyright (c) 2026 rushilpunu
Copyright (c) 2026 markse123

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
*/

/**
 * FordWidget — single-file Scriptable widget (North American FordPass profile).
 * Official source and instructions: https://github.com/rushilpunu/FordWidget
 * This fork derives from that source. Read the notes above and SECURITY & PRIVACY.
 * MIT License, Copyright (c) 2026 rushilpunu. See LICENSE in the repository.
 *
 * SETUP
 * 1. Copy this file into Scriptable as FordWidget. Run it IN THE APP first.
 * 2. Enter your VIN and badge, then choose Connect FordConnect / FordPass.
 *    FordConnect needs your own approved developer application, Client ID,
 *    Client Secret, and EXACT registered HTTPS redirect URI. Register at
 *    https://developer.ford.com/developer-na and grant telemetry categories.
 *    Use an HTTPS callback you control. This script intercepts the callback in
 *    WebView before navigation; no callback server or third-party relay is used.
 *    If Ford rejects your callback registration, resolve that with Ford first.
 * 3. Sign in in the Ford WebView, finish consent/MFA, then tap Close when the
 *    page says "Signed in". Typing the password in setup is optional: it only
 *    prefills Ford's login page for that sign-in and is never saved. Only the
 *    username and Ford's tokens are kept, in the iOS Keychain.
 *    Never paste bearer tokens, passwords, or secrets into widget parameters.
 * 4. Choose Fetch telemetry. Add a Scriptable Home Screen widget (small, medium,
 *    large) or Lock Screen widget, select FordWidget, and set "When Interacting"
 *    to Run Script. Parameter: words like "buttons", "-photo", "fuel tires lock".
 *    Tap the widget to open the menu; widget buttons open Scriptable and every
 *    command asks for confirmation there.
 *    Examples (actual script name is generated automatically):
 *      scriptable:///run?scriptName=FordWidget&action=start
 *      scriptable:///run?scriptName=FordWidget&action=stop
 *      scriptable:///run?scriptName=FordWidget&action=lock
 *      scriptable:///run?scriptName=FordWidget&action=unlock
 *      scriptable:///run?scriptName=FordWidget&action=refresh  (wake request)
 *      scriptable:///run?scriptName=FordWidget&action=fetch    (cloud reads only)
 *      scriptable:///run?scriptName=FordWidget&action=selftest (offline checks)
 *
 * TRUCK PHOTO
 * - After FordPass is connected, "Fetch telemetry" also downloads the photo Ford
 *   shows for your VIN in the FordPass app (refreshed every 30 days) and caches
 *   it next to the telemetry cache. Order: FordPass garage profile image, then
 *   Ford's image service. Menu > Vehicle photo picks a view angle (1-5), a photo
 *   from your library (worst case; a cut-out PNG with no background looks best),
 *   or the plain icon. URL: scriptable:///run?scriptName=FordWidget&action=photo
 *
 * SECURITY & PRIVACY (read before installing)
 * - Unofficial. Uses Ford's private FordPass app API the same way open-source
 *   projects (ha-fordpass) do. Ford can change or block it at any time, and using
 *   it may be against Ford's terms. You use it at your own risk.
 * - Read the code before running it, and only from a source you trust. A changed
 *   copy could send your Ford login anywhere. The only hosts contacted are
 *   login.ford.com, *.ford.com, api.autonomic.ai (Ford's vehicle cloud) and,
 *   only for the Remote start temperature line, api.open-meteo.com (location
 *   rounded to ~1 km, no account).
 * - Scriptable's Keychain is shared by ALL scripts in the app. Any other script
 *   you install can read FordWidget's tokens, and those tokens can unlock and
 *   start your vehicle. Don't install Scriptable scripts you haven't read. To
 *   revoke access, use Menu > Sign out of Ford and change your Ford password.
 * - Anything (a web page, a QR code) can open a scriptable:// link to this script.
 *   That's why every command shows a confirmation alert first. Only tap "Send
 *   command" if you started it.
 * - When asking for help, don't post your VIN, location or screenshots of
 *   View details. Errors never include tokens or passwords.
 * - Remote start: only when the vehicle is parked outdoors, never in a garage.
 *
 * BEHAVIOR / LIMITS
 * - Widgets draw from the cache and never send commands. One exception: the
 *   EVENING CHECK. The first widget refresh after the chosen hour (default 9 PM)
 *   reads the vehicle's last cloud state once (read-only, does not wake the modem),
 *   at most twice per evening, 6 s timeouts, and notifies you about problems.
 *   iOS decides exactly when widgets refresh, so the time is approximate.
 * - Remote start shows a live countdown (iOS ticks it). Right after Start it is an
 *   estimate (SETTINGS.startMinutes); Ford's remoteStartCountdownTimer replaces it.
 * - Lock Screen widgets: circular (Parameter fuel | lock | tires), rectangular
 *   (status | tires | parked) and inline. A running engine overrides the circle.
 * - Legacy local storage: FordPassWidgets/ford_vehicle_cache.json contains normalized telemetry,
 *   timestamps, cooldowns, and command receipts, never secrets. It holds the
 *   truck's parked coordinates only while "Parked location" is on (Customize).
 *   Keep the filename/directory if updating the script. Cache is device-local.
 * - Missing/unsupported measurements stay unknown. Oil/fuel are not invented;
 *   12V SOC never substitutes the high-voltage traction battery SOC.
 * - Last updated is the OLDEST known timestamp among displayed measurements;
 *   the app's details sheet shows each field's timestamp and source.
 * - Commands need an authorized modem and compatible vehicle/account. A receipt
 *   means accepted, NOT physically completed. Remote start first sends Lock and
 *   polls cloud status (8 x 5s) for that lock command to succeed before starting.
 * - Commands are never automatically retried after a timeout; outcome may be
 *   unknown. Wake requests have a 15-minute cooldown. No periodic modem polling.
 * - Script.setWidget + refreshAfterDate requests a timeline update. Scriptable
 *   has no public force-reload API; iOS decides when the Home Screen redraws.
 * - Private APIs can change or be blocked, including region/login policies.
 *   This is not a Ford-supported client or a guarantee of production service.
 *   Do not treat cached lock/door readings as a live security guarantee.
 *
 * FordPass login/app ID/token hosts match marq24/ha-fordpass (config_flow.py,
 * fordpass_bridge.py, const.py) as read 2026-11-07.
 * ROUTES CHECKED AGAINST (2026-11-06; no authenticated vehicle validation):
 * https://github.com/marq24/ha-fordconnect-query
 *   const.py, application_credentials.py, fordpass_handler.py
 * https://github.com/itchannel/fordpass-ha
 *   custom_components/fordpass/fordpass_new.py
 * FordConnect: GET https://api.vehicle.ford.com/fcon-query/v1/telemetry
 * FordPass: GET /v1/telemetry/sources/fordpass/vehicles/{vin}
 *           POST /v1/command/vehicles/{vin}/commands (type + wakeUp)
 * Older /vehicles/v5/{vin}/doors/lock and /engine/start endpoints use PUT/DELETE,
 * NOT the POST routes sometimes quoted online; they are deliberately not used.
 */

const SETTINGS = Object.freeze({
  officialAuth: 'https://api.vehicle.ford.com/fcon-public/v1/auth/init',
  officialToken: 'https://api.vehicle.ford.com/dah2vb2cprod.onmicrosoft.com/oauth2/v2.0/token?p=B2C_1A_FCON_AUTHORIZE',
  officialBase: 'https://api.vehicle.ford.com/fcon-query/v1',
  login: 'https://login.ford.com',
  tenant: '4566605f-43a7-400a-946e-89cc9fdb0bd7',
  policy: 'B2C_1A_SignInSignUp_en-US',
  mobileClient: '09852200-05fd-41f6-8c21-d36d3497dc64',
  applicationId: 'BFE8C5ED-D687-4C19-A5DD-F92CDFC4503A',
  mobileRedirect: 'fordapp://userauthorized',
  guard: 'https://api.foundational.ford.com/api',
  autonomic: 'https://api.autonomic.ai/v1',
  autonomicToken: 'https://accounts.autonomic.ai/v1/auth/oidc/token',
  fetchInterval: 5 * 60 * 1000,
  wakeInterval: 15 * 60 * 1000,
  commandInterval: 30 * 1000,
  // Timer.schedule takes MILLISECONDS. ~40s covers a typical sleeping-modem lock ack.
  lockPollAttempts: 8,
  lockPollDelay: 5000,
  lease: 15 * 60 * 1000,
  // FordPass lets owners pick the run time; until telemetry reports the real timer we
  // show this as an estimate. Ford's countdown metric replaces it on the next read.
  startMinutes: 15,
  lowTire: 30,
  homeRadius: 150,
  timeout: 12,
  // Vehicle photo sources (both need the FordPass CAT token). Checked 2026-11-07:
  // the old public www.digitalservices.ford.com image host no longer resolves.
  garage: 'https://api.vehicle.ford.com/api/fpcpl-user-garage-service/v1/user/garage',
  imageService: 'https://api.mps.ford.com/api/imageservice/data',
  imageMaxAge: 30 * 24 * 3600000,
  // Widgets have a small memory budget; never store a full-resolution photo.
  imageMaxWidth: 640,
});
const COMMANDS = Object.freeze({ lock: 'lock', unlock: 'unlock', start: 'remoteStart',
  stop: 'cancelRemoteStart', refresh: 'statusRefresh' });
const FIELD_NAMES = Object.freeze({ fuel: 'Fuel %', range: 'DTE (mi)', battery: '12V SOC %',
  batteryHealth: '12V health', oil: 'Oil life %', odometer: 'Odometer (mi)',
  fl: 'Front left PSI', fr: 'Front right PSI', rl: 'Rear left PSI', rr: 'Rear right PSI',
  lock: 'Locks', doors: 'Doors / hood', outsideTemp: 'Outside temp', position: 'Parked location',
  remoteStart: 'Remote start', ignition: 'Ignition', evSoc: 'EV charge %', evRange: 'EV range (mi)',
  plugStatus: 'Charge plug', chargeStatus: 'Charging', chargeEndTime: 'Reported charge end time',
  rli: 'Rear left inner PSI', rlo: 'Rear left outer PSI', rri: 'Rear right inner PSI', rro: 'Rear right outer PSI' });
const now = () => Date.now();
const uid = () => UUID.string().replace(/-/g, '').toLowerCase();
const form = obj => Object.keys(obj).filter(k => obj[k] !== undefined)
  .map(k => `${encodeURIComponent(k)}=${encodeURIComponent(obj[k])}`).join('&');
const vinOK = v => /^[A-HJ-NPR-Z0-9]{17}$/.test(v || '');
const secretKey = name => profileSecretKey(name);
function secretGet(name) { return profileSecretGet(name); }
function secretSet(name, value) { return profileSecretSet(name, value); }
function secretRemove(name) { return profileSecretRemove(name); }
function parkedLocationEnabled(prefs = secretGet('vehicle')) {
  return !!prefs && !(prefs.widget && prefs.widget.show && prefs.widget.show.parked === false);
}
function clearCachedLocation(cache) {
  if (cache && typeof cache === 'object') {
    if (cache.fields && typeof cache.fields === 'object') delete cache.fields.position;
    delete cache.place;
  }
  return cache;
}
function requireApp() {
  if (config.runsInWidget || !config.runsInApp) throw new Error('Open this script in the Scriptable app.');
}
function query(url) {
  const out = Object.create(null);
  const part = (url.split('?')[1] || '').split('#')[0];
  for (const pair of part.split('&').filter(Boolean)) {
    const at = pair.indexOf('=');
    const key = decodeURIComponent((at < 0 ? pair : pair.slice(0, at)).replace(/\+/g, ' '));
    if (Object.prototype.hasOwnProperty.call(out, key)) throw new Error('Duplicate OAuth parameter.');
    out[key] = decodeURIComponent((at < 0 ? '' : pair.slice(at + 1)).replace(/\+/g, ' '));
  }
  return out;
}
function callbackMatches(url, redirect) {
  return url.split(/[?#]/)[0].replace(/\/$/, '') === redirect.replace(/\/$/, '');
}
// Accepts the bare address or Chrome's whole "Failed to launch '…'" console line.
function extractRedirect(text) {
  const m = String(text || '').match(/fordapp:\/\/userauthorized[^\s'"]*/i);
  return m ? m[0] : String(text || '').trim();
}
// Login errors are useless without Ford's reason; show it, minus anything token-like.
function authDetail(raw) {
  let d = null;
  try { d = JSON.parse(raw); } catch (_) { return ''; }
  const text = [d && d.error, d && (d.error_description || d.message || d.description)].filter(v => typeof v === 'string').join(': ');
  return text ? ' ' + text.replace(/[A-Za-z0-9_\-.]{40,}/g, '…').replace(/\s+/g, ' ').slice(0, 180) : '';
}
function finite(value) {
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  if (typeof value === 'string' && !value.trim()) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}
function bounded(value, max) { const n = finite(value); return n !== null && n >= 0 && n <= max ? n : null; }
function timestamp(value) {
  const t = typeof value === 'number' ? value : Date.parse(value);
  return Number.isFinite(t) && t > 0 && t <= now() + 60000 ? t : null;
}
function age(at) {
  if (!at) return 'unknown';
  const minutes = Math.max(0, Math.floor((now() - at) / 60000));
  return minutes < 60 ? `${minutes}m ago` : minutes < 1440 ? `${Math.floor(minutes / 60)}h ago` : `${Math.floor(minutes / 1440)}d ago`;
}
async function message(title, body) {
  console.log(`${title}: ${body}`);
  try { const a = new Alert(); a.title = title; a.message = body; a.addAction('OK'); await a.presentAlert(); }
  catch (_) {
    // Alerts can fail while Scriptable is still coming to the foreground (e.g. launched from Safari).
    const n = new Notification(); n.title = title; n.body = body;
    try { await n.schedule(); } catch (__) { /* the console log above remains */ }
  }
}
async function input(title, description, fields) {
  const a = new Alert(); a.title = title; a.message = description;
  fields.forEach(f => f.secret ? a.addSecureTextField(f.label, f.value || '') : a.addTextField(f.label, f.value || ''));
  a.addAction('Save'); a.addCancelAction('Cancel');
  if (await a.presentAlert() < 0) return null;
  return fields.map((f, i) => f.secret ? a.textFieldValue(i) : a.textFieldValue(i).trim());
}

// SHA-256 is used only for PKCE. No third-party service sees the verifier.
function sha256(bytes) {
  const k = [], h = [];
  for (let n = 2; k.length < 64; n++) {
    let prime = true;
    for (let d = 2; d * d <= n; d++) if (n % d === 0) { prime = false; break; }
    if (prime) { if (h.length < 8) h.push((Math.sqrt(n) % 1 * 0x100000000) | 0);
      k.push((Math.pow(n, 1 / 3) % 1 * 0x100000000) | 0); }
  }
  const b = bytes.slice(), bits = b.length * 8;
  b.push(128); while (b.length % 64 !== 56) b.push(0);
  for (let i = 7; i >= 0; i--) b.push(i >= 4 ? 0 : (bits >>> (i * 8)) & 255);
  const rotr = (v, n) => (v >>> n) | (v << (32 - n));
  for (let offset = 0; offset < b.length; offset += 64) {
    const w = [];
    for (let i = 0; i < 64; i++) {
      if (i < 16) { const j = offset + i * 4; w[i] = (b[j] << 24) | (b[j + 1] << 16) | (b[j + 2] << 8) | b[j + 3]; }
      else { const x = w[i - 15], y = w[i - 2];
        w[i] = (w[i - 16] + (rotr(x, 7) ^ rotr(x, 18) ^ (x >>> 3)) + w[i - 7] + (rotr(y, 17) ^ rotr(y, 19) ^ (y >>> 10))) | 0; }
    }
    let [a, c, d, e, f, g, j, l] = h;
    for (let i = 0; i < 64; i++) {
      const t1 = (l + (rotr(f, 6) ^ rotr(f, 11) ^ rotr(f, 25)) + ((f & g) ^ (~f & j)) + k[i] + w[i]) | 0;
      const t2 = ((rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)) + ((a & c) ^ (a & d) ^ (c & d))) | 0;
      l = j; j = g; g = f; f = (e + t1) | 0; e = d; d = c; c = a; a = (t1 + t2) | 0;
    }
    [a, c, d, e, f, g, j, l].forEach((v, i) => { h[i] = (h[i] + v) | 0; });
  }
  return h.flatMap(v => [v >>> 24, (v >>> 16) & 255, (v >>> 8) & 255, v & 255]);
}
// Pure JS so PKCE does not depend on Scriptable's Data byte helpers.
function base64url(bytes) {
  const abc = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const n = (bytes[i] << 16) | ((bytes[i + 1] || 0) << 8) | (bytes[i + 2] || 0);
    out += abc[(n >> 18) & 63] + abc[(n >> 12) & 63];
    if (i + 1 < bytes.length) out += abc[(n >> 6) & 63];
    if (i + 2 < bytes.length) out += abc[n & 63];
  }
  return out;
}
function challenge(verifier) {
  return base64url(sha256(Array.from(verifier, c => c.charCodeAt(0))));
}

class LocalStore {
  constructor() {
    this.fm = FileManager.local();
    this.dir = this.fm.joinPath(this.fm.documentsDirectory(), 'FordPassWidgets');
    this.path = this.fm.joinPath(this.dir, 'ford_vehicle_cache.json');
    this.lockPath = this.fm.joinPath(this.dir, 'app.lock');
    this.owner = null;
    configureProfileStore(this);
  }
  readFile(path) { try { return JSON.parse(this.fm.readString(path)); } catch (_) { return null; } }
  read() {
    for (const path of [this.path, this.path + '.bak']) {
      const c = this.readFile(path);
      if (c && c.version === 1 && vinOK(c.vin) && c.fields && typeof c.fields === 'object')
        return parkedLocationEnabled() ? c : clearCachedLocation(c);
    }
    return null;
  }
// Move the actual lock before deciding which record may be removed. FileManager
// has no compare-and-delete operation; a mismatched owner must be restored with
// a no-clobber copy or retained at the displaced path for safe recovery.
  retireLease(expected) {
    const displaced = this.lockPath + '.retired.' + uid();
    let moved = false;
    const restore = () => {
      if (!moved || !this.fm.fileExists(displaced)) return;
      try {
        this.fm.copy(displaced, this.lockPath);
        if (this.fm.readString(this.lockPath) === this.fm.readString(displaced)) this.fm.remove(displaced);
      } catch (_) { /* Keep the displaced record; never overwrite a new owner. */ }
    };
    try {
      if (this.fm.fileExists(displaced)) return false;
      this.fm.move(this.lockPath, displaced); moved = true;
      if (JSON.stringify(this.readFile(displaced)) !== JSON.stringify(expected)) { restore(); return false; }
      this.fm.remove(displaced);
      return true;
    } catch (_) { restore(); return false; }
  }
  async acquire() {
    requireApp();
    if (!this.fm.fileExists(this.dir)) this.fm.createDirectory(this.dir, true);
    const old = this.readFile(this.lockPath);
    if (this.fm.fileExists(this.lockPath)) {
      if (old && old.until > now() && !old.background) {
        // A force-quit leaves the lock behind; only the person at the phone can tell.
        const a = new Alert(); a.title = 'FordWidget is already running';
        a.message = `A run ${old.started ? 'started ' + age(old.started) : 'from earlier'} did not finish. If you closed Scriptable or it got stuck, take over. If another FordWidget run is open right now, cancel.`;
        a.addDestructiveAction('Take over'); a.addCancelAction('Cancel');
        if (await a.presentAlert() < 0) throw new Error('Canceled. Another run still owns the app session.');
      }
      if (!this.retireLease(old)) throw new Error('Another run owns the app session. Try again later.');
    }
    const owner = uid(), temp = this.lockPath + '.' + owner;
    this.fm.writeString(temp, JSON.stringify({ owner, started: now(), until: now() + SETTINGS.lease }));
    // Native copy refuses an existing destination: concurrent app runs fail closed.
    try { this.fm.copy(temp, this.lockPath); this.owner = owner; this.assertLease(); }
    catch (_) { this.owner = null; throw new Error('Another run owns the app session. Try again later.'); }
    finally { try { if (this.fm.fileExists(temp)) this.fm.remove(temp); } catch (_) {} }
  }
  // Evening check from the widget: never waits, never takes an app run's lock.
  acquireBackground() {
    if (!this.fm.fileExists(this.dir)) return false;
    const old = this.readFile(this.lockPath);
    if (this.fm.fileExists(this.lockPath)) {
      if (old && old.until > now()) return false;
      if (!this.retireLease(old)) return false;
    }
    const owner = uid(), temp = this.lockPath + '.' + owner;
    this.fm.writeString(temp, JSON.stringify({ owner, started: now(), until: now() + 90000, background: true }));
    try {
      this.fm.copy(temp, this.lockPath); this.owner = owner; this.background = true; this.assertLease();
      return true;
    } catch (_) { this.owner = null; this.background = false; return false; }
    finally { try { if (this.fm.fileExists(temp)) this.fm.remove(temp); } catch (_) {} }
  }
  assertLease() {
    if (!this.background) requireApp();
    const l = this.readFile(this.lockPath);
    if (!this.owner || !l || l.owner !== this.owner || l.until <= now()) throw new Error('App session expired. Run the script again.');
    // Ownership is immutable until release/takeover/expiry. A stale run must
    // never rewrite this shared file and restore itself over a newer owner.
  }
  release() {
    const l = this.readFile(this.lockPath);
    if (this.owner && l && l.owner === this.owner) this.retireLease(l);
    this.owner = null; this.background = false;
  }
  imagePath(vin, custom) { return this.fm.joinPath(this.dir, `vehicle_${vin}${custom ? '_custom' : ''}.png`); }
  vehicleImage(prefs) {
    if (!prefs || !vinOK(prefs.vin) || prefs.imageMode === 'off') return null;
    const paths = [this.imagePath(prefs.vin, false)];
    if (prefs.imageMode === 'custom') paths.unshift(this.imagePath(prefs.vin, true));
    for (const path of paths) {
      try { if (this.fm.fileExists(path)) { const img = this.fm.readImage(path); if (img) return img; } } catch (_) { /* fall through */ }
    }
    return null;
  }
  writeImage(vin, custom, image) {
    this.assertLease();
    const path = this.imagePath(vin, custom), temp = path.replace(/\.png$/, `.${this.owner}.png`);
    this.fm.writeImage(temp, image);
    if (this.fm.fileExists(path)) this.fm.remove(path);
    this.fm.move(temp, path);
  }
  write(value) {
    this.assertLease();
    if (!parkedLocationEnabled()) { this.purgeLocation(); clearCachedLocation(value); }
    const temp = this.path + '.' + this.owner;
    this.fm.writeString(temp, JSON.stringify(value));
    if (this.fm.fileExists(this.path)) {
      if (this.fm.fileExists(this.path + '.bak')) this.fm.remove(this.path + '.bak');
      this.fm.copy(this.path, this.path + '.bak');
      this.fm.remove(this.path);
    }
    this.fm.move(temp, this.path);
  }
  purgeLocation() {
    this.assertLease();
    let failed = false;
    for (const path of [this.path, this.path + '.bak']) {
      if (!this.fm.fileExists(path)) continue;
      try {
        const c = this.readFile(path);
        if (!c || typeof c !== 'object') this.fm.remove(path);
        else if ((c.fields && Object.prototype.hasOwnProperty.call(c.fields, 'position')) ||
          Object.prototype.hasOwnProperty.call(c, 'place')) this.fm.writeString(path, JSON.stringify(clearCachedLocation(c)));
      } catch (_) {
        // If sanitizing fails, remove that copy rather than leave old coordinates recoverable.
        try { this.fm.remove(path); } catch (__) { failed = true; }
      }
    }
    if (failed) throw new Error('Saved location could not be removed. Try turning Parked location off again.');
  }
}

class APIError extends Error {
  constructor(message, status = 0) { super(message); this.status = status; }
}
class FordAuthManager {
  constructor(store) { this.store = store; this.timeout = SETTINGS.timeout; }
  mobileHeaders(token) {
    return { 'Application-Id': SETTINGS.applicationId, Authorization: `Bearer ${token}` };
  }
  gate(name) {
    const g = secretGet('gate.' + name);
    if (g && g.next > now()) throw new APIError(`${name}: cooling down; try again in ${Math.ceil((g.next - now()) / 60000)} minutes.`);
  }
  async request(name, url, method = 'GET', body = null, headers = {}, encoded = false, allowArray = false) {
    this.store.assertLease(); this.gate(name);
    const requestBinding = profileCopy(this.store.profileBinding);
    assertProfileRequestScope(this.store, name, url, method);
    const r = new Request(url); r.method = method; r.timeoutInterval = this.timeout;
    // Scriptable copies `headers` on assignment: build the complete object first,
    // because mutating r.headers afterwards is silently dropped (Ford answered 415).
    r.headers = Object.assign({ Accept: 'application/json' },
      /^https:\/\/[^/]*\.ford\.com\//i.test(url) ? { 'User-Agent': 'okhttp/4.12.0' } : {},
      body !== null ? { 'Content-Type': encoded ? 'application/x-www-form-urlencoded' : 'application/json' } : {},
      headers);
    // Never follow redirects carrying credentials to another origin.
    r.onRedirect = () => null;
    if (body !== null) r.body = encoded ? form(body) : JSON.stringify(body);
    let status = 0;
    try {
      const raw = await r.loadString();
      assertVehicleRequestBinding(this.store, requestBinding);
      this.store.assertLease();
      status = r.response ? r.response.statusCode : 0;
      if (status < 200 || status >= 300) throw new APIError(`${name}: HTTP ${status}.${name.startsWith('auth.') ? authDetail(raw) : ''}`, status);
      let data;
      try { data = raw.trim() ? JSON.parse(raw) : {}; }
      catch (_) { throw new APIError(`${name}: invalid JSON response.`, status); }
      if (!data || typeof data !== 'object' || (Array.isArray(data) && !allowArray)) throw new APIError(`${name}: invalid response shape.`, status);
      secretRemove('gate.' + name);
      return data;
    } catch (e) {
      assertVehicleRequestBinding(this.store, requestBinding);
      this.backoff(name, status, r, headers);
      // Never surface a raw server body, request URL, password, or token.
      throw e instanceof APIError ? e : new APIError(`${name}: connection failed or timed out; outcome may be unknown.`);
    }
  }
  backoff(name, status, r, headers) {
    // An older run's response must not change the current run's gates or tokens.
    this.store.assertLease();
    if (status === 401) {
      for (const tokenName of ['official', 'mobile', 'autonomic']) {
        const saved = secretGet('token.' + tokenName);
        if (saved && (headers.Authorization === `Bearer ${saved.access}` || headers['auth-token'] === saved.access)) {
          saved.expires = 0; secretSet('token.' + tokenName, saved);
        }
      }
    }
    const prior = secretGet('gate.' + name) || { failures: 0 };
    const failures = Math.min(prior.failures + 1, 10);
    let delay = Math.min(6 * 3600000, 60000 * Math.pow(2, failures - 1));
    const rh = r.response && r.response.headers || {};
    const key = Object.keys(rh).find(k => k.toLowerCase() === 'retry-after');
    const retry = key ? String(rh[key]) : '';
    if (retry) {
      const seconds = finite(retry);
      const until = seconds === null ? Date.parse(retry) : now() + seconds * 1000;
      if (Number.isFinite(until)) delay = Math.max(delay, until - now());
    }
    if (status === 401 || status === 403 || status === 400) delay = Math.max(delay, 15 * 60000);
    secretSet('gate.' + name, { failures, next: now() + delay,
      httpStatus: typeof status === 'number' && Number.isInteger(status) && (status === 0 || status >= 100 && status <= 599) ? status : null, failedAt: now() });
  }
  async requestImage(name, url, headers = {}) {
    this.store.assertLease(); this.gate(name);
    const requestBinding = profileCopy(this.store.profileBinding);
    assertProfileRequestScope(this.store, name, url, 'GET');
    const r = new Request(url); r.method = 'GET'; r.timeoutInterval = this.timeout;
    r.headers = Object.assign({ Accept: 'image/png,image/webp,image/*;q=0.9,application/json;q=0.5' }, headers);
    if (headers['auth-token']) r.onRedirect = () => null;
    let status = 0;
    try {
      const data = await r.load();
      assertVehicleRequestBinding(this.store, requestBinding);
      this.store.assertLease();
      status = r.response ? r.response.statusCode : 0;
      if (status < 200 || status >= 300) throw new APIError(`${name}: HTTP ${status}.`, status);
      const rh = r.response && r.response.headers || {};
      const key = Object.keys(rh).find(k => k.toLowerCase() === 'content-type');
      secretRemove('gate.' + name);
      return { data, type: key ? String(rh[key]).toLowerCase() : '' };
    } catch (e) {
      assertVehicleRequestBinding(this.store, requestBinding);
      this.backoff(name, status, r, headers);
      throw e instanceof APIError ? e : new APIError(`${name}: connection failed or timed out.`);
    }
  }
  saveToken(name, data, previous = null) {
    this.store.assertLease();
    const seconds = finite(data.expires_in);
    if (typeof data.access_token !== 'string' || !data.access_token || seconds === null || seconds <= 60)
      throw new Error(`${name}: missing access token or usable expiry.`);
    const token = { access: data.access_token, refresh: data.refresh_token || (previous && previous.refresh) || null,
      expires: now() + seconds * 1000 };
    secretSet('token.' + name, token); return token.access;
  }
  async token(name) {
    this.store.assertLease();
    const tokenBinding = profileCopy(this.store.profileBinding);
    const saved = secretGet('token.' + name);
    if (saved && saved.expires > now() + 60000) return saved.access;
    let data;
    if (name === 'autonomic') {
      const mobile = await this.token('mobile');
      data = await this.request('auth.autonomic', SETTINGS.autonomicToken, 'POST', {
        subject_token: mobile, subject_issuer: 'fordpass', client_id: 'fordpass-prod',
        grant_type: 'urn:ietf:params:oauth:grant-type:token-exchange',
        subject_token_type: 'urn:ietf:params:oauth:token-type:jwt',
      }, {}, true);
    } else {
      if (!saved || !saved.refresh) throw new Error(`Connect ${name === 'official' ? 'FordConnect' : 'FordPass'} in the app first.`);
      if (name === 'official') {
        const c = secretGet('official');
        if (!c) throw new Error('Configure FordConnect first.');
        data = await this.request('auth.official', SETTINGS.officialToken, 'POST', {
          grant_type: 'refresh_token', refresh_token: saved.refresh, client_id: c.clientId, client_secret: c.clientSecret,
        }, {}, true);
      } else {
        data = await this.request('auth.mobile', SETTINGS.guard + '/token/v2/cat-with-refresh-token', 'POST',
          { refresh_token: saved.refresh }, { 'Application-Id': SETTINGS.applicationId });
      }
    }
    assertVehicleRequestBinding(this.store, tokenBinding);
    return this.saveToken(name, data, saved);
  }
  async oauth(url, redirect, state, credentials = null) {
    requireApp();
    const w = new WebView(); let captured = null, failure = null;
    w.shouldAllowRequest = r => {
      // B2C pages may load about:blank frames; everything else must be HTTPS.
      if (!callbackMatches(r.url, redirect)) return /^(https:\/\/|about:)/i.test(r.url);
      if (captured || failure) return false;
      try {
        const p = query(r.url);
        if (p.error) throw new Error('Ford declined authorization.');
        if (!p.code || p.state !== state) throw new Error('OAuth callback failed state validation.');
        captured = p.code;
      } catch (e) { failure = e; }
      // A WebView cannot dismiss itself, and JS alert() is not shown inside it,
      // so replace Ford's stuck spinner with a page that says what to do next.
      const ok = !failure;
      Timer.schedule(100, false, () => w.loadHTML(`<meta name="viewport" content="width=device-width,initial-scale=1">
        <body style="font:17px -apple-system,sans-serif;text-align:center;padding:80px 24px;color:#111">
        <h2>${ok ? 'Signed in' : 'Sign-in failed'}</h2>
        <p>${ok ? 'Tap <b>Close</b> at the top to finish connecting FordPass.' : 'Tap <b>Close</b> and try again.'}</p></body>`).catch(() => {}));
      return false;
    };
    const loading = w.loadURL(url);
    if (credentials) {
      // Fill only the exact Ford login origin; never auto-submit or bypass MFA.
      const js = `(function(){if(location.origin!==${JSON.stringify(SETTINGS.login)})return;
        const u=document.querySelector('input[name="signInName"],input[type="email"]');
        const p=document.querySelector('input[type="password"]');
        for(const pair of [[u,${JSON.stringify(credentials.username)}],[p,${JSON.stringify(credentials.password)}]]){
          if(pair[0]&&pair[1]){pair[0].value=pair[1];pair[0].dispatchEvent(new Event('input',{bubbles:true}));}}
      })()`;
      loading.then(() => w.evaluateJavaScript(js)).catch(() => {});
    } else loading.catch(() => {});
    await w.present(false);
    this.store.assertLease();
    if (failure) throw failure;
    if (!captured) throw new Error('Authorization canceled. No credentials were exchanged.');
    return captured;
  }
  async signIn(url, redirect, state, credentials) {
    const a = new Alert(); a.title = 'Sign in to Ford';
    a.message = 'Sign in inside Scriptable. When the page says “Signed in”, tap Close. If it stays on Ford’s “Signing in” spinner for over 20 seconds, tap Close anyway: the login usually went through.';
    a.addAction('Sign in here'); a.addAction('Sign in on another device'); a.addCancelAction('Cancel');
    const choice = await a.presentAlert();
    if (choice < 0) return null;
    if (choice === 0) return this.oauth(url, redirect, state, credentials);
    Pasteboard.copy(url);
    await message('Login link copied', 'With Universal Clipboard, paste it on your Mac in Chrome or Brave:\n\n' +
      '1. Open a new tab, then DevTools (⌥⌘I) BEFORE signing in. Network tab: tick Preserve log, type userauthorized in the filter.\n' +
      '2. Paste the link in the address bar and sign in (finish MFA).\n' +
      '3. The page stays on “Signing in”. That is expected.\n' +
      '4. In Network, click the request named like ?code=… or check the Console for Failed to launch \'fordapp://…\'. ' +
      'Copy the full fordapp://userauthorized/?code=… address (Headers → Request URL, or the Location header of the request before it).\n' +
      '5. Come back and paste it within about 10 minutes. Keep Scriptable open meanwhile.');
    const values = await input('Paste Ford redirect', 'Paste the full address that starts with fordapp://userauthorized', [{ label: 'fordapp://userauthorized/?code=…' }]);
    if (!values) return null;
    const pasted = extractRedirect(values[0]);
    if (!callbackMatches(pasted, redirect)) throw new Error('That is not a fordapp://userauthorized address.');
    const p = query(pasted);
    if (p.error) throw new Error('Ford declined authorization.');
    if (!p.code || (p.state && p.state !== state)) throw new Error('The pasted address is missing its code or belongs to a different login attempt.');
    return p.code;
  }
  async connectOfficial() {
    this.store.assertLease(); const officialBinding = profileCopy(this.store.profileBinding);
    const old = secretGet('official') || {};
    const values = await input('FordConnect application', 'Use your approved Ford developer application and exact registered HTTPS callback.', [
      { label: 'Client ID', value: old.clientId }, { label: 'Client Secret', secret: true },
      { label: 'Registered HTTPS redirect URI', value: old.redirect },
    ]);
    if (!values) return;
    assertVehicleRequestBinding(this.store, officialBinding); this.store.assertLease();
    const [clientId, clientSecret, redirect] = values;
    if (!clientId || !clientSecret || !/^https:\/\/[^/?#\s@]+(?:\/[^?#\s]*)?$/.test(redirect))
      throw new Error('Client ID, secret, and a registered HTTPS URI without a query or fragment are required.');
    const state = uid().slice(0, 16), c = { clientId, clientSecret, redirect };
    const code = await this.oauth(SETTINGS.officialAuth + '?' + form({ response_type: 'code', client_id: clientId, redirect_uri: redirect, state }), redirect, state);
    const data = await this.request('auth.official', SETTINGS.officialToken, 'POST', {
      grant_type: 'authorization_code', client_id: clientId, client_secret: clientSecret, redirect_uri: redirect, code,
    }, {}, true);
    if (!data.access_token) throw new Error('FordConnect did not return an access token.');
    const garage = await this.request('garage.official', SETTINGS.officialBase + '/garage', 'GET', null,
      { Authorization: `Bearer ${data.access_token}` });
    const vehicle = secretGet('vehicle');
    if (!vehicle || String(garage.vin || '').toUpperCase() !== vehicle.vin)
      throw new Error('FordConnect consent belongs to a different vehicle. Reconnect and select the configured VIN.');
    this.saveToken('official', data); secretSet('official', c);
    await message('FordConnect connected', 'Choose Fetch telemetry to populate the widget.');
  }
  async connectMobile() {
    this.store.assertLease(); const loginBinding = profileCopy(this.store.profileBinding);
    for (const name of ['auth.b2c', 'auth.mobile', 'auth.autonomic']) secretRemove('gate.' + name);
    const old = secretGet('credentials') || {};
    const values = await input('FordPass login', 'Prefills Ford’s login form for this sign-in. Only the username is saved. Complete MFA/consent in the next screen. Leave password blank to enter it there.', [
      { label: 'FordPass username', value: old.username }, { label: 'Password (optional)', secret: true },
    ]);
    if (!values) return;
    assertVehicleRequestBinding(this.store, loginBinding); this.store.assertLease();
    const credentials = { username: values[0], password: values[1] };
    // Only the username is remembered. The password prefills this one sign-in and is never stored.
    secretSet('credentials', { username: credentials.username });
    const verifier = uid() + uid(), state = uid();
    const base = `${SETTINGS.login}/${SETTINGS.tenant}/${SETTINGS.policy}/oauth2/v2.0`;
    const url = `${base}/authorize?redirect_uri=${SETTINGS.mobileRedirect}&response_type=code&max_age=3600` +
      `&code_challenge=${challenge(verifier)}&code_challenge_method=S256&scope=%20${SETTINGS.mobileClient}%20openid` +
      `&client_id=${SETTINGS.mobileClient}&ui_locales=en-US&language_code=en-US` +
      `&ford_application_id=${SETTINGS.applicationId}&country_code=USA&state=${state}`;
    const code = await this.signIn(url, SETTINGS.mobileRedirect, state, credentials);
    if (!code) return;
    const b2c = await this.request('auth.b2c', base + '/token', 'POST', {
      client_id: SETTINGS.mobileClient, scope: `${SETTINGS.mobileClient} openid`, redirect_uri: SETTINGS.mobileRedirect,
      grant_type: 'authorization_code', resource: '', code, code_verifier: verifier,
    }, {}, true);
    if (!b2c.access_token) throw new Error('Ford login did not return an access token.');
    const mobile = await this.request('auth.mobile', SETTINGS.guard + '/token/v2/cat-with-b2c-access-token', 'POST',
      { idpToken: b2c.access_token }, { 'Application-Id': SETTINGS.applicationId });
    this.saveToken('mobile', mobile); secretRemove('token.autonomic');
    await message('FordPass connected', 'Commands are now available for compatible, authorized vehicles.');
  }
}

// Door/lock aggregates retain their component readings. An unchanged old hood
// timestamp must not prevent a newer door transition from changing the display.
// These are measurement times, never the time a cloud response was fetched.
function componentTime(value) {
  const at = timestamp(value);
  return at !== null && at <= now() ? at : null;
}
function componentReading(old, incoming, kind) {
  if (!old) return incoming;
  const unsafe = reading => ['OPEN', 'AJAR', 'UNLOCKED'].includes(reading.value);
  // Unidentified entries (including overflow evidence) are not the same
  // physical component. Later unnamed safe/unknown values cannot close one.
  if (incoming.id === 'UNIDENTIFIED') {
    if (unsafe(old) && !unsafe(incoming)) return old;
    if (!unsafe(old) && unsafe(incoming)) return incoming;
  }
  const a = old.at || 0, b = incoming.at || 0;
  // An undated unsafe reading cannot be proven older, so it may not lose to a dated safe one.
  if (!b && unsafe(incoming) && !unsafe(old)) return incoming;
  if (b < a) return old;
  if (kind === 'doors' && incoming.value === 'UNKNOWN' && (unsafe(old) || old.unresolvedUnsafe))
    incoming = Object.assign({}, incoming, { unresolvedUnsafe: true });
  if (kind === 'lock' && !incoming.latch && old.latch)
    incoming = Object.assign({}, incoming, { latch: old.latch, value: old.latch === 'MECHANICAL' ? 'IGNORED' : incoming.value });
  if (b > 0 && b === a && incoming.latch === 'MECHANICAL') return incoming;
  const rank = value => ['OPEN', 'AJAR', 'UNLOCKED'].includes(value) ? 2 : value === 'UNKNOWN' ? 1 : 0;
  if (b > a || b === a && rank(incoming.value) > rank(old.value)) return incoming;
  return old;
}
function componentIdentity(entry, hood = false) {
  if (hood) return 'HOOD';
  if (!entry || typeof entry !== 'object' || typeof entry.vehicleDoor !== 'string') return 'UNIDENTIFIED';
  const aliases = { LEFT_FRONT: 'FRONT_LEFT', RIGHT_FRONT: 'FRONT_RIGHT', LEFT_REAR: 'REAR_LEFT', RIGHT_REAR: 'REAR_RIGHT' };
  const door = aliases[entry.vehicleDoor] || entry.vehicleDoor;
  if (!/^[A-Z_]{1,40}$/.test(door)) return 'UNIDENTIFIED';
  if (['UNSPECIFIED_DOOR', 'UNKNOWN_DOOR'].includes(door)) return 'UNIDENTIFIED';
  if (!['UNSPECIFIED_FRONT', 'UNSPECIFIED_REAR'].includes(door)) return door;
  const selectors = [entry.vehicleSide, entry.vehicleOccupantRole].filter(value => ['DRIVER', 'PASSENGER'].includes(value));
  return selectors.length && selectors.every(value => value === selectors[0]) ? door + '|' + selectors[0] : 'UNIDENTIFIED';
}
function componentAdd(readings, incoming, kind) {
  const found = readings.findIndex(reading => reading.id === incoming.id);
  if (found >= 0) { readings[found] = componentReading(readings[found], incoming, kind); return false; }
  if (readings.length < 64) { readings.push(incoming); return false; }
  let marker = readings.findIndex(reading => reading.id === 'UNIDENTIFIED');
  if (marker < 0) marker = readings.findIndex(reading => !['HOOD', 'ALL_DOORS'].includes(reading.id));
  const evidence = [readings[marker], incoming], unsafe = evidence.filter(reading => ['OPEN', 'AJAR', 'UNLOCKED'].includes(reading.value));
  const selected = (unsafe.length ? unsafe : evidence).reduce((chosen, reading) => (reading.at || 0) > (chosen.at || 0) ? reading : chosen);
  readings[marker] = { id: 'UNIDENTIFIED', value: unsafe.length ? selected.value : 'UNKNOWN', at: selected.at, source: selected.source,
    latch: null, unresolvedUnsafe: evidence.some(reading => reading.unresolvedUnsafe || ['OPEN', 'AJAR'].includes(reading.value)) };
  return true;
}
function componentPacket(kind, entries, source, fetchedAt, doorList = false, hood = false) {
  const readings = [];
  let truncated = false;
  for (const item of entries.slice(0, 64)) {
    const entry = item.entry, id = componentIdentity(entry, item.hood);
    const latchValues = kind === 'lock' && entry ? [entry.doorLatchType, entry.tags && entry.tags.DOOR_LATCH_TYPE] : [];
    const latch = latchValues.includes('MECHANICAL') ? 'MECHANICAL' : latchValues.includes('ELECTRONIC') ? 'ELECTRONIC' : null;
    const mechanical = latch === 'MECHANICAL';
    if (mechanical && id === 'UNIDENTIFIED') continue;
    const allowed = kind === 'lock' ? ['LOCKED', 'DOUBLE_LOCKED', 'UNLOCKED'] : ['CLOSED', 'OPEN', 'AJAR'];
    let value = mechanical ? 'IGNORED' : entry && allowed.includes(entry.value) ? entry.value : 'UNKNOWN';
    // An unnamed closed component cannot establish which previously open door
    // closed. Keep it unknown instead of assigning identity by array position.
    if (id === 'UNIDENTIFIED' && !['OPEN', 'AJAR', 'UNLOCKED', 'IGNORED'].includes(value)) value = 'UNKNOWN';
    const incoming = { id, value, at: componentTime(entry && entry.updateTime), source, latch,
      unresolvedUnsafe: kind === 'doors' && ['OPEN', 'AJAR'].includes(value) };
    truncated = componentAdd(readings, incoming, kind) || truncated;
  }
  if (entries.length > 64) {
    componentAdd(readings, { id: 'UNIDENTIFIED', value: 'UNKNOWN', at: null, source, latch: null }, kind); truncated = true;
  }
  return componentField(kind, { version: 1, readings, doorList, hood, truncated, legacy: null }, fetchedAt);
}
function componentResult(kind, readings) {
  const active = readings.filter(reading => reading.value !== 'IGNORED');
  const result = (value, selected, contributors = selected ? [selected] : []) => {
    const item = selected || null;
    const measured = contributors.length && contributors.every(reading => typeof reading.at === 'number' &&
      Number.isFinite(reading.at) && reading.at > 0 && reading.at <= now());
    return { value, at: item && item.at || null, source: item && item.source || null,
      measurementAt: measured && item ? item.at : null };
  };
  const newest = list => list.reduce((chosen, item) => !chosen || (item.at || 0) > (chosen.at || 0) ? item : chosen, null);
  const oldest = list => list.length && list.every(item => item.at) ? list.reduce((chosen, item) => !chosen || item.at < chosen.at ? item : chosen, null) : null;
  const individual = active.filter(item => item.id !== 'ALL_DOORS'), all = kind === 'lock' && active.find(item => item.id === 'ALL_DOORS');
  if (all) {
    const newer = individual.filter(item => !all.at || !item.at || item.at >= all.at);
    const unlocked = newer.filter(item => item.value === 'UNLOCKED');
    if (unlocked.length) return result('Unlocked', newest(unlocked));
    const unknown = newer.filter(item => item.value === 'UNKNOWN');
    if (unknown.length) return result('Unknown', newest(unknown));
    // The feed does not declare a complete physical lock inventory. Individual
    // locked readings cannot clear or freshen a whole-vehicle aggregate.
    const value = all.value === 'UNLOCKED' ? 'Unlocked' : ['LOCKED', 'DOUBLE_LOCKED'].includes(all.value) ? 'Locked' : 'Unknown';
    return result(value, all, value === 'Locked' ? active : [all]);
  }
  const allDoors = kind === 'doors' && active.find(item => item.id === 'ALL_DOORS');
  if (allDoors) {
    const hood = active.find(item => item.id === 'HOOD');
    const newer = active.filter(item => item.id !== 'ALL_DOORS' && (item.id === 'HOOD' || !allDoors.at || !item.at || item.at >= allDoors.at));
    const unsafe = newer.filter(item => ['OPEN', 'AJAR'].includes(item.value));
    if (['OPEN', 'AJAR'].includes(allDoors.value)) unsafe.push(allDoors);
    if (unsafe.length) return result('Ajar', newest(unsafe));
    const unknown = newer.filter(item => item.value === 'UNKNOWN');
    if (allDoors.value === 'UNKNOWN') unknown.push(allDoors);
    if (unknown.length || !hood) return result('Unknown', newest(unknown));
    return result('Closed', oldest([allDoors, hood]), active);
  }
  const unsafe = active.filter(item => kind === 'lock' ? item.value === 'UNLOCKED' : ['OPEN', 'AJAR'].includes(item.value));
  if (unsafe.length) return result(kind === 'lock' ? 'Unlocked' : 'Ajar', newest(unsafe));
  const unknown = active.filter(item => item.value === 'UNKNOWN');
  if (unknown.length || !active.length) return result('Unknown', newest(unknown));
  return result(kind === 'lock' ? 'Locked' : 'Closed', oldest(active), active);
}
function componentField(kind, components, fetchedAt) {
  let derived = componentResult(kind, components.readings);
  if (kind === 'doors' && (!components.doorList || !components.hood) && derived.value === 'Closed')
    derived = { value: 'Unknown', at: null, source: derived.source, measurementAt: null };
  const legacy = components.legacy;
  if (legacy) {
    const covers = item => item && componentTime(item.at) !== null && (!legacy.at || item.at >= legacy.at);
    const whole = components.readings.find(item => item.id === 'ALL_DOORS'), hood = components.readings.find(item => item.id === 'HOOD');
    const wholeHealthy = covers(whole) && (kind === 'lock' ? ['LOCKED', 'DOUBLE_LOCKED'].includes(whole.value) :
      whole.value === 'CLOSED' && covers(hood) && hood.value === 'CLOSED');
    const legacyHealthy = legacy.value === (kind === 'lock' ? 'Locked' : 'Closed');
    if (wholeHealthy || legacyHealthy && componentTime(derived.at) !== null && (!legacy.at || derived.at >= legacy.at)) components.legacy = null;
    else if (legacyHealthy) derived = { value: legacy.value, at: legacy.at, source: legacy.source, measurementAt: legacy.measurementAt || null };
    else if (!(derived.value === (kind === 'lock' ? 'Unlocked' : 'Ajar') && componentTime(derived.at) !== null && (!legacy.at || derived.at >= legacy.at)))
      derived = { value: 'Unknown', at: null, source: legacy.source, measurementAt: null };
  }
  return Object.assign(derived, { fetchedAt, componentStatus: components });
}
function mergeComponentField(kind, previous, official, mobile) {
  const components = { version: 1, readings: [], doorList: false, hood: false, truncated: false, legacy: null };
  let fetchedAt = null;
  for (const [index, field] of [previous, official, mobile].entries()) {
    if (!field || typeof field !== 'object') continue;
    if (typeof field.fetchedAt === 'number' && Number.isFinite(field.fetchedAt)) fetchedAt = Math.max(fetchedAt || 0, field.fetchedAt);
    const packet = field.componentStatus;
    if (!packet || packet.version !== 1 || !Array.isArray(packet.readings)) {
      if (index === 0) components.legacy = { value: field.value, at: componentTime(field.at), source: field.source,
        measurementAt: typeof field.measurementAt === 'number' && field.measurementAt > 0 && field.measurementAt <= now() ? timestamp(field.measurementAt) : null };
      continue;
    }
    if (index === 0 && packet.legacy) components.legacy = {
      value: packet.legacy.value, at: componentTime(packet.legacy.at),
      source: ['FordPass', 'FordConnect'].includes(packet.legacy.source) ? packet.legacy.source : null,
      measurementAt: typeof packet.legacy.measurementAt === 'number' && packet.legacy.measurementAt > 0 && packet.legacy.measurementAt <= now() ? timestamp(packet.legacy.measurementAt) : null
    };
    components.doorList = components.doorList || packet.doorList === true;
    components.hood = components.hood || packet.hood === true;
    components.truncated = components.truncated || packet.truncated === true;
    for (const reading of packet.readings.slice(0, 64)) {
      const allowed = kind === 'lock' ? ['LOCKED', 'DOUBLE_LOCKED', 'UNLOCKED', 'UNKNOWN', 'IGNORED'] : ['CLOSED', 'OPEN', 'AJAR', 'UNKNOWN'];
      if (!reading || typeof reading.id !== 'string' || !/^[A-Z_]{1,40}(?:\|(?:DRIVER|PASSENGER))?$/.test(reading.id) || !allowed.includes(reading.value) ||
          reading.id === 'UNIDENTIFIED' && reading.value === 'IGNORED') continue;
      const incoming = { id: reading.id, value: reading.value, at: componentTime(reading.at),
        source: ['FordPass', 'FordConnect'].includes(reading.source) ? reading.source : null,
        latch: kind === 'lock' && ['MECHANICAL', 'ELECTRONIC'].includes(reading.latch) ? reading.latch : null,
        unresolvedUnsafe: kind === 'doors' && (reading.unresolvedUnsafe === true || ['OPEN', 'AJAR'].includes(reading.value)) };
      components.truncated = componentAdd(components.readings, incoming, kind) || components.truncated;
    }
    if (packet.readings.length > 64) {
      componentAdd(components.readings, { id: 'UNIDENTIFIED', value: 'UNKNOWN', at: null, source: null, latch: null }, kind); components.truncated = true;
    }
  }
  return componentField(kind, components, fetchedAt);
}

// FordConnect and the modern FordPass payload both use the Autonomic metrics schema.
function normalize(payload, vin, source, fetchedAt) {
  const root = vehicleTelemetryRoot(payload, vin);
  if (!root || !root.metrics || typeof root.metrics !== 'object') throw new Error(`${source}: unsupported telemetry schema.`);
  if (root.vin && String(root.vin).toUpperCase() !== vin) throw new Error('Telemetry VIN does not match configured vehicle.');
  const m = root.metrics, out = {};
  const put = (key, value, entry) => {
    if (value === null || value === undefined) return;
    out[key] = { value, at: timestamp(entry && entry.updateTime) || timestamp(root.updateTime) || null, source, fetchedAt };
  };
  for (const [field, key, max] of [['fuel', 'fuelLevel', 100], ['oil', 'oilLifeRemaining', 100], ['battery', 'batteryStateOfCharge', 100]]) {
    const e = m[key]; put(field, field === 'fuel' ? fordFuelPercent(e && e.value) : bounded(e && e.value, max), e);
    if (field === 'fuel' && out.fuel) out.fuel.rawValue = finite(e && e.value);
  }
  for (const [field, key] of [['range', 'fuelRange'], ['odometer', 'odometer']]) {
    const e = m[key], v = bounded(e && e.value, 1e8);
    const unit = String(e && (e.unit || e.unitSymbol) || 'km').toLowerCase();
    const factor = ['km', 'kilometer', 'kilometers'].includes(unit) ? 0.621371192 : ['mi', 'mile', 'miles'].includes(unit) ? 1 : null;
    put(field, v !== null && factor !== null ? v * factor : null, e);
  }
  const health = m.batteryLoadStatus;
  if (health && (!health.vehicleBattery || health.vehicleBattery === 'PRIMARY_BATTERY') && typeof health.value === 'string')
    put('batteryHealth', health.value, health);
  const positions = { FRONT_LEFT: 'fl', FRONT_RIGHT: 'fr', REAR_LEFT: 'rl', REAR_RIGHT: 'rr', LEFT_FRONT: 'fl', RIGHT_FRONT: 'fr', LEFT_REAR: 'rl', RIGHT_REAR: 'rr' };
  for (const t of Array.isArray(m.tirePressure) ? m.tirePressure : []) {
    const field = positions[t.vehicleWheel], v = bounded(t.value, 2000);
    const unit = String(t.unit || t.unitSymbol || 'kPa').toLowerCase();
    const factor = unit === 'kpa' ? 1 / 6.894757293 : unit === 'bar' ? 14.5037738 : unit === 'psi' ? 1 : null;
    if (field) put(field, v !== null && factor !== null ? bounded(v * factor, 150) : null, t);
  }
  if (Array.isArray(m.doorLockStatus) && m.doorLockStatus.length)
    out.lock = componentPacket('lock', m.doorLockStatus.map(entry => ({ entry })), source, fetchedAt);
  const doorList = Array.isArray(m.doorStatus), doors = (doorList ? m.doorStatus.map(entry => ({ entry })) : [])
    .concat(m.hoodStatus ? [{ entry: m.hoodStatus, hood: true }] : []);
  if (doors.length) out.doors = componentPacket('doors', doors, source, fetchedAt, doorList && m.doorStatus.length > 0, !!m.hoodStatus);
  const temp = m.outsideTemperature, celsius = temp ? finite(temp.value) : null;
  put('outsideTemp', celsius !== null && celsius > -60 && celsius < 70 ? celsius : null, temp);
  const pos = m.position, loc = pos && pos.value && pos.value.location;
  if (loc) {
    const lat = finite(loc.lat), lon = finite(loc.lon);
    if (lat !== null && lon !== null && Math.abs(lat) <= 90 && Math.abs(lon) <= 180 && (lat || lon)) put('position', { lat, lon }, pos);
  }
  // Ford's countdown is seconds remaining as of the metric's own updateTime.
  const rs = m.remoteStartCountdownTimer, rsv = rs ? finite(rs.value) : null;
  if (rsv !== null) {
    const from = timestamp(rs.updateTime) || timestamp(root.updateTime) || fetchedAt;
    put('remoteStart', { until: rsv > 0 ? from + rsv * 1000 : 0 }, rs);
  }
  const ign = m.ignitionStatus;
  if (ign && typeof ign.value === 'string') put('ignition', ign.value.toUpperCase(), ign);
  vehicleTelemetryExtras(root, vin, source, fetchedAt, out);
  if (!Object.keys(out).length) throw new Error(`${source}: no supported telemetry measurements.`);
  return out;
}
function mergeFields(previous, official, mobile) {
  const result = Object.assign({}, previous);
  for (const key of Object.keys(FIELD_NAMES)) {
    const a = official[key], b = mobile[key];
    if (['lock', 'doors'].includes(key) && [previous[key], a, b].some(field => field && field.componentStatus)) {
      result[key] = mergeComponentField(key, previous[key], a, b); continue;
    }
    const candidate = a && b ? ((b.at || 0) > (a.at || 0) ? b : a) : a || b;
    if (!candidate) continue;
    const old = result[key];
    if (!old || !old.at || (candidate.at && candidate.at >= old.at)) result[key] = candidate;
  }
  const inventory = vehicleMergeWheelPressures(previous.wheelPressures, official.wheelPressures, mobile.wheelPressures);
  if (inventory) result.wheelPressures = inventory;
  return result;
}

function meters(a, b) {
  const r = Math.PI / 180, dLat = (b.lat - a.lat) * r, dLon = (b.lon - a.lon) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLon / 2) ** 2;
  return 12742000 * Math.asin(Math.sqrt(h));
}
const fahrenheit = c => Math.round(c * 9 / 5 + 32);
function nightSettings(prefs) {
  const n = (prefs && prefs.night) || {};
  return { enabled: n.enabled !== false, hour: Number.isInteger(n.hour) ? n.hour : 21, notifyOk: !!n.notifyOk };
}
// What the evening check reports. Only readings Ford actually sent are judged.
function alertSettings(prefs) {
  const a = (prefs && prefs.alerts) || {};
  const valid = (v, fallback, max) => Number.isFinite(v) && v >= 0 && v <= max ? v : fallback;
  return { enabled: Object.assign({ lock: true, doors: true, tires: true, fuel: true, oil: true, battery: true, engine: true }, a.enabled || {}),
    tire: valid(a.tire, SETTINGS.lowTire, 100), fuel: valid(a.fuel, 15, 100), oil: valid(a.oil, 10, 100), battery: valid(a.battery, 50, 100), attention: a.attention === true };
}
function nightProblems(f, prefs) {
  const options = alertSettings(prefs), enabled = options.enabled;
  const v = k => f[k] && f[k].value !== null && f[k].value !== undefined ? f[k].value : null;
  const out = [];
  if (enabled.lock && v('lock') === 'Unlocked') out.push('Unlocked');
  if (enabled.doors && v('doors') === 'Ajar') out.push('Door, hood or tailgate open');
  const low = ['fl', 'fr', 'rl', 'rr'].filter(k => finite(v(k)) !== null && v(k) < options.tire);
  if (enabled.tires && low.length) out.push('Low tire ' + low.map(k => displayUnitLowTire(k, v(k), prefs)).join(', '));
  if (enabled.fuel && finite(v('fuel')) !== null && v('fuel') < options.fuel) out.push(`Fuel ${Math.round(v('fuel'))}%`);
  if (enabled.oil && finite(v('oil')) !== null && v('oil') <= options.oil) out.push(`Oil life ${Math.round(v('oil'))}%`);
  const health = v('batteryHealth');
  if (enabled.battery && finite(v('battery')) !== null && v('battery') < options.battery) out.push(`12V battery ${Math.round(v('battery'))}%`);
  else if (enabled.battery && typeof health === 'string' && /LOW|WEAK|BAD|CRITICAL|REPLACE/i.test(health)) out.push('12V battery ' + health.toLowerCase().replace(/_/g, ' '));
  const rs = v('remoteStart');
  if (enabled.engine && rs && rs.until > now()) out.push('Engine running (remote start)');
  return out;
}
// A fresh cloud response can contain only fuel or another unrelated metric.
// Confirm each security reading's own measurement time before an all-good notice.
function nightSecurityFresh(fields, at = now()) {
  return [['lock', 'Locked'], ['doors', 'Closed']].every(([key, value]) => {
    const reading = fields && fields[key], time = reading && reading.measurementAt;
    return reading && reading.value === value && typeof time === 'number' && Number.isFinite(time) &&
      time > 0 && time <= at && time >= at - 5 * 60000;
  });
}

// Only Ford's own hosts may receive the FordPass token when downloading images.
function isFordHost(url) { return /^https:\/\/(?:[a-z0-9-]+\.)*ford\.com(?::\d{1,5})?(?:[/?#]|$)/i.test(url || ''); }
function findVehicleImageUrl(garage, vin) {
  const list = Array.isArray(garage) ? garage
    : (garage && garage.userVehicles && garage.userVehicles.vehicleDetails) || (garage && (garage.vehicles || garage.vehicleProfile)) || [];
  const v = (Array.isArray(list) ? list : []).find(x => x && String(x.vin || x.VIN || '').toUpperCase() === vin);
  const p = v && (v.profile || v);
  const url = p && (p.vehicleImage || p.vehicleImageUrl || p.imageUrl);
  return typeof url === 'string' && /^https:\/\//i.test(url) ? url : null;
}
// The image service may answer with bytes, a link, or base64 inside JSON.
function findImageRef(node, depth = 0) {
  if (depth > 5 || node === null || node === undefined) return null;
  if (typeof node === 'string') {
    if (/^https:\/\//i.test(node)) return { url: node };
    const b = node.replace(/^data:image\/[a-z+]+;base64,/i, '');
    return b.length > 1000 && /^[A-Za-z0-9+/=\s]+$/.test(b) ? { base64: b } : null;
  }
  if (typeof node === 'object') for (const v of Object.values(node)) { const f = findImageRef(v, depth + 1); if (f) return f; }
  return null;
}
function downscale(img, maxWidth) {
  const s = img.size;
  if (s.width <= maxWidth) return img;
  const d = new DrawContext(); d.size = new Size(maxWidth, Math.round(s.height * maxWidth / s.width));
  d.opaque = false; d.respectScreenScale = false;
  d.drawImageInRect(img, new Rect(0, 0, d.size.width, d.size.height));
  return d.getImage();
}

class FordAPIClient {
  constructor(auth, store, prefs) { assertVehicleClientBinding(auth, store, prefs); this.auth = auth; this.store = store; this.prefs = prefs; }
  async mobileTelemetry() {
    const token = await this.auth.token('autonomic');
    return this.auth.request('telemetry.mobile', `${SETTINGS.autonomic}/telemetry/sources/fordpass/vehicles/${this.prefs.vin}`, 'GET', null, this.auth.mobileHeaders(token));
  }
  async getVehicleStatus(force = false) {
    this.store.assertLease();
    if (!parkedLocationEnabled(this.prefs) || !parkedLocationEnabled()) this.store.purgeLocation();
    let c = this.store.read();
    if (!c || c.vin !== this.prefs.vin) c = { version: 1, vin: this.prefs.vin, fields: {} };
    if (!force && c.nextFetch > now()) return { cache: c, note: 'Cloud reads are cooling down. Showing cached data.' };
    c.nextFetch = now() + SETTINGS.fetchInterval; this.store.write(c);
    let official = {}, mobile = {}, errors = [];
    if (secretGet('token.official')) {
      try {
        const token = await this.auth.token('official');
        const raw = await this.auth.request('telemetry.official', SETTINGS.officialBase + '/telemetry', 'GET', null, { Authorization: `Bearer ${token}` });
        official = normalize(raw, this.prefs.vin, 'FordConnect', now());
      } catch (e) { errors.push(e.message); }
    }
    if (Object.keys(official).length < Object.keys(FIELD_NAMES).length && secretGet('token.mobile')) {
      try { mobile = normalize(await this.mobileTelemetry(), this.prefs.vin, 'FordPass', now()); }
      catch (e) { errors.push(e.message); }
    }
    if (!Object.keys(official).length && !Object.keys(mobile).length) {
      c.notice = errors.join('\n') || 'Connect FordConnect or FordPass first.';
      this.store.write(c); return { cache: c, note: c.notice + '\nShowing cached data.' };
    }
    c.fields = mergeFields(c.fields, official, mobile); c.fetchedAt = now();
    // Parked location is opt-out; when off, no coordinates are kept at all.
    if (!widgetOptions(this.prefs, '').show.parked) { delete c.fields.position; delete c.place; }
    c.notice = errors.join('\n'); this.store.write(c);
    return { cache: c, note: errors.length ? 'Some sources failed; available telemetry was saved.\n' + c.notice : 'Cloud telemetry saved. This did not wake the modem.' };
  }
  // Street name for the parked spot. Apple's geocoder, app runs only, only when the vehicle moved.
  async updatePlace() {
    this.store.assertLease();
    const c = this.store.read(), p = c && c.fields && c.fields.position && c.fields.position.value;
    if (!p || (c.place && meters(c.place, p) < 50 && c.place.label)) return;
    let label = null;
    try {
      const g = (await Location.reverseGeocode(p.lat, p.lon) || [])[0];
      if (g) label = [g.subThoroughfare && g.thoroughfare ? `${g.subThoroughfare} ${g.thoroughfare}` : g.thoroughfare || g.name, g.locality]
        .filter(Boolean).join(', ') || null;
    } catch (_) { /* keep coordinates only */ }
    c.place = { lat: p.lat, lon: p.lon, label, at: now() }; this.store.write(c);
  }
  async fetchImage(name, url, headers, depth = 0) {
    const { data, type } = await this.auth.requestImage(name, url, headers);
    let img = /json|text/.test(type) ? null : Image.fromData(data);
    if (!img) {
      let ref = null;
      try { ref = findImageRef(JSON.parse(data.toRawString())); } catch (_) { /* not JSON */ }
      if (ref && ref.base64) img = Image.fromData(Data.fromBase64String(ref.base64));
      else if (ref && ref.url && depth === 0) return this.fetchImage(name + '.link', ref.url, isFordHost(ref.url) ? headers : {}, 1);
    }
    if (!img || !img.size || img.size.width < 40) throw new Error(`${name}: response was not a usable image.`);
    return downscale(img, SETTINGS.imageMaxWidth);
  }
  async updateVehicleImage(force = false) {
    this.store.assertLease();
    const vin = this.prefs.vin, angle = this.prefs.imageAngle || null;
    let c = this.store.read();
    if (!c || c.vin !== vin) c = { version: 1, vin, fields: {} };
    const meta = c.image;
    if (!force && meta && meta.angle === angle && meta.at > now() - SETTINGS.imageMaxAge &&
      this.store.fm.fileExists(this.store.imagePath(vin, false))) return null;
    if (!secretGet('token.mobile')) throw new Error('Connect FordPass first. Ford only serves your vehicle’s photo to a signed-in account.');
    const h = { 'auth-token': await this.auth.token('mobile'), 'Application-Id': SETTINGS.applicationId };
    const garage = async () => {
      const g = await this.auth.request('image.garage', SETTINGS.garage, 'GET', null,
        Object.assign({ countryCode: 'USA', locale: 'en-US' }, h), false, true);
      const url = findVehicleImageUrl(g, vin);
      if (!url) throw new Error('FordPass garage has no photo link for this VIN.');
      return { img: await this.fetchImage('image.profile', url, isFordHost(url) ? h : {}), source: 'FordPass garage' };
    };
    const service = async () => {
      const view = angle || 4;
      for (const size of ['full', 'thumbnail']) {
        try {
          const img = await this.fetchImage('image.service.' + size, SETTINGS.imageService + '?' + form({ key: `${vin}-${view}-${size}` }), h);
          return { img, source: `Ford image service (view ${view})` };
        } catch (e) { if (size === 'thumbnail') throw e; }
      }
    };
    // A chosen angle can only come from the image service; the garage photo has one fixed view.
    const errors = [];
    for (const attempt of angle ? [service, garage] : [garage, service]) {
      try {
        const found = await attempt();
        this.store.writeImage(vin, false, found.img);
        c.image = { angle, source: found.source, at: now() }; this.store.write(c);
        return found.source;
      } catch (e) { errors.push(e.message); }
    }
    throw new Error('Ford did not return a photo for this vehicle.\n' + errors.join('\n'));
  }
  receipt(data) {
    const state = String(data.currentStatus || data.status || '').toLowerCase();
    if (['failed', 'failure', 'expired', 'rejected', 'error'].includes(state)) throw new Error('Ford rejected the command.');
    if (typeof data.id !== 'string' || !data.id) throw new Error('No command receipt returned; outcome unknown. Do not retry immediately.');
    return { id: data.id, state: state || 'accepted' };
  }
  async postCommand(vin, command, token) {
    this.store.assertLease();
    const scope = command === 'refresh' ? 'commands.generalStatus' : 'commands';
    const data = await this.auth.request(scope, `${SETTINGS.autonomic}/command/vehicles/${vin}/commands`, 'POST',
      { properties: {}, tags: {}, type: COMMANDS[command], wakeUp: true }, this.auth.mobileHeaders(token));
    return this.receipt(data);
  }
  async sendCommand(vin, command) {
    this.store.assertLease();
    if (vin !== this.prefs.vin || !vinOK(vin) || !Object.prototype.hasOwnProperty.call(COMMANDS, command)) throw new Error('Invalid VIN or command.');
    const token = await this.auth.token('autonomic');
    this.auth.gate('commands');
    if (command === 'refresh') this.auth.gate('commands.generalStatus');
    let c = this.store.read() || { version: 1, vin, fields: {} };
    if (c.vin !== vin) throw new Error('Cache vehicle mismatch.');
    if (c.commandAfter > now()) throw new Error('A command was just sent. Wait at least 30 seconds.');
    if (command === 'refresh' && c.wakeAfter > now()) throw new Error('Wake cooldown active. Wait 15 minutes between wake attempts.');
    if (command === 'start' && c.fields.doors && (c.fields.doors.value === 'Ajar' ||
        c.fields.doors.componentStatus && (c.fields.doors.componentStatus.legacy && c.fields.doors.componentStatus.legacy.value === 'Ajar' ||
          c.fields.doors.value === 'Unknown' && c.fields.doors.componentStatus.readings.some(reading => reading.unresolvedUnsafe))))
      throw new Error('Door/hood status is ajar or a prior ajar reading is unresolved. Check the vehicle before remote start.');
    // Persist before dispatch: a killed process or ambiguous timeout must not replay.
    c.commandAfter = now() + SETTINGS.commandInterval;
    if (command === 'refresh') c.wakeAfter = now() + SETTINGS.wakeInterval;
    c.lastCommand = { action: command, at: now(), outcome: 'Dispatching; outcome unknown' }; this.store.write(c);
    try {
      let receipt;
      if (command === 'start') {
        const lock = await this.postCommand(vin, 'lock', token);
        c.lastCommand = { action: 'start', at: now(), outcome: 'Lock accepted; engine not started', id: lock.id }; this.store.write(c);
        let locked = ['success', 'succeeded', 'completed'].includes(lock.state);
        for (let attempt = 0; !locked && attempt < SETTINGS.lockPollAttempts; attempt++) {
          await new Promise(resolve => Timer.schedule(SETTINGS.lockPollDelay, false, resolve));
          const raw = await this.mobileTelemetry();
          const state = raw.states && raw.states.lockCommand;
          if (state && state.commandId === lock.id) {
            const result = String(state.value && state.value.toState || '').toLowerCase();
            if (['failed', 'expired', 'rejected'].includes(result)) throw new Error('Lock failed. Engine start was not sent.');
            locked = result === 'success';
          }
        }
        if (!locked) throw new Error('Lock completion was not confirmed. Engine start was not sent. Check FordPass before trying again.');
        receipt = await this.postCommand(vin, 'start', token);
      } else receipt = await this.postCommand(vin, command, token);
      c.lastCommand = { action: command, at: now(), id: receipt.id, outcome: 'Accepted; completion unverified' };
      // Estimated until Ford's own countdown arrives with the next read.
      if (command === 'start') c.startRun = { at: now(), until: now() + SETTINGS.startMinutes * 60000, estimated: true };
      // Stop acceptance isn't engine-off telemetry: keep the countdown until newer telemetry or expiry.
      c.nextFetch = 0; this.store.write(c);
      return `${command === 'refresh' ? 'Wake/status refresh' : command} request accepted by Ford.\nReceipt: ${receipt.id}\nVehicle completion is unverified. Fetch telemetry later to check.`;
    } catch (e) {
      c.lastCommand.outcome = e.message; this.store.write(c); throw e;
    }
  }
}

// Portable data parser only. These exact names were reviewed by the user.
// Units, scale factors, enum meanings and sentinel codes remain unverified.
function parsePttbStatusV2(raw) {
  const allowed = [
    'DcacEngOnMsgTxtDRq', 'DcacLoFuelMsgTxtDRq', 'DcacElPwDStat',
    'DcacOutPwDsplyMx', 'DcacHwDConfg', 'DcacOutETot',
    'DcacOut1Pw2Dsply', 'DcacOut2Pw2Dsply', 'DcacFaltMsgTxtD2Rq',
    'DcacEngOnMsgTxtD2Rq', 'DcacOutScndPw2Dsply', 'DcacOutScndPwDsplyMx',
    'DcacZone2PwBStat', 'DcacZone3PwBStat', 'VehElRngeL2Dsply',
    'RngPerChrgAvgL2Dsply', 'DcacLoFuelLimLRqMnu', 'DcacPwRsrvSetDStat'
  ];
  const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
  const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
  const child = (value, key) => record(value) && own(value, key) ? value[key] : undefined;
  if (!record(raw)) return null;
  const root = own(raw, 'vehicleStatus') ? raw.vehicleStatus : raw;
  const command = child(child(child(root, 'states'), 'commands'), 'updatePTTBStatusCommand');
  const oem = child(child(command, 'value'), 'oemData');
  const encoded = child(child(oem, 'pttbStatusDataV2'), 'stringValue');
  if (typeof encoded !== 'string' || encoded.length > 32768) return null;
  let decoded;
  try { decoded = JSON.parse(encoded); } catch (_) { return null; }
  if (!record(decoded)) return null;

  const rawSignals = Object.create(null);
  const rejectedSignals = [];
  let recognizedSignalCount = 0;
  for (const key of allowed) {
    if (!own(decoded, key)) continue;
    recognizedSignalCount += 1;
    const value = decoded[key];
    if (typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= Number.MAX_SAFE_INTEGER) rawSignals[key] = value;
    else rejectedSignals.push(key);
  }
  if (!recognizedSignalCount) return null;
  return {
    source: 'pttbStatusDataV2',
    units: 'unverified raw signals; no scaling applied',
    sentinels: 'unverified',
    rawSignals,
    rejectedSignals,
    recognizedSignalCount
  };
}

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


// Display options: app-wide defaults from Customize widgets, overridable per widget
// through its Parameter, e.g. "controls", "fuel tires lock", "-photo", "bar".
const METRICS = Object.freeze({ photo: 'Vehicle photo', fuel: 'Fuel & range', battery: '12V battery',
  evSoc: 'EV charge level', evRange: 'EV range', plugStatus: 'Plug status', chargeStatus: 'Charging status', tires: 'Tire pressures',
  oil: 'Oil life', lock: 'Lock state', odometer: 'Odometer', doors: 'Doors', temp: 'Outside temperature',
  parked: 'Parked location', ppoa: 'Pro Power A (estimated)', ppob: 'Pro Power B (estimated)',
  ppototal: 'Pro Power total (estimated)', ppocapacity: 'Pro Power capacity (estimated)' });
const METRIC_ALIASES = Object.freeze({ picture: 'photo', image: 'photo', truck: 'photo', range: 'fuel', '12v': 'battery',
  ev: 'evSoc', evsoc: 'evSoc', charge: 'evSoc', evrange: 'evRange', plug: 'plugStatus', plugstatus: 'plugStatus', charging: 'chargeStatus', chargestatus: 'chargeStatus',
  tire: 'tires', tpms: 'tires', psi: null, locks: 'lock', odo: 'odometer', miles: 'odometer', door: 'doors',
  weather: 'temp', temperature: 'temp', location: 'parked', gps: 'parked', map: 'parked',
  ppo: 'ppototal', propower: 'ppototal', generator: 'ppototal' });
// Lock Screen widgets show one view each, picked by the first view word in Parameter.
const ACCESSORY_VIEWS = ['fuel', 'evSoc', 'evRange', 'plugStatus', 'chargeStatus', 'battery', 'lock', 'doors', 'temp', 'tires', 'parked', 'status', 'ppoa', 'ppob', 'ppototal', 'ppocapacity'];
function widgetOptions(prefs, parameter) {
  const base = (prefs && prefs.widget) || {};
  const show = Object.assign(Object.fromEntries(Object.keys(METRICS).map(k => [k, !k.startsWith('ppo')])), base.show || {});
  const opts = { design: Object.assign({ small: 'classic', medium: 'classic', large: 'classic' }, base.design || {}), layout: { medium: base.medium || 'status', large: 'controls' }, unit: base.unit === 'bar' ? 'bar' : 'psi', vin: null, view: null };
  const only = [];
  for (const raw of String(parameter || '').toLowerCase().split(/[\s,;]+/).filter(Boolean)) {
    if (vinOK(raw.toUpperCase())) { opts.vin = raw.toUpperCase(); continue; }
    if (['classic', 'dashboard', 'showcase'].includes(raw)) { opts.design = { small: raw, medium: raw, large: raw }; continue; }
    if (raw === 'controls' || raw === 'buttons') { opts.layout.medium = opts.layout.large = 'controls'; continue; }
    if (raw === 'status' || raw === 'info') { opts.layout.medium = opts.layout.large = 'status'; opts.view = opts.view || 'status'; continue; }
    if (raw === 'bar' || raw === 'psi') { opts.unit = raw; continue; }
    const hide = /^(-|no-?)/.test(raw), word = raw.replace(/^(-|no-?)/, '');
    const key = Object.prototype.hasOwnProperty.call(METRICS, word) ? word : METRIC_ALIASES[word];
    if (!key) continue;
    if (!hide && !opts.view && ACCESSORY_VIEWS.includes(key)) opts.view = key;
    if (hide) show[key] = false; else only.push(key);
  }
  // Naming metrics in the Parameter means "show only these".
  if (only.length) for (const k of Object.keys(show)) show[k] = only.includes(k);
  opts.show = show;
  // A widget parameter cannot override the app-wide location privacy choice.
  if (!parkedLocationEnabled(prefs)) opts.show.parked = false;
  return opts;
}

class WidgetRenderer {
  constructor(prefs, cache, parameter = '') {
    this.prefs = prefs || {}; this.cache = cache || {}; this.fields = this.cache.fields || {};
    this.opts = widgetOptions(this.prefs, parameter);
    // Disk read only: widgets never download the photo.
    this.image = this.prefs.vin && this.opts.show.photo ? new LocalStore().vehicleImage(this.prefs) : null;
    this.ink = Color.dynamic(new Color('102237'), new Color('EDF4FF'));
    this.muted = Color.dynamic(new Color('516173'), new Color('A7B5C9'));
    this.accent = Color.dynamic(new Color('0065BA'), new Color('69B9FF'));
    this.panel = Color.dynamic(new Color('E8EFF7'), new Color('1C2A3C'));
    this.run = Color.dynamic(new Color('C2410C'), new Color('EA580C'));
  }
  on(key) { return this.opts.show[key]; }
  // A start estimate wins over older telemetry; newer telemetry wins. Ignore legacy until:0 stop markers.
  remote() {
    const f = this.fields.remoteStart, est = this.cache.startRun;
    const tel = f && f.value ? f : null;
    if (est && est.until > 0 && (!tel || (tel.at || 0) < est.at)) return est.until > now() ? { until: est.until, estimated: !!est.estimated } : null;
    return tel && tel.value.until > now() ? { until: tel.value.until, estimated: false } : null;
  }
  place() {
    const p = this.value('position');
    if (!p || !this.on('parked')) return null;
    const home = this.prefs.home;
    const near = home && meters(home, p) <= SETTINGS.homeRadius;
    const known = this.cache.place && meters(this.cache.place, p) < 50 ? this.cache.place.label : null;
    return { label: near ? 'Home' : known || `${p.lat.toFixed(4)}, ${p.lon.toFixed(4)}`, home: !!near,
      at: this.fields.position.at, url: `https://maps.apple.com/?${form({ ll: `${p.lat},${p.lon}`, q: this.prefs.name || 'Ford' })}` };
  }
  temp() { const t = finite(this.value('outsideTemp')); return t === null ? '—' : `${fahrenheit(t)}°F`; }
  nextRefresh() {
    let t = now() + 15 * 60000;
    const r = this.remote(); if (r) t = Math.min(t, r.until + 5000);
    const night = nightSettings(this.prefs);
    if (night.enabled) { const d = new Date(); d.setHours(night.hour, 1, 0, 0); if (d.getTime() > now()) t = Math.min(t, d.getTime()); }
    return t;
  }
  // Live countdown: iOS ticks the timer itself, no refreshes needed. Tap = Stop.
  runningBadge(stack, size = 11, full = false) {
    const r = this.remote(); if (!r) return false;
    const b = stack.addStack(); b.centerAlignContent(); b.spacing = 5; b.setPadding(4, 8, 4, 8); b.cornerRadius = 9;
    b.backgroundColor = this.run; b.url = this.url('stop');
    this.symbol(b, 'engine.combustion.fill', size + 1, Color.white());
    if (full) this.text(b, r.estimated ? 'Running · est.' : 'Running', size, true, Color.white());
    const t = b.addDate(new Date(r.until)); t.applyTimerStyle();
    t.font = Font.boldMonospacedSystemFont(size); t.textColor = Color.white(); t.lineLimit = 1;
    if (full) { b.addSpacer(); this.text(b, 'Tap to stop', size - 1, false, Color.white()); }
    return true;
  }
  parkedRow(stack, size = 11) {
    const pl = this.place(); if (!pl) return;
    const row = stack.addStack(); row.centerAlignContent(); row.spacing = 5; row.url = pl.url;
    this.symbol(row, pl.home ? 'house.fill' : 'mappin.and.ellipse', size + 1);
    this.text(row, `Parked · ${pl.label}`, size, true);
    row.addSpacer(); this.text(row, age(pl.at), size - 1, false, this.muted);
  }
  url(action = '') { return `scriptable:///run?${form({ scriptName: Script.name(), action })}`; }
  value(key) { const f = this.fields[key]; return f && f.value !== null && f.value !== undefined ? f.value : null; }
  number(key, suffix = '') { const n = finite(this.value(key)); return n === null ? '—' : `${Math.round(n)}${suffix}`; }
  tire(key) {
    const n = finite(this.value(key));
    return n === null ? '—' : this.opts.unit === 'bar' ? (n * 0.0689476).toFixed(1) : String(Math.round(n));
  }
  text(stack, content, size = 12, bold = false, color = this.ink) {
    const t = stack.addText(String(content)); t.font = bold ? Font.boldSystemFont(size) : Font.systemFont(size);
    t.textColor = color; t.lineLimit = 1; t.minimumScaleFactor = 0.65; return t;
  }
  symbol(stack, name, size = 16, tint = this.accent) {
    const s = SFSymbol.named(name) || SFSymbol.named('car.fill');
    const i = stack.addImage(s.image); i.imageSize = new Size(size, size); i.tintColor = tint; return i;
  }
  truck(stack, w, h) {
    if (!this.on('photo')) return null;
    if (!this.image) return this.symbol(stack, 'car.side.fill', h);
    const s = this.image.size, k = Math.min(w / s.width, h / s.height);
    const i = stack.addImage(this.image); i.imageSize = new Size(Math.round(s.width * k), Math.round(s.height * k));
    if (this.prefs.imageMode === 'custom') i.cornerRadius = 8;
    return i;
  }
  pill(stack, label, symbol) {
    const p = stack.addStack(); p.centerAlignContent(); p.spacing = 4; p.setPadding(4, 6, 4, 6);
    p.backgroundColor = this.panel; p.cornerRadius = 7;
    if (symbol) this.symbol(p, symbol, 12);
    this.text(p, label, 10, true); return p;
  }
  lockPill(stack) {
    if (this.on('lock')) this.pill(stack, this.value('lock') || 'Unknown', this.value('lock') === 'Locked' ? 'lock.fill' : 'lock.open.fill');
  }
  batteryPill(stack) {
    if (!this.on('battery')) return;
    const battery = this.value('battery');
    this.pill(stack, `12V ${battery !== null ? this.number('battery', '%') : this.value('batteryHealth') || 'Unknown'}`, 'battery.100');
  }
  gauge(stack, width = 132) {
    const d = new DrawContext(); d.size = new Size(width, 7); d.opaque = false; d.respectScreenScale = true;
    d.setFillColor(this.panel); d.fillRect(new Rect(0, 0, width, 7));
    const fuel = bounded(this.value('fuel'), 100);
    if (fuel !== null && fuel > 0) { d.setFillColor(fuel < 15 ? new Color('DB5D3F') : this.accent); d.fillRect(new Rect(0, 0, width * fuel / 100, 7)); }
    const i = stack.addImage(d.getImage()); i.imageSize = new Size(width, 7);
  }
  fuel(stack, width) {
    if (!this.on('fuel')) return;
    this.text(stack, `Fuel ${this.number('fuel', '%')} · ${this.number('range', ' mi')}`, 12, true);
    this.gauge(stack, width);
  }
  tires(stack, size) {
    if (!this.on('tires')) return;
    this.text(stack, `TIRES · ${this.opts.unit.toUpperCase()}`, 9, true, this.muted);
    for (const pair of [['fl', 'fr'], ['rl', 'rr']]) {
      const tr = stack.addStack(); tr.spacing = 12;
      for (const key of pair) {
        const cell = tr.addStack(); cell.layoutVertically();
        this.text(cell, key.toUpperCase(), 8, false, this.muted);
        this.text(cell, this.tire(key), size, true);
      }
    }
  }
  extras(stack, size = 11, max = 9, parked = true) {
    const lines = [];
    if (this.on('oil')) lines.push(`Oil ${this.number('oil', '%')}`);
    if (this.on('odometer')) lines.push(`Odometer ${this.number('odometer', ' mi')}`);
    if (this.on('doors')) lines.push(`Doors ${this.value('doors') || 'Unknown'}`);
    if (this.on('temp')) lines.push(`Outside ${this.temp()}`);
    const pl = parked && this.place(); if (pl) lines.push(`Parked · ${pl.label}`);
    lines.slice(0, max).forEach(l => this.text(stack, l, size, true));
  }
  buttons(stack, cols, w, h) {
    const actions = [['lock', 'Lock', 'lock.fill'], ['unlock', 'Unlock', 'lock.open.fill'],
      this.remote() ? ['stop', 'Stop', 'stop.circle.fill'] : ['start', 'Start', 'power'], ['refresh', 'Refresh', 'arrow.clockwise']].filter(a => !this.prefs.compatibility || this.prefs.compatibility.commands[a[0]] !== false);
    const grid = stack.addStack(); grid.layoutVertically(); grid.spacing = 6;
    for (let i = 0; i < actions.length; i += cols) {
      const row = grid.addStack(); row.spacing = 6;
      for (const [action, label, icon] of actions.slice(i, i + cols)) {
        const b = row.addStack(); b.layoutVertically(); b.size = new Size(w, h); b.centerAlignContent();
        b.backgroundColor = this.panel; b.cornerRadius = 10; b.url = this.url(action === 'refresh' ? 'refreshwidget' : action);
        const top = b.addStack(); top.addSpacer(); this.symbol(top, icon, 15); top.addSpacer();
        b.addSpacer(3);
        const bottom = b.addStack(); bottom.addSpacer(); this.text(bottom, label, 10, true); bottom.addSpacer();
      }
    }
  }
  ring(fraction) {
    const S = 120, d = new DrawContext(); d.size = new Size(S, S); d.opaque = false; d.respectScreenScale = true;
    const arc = (from, to, color) => {
      const p = new Path(), r = S / 2 - 9;
      for (let i = 0; i <= 64; i++) {
        const a = (from + (to - from) * i / 64) * Math.PI / 180, pt = new Point(S / 2 + r * Math.cos(a), S / 2 + r * Math.sin(a));
        if (i) p.addLine(pt); else p.move(pt);
      }
      d.addPath(p); d.setStrokeColor(color); d.setLineWidth(11); d.strokePath();
    };
    arc(135, 405, new Color('#FFFFFF', 0.28));
    if (fraction > 0) arc(135, 135 + 270 * Math.min(1, fraction), Color.white());
    return d.getImage();
  }
  bar(width, fraction) {
    const d = new DrawContext(); d.size = new Size(width, 5); d.opaque = false; d.respectScreenScale = true;
    d.setFillColor(new Color('#FFFFFF', 0.3)); d.fillRect(new Rect(0, 0, width, 5));
    if (fraction > 0) { d.setFillColor(Color.white()); d.fillRect(new Rect(0, 0, width * Math.min(1, fraction), 5)); }
    return d.getImage();
  }
  centered(w, build) { const row = w.addStack(); row.addSpacer(); build(row); row.addSpacer(); return row; }
  buildAccessory(family, notice) {
    const w = new ListWidget(); w.url = this.url(); w.refreshAfterDate = new Date(this.nextRefresh());
    const white = Color.white(), r = this.remote(), fuel = bounded(this.value('fuel'), 100);
    const locked = this.value('lock'), lockIcon = locked === 'Unlocked' ? 'lock.open.fill' : 'lock.fill';
    const tiny = (stack, t, size, bold = false) => this.text(stack, t, size, bold, white);
    if (family === 'accessoryInline') {
      // One symbol + one line above the clock.
      const line = r ? `Running until ${new Date(r.until).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`
        : `${this.number('fuel', '%')} · ${this.number('range', ' mi')} · ${locked || '—'}`;
      w.addImage(SFSymbol.named(r ? 'engine.combustion.fill' : 'fuelpump.fill').image); w.addText(line);
      return w;
    }
    if (family === 'accessoryCircular') {
      const view = this.opts.view || 'fuel';
      w.addSpacer();
      if (r && view !== 'lock') {
        w.addAccessoryWidgetBackground = true;
        this.centered(w, row => this.symbol(row, 'engine.combustion.fill', 15, white));
        this.centered(w, row => { const t = row.addDate(new Date(r.until)); t.applyTimerStyle(); t.font = Font.boldMonospacedSystemFont(12); t.textColor = white; t.centerAlignText(); });
      } else if (view === 'lock') {
        w.addAccessoryWidgetBackground = true;
        this.centered(w, row => this.symbol(row, lockIcon, 22, white));
        this.centered(w, row => tiny(row, locked || '—', 9, true));
      } else if (view === 'tires') {
        w.addAccessoryWidgetBackground = true;
        const known = ['fl', 'fr', 'rl', 'rr'].filter(k => finite(this.value(k)) !== null);
        const low = known.sort((a, b) => this.value(a) - this.value(b))[0];
        this.centered(w, row => tiny(row, low ? this.tire(low) : '—', 19, true));
        this.centered(w, row => tiny(row, low ? `${low.toUpperCase()} ${this.opts.unit.toUpperCase()}` : 'TIRES', 8, true));
      } else {
        w.backgroundImage = this.ring(fuel === null ? 0 : fuel / 100);
        this.centered(w, row => this.symbol(row, 'fuelpump.fill', 11, white));
        this.centered(w, row => tiny(row, fuel === null ? '—' : String(Math.round(fuel)), 20, true));
      }
      w.addSpacer();
      return w;
    }
    // accessoryRectangular
    const view = this.opts.view || 'status';
    if (view === 'tires') {
      const head = w.addStack(); this.symbol(head, 'tirepressure', 11, white); head.addSpacer(4); tiny(head, `Tires · ${this.opts.unit.toUpperCase()}`, 12, true);
      for (const pair of [['fl', 'fr'], ['rl', 'rr']]) {
        const row = w.addStack();
        for (const k of pair) {
          const v = finite(this.value(k)), flag = v !== null && v < alertSettings(this.prefs).tire && alertSettings(this.prefs).enabled.tires ? ' !' : '';
          tiny(row, `${k.toUpperCase()} ${this.tire(k)}${flag}`, 13, !!flag); row.addSpacer();
        }
      }
    } else if (view === 'parked') {
      const pl = this.place();
      const head = w.addStack(); this.symbol(head, pl && pl.home ? 'house.fill' : 'mappin.and.ellipse', 11, white); head.addSpacer(4);
      tiny(head, 'Parked', 12, true); head.addSpacer(); tiny(head, pl ? age(pl.at) : '', 10);
      const t = w.addText(pl ? pl.label : 'Location not reported'); t.font = Font.semiboldSystemFont(13); t.textColor = white; t.lineLimit = 2; t.minimumScaleFactor = 0.7;
      if (pl) w.url = pl.url;
    } else {
      const head = w.addStack(); head.centerAlignContent();
      this.symbol(head, 'car.side.fill', 12, white); head.addSpacer(4);
      tiny(head, this.prefs.name || 'Ford', 13, true); head.addSpacer();
      if (this.on('lock')) this.symbol(head, lockIcon, 11, white);
      w.addSpacer(3);
      const fuelRow = w.addStack(); fuelRow.centerAlignContent();
      const img = fuelRow.addImage(this.bar(70, fuel === null ? 0 : fuel / 100)); img.imageSize = new Size(70, 5);
      fuelRow.addSpacer(6); tiny(fuelRow, `${this.number('fuel', '%')} · ${this.number('range', ' mi')}`, 12, true);
      w.addSpacer(3);
      if (r) {
        const row = w.addStack(); row.centerAlignContent(); this.symbol(row, 'engine.combustion.fill', 10, white); row.addSpacer(4);
        const t = row.addDate(new Date(r.until)); t.applyTimerStyle(); t.font = Font.boldMonospacedSystemFont(11); t.textColor = white;
      } else tiny(w, notice || `Updated ${age(this.oldest())}`, 10);
    }
    return w;
  }
  oldest() {
    const times = Object.values(this.fields).filter(f => f && f.value !== null && f.value !== undefined && f.value !== 'Unknown').map(f => f.at);
    return times.length && times.every(Boolean) ? Math.min(...times) : null;
  }
  frame(padding) {
    const w = new ListWidget();
    w.backgroundColor = Color.dynamic(new Color('F8FAFD'), new Color('101B2B'));
    w.setPadding(...padding); w.url = this.url();
    w.refreshAfterDate = new Date(this.nextRefresh());
    return w;
  }
  footer(notice) {
    const issues = alertSettings(this.prefs).attention ? nightProblems(this.fields, displayUnitPreferences(this.prefs, this.opts)) : [];
    return issues.length ? `⚠ ${issues[0]}${issues.length > 1 ? ` +${issues.length - 1}` : ''} · ${age(this.oldest())}` : (notice || `Updated ${age(this.oldest())}`);
  }
  buildSmall(notice) {
    const w = this.frame([12, 12, 10, 12]);
    const top = w.addStack(); top.centerAlignContent(); top.spacing = 6;
    this.truck(top, 64, 24);
    this.text(top, this.prefs.name || 'Ford', 13, true);
    w.addSpacer(6);
    if (this.on('fuel')) {
      this.text(w, `Fuel ${this.number('fuel', '%')}`, 15, true);
      this.text(w, this.number('range', ' mi'), 11, false, this.muted);
    } else this.extras(w, 13, 3);
    w.addSpacer(4);
    if (!this.runningBadge(w, 11)) this.lockPill(w);
    if (typeof this._ppoBeforeFooter === 'function') this._ppoBeforeFooter(w);
    w.addSpacer();
    this.text(w, this.footer(notice), 9, false, this.muted);
    return w;
  }
  // Alternative layouts use only cached readings and the same action handlers as Classic.
  buildDesign(family, design, notice) {
    const w = this.frame([12, 14, 10, 14]);
    w.backgroundColor = Color.dynamic(new Color('E6E8EB'), new Color('101B30'));
    const isSmall = family === 'small', isLarge = family === 'large';
    const headline = row => {
      const col = row.addStack(); col.layoutVertically(); col.spacing = 3;
      this.text(col, this.prefs.name || 'Ford', isSmall ? 14 : 17, true);
      if (this.on('fuel')) this.text(col, `${this.number('range', ' mi')} to E / ${this.number('fuel', '%')}`, isSmall ? 11 : 14, false, this.muted);
      if (this.on('odometer')) this.text(col, `Odometer: ${this.number('odometer', ' mi')}`, 10, false, this.muted);
      return col;
    };
    const info = (stack, label, value) => {
      this.text(stack, label, isSmall ? 9 : 11, true);
      this.text(stack, value, isSmall ? 10 : 12, true, this.accent);
    };
    const status = stack => {
      if (this.on('lock')) info(stack, 'Locks', this.value('lock') || 'Unknown');
      if (this.on('doors')) info(stack, 'Doors', this.value('doors') || 'Unknown');
      if (this.on('oil')) info(stack, 'Oil life', this.number('oil', '%'));
      if (this.on('battery')) info(stack, '12V battery', this.value('battery') !== null ? this.number('battery', '%') : this.value('batteryHealth') || 'Unknown');
    };
    if (isSmall) {
      if (design === 'showcase') {
        headline(w); w.addSpacer(4);
        if (!this.runningBadge(w, 9)) this.lockPill(w);
        w.addSpacer(); this.centered(w, row => this.truck(row, 116, 42));
      } else {
        const row = w.addStack(); row.spacing = 6;
        const left = row.addStack(); left.layoutVertically(); left.spacing = 4;
        this.truck(left, 70, 32);
        if (this.on('fuel')) { this.text(left, this.number('fuel', '%'), 13, true); this.gauge(left, 65); this.text(left, this.number('range', ' mi'), 10); }
        const right = row.addStack(); right.layoutVertically(); right.spacing = 2; status(right);
      }
    } else if (design === 'showcase' && !isLarge) {
      const row = w.addStack(); row.spacing = 8; headline(row); row.addSpacer(); this.truck(row, 120, 54);
      w.addSpacer(4); this.parkedRow(w, 10); if (typeof this._ppoBeforeControls === 'function') this._ppoBeforeControls(w); w.addSpacer(); this.buttons(w, 4, 62, 38);
    } else {
      const head = w.addStack(); head.spacing = 8; headline(head); head.addSpacer(); this.truck(head, isLarge ? 140 : 95, isLarge ? 60 : 40);
      if (this.on('fuel')) { w.addSpacer(4); this.gauge(w, isLarge ? 250 : 180); }
      w.addSpacer(5);
      const row = w.addStack(); row.spacing = 12;
      const left = row.addStack(); left.layoutVertically(); left.spacing = 2; status(left);
      if (this.on('tires')) { const middle = row.addStack(); middle.layoutVertically(); middle.spacing = 2; this.tires(middle, isLarge ? 13 : 11); }
      if (isLarge && this.on('temp')) { const right = row.addStack(); right.layoutVertically(); info(right, 'Outside', this.temp()); }
      if (isLarge) {
        w.addSpacer(5); this.parkedRow(w, 10);
        if (this.remote()) { w.addSpacer(4); this.runningBadge(w, 10, true); }
        if (typeof this._ppoBeforeControls === 'function') this._ppoBeforeControls(w);
        w.addSpacer(); this.buttons(w, 4, 65, 38);
      }
    }
    if (typeof this._ppoBeforeFooter === 'function') this._ppoBeforeFooter(w);
    w.addSpacer();
    const known = Object.values(this.fields).some(f => f && f.value !== null && f.value !== undefined);
    const state = notice || (!known ? 'Open Scriptable to set up / fetch' : this.cache.notice ? 'Cached · source unavailable' : '');
    this.text(w, this.footer(state ? `Updated ${age(this.oldest())} · ${state}` : ''), 9, false, this.muted);
    return w;
  }
  build(family = 'medium', notice = '') {
    const designFamily = family === 'extraLarge' ? 'large' : family;
    if (['small', 'medium', 'large'].includes(designFamily) && this.opts.design[designFamily] !== 'classic' && ['dashboard', 'showcase'].includes(this.opts.design[designFamily])) return this.buildDesign(designFamily, this.opts.design[designFamily], notice);
    if (family === 'small') return this.buildSmall(notice);
    if (String(family).startsWith('accessory')) return this.buildAccessory(family, notice);
    const large = family === 'large' || family === 'extraLarge';
    const controls = this.opts.layout[large ? 'large' : 'medium'] === 'controls';
    const w = this.frame([12, 14, 10, 14]);
    const row = w.addStack(); row.layoutHorizontally(); row.spacing = 14;
    const left = row.addStack(); left.layoutVertically(); left.spacing = 4;
    this.text(left, this.prefs.name || 'Ford', 17, true);
    if (!large && controls) {
      // Medium + controls: compact status on the left, a 2x2 button grid on the right.
      if (!this.runningBadge(left, 11)) this.truck(left, 124, 34);
      this.fuel(left, 124);
      this.lockPill(left);
      row.addSpacer();
      this.buttons(row, 2, 66, 50);
    } else {
      // Medium: the countdown takes the photo's place while the engine runs.
      if (large || !this.runningBadge(left, 11)) this.truck(left, large ? 150 : 124, large ? 62 : 38);
      this.fuel(left, 132);
      this.batteryPill(left);
      const right = row.addStack(); right.layoutVertically(); right.spacing = 5;
      this.tires(right, large ? 18 : 16);
      if (large || !this.on('tires')) this.extras(right, 11, large ? 4 : 5, !large);
      else if (this.on('oil')) this.text(right, `Oil ${this.number('oil', '%')}`, 11, true);
      this.lockPill(right);
      if (large) {
        w.addSpacer(8); this.parkedRow(w);
        if (this.remote()) { w.addSpacer(6); this.runningBadge(w, 12, true); }
      }
      if (large && controls) { if (typeof this._ppoBeforeControls === 'function') this._ppoBeforeControls(w); w.addSpacer(8); this.buttons(w, 4, 70, 46); }
    }
    if (typeof this._ppoBeforeFooter === 'function') this._ppoBeforeFooter(w);
    w.addSpacer();
    const known = Object.values(this.fields).filter(f => f && f.value !== null && f.value !== undefined);
    const status = notice || (!known.length ? 'Open Scriptable to set up / fetch' : this.cache.notice ? 'Cached · source unavailable' : '');
    this.text(w, this.footer(`Last updated: ${age(this.oldest())}${status ? ' · ' + status : ''}`), 9, false, status ? this.ink : this.muted);
    return w;
  }
}

// New settings dialogs may outlive their foreground session while awaiting UI.
function saveVehiclePreferences(store, prefs) {
  requireApp(); store.assertLease();
  if (!vehicleBindingCurrent(prefs, store))
    throw new Error('The selected vehicle or account session changed. Run the script again.');
  saveVehicleProfile(prefs, store);
  if (!parkedLocationEnabled(prefs)) store.purgeLocation();
}

class AppController {
  constructor() { this.store = null; this.auth = null; }
  async setupVehicle() {
    const old = secretGet('vehicle') || {};
    const values = await input('Vehicle setup', 'One vehicle. Changing VIN clears saved telemetry and disconnects FordConnect consent for the old vehicle.', [
      { label: '17-character VIN', value: old.vin }, { label: 'Badge / name', value: old.name || 'Ford' },
    ]);
    if (!values) return null;
    const vin = values[0].toUpperCase(), name = values[1] || 'Ford';
    if (!vinOK(vin)) throw new Error('Enter a valid 17-character VIN (no I, O, Q).');
    if (old.vin && old.vin !== vin) {
      secretRemove('token.official');
      this.store.write({ version: 1, vin, fields: {} });
    }
    // Photo choices belong to the VIN; a new truck starts from Ford's photo again.
    const prefs = Object.assign({}, old.vin === vin ? old : {}, { vin, name }); secretSet('vehicle', prefs); return prefs;
  }
  async compatibility(prefs) {
    selfTest();
    await message('Self-test passed', 'Offline script checks passed. Next, check available vehicle features.');
    let c = this.store.read() || { fields: {} }, note = 'Using saved readings.';
    if (secretGet('token.official') || secretGet('token.mobile')) {
      try { const result = await new FordAPIClient(this.auth, this.store, prefs).getVehicleStatus(); c = result.cache; note = result.note; }
      catch (e) { note = 'Cloud check failed: ' + e.message + '\nUsing saved readings.'; }
    } else note = 'Connect FordPass or FordConnect and rerun this check for cloud suggestions.';
    const fields = c.fields || {};
    const mapping = { fuel: ['fuel', 'range'], battery: ['battery'], tires: ['fl', 'fr', 'rl', 'rr'], oil: ['oil'], lock: ['lock'], odometer: ['odometer'], doors: ['doors'], temp: ['outsideTemp'], parked: ['position'] };
    const previous = prefs.compatibility;
    const cfg = prefs.widget || {}, show = Object.assign({}, cfg.show || {});
    if (!previous) for (const k of Object.keys(mapping)) {
      if (show[k] === undefined) show[k] = mapping[k].some(f => fields[f] && fields[f].value != null);
    }
    const commands = Object.assign({ lock: true, unlock: true, start: true, stop: true, refresh: true }, previous && previous.commands || {});
    const verified = Object.assign({}, previous && previous.verified || {});
    await message('Compatibility check', note + '\n\nReported readings are suggested. Missing readings are unverified, not proof of incompatibility. Select what is available in your Ford app.');
    const labels = { lock: 'Lock', unlock: 'Unlock', start: 'Remote start', stop: 'Remote stop', refresh: 'Wake / refresh' };
    for (;;) {
      const a = new Alert(); a.title = 'Vehicle features';
      a.message = 'Tap to select or deselect features. Commands are unverified until tested. Your selections can be changed later.';
      const keys = Object.keys(mapping), actions = Object.keys(labels);
      keys.forEach(k => a.addAction(`${show[k] ? '✓' : '○'} ${METRICS[k]}${mapping[k].some(f => fields[f] && fields[f].value != null) ? ' · reported' : ' · unverified'}`));
      actions.forEach(k => a.addAction(`${commands[k] ? '✓' : '○'} ${labels[k]} · ${verified[k] ? 'owner confirmed' : 'unverified'}`));
      a.addAction('Enable reported readings'); a.addAction('Test a command…'); a.addCancelAction('Done');
      const i = await a.presentSheet();
      if (i < 0) break;
      if (i < keys.length) show[keys[i]] = !show[keys[i]];
      else if (i < keys.length + actions.length) { const k = actions[i - keys.length]; commands[k] = !commands[k]; }
      else if (i === keys.length + actions.length) {
        for (const k of keys) if (mapping[k].some(f => fields[f] && fields[f].value != null)) show[k] = true;
      } else {
        const t = new Alert(); t.title = 'Optional command test'; t.message = 'Each test sends a real command after a separate confirmation. Check the vehicle yourself. Start only outdoors.';
        actions.forEach(k => t.addAction(labels[k])); t.addCancelAction('Cancel');
        const n = await t.presentSheet();
        if (n >= 0) {
          const k = actions[n];
          const sent = await this.action(k, prefs, true);
          if (sent) {
            const v = new Alert(); v.title = 'Did the vehicle complete it?'; v.message = 'Ford accepting a request does not confirm completion. Check your vehicle before answering.';
            v.addAction('Yes, completed'); v.addAction('No / unsure'); v.addCancelAction('Cancel');
            const answer = await v.presentAlert();
            if (answer >= 0) verified[k] = answer === 0;
          }
        }
      }
      prefs.widget = Object.assign({}, cfg, { show }); prefs.compatibility = { commands, verified }; saveVehiclePreferences(this.store, prefs);
    }
    prefs.widget = Object.assign({}, cfg, { show }); prefs.compatibility = { commands, verified }; saveVehiclePreferences(this.store, prefs);
  }
  async details(prefs) {
    const c = this.store.read() || {}, f = c.fields || {};
    const show = (k, v) => ['outsideTemp', 'range', 'odometer', 'fl', 'fr', 'rl', 'rr'].includes(k) ? displayUnitDetailValue(k, v, prefs)
      : k === 'position' ? (c.place && c.place.label) || `${v.lat.toFixed(5)}, ${v.lon.toFixed(5)}`
      : k === 'remoteStart' ? (v.until > now() ? `Running until ${new Date(v.until).toLocaleTimeString()}` : 'Off')
      : typeof v === 'number' ? Math.round(v * 10) / 10 : v;
    const lines = Object.keys(FIELD_NAMES).map(k => {
      const item = f[k];
      const value = item && item.value !== null && item.value !== undefined ? show(k, item.value) : null;
      return `${displayUnitFieldLabel(k, prefs)}: ${value === null || value === undefined ? 'Unknown' : value}\n${item ? `${item.source} · ${item.at ? new Date(item.at).toLocaleString() : 'measurement time unknown'}` : 'Not reported'}`;
    });
    const photo = prefs.imageMode === 'off' ? 'Icon (photo off)' : prefs.imageMode === 'custom' ? 'From your Photos'
      : c.image && c.image.source ? `${c.image.source} · ${age(c.image.at)}` : 'Not downloaded yet';
    lines.push(`Vehicle photo: ${photo}`);
    const n = c.night;
    lines.push(`Evening check: ${!nightSettings(prefs).enabled ? 'Off' : n && n.done ? `${n.problems.length ? n.problems.join(', ') : n.securityFresh === true ? 'All good' : 'Limited status; current lock/door readings not confirmed'} · ${age(n.at)}` : 'Not run yet'}`);
    if (c.lastCommand) lines.push(`Last request: ${c.lastCommand.action}\n${c.lastCommand.outcome} · ${age(c.lastCommand.at)}`);
    await message(prefs.name, lines.join('\n\n'));
  }
  async truckPhoto(prefs) {
    const api = new FordAPIClient(this.auth, this.store, prefs);
    const a = new Alert(); a.title = 'Vehicle photo';
    a.message = 'Use the picture Ford shows for your VIN in the FordPass app, or pick your own. A cut-out PNG with no background looks best on the widget.';
    ['Download from Ford', 'Download from Ford: choose view', 'Choose from Photos…', 'Use generic vehicle icon'].forEach(l => a.addAction(l));
    a.addCancelAction('Cancel');
    const choice = await a.presentSheet();
    appAssertProfile(prefs, this.store);
    if (choice < 0) return;
    if (choice <= 1) {
      let angle = null;
      if (choice === 1) {
        const v = new Alert(); v.title = 'Choose a view';
        v.message = 'Ford renders views 1-5. View 4 is the usual FordPass angle. Some vehicles only have one view.';
        for (let n = 1; n <= 5; n++) v.addAction(`View ${n}${n === 4 ? ' (default)' : ''}`);
        v.addCancelAction('Cancel');
        const pick = await v.presentSheet();
        appAssertProfile(prefs, this.store);
        if (pick < 0) return;
        angle = pick + 1;
      }
      Object.assign(prefs, { imageMode: 'auto', imageAngle: angle }); secretSet('vehicle', prefs);
      try { await message('Vehicle photo', `Downloaded from ${await api.updateVehicleImage(true)}.`); }
      catch (e) { await message('Vehicle photo not available', e.message + '\n\nYou can choose a picture from Photos instead.'); return; }
    } else if (choice === 2) {
      let img;
      try { img = await Photos.fromLibrary(); } catch (_) { return; }
      appAssertProfile(prefs, this.store);
      this.store.writeImage(prefs.vin, true, downscale(img, SETTINGS.imageMaxWidth));
      prefs.imageMode = 'custom'; secretSet('vehicle', prefs);
    } else { prefs.imageMode = 'off'; secretSet('vehicle', prefs); }
    appAssertProfile(prefs, this.store);
    await new WidgetRenderer(prefs, this.store.read()).build('medium').presentMedium();
  }
  async nightlyCheck(prefs) {
    const night = nightSettings(prefs), d = new Date();
    if (!night.enabled || d.getHours() < night.hour || !(secretGet('token.mobile') || secretGet('token.official'))) return null;
    const today = d.toDateString(), before = this.store.read(), n = before && before.night;
    if (n && n.date === today && (n.done || n.tries >= 2 || n.next > now())) return null;
    if (!this.store.acquireBackground()) return null;
    this.auth.timeout = 6;
    try {
      let c = this.store.read();
      if (!c || c.vin !== prefs.vin) return null;
      // At most two attempts per evening, 30 minutes apart; never a retry loop.
      c.night = { date: today, tries: n && n.date === today ? n.tries + 1 : 1, next: now() + 30 * 60000, done: false };
      c.nextFetch = 0; this.store.write(c);
      c = (await new FordAPIClient(this.auth, this.store, prefs).getVehicleStatus()).cache;
      if (!c.fetchedAt || c.fetchedAt < now() - 5 * 60000) return c;
      const problems = nightProblems(c.fields, prefs);
      const securityFresh = nightSecurityFresh(c.fields);
      c.night = Object.assign({}, c.night, { done: true, at: now(), problems, securityFresh }); this.store.write(c);
      if (problems.length || night.notifyOk) {
        const note = new Notification(); note.title = `${prefs.name || 'Ford'} · evening check`;
        note.body = problems.length ? problems.join(' · ') + ' · Check reading ages in FordWidget.' : securityFresh ? 'Locked and closed; no problems in the reported readings.'
          : 'No enabled alerts found in available readings. Current lock/door status could not be confirmed.';
        note.openURL = new WidgetRenderer(prefs, c).url();
        try { await note.schedule(); } catch (_) { /* the widget still shows the result */ }
      }
      return c;
    } catch (e) { console.log('Evening check failed: ' + e.message); return null; }
    finally { this.auth.timeout = SETTINGS.timeout; this.store.release(); }
  }
  async parked(prefs) {
    const c = this.store.read() || {}, r = new WidgetRenderer(prefs, c), pl = r.place();
    if (!pl) { await message('Parked location', 'Ford has not reported a location yet, or Parked location is off in Customize widgets. Run Fetch telemetry.'); return; }
    const a = new Alert(); a.title = `Parked · ${pl.label}`; a.message = `Reported ${age(pl.at)}. ${pl.home ? 'This is your saved Home.' : ''}`;
    a.addAction('Open in Maps'); a.addAction('Save this spot as Home');
    if (prefs.home) a.addDestructiveAction('Clear Home');
    a.addCancelAction('Close');
    const i = await a.presentAlert();
    appAssertProfile(prefs, this.store);
    if (i === 0) Safari.open(pl.url);
    if (i === 1) { const p = c.fields.position.value; prefs.home = { lat: p.lat, lon: p.lon }; secretSet('vehicle', prefs); await message('Home saved', 'The widget will say “Parked · Home” when the vehicle is within about 150 m of here.'); }
    if (i === 2) { delete prefs.home; secretSet('vehicle', prefs); }
  }
  // No weather service polling: the vehicle reports its own outside temperature.
  async startWeather() {
    const f = (this.store.read() || {}).fields || {}, t = f.outsideTemp, p = f.position && f.position.value;
    const hint = deg => deg <= 40 ? ' Cold: a full run warms the cabin.' : deg >= 85 ? ' Hot: a full run cools the cabin.' : '';
    if (t && t.at && t.at > now() - 2 * 3600000) return `Outside ${displayUnitWeatherTemperature(t.value)} (vehicle sensor, ${age(t.at)}).${hint(fahrenheit(t.value))}`;
    if (p) {
      try {
        // Only when the vehicle's reading is old: one request, ~1 km-rounded position, no key, no account.
        const r = new Request('https://api.open-meteo.com/v1/forecast?' + form({ latitude: p.lat.toFixed(2), longitude: p.lon.toFixed(2),
          current: 'temperature_2m', temperature_unit: 'fahrenheit' }));
        r.timeoutInterval = 5;
        const j = await r.loadJSON();
        const v = finite(j && j.current && j.current.temperature_2m);
        if (v !== null) return `Outside about ${displayUnitWeatherTemperature(v, 'f')} near the vehicle (Open-Meteo, now).${hint(Math.round(v))}`;
      } catch (_) { /* no temperature line */ }
    }
    return t ? `Outside ${displayUnitWeatherTemperature(t.value)} (vehicle sensor, ${age(t.at)}).` : '';
  }
  async chooseDesign(prefs) {
    const sizes = ['small', 'medium', 'large'], designs = ['classic', 'showcase', 'dashboard'];
    const sizePicker = new Alert(); sizePicker.title = 'Widget gallery · choose size';
    sizes.forEach(s => sizePicker.addAction(s[0].toUpperCase() + s.slice(1)));
    sizePicker.addCancelAction('Cancel');
    const selected = await sizePicker.presentSheet(); if (selected < 0) return;
    const family = sizes[selected];
    for (;;) {
      const cfg = prefs.widget || {}, saved = Object.assign({ small: 'classic', medium: 'classic', large: 'classic' }, cfg.design || {});
      const picker = new Alert(); picker.title = `${family[0].toUpperCase() + family.slice(1)} design`;
      picker.message = 'Classic: balanced status. Showcase: vehicle and controls. Dashboard: detailed readings. Tap a design to preview it, then Close and Use design.';
      designs.forEach(d => picker.addAction(`${saved[family] === d ? '✓ ' : ''}${d[0].toUpperCase() + d.slice(1)}`));
      picker.addCancelAction('Done'); const choice = await picker.presentSheet(); if (choice < 0) return;
      const design = designs[choice], previewPrefs = Object.assign({}, prefs, { widget: Object.assign({}, cfg, { design: Object.assign({}, saved, { [family]: design }) }) });
      const preview = new WidgetRenderer(previewPrefs, this.store.read()).build(family);
      if (family === 'small') await preview.presentSmall();
      else if (family === 'medium') await preview.presentMedium();
      else await preview.presentLarge();
      const confirm = new Alert(); confirm.title = `Use ${design}?`; confirm.message = `Apply this design to ${family} widgets. You can change it again later.`;
      confirm.addAction('Use design'); confirm.addCancelAction('Keep current');
      if (await confirm.presentAlert() === 0) { prefs.widget = previewPrefs.widget; saveVehiclePreferences(this.store, prefs); return; }
    }
  }
  async alertOptions(prefs) {
    const names = { lock: 'Unlocked', doors: 'Door / hood / tailgate open', tires: 'Low tire pressure', fuel: 'Low fuel', oil: 'Low oil life', battery: 'Low 12V battery', engine: 'Remote start running' };
    for (;;) {
      const settings = alertSettings(prefs), keys = Object.keys(names);
      const a = new Alert(); a.title = 'Alerts & attention';
      a.message = 'Evening notifications use these conditions. Attention shows the first matching cached reading on widgets with its age. Missing readings are not treated as healthy. iOS controls refresh timing.';
      keys.forEach(k => a.addAction(`${settings.enabled[k] ? '✓' : '○'} ${names[k]}`));
      a.addAction('Tire threshold: below ' + displayUnitTireThresholdLabel(prefs, settings.tire));
      a.addAction(`Fuel threshold: below ${settings.fuel}%`);
      a.addAction(`Oil threshold: at or below ${settings.oil}%`);
      a.addAction(`Battery threshold: below ${settings.battery}%`);
      a.addAction(`Widget attention: ${settings.attention ? 'On' : 'Off'}`);
      a.addCancelAction('Done'); const i = await a.presentSheet(); if (i < 0) return;
      const next = Object.assign({}, prefs.alerts || {});
      if (i < keys.length) next.enabled = Object.assign({}, settings.enabled, { [keys[i]]: !settings.enabled[keys[i]] });
      else if (i < keys.length + 4) {
        const key = ['tire', 'fuel', 'oil', 'battery'][i - keys.length], max = 100;
        const threshold = displayUnitThreshold(prefs, key, settings[key], max);
        const unit = threshold.unit === '%' ? '%' : ' ' + threshold.unit;
        const values = await input('Alert threshold', `Enter a number from 0 to ${threshold.max}${unit}.`, [{ label: key, value: threshold.value }]);
        if (!values) continue;
        const n = parseDisplayUnitThreshold(values[0], threshold, settings[key]);
        if (n === null) { await message('Invalid threshold', `Enter a number from 0 to ${threshold.max}${unit}.`); continue; }
        next[key] = n;
      } else next.attention = !settings.attention;
      prefs.alerts = next; saveVehiclePreferences(this.store, prefs);
    }
  }
  async customize(prefs) {
    for (;;) {
      const o = widgetOptions(prefs, ''), cfg = prefs.widget || {};
      const a = new Alert(); a.title = 'Customize widgets';
      a.message = 'Applies to every FordWidget widget. To change one widget, edit it and type words in Parameter: "controls", "fuel tires lock", "-photo", "bar". Lock Screen: "fuel", "lock", "tires" (circle) or "status", "tires", "parked" (rectangle).\n\nEvening check: the first widget refresh after the set hour reads the vehicle’s last state once and notifies you of problems.';
      const keys = Object.keys(METRICS);
      keys.forEach(k => a.addAction(`${o.show[k] ? '✓' : '○'}  ${METRICS[k]}`));
      a.addAction(`Medium layout: ${o.layout.medium === 'controls' ? 'Buttons' : 'Status'}`);
      a.addAction('Tire units: ' + displayUnitTirePreferenceLabel(prefs));
      const night = nightSettings(prefs);
      a.addAction(`Evening check: ${night.enabled ? `from ${night.hour > 12 ? night.hour - 12 : night.hour} PM` : 'Off'}`);
      a.addAction(`Evening “all good” notice: ${night.notifyOk ? 'On' : 'Off'}`);
      a.addAction('Preview small'); a.addAction('Preview medium'); a.addAction('Preview large');
      a.addCancelAction('Done');
      const i = await a.presentSheet();
      if (i < 0) return;
      const show = Object.assign({}, cfg.show);
      if (i < keys.length) show[keys[i]] = !o.show[keys[i]];
      const next = Object.assign({}, cfg, { show });
      if (i === keys.length) next.medium = o.layout.medium === 'controls' ? 'status' : 'controls';
      if (i === keys.length + 1) next.unit = nextDisplayUnitTirePreference(prefs);
      prefs.widget = next;
      if (i === keys.length + 2) {
        // Off → 8 PM → 9 PM → 10 PM → 11 PM → Off
        const order = [null, 20, 21, 22, 23], cur = night.enabled ? night.hour : null;
        const nxt = order[(order.indexOf(cur) + 1) % order.length];
        prefs.night = Object.assign({}, prefs.night, nxt === null ? { enabled: false } : { enabled: true, hour: nxt });
      }
      if (i === keys.length + 3) prefs.night = Object.assign({}, prefs.night, { notifyOk: !night.notifyOk });
      saveVehiclePreferences(this.store, prefs);
      const r = () => new WidgetRenderer(prefs, this.store.read());
      if (i === keys.length + 4) await r().build('small').presentSmall();
      if (i === keys.length + 5) await r().build('medium').presentMedium();
      if (i === keys.length + 6) await r().build('large').presentLarge();
    }
  }
  async signOut() {
    const a = new Alert(); a.title = 'Sign out of Ford';
    a.message = 'Removes the saved username, Ford tokens and FordConnect app secret from this phone. Telemetry cache, photo and widget settings stay.';
    a.addDestructiveAction('Sign out'); a.addCancelAction('Cancel');
    if (await a.presentAlert() < 0) return;
    for (const name of ['credentials', 'official', 'token.official', 'token.mobile', 'token.autonomic']) secretRemove(name);
    await message('Signed out', 'Connect FordPass again to use commands.');
  }
  async notify(body) {
    const n = new Notification(); n.title = 'FordWidget'; n.body = body; n.openURL = new WidgetRenderer().url();
    try { await n.schedule(); } catch (_) { /* The foreground alert remains available if notifications are denied. */ }
    await message('FordWidget', body);
  }
  async action(action, prefs, compatibilityTest = false) {
    const api = new FordAPIClient(this.auth, this.store, prefs);
    if (action === 'photo') { await this.truckPhoto(prefs); return; }
    if (action === 'parked') { await this.parked(prefs); return; }
    if (action === 'fetch') {
      const result = await api.getVehicleStatus();
      if (secretGet('token.mobile') && appProPowerEnabled(prefs, this.store)) {
        try {
          const power = await api.readProPower();
          result.note += '\nPro Power: ' + power.note;
          result.cache = power.cache;
        } catch (_) { result.note += '\nPro Power could not be read. Existing telemetry was retained.'; }
      }
      await api.updatePlace();
      if ((prefs.imageMode || 'auto') === 'auto' && secretGet('token.mobile')) {
        try { const source = await api.updateVehicleImage(false); if (source) result.note += `\nVehicle photo downloaded from ${source}.`; }
        catch (e) { result.note += '\nVehicle photo: ' + e.message.split('\n')[0]; }
      }
      await message('Telemetry', result.note); return;
    }
    if (!Object.prototype.hasOwnProperty.call(COMMANDS, action)) throw new Error('Unknown action.');
    if (!compatibilityTest && prefs.compatibility && prefs.compatibility.commands[action] === false) throw new Error('This command is disabled in Vehicle features.');
    const a = new Alert(); a.title = `${action === 'refresh' ? 'Wake vehicle' : action.toUpperCase()} · ${appVehicleLabel(prefs)}`;
    const weather = action === 'start' ? await this.startWeather() : '';
    a.message = action === 'start' ? `${weather ? weather + '\n\n' : ''}Use only with the vehicle safely parked outdoors. Sends Lock, confirms that command, then requests engine start.` : action === 'refresh' ? 'Requests a modem wake/status refresh. Updated readings may take time. Limited to one attempt per 15 minutes.' : `Send ${action} to your vehicle?\n\nOnly continue if you tapped this in FordWidget.`;
    if (prefs.compatibility && !prefs.compatibility.verified[action]) a.message += '\n\nUnverified for this vehicle.';
    a.addAction('Send command'); a.addCancelAction('Cancel');
    if (await a.presentAlert() < 0) return;
    let result;
    let sent = false;
    try { result = await api.sendCommand(prefs.vin, action); sent = true; }
    catch (e) { result = 'Command not confirmed.\n' + e.message; }
    // Build a new timeline from actual telemetry, never predicted command effects.
    Script.setWidget(new WidgetRenderer(prefs, this.store.read()).build('large'));
    await this.notify(result);
    return sent;
  }
  async run() {
    if (config.runsInWidget) {
      // Keep this branch ahead of all setup and authentication prompts.
      let c = this.store.read(); const prefs = secretGet('vehicle');
      const parameter = String(args.widgetParameter || '').trim();
      const pinned = widgetOptions(prefs, parameter).vin;
      const mismatch = pinned && (!prefs || pinned !== prefs.vin);
      const valid = !mismatch && prefs && c && c.vin === prefs.vin;
      // The one exception to "widgets never use the network": one read per evening.
      if (valid) c = await this.nightlyCheck(prefs) || c;
      Script.setWidget(new WidgetRenderer(prefs, valid ? c : null, parameter).build(config.widgetFamily || 'medium', mismatch ? 'Widget VIN does not match setup' : ''));
      return;
    }
    console.log(`FordPassWidgets start · app=${config.runsInApp} widget=${config.runsInWidget} action=${args.queryParameters.action || 'menu'}`);
    requireApp();
    if (args.queryParameters.action === 'selftest') { selfTest(); await message('Self-test', 'All offline checks passed. No network calls or commands.'); return; }
    await this.store.acquire();
    try {
      if (!parkedLocationEnabled()) this.store.purgeLocation();
      const saved = secretGet('credentials');
      if (saved && saved.password !== undefined) secretSet('credentials', { username: saved.username });
      let prefs = secretGet('vehicle');
      if (!prefs) { prefs = await this.setupVehicle(); if (prefs) await this.compatibility(prefs); }
      if (!prefs) return;
      const action = args.queryParameters.action;
      if (action) { await this.action(action, prefs); return; }
      const menu = new Alert(); menu.title = prefs.name + ' · ' + FORDWIDGET_VERSION; menu.message = 'Telemetry reads do not wake the vehicle. Refresh sends an explicit wake request.';
      const items = [
        ['Fetch telemetry', () => this.action('fetch', prefs)],
        ['Lock', () => this.action('lock', prefs)],
        ['Unlock', () => this.action('unlock', prefs)],
        ['Remote start', () => this.action('start', prefs)],
        ['Remote stop', () => this.action('stop', prefs)],
        ['Wake / refresh', () => this.action('refresh', prefs)],
        ['View details', () => this.details(prefs)],
        ['Troubleshooting', () => this.troubleshooting(prefs)],
        ['Pro Power', () => this.action('propower', prefs)],
        ['Parked location', () => this.parked(prefs)],
        ['Customize widgets', () => this.customize(prefs)],
        ['Units & formats', () => this.unitsOptions(prefs)],
        ['Widget gallery', () => this.chooseDesign(prefs)],
        ['Alerts & attention', () => this.alertOptions(prefs)],
        ['Vehicle photo', () => this.truckPhoto(prefs)],
        ['Connect FordPass', () => this.auth.connectMobile()],
        ['Connect FordConnect', () => this.auth.connectOfficial()],
        ['Vehicle features / compatibility', () => this.compatibility(prefs)],
        ['Vehicle setup', async () => { prefs = await this.setupVehicle() || prefs; }],
        ['Sign out of Ford', () => this.signOut()],
        ['Run self-test', async () => { selfTest(); await message('Self-test', 'All offline checks passed. No network calls or commands.'); }],
      ];
      items.forEach(([label]) => menu.addAction(label)); menu.addCancelAction('Close');
      const choice = await menu.presentSheet();
      if (choice >= 0) await items[choice][1]();
      Script.setWidget(new WidgetRenderer(prefs, this.store.read()).build('large'));
    } finally { this.store.release(); }
  }
}

// Ford can report fuel above 100%; cap the percentage and retain raw data separately.
// Negative values remain unknown rather than treating a possible sentinel as empty.
function fordFuelPercent(value) {
  const raw = finite(value);
  if (raw === null || raw < 0) return null;
  return Math.min(raw, 100);
}

// Optional Pro Power views. All original views and actions retain their handlers.
const PPO_UI_METRICS = Object.freeze(['ppoa', 'ppob', 'ppototal', 'ppocapacity']);
const PPO_UI_CAPACITIES = Object.freeze([2000, 2300, 2400, 6900, 7200, 9600]);
const PPO_UI_RAW_KEYS = Object.freeze([
  'DcacEngOnMsgTxtDRq', 'DcacLoFuelMsgTxtDRq', 'DcacElPwDStat',
  'DcacOutPwDsplyMx', 'DcacHwDConfg', 'DcacOutETot',
  'DcacOut1Pw2Dsply', 'DcacOut2Pw2Dsply', 'DcacFaltMsgTxtD2Rq',
  'DcacEngOnMsgTxtD2Rq', 'DcacOutScndPw2Dsply', 'DcacOutScndPwDsplyMx',
  'DcacZone2PwBStat', 'DcacZone3PwBStat', 'VehElRngeL2Dsply',
  'RngPerChrgAvgL2Dsply', 'DcacLoFuelLimLRqMnu', 'DcacPwRsrvSetDStat'
]);

// Estimates assume one watt per raw unit. Only a 7.2 kW installation has been
// corroborated against a known load. Missing/rejected data never becomes zero.
function ppoEstimated(snapshot) {
  const view = ppoView(snapshot ? Object.assign({}, snapshot, { rawSignals: ppoRawSignals(snapshot) }) : null);
  const rated = value => typeof value === 'number' && Number.isFinite(value) && PPO_UI_CAPACITIES.includes(value);
  const usage = (value, capacity) => typeof value === 'number' && Number.isFinite(value) &&
    capacity !== null && value >= 0 && value <= capacity ? value : null;
  const mainCapacity = rated(view.rawCapacity) ? view.rawCapacity : null;
  const a = usage(view.rawA, mainCapacity), b = usage(view.rawB, mainCapacity);
  const abTotal = a !== null && b !== null && a + b <= mainCapacity ? a + b : null;
  const secondaryCapacity = view.rawSecondaryCapacity === 0 ? 0 :
    rated(view.rawSecondaryCapacity) ? view.rawSecondaryCapacity : null;
  const secondary = usage(view.rawSecondary, secondaryCapacity);
  const secondaryScopeKnown = secondaryCapacity !== null && secondary !== null;
  // A positive secondary capacity establishes installed capacity even when its
  // usage is missing. Overall usage still requires every participating value.
  const capacity = mainCapacity === null ? null : secondaryCapacity !== null ? mainCapacity + secondaryCapacity : mainCapacity;
  const total = abTotal !== null && secondaryScopeKnown ? abTotal + secondary : null;
  return { a, b, abTotal, total, capacity, mainCapacity, secondary, secondaryCapacity,
    capacityScope: secondaryCapacity === null ? 'A+B capacity' : secondaryCapacity > 0 ? 'Combined capacity' : 'Capacity',
    secondaryScopeKnown, estimated: true, unitAssumption: '1 raw unit = 1 W; corroborated only on 7.2 kW' };
}
function ppoPowerText(value) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return '—';
  if (value >= 1000) return '~' + (value / 1000).toFixed(2).replace(/\.?0+$/, '') + ' kW';
  return '~' + String(Math.round(value * 10) / 10) + ' W';
}
function ppoModeLine(view) {
  const mode = view && view.latestMode;
  const value = mode && ['OFF', 'LOW', 'HIGH'].includes(mode.value) ? mode.value : null;
  return value ? 'Ford ' + value + ' · ' + age(ppoUIAt(mode.at)) : 'Ford mode unknown';
}
function ppoUIAt(at) { return typeof at === 'number' && Number.isFinite(at) && at > 0 && at <= now() ? at : null; }
function ppoCommandAge(view) { return age(ppoUIAt(view.commandAt)); }
function ppoShortAge(at) {
  if (typeof at !== 'number' || !Number.isFinite(at) || at <= 0 || at > now()) return '?';
  const seconds = Math.floor((now() - at) / 1000), minutes = Math.floor(seconds / 60), hours = Math.floor(minutes / 60);
  return seconds < 60 ? seconds + 's' : minutes < 60 ? minutes + 'm' : hours < 48 ? hours + 'h' : Math.floor(hours / 24) + 'd';
}
function ppoShortMode(view) {
  const mode = view && view.latestMode;
  return mode && ['OFF', 'LOW', 'HIGH'].includes(mode.value) ? mode.value + ppoShortAge(mode.at) : 'mode?';
}
function ppoStaleText(view) {
  const reasons = [];
  for (const reason of view.staleReasons || []) {
    if (reason === 'unknown_command_time') reasons.push('Command result time is unknown.');
    if (reason === 'command_older_than_two_minutes') reasons.push(view.commandAt > now() ? 'The command result time is ahead of the phone clock.' : 'The command report is older than two minutes.');
    if (reason === 'newer_off_mode') reasons.push('Ford reported OFF after this load report; the earlier readings are retained.');
  }
  return reasons.join(' ');
}
function ppoSelected(renderer) {
  const show = renderer.opts && renderer.opts.show || {};
  return PPO_UI_METRICS.filter(key => show[key] === true);
}
function ppoEntries(estimated, selected) {
  const items = {
    ppoa: ['A', estimated.a], ppob: ['B', estimated.b],
    ppototal: ['Total', estimated.total], ppocapacity: [estimated.capacityScope, estimated.capacity]
  };
  return selected.map(key => ({ key, label: items[key][0], value: items[key][1] }));
}
function ppoSnapshotFor(cache, prefs) {
  if (!cache || !prefs || cache.vin !== prefs.vin) return null;
  const snapshot = cache.proPower;
  return snapshot && (!snapshot.vin || snapshot.vin === prefs.vin) ? snapshot : null;
}
function ppoRawSignals(snapshot) {
  const input = snapshot && snapshot.rawSignals || {}, result = Object.create(null);
  for (const key of PPO_UI_RAW_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(input, key)) continue;
    const value = input[key];
    if (typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= Number.MAX_SAFE_INTEGER) result[key] = value;
  }
  return result;
}
function ppoStatusRequestView(request) {
  const outcomes = ['dispatching', 'device_succeeded', 'device_failed', 'accepted_unconfirmed', 'delivery_uncertain'];
  if (!request || !outcomes.includes(request.outcome)) return null;
  const at = ppoUIAt(request.attemptAt);
  return { outcome: request.outcome, attemptAgeSeconds: at === null ? null : Math.floor((now() - at) / 1000) };
}
function ppoRequestLine(request) {
  const safe = ppoStatusRequestView(request);
  if (!safe) return 'Last status request: not recorded.';
  const labels = { dispatching: 'dispatch started; outcome unknown', device_succeeded: 'Ford reported device success',
    device_failed: 'Ford reported failure, expiration or cancellation', accepted_unconfirmed: 'accepted; device completion unconfirmed',
    delivery_uncertain: 'delivery uncertain; no automatic retry' };
  return 'Last status request: ' + labels[safe.outcome] + ' · attempt ' + age(ppoUIAt(request.attemptAt));
}
function ppoRedactedReport(snapshot, request = null) {
  const view = ppoView(snapshot), estimates = ppoEstimated(snapshot);
  const mode = view.latestMode || {};
  const modeAt = ppoUIAt(mode.at), commandAt = ppoUIAt(view.commandAt);
  return {
    tool: 'FordWidget Pro Power', reportVersion: 1, rawSignalSchemaVersion: 1,
    source: 'pttbStatusDataV2', sourceCommandAgeSeconds: commandAt === null ? null : Math.floor((now() - commandAt) / 1000),
    sourceCommandState: PPO_WIDGET_STATES.has(view.commandState) ? view.commandState : null,
    embeddedSampleAgeSeconds: null, embeddedSampleFreshness: 'unverified',
    latestFordMode: { value: ['OFF', 'LOW', 'HIGH'].includes(mode.value) ? mode.value : null,
      ageSeconds: modeAt === null ? null : Math.floor((now() - modeAt) / 1000) },
    lastStatusRequest: ppoStatusRequestView(request), rawSignals: ppoRawSignals(snapshot), estimates,
    interpretation: 'Estimated watts assume 1 raw unit = 1 W, corroborated only on a 7.2 kW truck. Command time does not establish sample time.'
  };
}

const PPO_UI_ORIGINAL_METRICS = Object.freeze([
  'photo', 'fuel', 'battery', 'tires', 'oil', 'lock', 'odometer', 'doors', 'temp', 'parked'
]);
function ppoHasOriginalSelection(renderer) {
  const show = renderer.opts && renderer.opts.show || {};
  return PPO_UI_ORIGINAL_METRICS.some(key => show[key] === true);
}
function ppoAdditiveSummary(renderer, widget, family, selected, originalText) {
  const snapshot = ppoSnapshotFor(renderer.cache, renderer.prefs), view = ppoView(snapshot);
  const entries = ppoEntries(ppoEstimated(snapshot), selected);
  const small = family === 'small', large = family === 'large' || family === 'extraLarge';
  const section = widget.addStack(); section.layoutVertically(); section.spacing = 1;
  section.setPadding(large ? 0 : 3, 0, 1, 0); section.url = renderer.url('propower');
  const text = (content, size, bold = false, color = renderer.muted) => originalText.call(renderer, section, content, size, bold, color);
  const freshness = 'cmd' + ppoShortAge(view.commandAt) + ' · ' + ppoShortMode(view);
  if (large) {
    text('Pro Power · last reported · est.', 9, true);
    text(freshness + ' · sample time unknown', 8);
  } else text(small ? 'PPO last est. · sample time unknown' :
    'PPO last est. · ' + freshness + ' · sample time unknown', small ? 6.5 : 7, true);
  // Keep small-widget freshness separate so reading pairs remain legible.
  if (small) text(freshness, 7);
  // Two readings per line keep every selected field visible at all Home sizes.
  for (let i = 0; i < entries.length; i += 2) {
    const readings = entries.slice(i, i + 2).map(item => {
      const label = item.key === 'ppocapacity' ? item.label === 'A+B capacity' ? 'AB cap' : 'Cap' : item.label;
      return label + ' ' + ppoPowerText(item.value).replace(/\s/g, '');
    }).join(' · ');
    text(readings, small ? 8 : large ? 14 : 9, true, large ? renderer.ink : renderer.muted);
  }
}
function ppoBuildAdditive(renderer, family, notice, selected) {
  const small = family === 'small', large = family === 'large' || family === 'extraLarge';
  const names = ['frame', 'text', 'truck', 'pill', 'buttons', 'tires', '_ppoBeforeControls', '_ppoBeforeFooter'];
  const descriptors = Object.create(null), saved = Object.create(null);
  for (const name of names) { descriptors[name] = Object.getOwnPropertyDescriptor(renderer, name); saved[name] = renderer[name]; }
  let widget = null, inserted = false;
  const insert = root => {
    if (inserted || root !== widget) return;
    inserted = true; root.addSpacer(large ? 4 : 2);
    if (large) ppoDashboardPanel(renderer, root, selected, saved.text);
    else ppoAdditiveSummary(renderer, root, family, selected, saved.text);
  };
  try {
    // Compact the existing layout instead of replacing or filtering its content.
    // All overrides are instance-local and restored even if rendering throws.
    renderer.frame = function(padding) {
      widget = saved.frame.call(this, large ? [8, 12, 7, 12] : small ? [8, 10, 7, 10] : [6, 11, 6, 11]);
      return widget;
    };
    for (const name of ['_ppoBeforeControls', '_ppoBeforeFooter']) renderer[name] = function(root) {
      if (typeof saved[name] === 'function') saved[name].call(this, root);
      insert(root);
    };
    renderer.text = function(stack, content, size = 12, bold = false, color = this.ink) {
      // Upstream's final root text is its nine-point, non-bold timestamp/notice.
      // Check the root and text signature, so arbitrary small-widget notices work.
      // This also remains a fallback for bases without the before-footer hook.
      if (!inserted && widget && stack === widget && size === 9 && bold === false) insert(widget);
      return saved.text.call(this, stack, content, Math.max(7, size * (small ? 0.85 : large ? 0.9 : 0.88)), bold, color);
    };
    renderer.truck = function(stack, width, height) {
      return saved.truck.call(this, stack, width, Math.max(12, height * (small ? 0.75 : large ? 0.85 : 0.7)));
    };
    if (large) renderer.tires = function(stack, size) {
      // This is the original right column, which also holds extras and locks.
      // Tighten its gaps to leave room for the larger PPO readings and timer.
      stack.spacing = 2;
      return saved.tires.call(this, stack, size);
    };
    renderer.pill = function(stack, label, symbol) {
      const pill = saved.pill.call(this, stack, label, symbol);
      pill.setPadding(2, 5, 2, 5); return pill;
    };
    renderer.buttons = function(stack, columns, width, height) {
      return saved.buttons.call(this, stack, columns, width, Math.min(height, large ? 34 : 30));
    };
    return PPO_UI_ORIGINAL_BUILD.call(renderer, family, notice);
  } finally {
    for (const name of names) {
      if (descriptors[name]) Object.defineProperty(renderer, name, descriptors[name]);
      else delete renderer[name];
    }
  }
}

const PPO_UI_ORIGINAL_BUILD = WidgetRenderer.prototype.build;
WidgetRenderer.prototype.build = function(family = 'medium', notice = '') {
  const selected = ppoSelected(this), accessory = String(family).startsWith('accessory');
  const viewWord = this.opts && this.opts.view;
  const accessorySelected = PPO_UI_METRICS.includes(viewWord) || viewWord === 'propower';
  // Preserve first-view parameter semantics, including existing Lock Screen views.
  if (!selected.length || accessory && !accessorySelected) return PPO_UI_ORIGINAL_BUILD.call(this, family, notice);
  // Global checkboxes and mixed positive parameters add PPO to the normal view.
  // Show-only PPO parameters still clear the original flags in widgetOptions.
  if (!accessory && ppoHasOriginalSelection(this)) return ppoBuildAdditive(this, family, notice, selected);
  const snapshot = ppoSnapshotFor(this.cache, this.prefs);
  const view = ppoView(snapshot), estimates = ppoEstimated(snapshot);
  const entries = ppoEntries(estimates, selected), cmd = 'cmd ' + ppoCommandAge(view);
  const mode = ppoModeLine(view), header = 'Pro Power · last reported';
  const primary = entries.find(item => item.key === viewWord) || entries.find(item => item.key === 'ppototal') || entries[0];

  if (accessory) {
    const widget = new ListWidget(); widget.url = this.url('propower'); widget.refreshAfterDate = new Date(this.nextRefresh());
    const white = Color.white();
    if (family === 'accessoryInline') {
      const shortLabel = { ppoa: 'A ', ppob: 'B ', ppototal: '', ppocapacity: estimates.capacityScope === 'A+B capacity' ? 'AB cap ' : 'cap ' }[primary.key];
      // Age and mode precede the value so truncation cannot conceal staleness.
      const text = this.text(widget, 'PPO last · cmd' + ppoShortAge(view.commandAt) + ' · ' + ppoShortMode(view) + ' · ' + shortLabel + ppoPowerText(primary.value).replace(/\s/g, ''), 8, false, white);
      text.minimumScaleFactor = 0.5;
      return widget;
    }
    if (family === 'accessoryCircular') {
      widget.addAccessoryWidgetBackground = true;
      widget.addSpacer();
      this.centered(widget, row => this.text(row, 'PPO · LAST', 8, true, white));
      this.centered(widget, row => this.text(row, 'cmd' + ppoShortAge(view.commandAt), 7, false, white));
      this.centered(widget, row => this.text(row, ppoShortMode(view), 6, false, white));
      this.centered(widget, row => this.text(row, primary.label + ' est.', 7, true, white));
      this.centered(widget, row => this.text(row, ppoPowerText(primary.value), 11, true, white));
      widget.addSpacer();
      return widget;
    }
    this.text(widget, header, 9, true, white);
    for (let i = 0; i < entries.length; i += 2) {
      const line = entries.slice(i, i + 2).map(item => item.label + ' ' + ppoPowerText(item.value)).join(' · ');
      this.text(widget, 'Est. ' + line, 10, true, white);
    }
    this.text(widget, 'cmd' + ppoShortAge(view.commandAt) + ' · ' + ppoShortMode(view), 8, false, white);
    return widget;
  }

  const small = family === 'small', large = family === 'large' || family === 'extraLarge';
  const controls = !small && this.opts.layout[large ? 'large' : 'medium'] === 'controls';
  const widget = this.frame(small ? [10, 11, 9, 11] : [10, 12, 9, 12]);
  widget.url = this.url('propower');
  this.text(widget, header, small ? 10 : 13, true);
  this.text(widget, 'ESTIMATED · sample time unknown', small ? 7 : 8, false, this.muted);
  widget.addSpacer(large ? 8 : 4);
  const body = widget.addStack(); body.layoutHorizontally(); body.spacing = 10;
  const values = body.addStack(); values.layoutVertically(); values.spacing = large ? 6 : 3;
  for (const item of entries) this.text(values, item.label + '  ' + ppoPowerText(item.value), large ? 20 : small ? 12 : 13, true);
  if (!large && controls) {
    body.addSpacer();
    const vehicleControls = body.addStack(); vehicleControls.layoutVertically(); vehicleControls.spacing = 2;
    this.text(vehicleControls, 'Engine / locks / refresh', 8, true, this.muted);
    this.buttons(vehicleControls, 2, 56, 32);
  }
  widget.addSpacer();
  this.text(widget, mode, small ? 7 : large ? 11 : 8, false, this.muted);
  this.text(widget, cmd + (view.stale ? ' · older / unverified' : ' · sample age unverified'), small ? 7 : 8, false, this.muted);
  if (large && estimates.secondaryCapacity > 0) this.text(widget, 'Includes secondary output ' + ppoPowerText(estimates.secondary), 10, false, this.muted);
  if (large && controls) {
    widget.addSpacer(7);
    this.text(widget, 'Engine / locks / refresh', 9, true, this.muted);
    this.buttons(widget, 4, 64, 43);
  }
  if (notice) this.text(widget, notice, 8, false, this.muted);
  return widget;
};

function ppoDetailsText(snapshot, request = null, prefs = null) {
  const view = ppoView(snapshot), e = prefs ? modelProPowerEstimate(snapshot, prefs) : ppoEstimated(snapshot);
  const lines = [
    prefs && e.mappingStatus === 'unverified' ? 'Mapping unverified · raw details' : '',
    'Estimated A: ' + ppoPowerText(e.a), 'Estimated B: ' + ppoPowerText(e.b),
    'Estimated total: ' + ppoPowerText(e.total), e.capacityScope + ': ' + ppoPowerText(e.capacity),
    'A+B subtotal: ' + ppoPowerText(e.abTotal),
    'Secondary usage: ' + ppoPowerText(e.secondary),
    'Command result: ' + (ppoUIAt(view.commandAt) ? new Date(view.commandAt).toLocaleString() : 'time unknown') + ' · ' + ppoCommandAge(view),
    ppoRequestLine(request), ppoModeLine(view), 'Embedded sample time is unverified.',
    ppoStaleText(view),
    prefs ? modelProPowerInterpretation(snapshot, prefs) : 'Experimental estimates assume 1 raw unit = 1 W. Corroborated only on a 7.2 kW truck; other ratings and sentinel codes need validation.'
  ];
  if (e.secondaryCapacity === null) lines.push('Secondary scope is unknown, so overall total is unknown. Capacity shown is A+B only.');
  else if (e.secondary === null) lines.push('Secondary usage is unknown, so overall total is unknown.');
  else if (e.secondaryCapacity > 0) lines.push('Combined capacity and total include the reported secondary output.');
  return lines.filter(Boolean).join('\n');
}
function ppoUIError(error) {
  const text = error && typeof error.message === 'string' ? error.message : '';
  if (/cooling down|A vehicle request was just sent/.test(text)) return 'A request is cooling down. Keep the cached report and wait before requesting again.';
  if (/Connect (?:FordPass|mobile)|Connect .* in the app first/.test(text)) return 'Connect FordPass in the app first, then open Pro Power again.';
  if (text === 'Pro Power baseline could not be read. No vehicle status request was sent.') return text;
  return 'The Pro Power action could not be completed. Its outcome is unconfirmed; it was not automatically retried. Showing the last cached report.';
}
AppController.prototype.confirmProPowerStatus = async function(prefs) {
  requireApp();
  const alert = new Alert(); alert.title = 'Request Pro Power status for ' + appVehicleLabel(prefs) + ' once?';
  alert.message = 'This requests one Pro Power status update and may wake the truck\'s connected electronics. It does not request engine start/stop or outlet switching. The app checks the cloud result for up to 30 seconds after acceptance. Updated measurements are not guaranteed, and the command is never automatically retried.';
  alert.addAction('Request status once'); alert.addCancelAction('Cancel');
  if (await alert.presentAlert() < 0) return false;
  requireApp();
  try {
    const result = await new FordAPIClient(this.auth, this.store, prefs).requestProPowerStatus(true);
    await message('Pro Power status request', result.message);
    return true;
  } catch (error) { await message('Pro Power', ppoUIError(error)); return false; }
};
AppController.prototype.proPowerDetails = async function(prefs) {
  requireApp();
  for (;;) {
    if (!appProPowerEnabled(prefs, this.store)) throw new Error('Pro Power monitoring is not enabled for this vehicle.');
    const cache = this.store.read(), snapshot = ppoSnapshotFor(cache, prefs);
    const request = cache && cache.vin === prefs.vin ? cache.proPowerRequest : null;
    const menu = new Alert(); menu.title = 'Pro Power · last reported'; menu.message = ppoDetailsText(snapshot, request, prefs);
    ['Read cached Pro Power', 'Request status once…', 'View raw signals', 'Copy redacted report'].forEach(label => menu.addAction(label));
    menu.addCancelAction('Close');
    const choice = await menu.presentSheet();
    if (!appProPowerEnabled(prefs, this.store)) throw new Error('Pro Power monitoring is not enabled for this vehicle.');
    if (choice < 0) return;
    if (choice === 0) {
      try { const result = await new FordAPIClient(this.auth, this.store, prefs).readProPower(true); await message('Pro Power cloud cache', result.note); }
      catch (error) { await message('Pro Power', ppoUIError(error)); }
    } else if (choice === 1) await this.confirmProPowerStatus(prefs);
    else if (choice === 2) await this.proPowerReport(prefs, false);
    else if (choice === 3) await this.proPowerReport(prefs, true);
  }
};
const PPO_UI_ORIGINAL_ACTION = AppController.prototype.action;
AppController.prototype.action = async function(action, prefs, compatibilityTest = false) {
  if (!['propower', 'ppofetch', 'ppostatus'].includes(action)) return PPO_UI_ORIGINAL_ACTION.call(this, action, prefs, compatibilityTest);
  requireApp();
  if (action === 'ppofetch') {
    try { const result = await new FordAPIClient(this.auth, this.store, prefs).readProPower(true); await message('Pro Power cloud cache', result.note); }
    catch (error) { await message('Pro Power', ppoUIError(error)); }
  } else if (action === 'ppostatus') await this.confirmProPowerStatus(prefs);
  return this.proPowerDetails(prefs);
};

// Classic keeps its existing PPO dashboard; other gallery designs add a compact section.
function ppoDashboardAge(at, clock = now()) {
  if (typeof at !== 'number' || !Number.isFinite(at) || at <= 0 || at > clock) return 'unknown';
  const seconds = Math.floor((clock - at) / 1000), minutes = Math.floor(seconds / 60);
  if (seconds < 60) return seconds + 's ago';
  if (minutes < 60) return minutes + 'm ago';
  const hours = Math.floor(minutes / 60);
  return hours < 48 ? hours + 'h ' + minutes % 60 + 'm ago' : Math.floor(hours / 24) + 'd ' + hours % 24 + 'h ago';
}

function ppoDashboardPanel(renderer, widget, selected, originalText = renderer.text) {
  const snapshot = ppoSnapshotFor(renderer.cache, renderer.prefs), view = ppoView(snapshot);
  const entries = ppoEntries(ppoEstimated(snapshot), selected);
  const text = (stack, content, size, bold = false, color = renderer.muted) =>
    originalText.call(renderer, stack, content, size, bold, color);
  const panel = widget.addStack(); panel.layoutVertically(); panel.spacing = 1; panel.url = renderer.url('propower');
  const header = panel.addStack(); header.layoutHorizontally(); header.centerAlignContent(); header.spacing = 6;
  text(header, 'Pro Power · last reported estimates', 9, true, renderer.ink);
  header.addSpacer(); text(header, 'Sample time unknown', 7);
  text(panel, 'Status result: ' + ppoDashboardAge(view.commandAt), 7);
  const mode = view.latestMode || {}, modeValue = ['OFF', 'LOW', 'HIGH'].includes(mode.value) ? mode.value : 'unknown';
  text(panel, 'Ford mode: ' + modeValue + ' · reported ' + ppoDashboardAge(mode.at), 7);
  for (let i = 0; i < entries.length; i += 2) {
    const row = panel.addStack(); row.layoutHorizontally(); row.spacing = 8;
    row.addSpacer();
    for (const item of entries.slice(i, i + 2)) {
      const cell = row.addStack(); cell.layoutVertically(); cell.size = new Size(138, 0);
      const label = item.label === 'Combined capacity' ? 'Combined cap' : item.label;
      text(cell, label + ' ' + ppoPowerText(item.value), 12, true, renderer.ink);
    }
    row.addSpacer();
  }
  return panel;
}

function ppoDashboardVehicle(renderer, widget) {
  const vehicle = widget.addStack(); vehicle.layoutVertically(); vehicle.spacing = 3;
  const header = vehicle.addStack(); header.layoutHorizontally(); header.centerAlignContent(); header.spacing = 6;
  renderer.truck(header, 64, 24);
  const name = header.addStack(); name.layoutVertically();
  renderer.text(name, renderer.prefs.name || 'F-150', 14, true);
  renderer.text(name, 'Vehicle · last reported', 8, false, renderer.muted);
  header.addSpacer(); renderer.runningBadge(header, 12, false);

  if (renderer.on('fuel') || renderer.on('battery')) {
    const row = vehicle.addStack(); row.layoutHorizontally(); row.centerAlignContent(); row.spacing = 8;
    if (renderer.on('fuel')) {
      const fuel = row.addStack(); fuel.layoutVertically(); fuel.spacing = 1;
      // Unknown fuel must not resemble a full gauge, even in the light theme.
      if (finite(renderer.value('fuel')) === null) {
        renderer.text(fuel, 'Fuel unavailable', 11, true);
        renderer.text(fuel, 'Range ' + renderer.number('range', ' mi'), 9, false, renderer.muted);
      } else renderer.fuel(fuel, 132);
    }
    row.addSpacer(); renderer.batteryPill(row);
  }

  if (renderer.on('tires')) {
    const row = vehicle.addStack(); row.layoutHorizontally(); row.centerAlignContent(); row.spacing = 9;
    renderer.text(row, 'TIRES · ' + renderer.opts.unit.toUpperCase(), 8, true, renderer.muted);
    for (const key of ['fl', 'fr', 'rl', 'rr']) {
      const cell = row.addStack(); cell.layoutVertically();
      renderer.text(cell, key.toUpperCase(), 8, false, renderer.muted);
      renderer.text(cell, renderer.tire(key), 11, true);
    }
  }

  const extras = [];
  if (renderer.on('oil')) extras.push('Oil ' + renderer.number('oil', '%'));
  if (renderer.on('odometer')) extras.push('Odometer ' + renderer.number('odometer', ' mi'));
  if (renderer.on('temp')) extras.push('Outside ' + renderer.temp());
  if (extras.length) {
    const row = vehicle.addStack(); row.layoutHorizontally(); row.spacing = 10;
    for (const line of extras) renderer.text(row, line, 10, true);
  }

  if (renderer.on('lock') || renderer.on('doors')) {
    const row = vehicle.addStack(); row.layoutHorizontally(); row.spacing = 8;
    for (const key of ['lock', 'doors']) {
      if (!renderer.on(key)) continue;
      const cell = row.addStack(); cell.layoutVertically(); cell.spacing = 1; cell.size = new Size(138, 0);
      if (key === 'lock') renderer.lockPill(cell);
      else renderer.text(cell, 'Doors ' + (renderer.value('doors') || 'Unknown'), 10, true);
      const field = renderer.fields[key];
      renderer.text(cell, 'Reported: ' + ppoDashboardAge(field && field.at), 8, false, renderer.muted);
    }
  }

  if (renderer.on('parked')) {
    if (renderer.place()) renderer.parkedRow(vehicle, 9);
    else renderer.text(vehicle, 'Parked location unavailable', 9, false, renderer.muted);
  }
  return vehicle;
}

function ppoClassicDashboardPanel(renderer, widget, selected) {
  const snapshot = ppoSnapshotFor(renderer.cache, renderer.prefs), view = ppoView(snapshot);
  const entries = ppoEntries(ppoEstimated(snapshot), selected);
  const panel = widget.addStack(); panel.layoutVertically(); panel.spacing = 2; panel.url = renderer.url('propower');
  const header = panel.addStack(); header.layoutHorizontally(); header.centerAlignContent(); header.spacing = 6;
  renderer.text(header, 'Pro Power · last reported estimates', 9, true);
  header.addSpacer(); renderer.text(header, 'Sample time unknown', 8, false, renderer.muted);
  renderer.text(panel, 'Status result: ' + ppoDashboardAge(view.commandAt), 8, false, renderer.muted);
  const mode = view.latestMode || {}, modeValue = ['OFF', 'LOW', 'HIGH'].includes(mode.value) ? mode.value : 'unknown';
  renderer.text(panel, 'Ford mode: ' + modeValue + ' · reported ' + ppoDashboardAge(mode.at), 8, false, renderer.muted);
  for (let i = 0; i < entries.length; i += 2) {
    const row = panel.addStack(); row.layoutHorizontally(); row.spacing = 8;
    row.addSpacer();
    for (const item of entries.slice(i, i + 2)) {
      const card = row.addStack(); card.layoutVertically(); card.spacing = 1;
      card.size = new Size(138, 0); card.setPadding(4, 7, 4, 7); card.cornerRadius = 8; card.backgroundColor = renderer.panel;
      renderer.text(card, item.label, 9, true, renderer.muted);
      renderer.text(card, ppoPowerText(item.value), 16, true);
    }
    row.addSpacer();
  }
  return panel;
}

function ppoBuildDashboard(renderer, family, notice, selected) {
  const widget = renderer.frame([8, 12, 8, 12]);
  // The root retains the main-menu target; only the PPO panel opens its details.
  ppoDashboardVehicle(renderer, widget);
  widget.addSpacer(6); ppoClassicDashboardPanel(renderer, widget, selected);
  widget.addSpacer();
  const permissions = renderer.prefs.compatibility && renderer.prefs.compatibility.commands;
  const controls = !permissions || ['lock', 'unlock', renderer.remote() ? 'stop' : 'start', 'refresh'].some(action => permissions[action] !== false);
  if (renderer.opts.layout.large === 'controls' && controls) {
    renderer.text(widget, 'Vehicle controls', 8, true, renderer.muted);
    widget.addSpacer(2); renderer.buttons(widget, 4, 64, 34);
  }
  widget.addSpacer(3);
  const status = notice || (renderer.cache.notice ? 'cached source unavailable' : '');
  const line = 'Oldest vehicle reading: ' + ppoDashboardAge(renderer.oldest()) + (status ? ' · ' + status : '');
  const footer = typeof renderer.footer === 'function' ? renderer.footer(line) : line;
  renderer.text(widget, footer, 8, false, renderer.muted);
  if (notice && !footer.includes(notice)) renderer.text(widget, notice, 8, false, renderer.muted);
  return widget;
}

const PPO_DASHBOARD_ORIGINAL_BUILD = WidgetRenderer.prototype.build;
WidgetRenderer.prototype.build = function(family = 'medium', notice = '') {
  const selected = ppoSelected(this), design = this.opts.design && this.opts.design.large || 'classic';
  // Keep the existing mixed Classic dashboard; other gallery designs retain
  // their upstream vehicle layout and receive the compact additive section.
  if ((family === 'large' || family === 'extraLarge') && design === 'classic' && selected.length && ppoHasOriginalSelection(this))
    return ppoBuildDashboard(this, family, notice, selected);
  return PPO_DASHBOARD_ORIGINAL_BUILD.call(this, family, notice);
};

// Local metadata only: fixed gate names, fixed cache fields, and no token reads.
// Missing historical HTTP metadata stays unknown; a gate is not an HTTP trace.
const FORDWIDGET_VERSION = '0.1.0';
const WIDGET_DIAGNOSTIC_GATES = Object.freeze([
  'commands', 'commands.generalStatus', 'commands.proPower', 'telemetry.mobile',
  'telemetry.proPower', 'auth.mobile', 'auth.autonomic'
]);
const WIDGET_DIAGNOSTIC_TIMERS = Object.freeze([
  'widgetRefreshAfter', 'commandAfter', 'wakeAfter', 'proPowerRequestAfter',
  'proPowerReadAfter', 'nextFetch'
]);
const WIDGET_DIAGNOSTIC_REQUEST_OUTCOMES = Object.freeze([
  'dispatching', 'device_succeeded', 'device_failed', 'accepted_unconfirmed', 'delivery_uncertain'
]);
const WIDGET_DIAGNOSTIC_STEPS = Object.freeze({
  generalStatus: ['device_succeeded', 'device_failed', 'accepted_unconfirmed', 'delivery_uncertain',
    'cooldown', 'baseline_unavailable', 'blocked', 'unconfirmed', 'requires_fordpass'],
  proPowerRequest: ['device_succeeded', 'device_failed', 'accepted_unconfirmed', 'delivery_uncertain',
    'unconfirmed', 'unconfirmed_or_cooling_down', 'requires_fordpass'],
  telemetry: ['saved', 'partial', 'cached_or_unavailable', 'failed'],
  proPowerRead: ['checked', 'cached_or_unavailable', 'failed', 'already_checked_by_request', 'requires_fordpass'],
  place: ['checked', 'failed', 'skipped'], photo: ['checked', 'failed', 'skipped']
});
function widgetDiagnosticOwn(object, key) {
  if (!object || typeof object !== 'object' || Array.isArray(object)) return undefined;
  try {
    const descriptor = Object.getOwnPropertyDescriptor(object, key);
    return descriptor && Object.prototype.hasOwnProperty.call(descriptor, 'value') ? descriptor.value : undefined;
  } catch (_) { return undefined; }
}
function widgetDiagnosticNumber(value, maximum = Number.MAX_SAFE_INTEGER) {
  return typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= maximum ? value : null;
}
function widgetDiagnosticTime(value) {
  return widgetDiagnosticNumber(value, 8640000000000000) !== null && value > 0 ? value : null;
}
function widgetDiagnosticAge(value, clock) {
  const at = widgetDiagnosticTime(value);
  return at !== null && clock !== null && at <= clock ? Math.floor((clock - at) / 1000) : null;
}
function widgetDiagnosticRemaining(value, clock) {
  const at = widgetDiagnosticTime(value);
  return at !== null && clock !== null ? Math.max(0, Math.ceil((at - clock) / 1000)) : null;
}
function widgetDiagnosticRequest(request, clock) {
  const outcome = widgetDiagnosticOwn(request, 'outcome');
  return WIDGET_DIAGNOSTIC_REQUEST_OUTCOMES.includes(outcome) ? {
    outcome, attemptAgeSeconds: widgetDiagnosticAge(widgetDiagnosticOwn(request, 'attemptAt'), clock)
  } : null;
}
function widgetDiagnosticContext(cache, clock = now()) {
  const time = widgetDiagnosticTime(clock), gates = {}, cooldowns = {};
  for (const name of WIDGET_DIAGNOSTIC_GATES) {
    let gate;
    try { gate = secretGet('gate.' + name); } catch (_) { /* Unavailable metadata stays unknown. */ }
    const remaining = widgetDiagnosticRemaining(widgetDiagnosticOwn(gate, 'next'), time);
    const failures = widgetDiagnosticNumber(widgetDiagnosticOwn(gate, 'failures'), 10);
    const status = widgetDiagnosticNumber(widgetDiagnosticOwn(gate, 'httpStatus'), 599);
    gates[name] = {
      active: remaining === null ? null : remaining > 0, secondsRemaining: remaining,
      failures: failures !== null && Number.isInteger(failures) && failures >= 0 ? failures : null,
      httpStatus: status !== null && Number.isInteger(status) && (status === 0 || status >= 100) ? status : null,
      failedAgeSeconds: widgetDiagnosticAge(widgetDiagnosticOwn(gate, 'failedAt'), time)
    };
  }
  for (const name of WIDGET_DIAGNOSTIC_TIMERS)
    cooldowns[name] = widgetDiagnosticRemaining(widgetDiagnosticOwn(cache, name), time);
  const ppo = widgetDiagnosticOwn(cache, 'proPower');
  const fields = widgetDiagnosticOwn(cache, 'fields'), fuel = widgetDiagnosticOwn(fields, 'fuel');
  const fuelInput = widgetDiagnosticOwn(fuel, 'value');
  const fuelNumber = typeof fuelInput === 'number' || typeof fuelInput === 'string' && fuelInput.length <= 40 ? finite(fuelInput) : null;
  const fuelValue = widgetDiagnosticNumber(fuelNumber, 1000000);
  const fuelRaw = widgetDiagnosticNumber(widgetDiagnosticOwn(fuel, 'rawValue'), 1000000);
  const fuelAt = widgetDiagnosticTime(widgetDiagnosticOwn(fuel, 'at'));
  const fuelSource = widgetDiagnosticOwn(fuel, 'source');
  const last = widgetDiagnosticOwn(cache, 'widgetRefreshLast'), outcome = widgetDiagnosticOwn(last, 'outcome');
  let lastFullRefresh = null;
  if (['in_progress', 'completed', 'cooldown', 'blocked', 'cancelled'].includes(outcome)) {
    const input = widgetDiagnosticOwn(last, 'steps'), steps = {};
    for (const name of Object.keys(WIDGET_DIAGNOSTIC_STEPS)) {
      const value = widgetDiagnosticOwn(input, name);
      if (WIDGET_DIAGNOSTIC_STEPS[name].includes(value)) steps[name] = value;
    }
    lastFullRefresh = { attemptAgeSeconds: widgetDiagnosticAge(widgetDiagnosticOwn(last, 'attemptAt'), time), outcome, steps };
  }
  return {
    appVersion: FORDWIDGET_VERSION, gates, cooldowns,
    lastGeneralStatusRequest: widgetDiagnosticRequest(widgetDiagnosticOwn(cache, 'generalStatusRequest'), time),
    lastProPowerStatusRequest: widgetDiagnosticRequest(widgetDiagnosticOwn(cache, 'proPowerRequest'), time),
    cachedProPower: { commandAgeSeconds: widgetDiagnosticAge(widgetDiagnosticOwn(ppo, 'commandAt'), time),
      fetchedAgeSeconds: widgetDiagnosticAge(widgetDiagnosticOwn(ppo, 'fetchedAt'), time) },
    cachedFuel: fuel ? { value: fuelValue, rawValue: fuelRaw, atMs: fuelAt !== null && time !== null && fuelAt <= time ? fuelAt : null,
      ageSeconds: widgetDiagnosticAge(fuelAt, time), source: ['FordPass', 'FordConnect'].includes(fuelSource) ? fuelSource : null } : null,
    lastFullRefresh
  };
}

// Pure fuel investigation using an already-fetched response. No I/O or cache write.
const statusFuelType = value => value === undefined ? 'missing' : value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value;
function statusFuelNumber(value) {
  const inputType = statusFuelType(value);
  const n = inputType === 'number' || inputType === 'string' && value.length <= 40 ? finite(value) : null;
  const safe = n !== null && Math.abs(n) <= 1000000;
  return { inputType, numericValue: safe ? n : null, withheldCount: value !== undefined && value !== null && !safe ? 1 : 0 };
}
function statusFuelEntry(entry, units, clock) {
  const record = statusDiagRecord(entry), own = key => record && statusDiagOwn(entry, key) ? entry[key] : undefined;
  return { entryType: statusFuelType(entry),
    value: statusFuelNumber(own('value')),
    unit: statusDiagnosticEnum(own('unit'), units),
    unitSymbol: statusDiagnosticEnum(own('unitSymbol'), units),
    updateTime: statusDiagnosticTime(own('updateTime'), clock) };
}
function statusFuelFields(fields, clock) {
  const item = statusDiagRecord(fields) && statusDiagOwn(fields, 'fuel') && statusDiagRecord(fields.fuel) ? fields.fuel : null;
  return { fuel: item ? { value: statusFuelNumber(item.value),
    rawValue: statusFuelNumber(item.rawValue),
    source: ['FordPass', 'FordConnect'].includes(item.source) ? item.source : null,
    at: statusDiagnosticTime(item.at, clock) } : null };
}
function statusFuelDiagnostic(raw, before, vin, clock = now(), after = before) {
  if (typeof vin !== 'string' || vin.length !== 17 || !vinOK(vin) || !statusDiagRecord(raw))
    throw new Error('Fuel diagnostic response vehicle mismatch.');
  const root = statusDiagOwn(raw, 'vehicleStatus') ? raw.vehicleStatus : raw;
  if (!statusDiagRecord(root) || !statusDiagRecord(root.metrics)) throw new Error('Fuel diagnostic response schema unsupported.');
  for (const object of [raw, root]) for (const key of ['vin', 'VIN']) {
    if (statusDiagOwn(object, key) && (typeof object[key] !== 'string' || object[key].toUpperCase() !== vin))
      throw new Error('Fuel diagnostic response vehicle mismatch.');
  }
  statusDiagValidateCache(before, vin); statusDiagValidateCache(after, vin);
  const metrics = root.metrics, fuel = statusDiagOwn(metrics, 'fuelLevel') ? metrics.fuelLevel : undefined;
  const value = statusDiagRecord(fuel) && statusDiagOwn(fuel, 'value') ? fuel.value : undefined;
  const n = finite(value);
  const reason = fuel === undefined || fuel === null || statusDiagRecord(fuel) && (value === undefined || value === null) ? 'fuel_missing' :
    n === null ? 'non_numeric' : n < 0 ? 'out_of_0_100' : n > 100 ? 'clamped_to_100' : 'accepted';
  let candidate = {}, normalization = 'completed';
  try { candidate = normalize(raw, vin, 'FordPass', clock); }
  catch (_) { normalization = 'no_supported_fields_or_schema'; }
  const only = fields => statusDiagOwn(fields, 'fuel') ? { fuel: fields.fuel } : {};
  const merged = mergeFields(only(before.fields), {}, only(candidate));
  return { readOnly: true, scope: 'fuelLevel percentage; positive over-100 readings clamp to 100 with raw value retained. No aliases or unit conversion applied.',
    normalization, reason, rootUpdateTime: statusDiagnosticTime(root.updateTime, clock),
    raw: { fuelLevel: statusFuelEntry(fuel, ['%', 'percent', 'percentage'], clock),
      fuelRange: statusFuelEntry(statusDiagOwn(metrics, 'fuelRange') ? metrics.fuelRange : undefined,
        ['km', 'kilometer', 'kilometers', 'mi', 'mile', 'miles'], clock) },
    before: statusFuelFields(before.fields, clock), normalizedCandidate: statusFuelFields(candidate, clock),
    wouldMerge: statusFuelFields(merged, clock), cachedAfter: statusFuelFields(after.fields, clock) };
}

// Observe the existing temperature parser and merge without changing saved data.
const STATUS_TEMP_UNITS = Object.freeze(['C', '°C', 'celsius', 'degC', 'CELSIUS', 'DEGREES_CELSIUS',
  'F', '°F', 'fahrenheit', 'degF', 'FAHRENHEIT', 'DEGREES_FAHRENHEIT', 'K', 'kelvin']);
const STATUS_TEMP_SCOPE = 'One FordPass response compared with saved cache; no simultaneous FordConnect read. Existing outsideTemperature parser assumes Celsius and ignores unit labels. No conversion, alias, range or merge changes applied.';
function statusTemperatureFields(fields, clock) {
  const item = statusDiagRecord(fields) && statusDiagOwn(fields, 'outsideTemp') && statusDiagRecord(fields.outsideTemp) ? fields.outsideTemp : null;
  const value = item ? statusFuelNumber(item.value) : null;
  return { outsideTemp: item ? { value, asDisplayedFahrenheit: value.numericValue === null ? null : Math.round(value.numericValue * 9 / 5 + 32),
    source: ['FordPass', 'FordConnect'].includes(item.source) ? item.source : null,
    at: statusDiagnosticTime(item.at, clock) } : null };
}
function statusTemperatureCached(before, after, clock) {
  return { readOnly: true, scope: STATUS_TEMP_SCOPE, normalization: 'not_attempted', reason: 'cloud_unavailable',
    timestampSource: 'unknown', mergeDecision: 'not_evaluated', raw: null,
    before: statusTemperatureFields(before.fields, clock), normalizedCandidate: statusTemperatureFields({}, clock),
    wouldMerge: statusTemperatureFields(before.fields, clock), cachedAfter: statusTemperatureFields(after.fields, clock) };
}
function statusTemperatureDiagnostic(raw, before, vin, clock = now(), after = before) {
  if (typeof vin !== 'string' || vin.length !== 17 || !vinOK(vin) || !statusDiagRecord(raw))
    throw new Error('Temperature diagnostic response vehicle mismatch.');
  const root = statusDiagOwn(raw, 'vehicleStatus') ? raw.vehicleStatus : raw;
  if (!statusDiagRecord(root) || !statusDiagRecord(root.metrics)) throw new Error('Temperature diagnostic response schema unsupported.');
  for (const object of [raw, root]) for (const key of ['vin', 'VIN']) {
    if (statusDiagOwn(object, key) && (typeof object[key] !== 'string' || object[key].toUpperCase() !== vin))
      throw new Error('Temperature diagnostic response vehicle mismatch.');
  }
  statusDiagValidateCache(before, vin); statusDiagValidateCache(after, vin);
  const entry = statusDiagOwn(root.metrics, 'outsideTemperature') ? root.metrics.outsideTemperature : undefined;
  const own = key => statusDiagRecord(entry) && statusDiagOwn(entry, key) ? entry[key] : undefined;
  const value = own('value'), number = finite(value);
  const reason = entry === undefined || entry === null ? 'metric_missing' : !statusDiagRecord(entry) ? 'invalid_metric_shape' :
    value === undefined || value === null ? 'value_missing' : number === null ? 'non_numeric' :
    number <= -60 || number >= 70 ? 'out_of_parser_range' : 'accepted';
  let candidate = {}, normalization = 'completed';
  try { candidate = normalize(raw, vin, 'FordPass', clock); }
  catch (_) { normalization = 'no_supported_fields_or_schema'; }
  const only = fields => statusDiagOwn(fields, 'outsideTemp') ? { outsideTemp: fields.outsideTemp } : {};
  const merged = mergeFields(only(before.fields), {}, only(candidate));
  const incoming = candidate.outsideTemp, previous = before.fields.outsideTemp;
  const mergeDecision = !incoming ? 'no_candidate' : !previous ? 'accepted_no_cached_value' : !previous.at ? 'accepted_cached_time_missing' :
    !incoming.at ? 'retained_candidate_time_missing' : incoming.at >= previous.at ? 'accepted_not_older' : 'retained_candidate_older';
  return { readOnly: true, scope: STATUS_TEMP_SCOPE, normalization, reason,
    timestampSource: !incoming ? 'unknown' : timestamp(own('updateTime')) !== null ? 'metric' : timestamp(root.updateTime) !== null ? 'root' : 'unknown',
    mergeDecision, rootUpdateTime: statusDiagnosticTime(root.updateTime, clock),
    raw: { outsideTemperature: statusFuelEntry(entry, STATUS_TEMP_UNITS, clock) },
    before: statusTemperatureFields(before.fields, clock), normalizedCandidate: statusTemperatureFields(candidate, clock),
    wouldMerge: statusTemperatureFields(merged, clock), cachedAfter: statusTemperatureFields(after.fields, clock) };
}

// Passive, redacted lock/door investigation. No cache write or vehicle command.
const STATUS_DIAG_COMPONENTS = Object.freeze(['ALL_DOORS', 'FRONT_LEFT', 'FRONT_RIGHT', 'REAR_LEFT', 'REAR_RIGHT',
  'LEFT_FRONT', 'RIGHT_FRONT', 'LEFT_REAR', 'RIGHT_REAR', 'HOOD', 'TAILGATE', 'TRUNK', 'CARGO', 'DRIVER', 'PASSENGER',
  'FRUNK', 'INNER_TAILGATE', 'REAR_CARGO_LEFT', 'REAR_CARGO_RIGHT', 'SLIDING_LEFT', 'SLIDING_RIGHT',
  'UNKNOWN_DOOR', 'UNSPECIFIED_DOOR', 'UNSPECIFIED_FRONT', 'UNSPECIFIED_REAR']);
const STATUS_DIAG_LOCKS = Object.freeze(['LOCKED', 'DOUBLE_LOCKED', 'UNLOCKED', 'UNKNOWN']);
const STATUS_DIAG_DOORS = Object.freeze(['OPEN', 'AJAR', 'CLOSED', 'UNKNOWN', 'INVALID']);
const statusDiagRecord = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const statusDiagOwn = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
function statusDiagnosticEnum(value, allowed) {
  const canonical = typeof value === 'string' && value.length <= 32 ? allowed.find(item => item.toUpperCase() === value.toUpperCase()) : undefined;
  return { value: canonical === undefined ? null : value, exactEnumMatch: canonical !== undefined && allowed.includes(value),
    withheldCount: value !== undefined && canonical === undefined ? 1 : 0 };
}
function statusDiagnosticTime(value, clock = now()) {
  const inputType = value === undefined ? 'missing' : value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value;
  const out = { inputType, format: inputType === 'missing' || inputType === 'null' ? inputType : 'withheld',
    rawValue: null, normalizerAtMs: null, asMillisecondsISO: null, asEpochSecondsISO: null,
    withheldCount: value === undefined || value === null ? 0 : 1 };
  const numeric = typeof value === 'number' ? value : typeof value === 'string' && value.length <= 40 && /^\d{1,16}(?:\.\d{1,6})?$/.test(value) ? Number(value) : NaN;
  if (Number.isFinite(numeric) && (numeric === 0 || numeric >= 946684800 && numeric <= clock / 1000 + 60 || numeric >= 946684800000 && numeric <= clock + 60000)) {
    const seconds = numeric >= 946684800 && numeric <= clock / 1000 + 60;
    out.format = numeric === 0 ? 'zero' : seconds ? 'epoch_seconds' : 'epoch_milliseconds';
    out.rawValue = value; out.withheldCount = 0; out.asMillisecondsISO = new Date(numeric).toISOString();
    if (seconds) out.asEpochSecondsISO = new Date(numeric * 1000).toISOString();
    out.normalizerAtMs = timestamp(value);
  } else if (typeof value === 'string' && value.length <= 40 && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/.test(value)) {
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed) && parsed >= 946684800000 && parsed <= clock + 60000) {
      out.format = 'iso'; out.rawValue = value; out.withheldCount = 0; out.normalizerAtMs = timestamp(value); out.asMillisecondsISO = new Date(parsed).toISOString();
    }
  }
  return out;
}
function statusDiagnosticFields(fields, clock) {
  const result = {};
  for (const key of ['lock', 'doors']) {
    const item = statusDiagRecord(fields) && statusDiagOwn(fields, key) && statusDiagRecord(fields[key]) ? fields[key] : null;
    result[key] = item ? { value: statusDiagnosticEnum(item.value, key === 'lock' ? ['Locked', 'Unlocked', 'Unknown'] : ['Closed', 'Ajar', 'Unknown']),
      source: ['FordPass', 'FordConnect'].includes(item.source) ? item.source : null,
      at: statusDiagnosticTime(item.at, clock) } : null;
  }
  return result;
}
function statusDiagnosticEntry(entry, allowed, clock) {
  if (!statusDiagRecord(entry)) return { malformed: true, withheldCount: entry === undefined ? 0 : 1 };
  const tags = statusDiagRecord(entry.tags) ? entry.tags : {};
  const component = statusDiagnosticEnum(entry.vehicleDoor, STATUS_DIAG_COMPONENTS);
  const value = statusDiagnosticEnum(entry.value, allowed);
  const latchValues = ['MECHANICAL', 'ELECTRONIC', 'UNKNOWN'];
  const latch = statusDiagnosticEnum(tags.DOOR_LATCH_TYPE, latchValues);
  const directLatch = statusDiagnosticEnum(entry.doorLatchType, latchValues);
  const side = statusDiagnosticEnum(entry.vehicleSide, ['UNKNOWN', 'DRIVER', 'PASSENGER']);
  const role = statusDiagnosticEnum(entry.vehicleOccupantRole, ['UNKNOWN', 'DRIVER', 'PASSENGER']);
  const updateTime = statusDiagnosticTime(entry.updateTime, clock);
  return { component, value, doorLatchType: latch, directDoorLatchType: directLatch, vehicleSide: side, vehicleOccupantRole: role, updateTime,
    withheldCount: component.withheldCount + value.withheldCount + latch.withheldCount + directLatch.withheldCount + side.withheldCount + role.withheldCount + updateTime.withheldCount +
      (entry.tags !== undefined && !statusDiagRecord(entry.tags) ? 1 : 0) +
      Object.keys(entry).filter(key => !['vehicleDoor', 'value', 'tags', 'updateTime', 'doorLatchType', 'vehicleSide', 'vehicleOccupantRole'].includes(key)).length +
      Object.keys(tags).filter(key => key !== 'DOOR_LATCH_TYPE').length };
}
function statusDiagnosticArray(value, allowed, clock) {
  if (!Array.isArray(value)) return { items: [], count: 0, omittedCount: 0, malformed: value !== undefined, withheldCount: value === undefined ? 0 : 1 };
  return { items: value.slice(0, 32).map(entry => statusDiagnosticEntry(entry, allowed, clock)), count: value.length,
    omittedCount: Math.max(0, value.length - 32), malformed: false };
}
function statusDiagValidateCache(cache, vin) {
  if (!statusDiagRecord(cache) || cache.vin !== vin || !statusDiagRecord(cache.fields)) throw new Error('Diagnostic cache vehicle mismatch.');
}
function statusDiagnosticGeneralRequest(cache, clock) {
  const entry = statusDiagRecord(cache.generalStatusRequest) ? cache.generalStatusRequest : null;
  if (!entry) return null;
  const allowed = ['dispatching', 'device_succeeded', 'device_failed', 'accepted_unconfirmed', 'delivery_uncertain'];
  const at = typeof entry.attemptAt === 'number' && Number.isFinite(entry.attemptAt) && entry.attemptAt > 0 && entry.attemptAt <= clock ? entry.attemptAt : null;
  return { outcome: allowed.includes(entry.outcome) ? entry.outcome : null,
    attemptAgeSeconds: at === null ? null : Math.floor((clock - at) / 1000) };
}
function statusDiagnosticReport(raw, before, vin, clock = now(), after = before) {
  if (typeof vin !== 'string' || vin.length !== 17 || !vinOK(vin) || !statusDiagRecord(raw)) throw new Error('Diagnostic response vehicle mismatch.');
  const root = statusDiagOwn(raw, 'vehicleStatus') ? raw.vehicleStatus : raw;
  if (!statusDiagRecord(root) || !statusDiagRecord(root.metrics)) throw new Error('Diagnostic response schema unsupported.');
  for (const object of [raw, root]) for (const key of ['vin', 'VIN']) {
    if (statusDiagOwn(object, key) && (typeof object[key] !== 'string' || object[key].toUpperCase() !== vin)) throw new Error('Diagnostic response vehicle mismatch.');
  }
  statusDiagValidateCache(before, vin); statusDiagValidateCache(after, vin);
  let candidate = {}, normalization = 'completed';
  try { candidate = normalize(raw, vin, 'FordPass', clock); }
  catch (_) { normalization = 'no_supported_fields_or_schema'; }
  const only = fields => Object.fromEntries(['lock', 'doors'].filter(key => statusDiagOwn(fields, key)).map(key => [key, fields[key]]));
  const merged = mergeFields(only(before.fields), {}, only(candidate));
  return { tool: 'FordWidget door / lock diagnostic', reportVersion: 2, readOnly: true,
    normalization, rootUpdateTime: statusDiagnosticTime(root.updateTime, clock),
    lastGeneralStatusRequest: statusDiagnosticGeneralRequest(after, clock),
    before: statusDiagnosticFields(before.fields, clock), normalizedCandidate: statusDiagnosticFields(candidate, clock),
    wouldMerge: statusDiagnosticFields(merged, clock), cachedAfter: statusDiagnosticFields(after.fields, clock),
    raw: { doorLockStatus: statusDiagnosticArray(root.metrics.doorLockStatus, STATUS_DIAG_LOCKS, clock),
      doorStatus: statusDiagnosticArray(root.metrics.doorStatus, STATUS_DIAG_DOORS, clock),
      hoodStatus: statusDiagnosticEntry(root.metrics.hoodStatus, STATUS_DIAG_DOORS, clock) } };
}
AppController.prototype.vehicleStatusDiagnostic = async function(prefs) {
  requireApp();
  try {
    const vin = prefs && prefs.vin;
    const validate = () => {
      requireApp(); this.store.assertLease();
      const configured = secretGet('vehicle');
      if (typeof vin !== 'string' || vin.length !== 17 || !vinOK(vin) || !configured || configured.vin !== vin || prefs.vin !== vin) throw new Error('Diagnostic configured vehicle changed.');
    };
    validate();
    if (!secretGet('token.mobile')) { await message('Vehicle data diagnostic', 'Connect FordPass first. No cloud read was sent.'); return null; }
    const choice = new Alert(); choice.title = 'Vehicle data diagnostic';
    choice.message = 'Check the saved cooldowns and compare one passive Ford cloud read with cached temperature, fuel, door and lock readings. No vehicle command or telemetry-cache update is requested. A redacted cached report remains available if the cloud read is blocked.';
    choice.addAction('Preview report'); choice.addAction('Copy report'); choice.addCancelAction('Cancel');
    const selected = await choice.presentAlert(); if (selected < 0) return null;
    validate(); const before = this.store.read(); statusDiagValidateCache(before, vin);
    let raw = null, cloudReadOutcome = 'unavailable';
    try {
      raw = await new FordAPIClient(this.auth, this.store, prefs).mobileTelemetry();
      cloudReadOutcome = 'succeeded';
    } catch (_) { /* Report only safe cached gates/status; never copy raw errors. */ }
    validate(); const after = this.store.read(); statusDiagValidateCache(after, vin);
    const clock = now();
    let report = null;
    if (raw !== null) {
      try {
        report = statusDiagnosticReport(raw, before, vin, clock, after);
        report.fuel = statusFuelDiagnostic(raw, before, vin, clock, after);
        report.temperature = statusTemperatureDiagnostic(raw, before, vin, clock, after);
      } catch (_) { report = null; cloudReadOutcome = 'response_rejected'; }
    }
    if (!report) report = { readOnly: true, before: statusDiagnosticFields(before.fields, clock),
      cachedAfter: statusDiagnosticFields(after.fields, clock), fuel: null, temperature: statusTemperatureCached(before, after, clock) };
    report.tool = 'FordWidget vehicle data diagnostic';
    report.reportVersion = 5;
    report.appVersion = FORDWIDGET_VERSION;
    report.cloudReadOutcome = cloudReadOutcome;
    report.refreshDiagnostics = widgetDiagnosticContext(after, clock);
    const text = JSON.stringify(report, null, 2);
    let copy = selected === 1;
    if (!copy) {
      await QuickLook.present(text); validate();
      const next = new Alert(); next.title = 'Redacted report ready'; next.message = 'Copy this same report to share temperature/fuel/status timestamps and cooldown details. No additional cloud read is needed.';
      next.addAction('Copy report'); next.addCancelAction('Close'); copy = await next.presentAlert() === 0;
    }
    validate();
    if (copy) { Pasteboard.copyString(text); await message('Vehicle data diagnostic', 'Redacted report copied.'); }
    return report;
  } catch (_) { await message('Vehicle data diagnostic', 'The diagnostic could not be completed. Raw errors are withheld. No vehicle command or telemetry-cache update was requested.'); return null; }
};

// General TCU status push uses the original v1 command, separate from PPO.
const GENERAL_STATUS_STATES = new Set(('REQUESTED REQUEST_DELIVERY_QUEUED CANCELLATION_IN_PROGRESS EXPIRED CANCELLED FAILURE SUCCESS SUCCEEDED_ON_DEVICE OEM_CLOUD_DELIVERY_IN_PROGRESS REQUEST_DELIVERY_IN_PROGRESS OEM_CLOUD_TRANSLATION_IN_PROGRESS REQUEST_QUEUED REQUEST_DELIVERY_FAILURE REQUEST_DELIVERY_TIMED_OUT REQUEST_VALIDATION_IN_PROGRESS REQUEST_VALIDATION_FAILURE CLOUD_VALIDATION_IN_PROGRESS CLOUD_VALIDATION_FAILURE OEM_CLOUD_TO_DEVICE_DELIVERY_IN_PROGRESS ACTUATION_IN_PROGRESS').split(' '));
function generalStatusCommand(raw) {
  const root = ppoRoot(raw);
  return ppoChild(ppoChild(root, 'states'), 'statusRefreshCommand');
}
function generalStatusState(raw) {
  const input = ppoChild(ppoChild(generalStatusCommand(raw), 'value'), 'toState');
  const state = typeof input === 'string' && input.length <= 64 && GENERAL_STATUS_STATES.has(input.toUpperCase()) ? input.toUpperCase() : null;
  return { state, terminal: state === 'SUCCESS' || ['FAILURE', 'CANCELLED', 'EXPIRED'].includes(state),
    outcome: state === 'SUCCESS' ? 'device_succeeded' : ['FAILURE', 'CANCELLED', 'EXPIRED'].includes(state) ? 'device_failed' : 'unconfirmed' };
}
function generalStatusContext(client, vin) {
  requireApp(); client.store.assertLease();
  const configured = secretGet('vehicle'), cache = client.store.read();
  if (typeof vin !== 'string' || vin.length !== 17 || !vinOK(vin) || !client.prefs || client.prefs.vin !== vin ||
      !configured || configured.vin !== vin || !cache || cache.vin !== vin || !ppoRecord(cache.fields))
    throw new APIError('General status refresh vehicle/session mismatch.');
  return cache;
}
async function generalStatusRead(client, vin, deadline = null) {
  generalStatusContext(client, vin);
  const previous = client.auth.timeout;
  if (deadline !== null) {
    if (deadline <= now()) throw new APIError('General status read window ended.');
    client.auth.timeout = Math.min(previous || SETTINGS.timeout, (deadline - now()) / 1000);
  }
  try {
    const raw = await client.mobileTelemetry();
    if (deadline !== null && now() > deadline) throw new APIError('General status read window ended.');
    generalStatusContext(client, vin); ppoValidate(raw, vin);
    const root = ppoRoot(raw);
    if (!ppoRecord(ppoChild(root, 'metrics')) && !ppoRecord(ppoChild(root, 'states')))
      throw new APIError('General status telemetry schema unsupported.');
    if (deadline !== null && now() > deadline) throw new APIError('General status read window ended.');
    return raw;
  } finally { client.auth.timeout = previous; }
}
function generalStatusResult(client, vin, attemptAt, outcome, dispatched) {
  if (attemptAt !== null) {
    try { const cache = generalStatusContext(client, vin);
      cache.generalStatusRequest = { attemptAt, outcome }; client.store.write(cache);
    } catch (_) { /* A lost session must not write another run's cache. */ }
  }
  const messages = {
    device_succeeded: 'Ford reports the matched general status-refresh command succeeded. Individual measurement times may still differ.',
    device_failed: 'Ford reports the matched general status request failed, expired or was canceled. It was not retried.',
    accepted_unconfirmed: 'General status refresh was accepted; its completion was not confirmed in the read window.',
    delivery_uncertain: 'General status-refresh delivery is uncertain. It was not retried.',
    cooldown: 'General status refresh is cooling down or blocked by an existing request gate. No new general status command was sent.',
    baseline_unavailable: 'The general status baseline could not be read. No general status command was sent.',
    blocked: 'General status refresh stopped because the configured vehicle or app session changed.'
  };
  return { outcome, dispatched, message: messages[outcome] };
}
FordAPIClient.prototype.requestGeneralStatus = async function(confirmed = false) {
  requireApp();
  if (confirmed !== true) throw new APIError('Confirm the general status refresh in the app first.');
  const vin = this.prefs && this.prefs.vin;
  const result = (outcome, dispatched = false, at = null) => generalStatusResult(this, vin, at, outcome, dispatched);
  const available = () => {
    const cache = generalStatusContext(this, vin);
    this.auth.gate('commands');
    this.auth.gate('commands.generalStatus');
    return !(cache.commandAfter > now() || cache.wakeAfter > now());
  };
  try { generalStatusContext(this, vin); } catch (_) { return result('blocked'); }
  try { if (!available()) return result('cooldown'); } catch (_) { return result('cooldown'); }
  let token, baseline;
  try {
    token = await this.auth.token('autonomic');
    if (!available()) return result('cooldown');
    baseline = await generalStatusRead(this, vin);
  } catch (_) { return result('baseline_unavailable'); }
  const historicalID = ppoID(ppoChild(generalStatusCommand(baseline), 'commandId'));
  let cache;
  try { if (!available()) return result('cooldown'); cache = generalStatusContext(this, vin); }
  catch (_) { return result('blocked'); }
  const attemptAt = now();
  cache.commandAfter = attemptAt + SETTINGS.commandInterval;
  cache.wakeAfter = attemptAt + SETTINGS.wakeInterval;
  cache.generalStatusRequest = { attemptAt, outcome: 'dispatching' }; this.store.write(cache);
  let receipt;
  try {
    // Exactly the original v1 body/route, with an independent error backoff.
    // The global legacy command gate was checked immediately before dispatch.
    const body = await this.auth.request('commands.generalStatus',
      'https://api.autonomic.ai/v1/command/vehicles/' + vin + '/commands', 'POST',
      { properties: {}, tags: {}, type: 'statusRefresh', wakeUp: true }, this.auth.mobileHeaders(token));
    receipt = this.receipt(body);
    generalStatusContext(this, vin);
  } catch (_) { return result('delivery_uncertain', true, attemptAt); }
  const id = ppoID(ppoChild(receipt, 'id'));
  if (!id || id === historicalID) return result('accepted_unconfirmed', true, attemptAt);
  const deadline = now() + 40000;
  for (let attempt = 0; attempt < 8; attempt++) {
    if (attempt) await new Promise(resolve => Timer.schedule(Math.min(5000, Math.max(0, deadline - now())), false, resolve));
    if (now() >= deadline) break;
    let raw;
    try { raw = await generalStatusRead(this, vin, deadline); }
    catch (_) { break; } // No further poll after a transport, gate or lease error.
    if (ppoChild(generalStatusCommand(raw), 'commandId') !== id) continue;
    const state = generalStatusState(raw);
    if (state.terminal) return result(state.outcome, true, attemptAt);
  }
  return result('accepted_unconfirmed', true, attemptAt);
};

// One foreground refresh requests general status, then PPO, then reads telemetry.
// Original Wake, engine and lock actions keep their existing handlers.
AppController.prototype.refreshWidget = async function(prefs) {
  requireApp();
  if (!vehicleCommandAllowed(appAssertProfile(prefs, this.store), 'refresh'))
    throw new Error('This vehicle refresh is not enabled.');
  const vin = prefs && prefs.vin, steps = {};
  let attemptAt = null;
  const stageCodes = {
    generalStatus: ['device_succeeded', 'device_failed', 'accepted_unconfirmed', 'delivery_uncertain', 'cooldown', 'baseline_unavailable', 'blocked', 'unconfirmed', 'requires_fordpass'],
    proPowerRequest: ['device_succeeded', 'device_failed', 'accepted_unconfirmed', 'delivery_uncertain', 'unconfirmed', 'unconfirmed_or_cooling_down', 'requires_fordpass', 'not_enabled'],
    telemetry: ['saved', 'partial', 'cached_or_unavailable', 'failed'],
    proPowerRead: ['checked', 'cached_or_unavailable', 'failed', 'already_checked_by_request', 'requires_fordpass', 'not_enabled'],
    place: ['checked', 'failed', 'skipped'], photo: ['checked', 'failed', 'skipped']
  };
  const validate = () => {
    appAssertProfile(prefs, this.store);
    const configured = secretGet('vehicle'), cache = this.store.read();
    if (typeof vin !== 'string' || vin.length !== 17 || !vinOK(vin) || !configured || configured.vin !== vin || prefs.vin !== vin ||
        !cache || cache.vin !== vin || !cache.fields || typeof cache.fields !== 'object' || Array.isArray(cache.fields))
      throw new Error('Widget refresh vehicle/session mismatch.');
    return cache;
  };
  const marker = outcome => ({ attemptAt, outcome: ['in_progress', 'completed', 'blocked'].includes(outcome) ? outcome : 'in_progress',
    steps: Object.fromEntries(Object.keys(stageCodes).filter(key => stageCodes[key].includes(steps[key])).map(key => [key, steps[key]])) });
  const checkpoint = (outcome = 'in_progress') => {
    if (attemptAt === null) return;
    // Re-read after every await so a marker never replaces newly saved fields.
    const current = validate(); current.widgetRefreshLast = marker(outcome); this.store.write(current);
  };
  const cooling = cache => typeof cache.widgetRefreshAfter === 'number' && Number.isFinite(cache.widgetRefreshAfter) && cache.widgetRefreshAfter > now();
  const finish = async (outcome, body) => {
    try { checkpoint(outcome); const cache = validate(); Script.setWidget(new WidgetRenderer(prefs, cache).build('large')); }
    catch (_) { /* Never render another vehicle or overwrite cache after session loss. */ }
    await this.notify(body);
    return { outcome, steps, message: body };
  };
  let cache;
  try { cache = validate(); }
  catch (_) { return finish('blocked', 'Widget refresh stopped because the configured vehicle or app session changed.'); }
  if (cooling(cache)) return finish('cooldown', 'Widget refresh is cooling down. No cloud read or vehicle request was sent. Showing cached data.');

  const confirmation = new Alert(); confirmation.title = 'Refresh ' + appVehicleLabel(prefs) + '?';
  confirmation.message = appRefreshPrompt(prefs, this.store);
  confirmation.addAction('Refresh widget'); confirmation.addCancelAction('Cancel');
  if (await confirmation.presentAlert() < 0) return { outcome: 'cancelled', steps, message: 'Canceled.' };
  try {
    cache = validate();
    if (cooling(cache)) return finish('cooldown', 'Widget refresh is cooling down. No cloud read or vehicle request was sent. Showing cached data.');
    // Persist before dispatch; never rewrite this old cache object after an await.
    attemptAt = now(); cache.widgetRefreshAfter = attemptAt + 60000;
    cache.widgetRefreshLast = marker('in_progress'); this.store.write(cache);
  } catch (_) { return finish('blocked', 'Widget refresh stopped before dispatch because the vehicle or app session changed.'); }

  const client = new FordAPIClient(this.auth, this.store, prefs);
  const mobile = !!secretGet('token.mobile');
  try {
    if (mobile) {
      let generalDispatched = false;
      try {
        const general = await client.requestGeneralStatus(true);
        steps.generalStatus = general && ['device_succeeded', 'device_failed', 'accepted_unconfirmed', 'delivery_uncertain', 'cooldown', 'baseline_unavailable', 'blocked'].includes(general.outcome) ? general.outcome : 'unconfirmed';
        generalDispatched = !!(general && general.dispatched === true);
      } catch (_) { steps.generalStatus = 'unconfirmed'; }
      checkpoint();
      if (generalDispatched && appProPowerEnabled(prefs, this.store)) {
        // Wait only this run's remaining shared command spacing. Never wait out
        // a preexisting wake/auth/PPO backoff or retry the general command.
        const remaining = validate().commandAfter - now();
        if (remaining > 0 && remaining <= SETTINGS.commandInterval) {
          await new Promise(resolve => Timer.schedule(remaining, false, resolve));
          checkpoint();
        }
      }
      if (appProPowerEnabled(prefs, this.store)) {
        try {
          const result = await client.requestProPowerStatus(true);
          steps.proPowerRequest = result && ['device_succeeded', 'device_failed', 'accepted_unconfirmed', 'delivery_uncertain'].includes(result.outcome) ? result.outcome : 'unconfirmed';
        } catch (_) { steps.proPowerRequest = 'unconfirmed_or_cooling_down'; }
      } else steps.proPowerRequest = 'not_enabled';
    } else { steps.generalStatus = 'requires_fordpass'; steps.proPowerRequest = appProPowerEnabled(prefs, this.store) ? 'requires_fordpass' : 'not_enabled'; }

    checkpoint();
    try {
      // Read ordinary telemetry after the wake/status attempt. Only the local
      // nextFetch interval is bypassed; existing authentication gates still apply.
      const result = await client.getVehicleStatus(true);
      const note = result && typeof result.note === 'string' ? result.note : '';
      steps.telemetry = note.startsWith('Cloud telemetry saved.') ? 'saved' :
        note.startsWith('Some sources failed; available telemetry was saved.') ? 'partial' : 'cached_or_unavailable';
    } catch (_) { steps.telemetry = 'failed'; }

    checkpoint();
    if (appProPowerEnabled(prefs, this.store) && mobile && steps.proPowerRequest !== 'device_succeeded') {
      try {
        const result = await client.readProPower(true);
        steps.proPowerRead = result && typeof result.note === 'string' && result.note.startsWith('Pro Power cloud cache checked.') ? 'checked' : 'cached_or_unavailable';
      } catch (_) { steps.proPowerRead = 'failed'; }
    } else steps.proPowerRead = !appProPowerEnabled(prefs, this.store) ? 'not_enabled' : mobile ? 'already_checked_by_request' : 'requires_fordpass';

    checkpoint();
    if (widgetOptions(prefs, '').show.parked) {
      try { await client.updatePlace(); steps.place = 'checked'; }
      catch (_) { steps.place = 'failed'; }
    } else steps.place = 'skipped';
    checkpoint();
    if ((prefs.imageMode || 'auto') === 'auto' && secretGet('token.mobile')) {
      try { await client.updateVehicleImage(false); steps.photo = 'checked'; }
      catch (_) { steps.photo = 'failed'; }
    } else steps.photo = 'skipped';
    checkpoint();
  } catch (_) {
    return finish('blocked', 'Widget refresh stopped because the configured vehicle or app session changed. Completed portions were kept; remaining portions were not sent.');
  }

  const lines = ['Widget refresh checked the available sources.'];
  const generalText = {
    device_succeeded: 'Ford reports the general vehicle status command succeeded; individual field times may still differ.',
    device_failed: 'Ford reports the general status request failed, expired or was canceled.',
    accepted_unconfirmed: 'General vehicle status refresh was accepted; completion is unconfirmed.',
    delivery_uncertain: 'General vehicle status-refresh delivery is uncertain; it was not retried.',
    cooldown: 'General vehicle status is cooling down. No new general status request was sent.',
    baseline_unavailable: 'General vehicle status could not be read before requesting an update. No general status request was sent.',
    blocked: 'General status refresh stopped because the vehicle or app session changed.',
    unconfirmed: 'General status-refresh completion is unconfirmed.',
    requires_fordpass: 'Requesting new vehicle status from the truck requires FordPass.'
  };
  lines.push(generalText[steps.generalStatus]);
  lines.push(steps.telemetry === 'saved' ? 'Vehicle telemetry saved.' : steps.telemetry === 'partial' ?
    'Available vehicle telemetry saved; some sources failed.' : 'Vehicle telemetry could not be confirmed; cached values were retained.');
  const proPowerText = {
    device_succeeded: 'Ford reports the Pro Power status request succeeded on the device.',
    device_failed: 'Ford reports the Pro Power request failed, expired or was canceled.',
    accepted_unconfirmed: 'Ford accepted the Pro Power request; device completion is unconfirmed.',
    delivery_uncertain: 'Pro Power request delivery is uncertain; it was not retried.',
    requires_fordpass: 'Pro Power requires FordPass; the other connected source was still checked.',
    unconfirmed: 'Pro Power request completion is unconfirmed.',
    unconfirmed_or_cooling_down: 'Pro Power status was not confirmed or is cooling down; no command retry was sent.'
  };
  if (steps.proPowerRequest !== 'not_enabled') lines.push(proPowerText[steps.proPowerRequest]);
  if (steps.proPowerRead === 'checked') lines.push('The Pro Power cloud cache was checked separately.');
  else if (['failed', 'cached_or_unavailable'].includes(steps.proPowerRead)) lines.push('The Pro Power cache read was unavailable; saved readings were retained.');
  if (steps.place === 'failed' || steps.photo === 'failed') lines.push('Location or automatic-photo processing was unavailable; the other results were kept.');
  lines.push('Readings keep Ford\'s measurement times.' + (appProPowerEnabled(prefs, this.store) ? ' Pro Power sample time remains unverified.' : ''));
  return finish('completed', lines.join('\n'));
};
const WIDGET_REFRESH_ORIGINAL_ACTION = AppController.prototype.action;
AppController.prototype.action = async function(action, prefs, ...rest) {
  if (action === 'refreshwidget') return this.refreshWidget(prefs);
  return WIDGET_REFRESH_ORIGINAL_ACTION.call(this, action, prefs, ...rest);
};

// Optional reports stay separate from routine vehicle and Pro Power actions.
function troubleshootingCache(controller, prefs) {
  requireApp(); controller.store.assertLease();
  const configured = secretGet('vehicle'), cache = controller.store.read();
  if (!prefs || !configured || prefs.vin !== configured.vin || !cache || cache.vin !== prefs.vin)
    throw new Error('Troubleshooting vehicle/session changed.');
  return cache;
}
AppController.prototype.troubleshooting = async function(prefs) {
  requireApp();
  for (;;) {
    troubleshootingCache(this, prefs);
    const menu = new Alert(); menu.title = 'Troubleshooting';
    menu.message = 'Optional redacted vehicle reports. Review before sharing: reports still include vehicle states and times. Nothing is uploaded automatically. Pro Power tools use saved data; the vehicle report offers one passive cloud read.';
    ['Vehicle data report', ...(appProPowerEnabled(prefs, this.store) ? ['Pro Power raw signals', 'Copy redacted Pro Power report'] : [])].forEach(label => menu.addAction(label));
    menu.addCancelAction('Close');
    const choice = await menu.presentSheet();
    const cache = troubleshootingCache(this, prefs);
    if (choice < 0) return;
    if (choice === 0) { await this.vehicleStatusDiagnostic(prefs); continue; }
    if (!appProPowerEnabled(prefs, this.store)) throw new Error('Pro Power monitoring is not enabled for this vehicle.');
    const snapshot = ppoSnapshotFor(cache, prefs), request = cache.proPowerRequest || null;
    const report = modelProPowerReport(snapshot, prefs, request);
    if (choice === 1) {
      const lines = ['Pro Power raw signals · last reported', 'Status result: ' + ppoCommandAge(ppoView(snapshot)),
        ppoRequestLine(request), ppoModeLine(ppoView(snapshot)),
        'Raw units, enum meanings, sample time and sentinel codes remain unverified.', ''];
      for (const key of PPO_UI_RAW_KEYS) lines.push(key + ': ' + (Object.prototype.hasOwnProperty.call(report.rawSignals, key) ? report.rawSignals[key] : 'not reported'));
      await QuickLook.present(lines.join('\n'));
    } else if (choice === 2) {
      report.reportVersion = 3;
      report.appVersion = FORDWIDGET_VERSION;
      report.refreshDiagnostics = widgetDiagnosticContext(cache);
      const text = JSON.stringify(report, null, 2);
      const review = new Alert(); review.title = 'Review redacted Pro Power report';
      review.message = text;
      review.addAction('Copy report'); review.addCancelAction('Cancel');
      const selected = await review.presentAlert(); troubleshootingCache(this, prefs);
      if (selected === 0) { Pasteboard.copyString(text); await message('Pro Power', 'Redacted report copied.'); }
    }
  }
};

// Additional on-device offline checks. No account, cache writes or requests.
function ppoSelfCheck() {
  const assert = (ok, label) => { if (!ok) throw new Error('Pro Power self-test failed: ' + label); };
  const vin = '1FTFW1E50JFA00001', clock = now(), at = Math.floor(clock / 1000) * 1000 - 60000;
  const fields = { DcacOut1Pw2Dsply: 1450, DcacOut2Pw2Dsply: 0, DcacOutPwDsplyMx: 7200,
    DcacOutScndPw2Dsply: 0, DcacOutScndPwDsplyMx: 0, DcacOutETot: 200, UnknownPrivateField: 998877 };
  const raw = { vin, states: { commands: { updatePTTBStatusCommand: {
    commandId: 'synthetic-private-status', timestamp: new Date(at).toISOString(),
    value: { toState: 'COMMAND_SUCCEEDED_ON_DEVICE', oemData: {
      pttbStatusDataV2: { stringValue: JSON.stringify(fields) },
      vehicle_common_correlation_id: { stringValue: 'synthetic-private-correlation' }
    } }
  } } }, events: { customEvents: { 'pttb-power-mode-change-event': {
    updateTime: new Date(at + 30000).toISOString(), oemData: { current_power_mode: { stringValue: 'Off' } }
  } } } };
  const snapshot = ppoNormalize(raw, vin, clock), view = ppoView(snapshot, clock), e = ppoEstimated(snapshot);
  assert(e.a === 1450 && e.b === 0 && e.total === 1450 && e.capacity === 7200, 'independent A/B/total/capacity');
  assert(snapshot.rawSignals.DcacOutETot === 200 && e.total !== 1650, 'energy excluded from power');
  assert(!Object.prototype.hasOwnProperty.call(snapshot.rawSignals, 'UnknownPrivateField'), 'unknown fields withheld');
  assert(view.stale && view.staleReasons.includes('newer_off_mode') && e.a === 1450, 'newer Off retains last-known load');
  assert(snapshot.commandAt === at && ppoView(snapshot, clock + 60000).ageSeconds === view.ageSeconds + 60, 'command age advances');
  const partial = Object.assign({}, snapshot, { rawSignals: Object.assign({}, snapshot.rawSignals) });
  delete partial.rawSignals.DcacOut2Pw2Dsply;
  assert(ppoEstimated(partial).b === null && ppoEstimated(partial).total === null, 'missing B stays unknown');
  partial.rawSignals.DcacOut1Pw2Dsply = 65535;
  assert(ppoEstimated(partial).a === null, 'out-of-capacity raw code is not wattage');
  const text = JSON.stringify(ppoRedactedReport(snapshot));
  assert(!text.includes(vin) && !text.includes('synthetic-private') && !text.includes('998877'), 'copied report redaction');
  const defaults = widgetOptions({}, '');
  assert(PPO_UI_METRICS.every(key => defaults.show[key] === false), 'original layouts remain default');
}

// Display preferences only. Cached distances stay miles, temperatures Celsius,
// pressures PSI, and alert thresholds PSI regardless of the chosen formats.
const DISPLAY_PSI_TO_KPA = 6.894757293;
const DISPLAY_PSI_TO_BAR = 0.0689476;
function displayUnitOptions(prefs, parameter = '') {
  const saved = prefs && prefs.widget || {};
  let units = prefs && prefs.units === 'metric' ? 'metric' : 'us', explicit = null;
  const pressureMode = ['psi', 'kpa', 'bar'].includes(saved.unit) ? saved.unit : 'auto';
  for (const word of String(parameter || '').toLowerCase().split(/[\s,;]+/).filter(Boolean)) {
    if (word === 'us' || word === 'metric') units = word;
    if (['psi', 'kpa', 'bar'].includes(word)) explicit = word;
  }
  return { units, unit: explicit || (pressureMode === 'auto' ? units === 'metric' ? 'kpa' : 'psi' : pressureMode), pressureMode };
}
function displayUnitPressureLabel(unit) { return unit === 'kpa' ? 'kPa' : unit === 'bar' ? 'bar' : 'psi'; }
function formatDisplayTemperature(celsius, units = 'us') {
  const value = finite(celsius);
  return value === null ? '—' : units === 'metric' ? Math.round(value) + '°C' : fahrenheit(value) + '°F';
}
function formatDisplayFahrenheit(fahrenheitValue, units = 'us') {
  const value = finite(fahrenheitValue);
  return value === null ? '—' : units === 'metric' ? Math.round((value - 32) * 5 / 9) + '°C' : Math.round(value) + '°F';
}
function formatDisplayPressure(psi, unit = 'psi', detail = false) {
  const value = finite(psi);
  if (value === null) return '—';
  if (unit === 'bar') return (value * DISPLAY_PSI_TO_BAR).toFixed(1);
  if (unit === 'kpa') return String(Math.round(value * DISPLAY_PSI_TO_KPA));
  return String(detail ? Math.round(value * 10) / 10 : Math.round(value));
}
function displayUnitDistance(miles, units = 'us', decimals = 0, suffix = true) {
  const value = finite(miles), factor = Math.pow(10, decimals);
  return value === null ? '—' : String(Math.round(value * (units === 'metric' ? 1.609344 : 1) * factor) / factor) +
    (suffix ? units === 'metric' ? ' km' : ' mi' : '');
}
function displayUnitFieldLabel(key, prefs) {
  const options = displayUnitOptions(prefs), label = FIELD_NAMES[key];
  if (['range', 'odometer'].includes(key) && options.units === 'metric') return label.replace('(mi)', '(km)');
  if (['fl', 'fr', 'rl', 'rr'].includes(key) && options.unit !== 'psi') return label.replace(/PSI$/, displayUnitPressureLabel(options.unit));
  return label;
}
function displayUnitDetailValue(key, value, prefs) {
  const options = displayUnitOptions(prefs);
  if (key === 'outsideTemp') return formatDisplayTemperature(value, options.units);
  if (['range', 'odometer'].includes(key)) return displayUnitDistance(value, options.units, 1, false);
  return formatDisplayPressure(value, options.unit, true);
}
function displayUnitPreferences(prefs, options) {
  return Object.assign({}, prefs, { units: options.units, widget: Object.assign({}, prefs && prefs.widget, { unit: options.unit }) });
}
function displayUnitTirePreferenceLabel(prefs) {
  const options = displayUnitOptions(prefs), label = options.unit === 'psi' ? 'PSI' : displayUnitPressureLabel(options.unit);
  return options.pressureMode === 'auto' ? 'Auto (' + label + ')' : label;
}
function nextDisplayUnitTirePreference(prefs) {
  const order = ['auto', 'psi', 'kpa', 'bar'];
  return order[(order.indexOf(displayUnitOptions(prefs).pressureMode) + 1) % order.length];
}
function displayUnitThreshold(prefs, key, canonical, max) {
  const unit = key === 'tire' ? displayUnitOptions(prefs).unit : '%';
  const factor = unit === 'bar' ? DISPLAY_PSI_TO_BAR : unit === 'kpa' ? DISPLAY_PSI_TO_KPA : 1;
  return { value: key === 'tire' && unit !== 'psi' ? formatDisplayPressure(canonical, unit) : String(canonical),
    max: Number((max * factor).toFixed(9)), unit: key === 'tire' ? displayUnitPressureLabel(unit) : '%', canonicalMax: max };
}
function displayUnitTireThresholdLabel(prefs, psi) {
  const threshold = displayUnitThreshold(prefs, 'tire', psi, 100);
  return threshold.value + ' ' + threshold.unit;
}
function displayUnitLowTire(key, psi, prefs) {
  const options = displayUnitOptions(prefs);
  return key.toUpperCase() + ' ' + formatDisplayPressure(psi, options.unit) + ' ' + displayUnitPressureLabel(options.unit);
}
function parseDisplayUnitThreshold(text, threshold, canonical) {
  // Rounded display values must not alter an existing exact PSI threshold when
  // the owner submits the prefilled value without changing it.
  if (typeof text === 'string' && text.trim() === threshold.value && typeof canonical === 'number' &&
      Number.isFinite(canonical) && canonical >= 0 && canonical <= threshold.canonicalMax) return canonical;
  const value = finite(text);
  if (value === null || value < 0 || value > threshold.max) return null;
  const converted = value / (threshold.unit === 'bar' ? DISPLAY_PSI_TO_BAR : threshold.unit === 'kPa' ? DISPLAY_PSI_TO_KPA : 1);
  if (!Number.isFinite(converted) || converted < 0) return null;
  if (converted > threshold.canonicalMax) {
    const roundoff = Number.EPSILON * Math.max(1, threshold.canonicalMax) * 8;
    return converted - threshold.canonicalMax <= roundoff ? threshold.canonicalMax : null;
  }
  return converted;
}
function displayUnitWeatherTemperature(value, from = 'c') {
  const units = displayUnitOptions(secretGet('vehicle')).units;
  return from === 'f' ? formatDisplayFahrenheit(value, units) : formatDisplayTemperature(value, units);
}

const DISPLAY_ORIGINAL_WIDGET_OPTIONS = widgetOptions;
widgetOptions = function(prefs, parameter) {
  return Object.assign(DISPLAY_ORIGINAL_WIDGET_OPTIONS(prefs, parameter), displayUnitOptions(prefs, parameter));
};
const DISPLAY_ORIGINAL_NUMBER = WidgetRenderer.prototype.number;
WidgetRenderer.prototype.number = function(key, suffix = '') {
  if (this.opts.units !== 'metric' || !['range', 'odometer'].includes(key)) return DISPLAY_ORIGINAL_NUMBER.call(this, key, suffix);
  const number = displayUnitDistance(this.value(key), 'metric', 0, false);
  return number === '—' ? number : number + suffix.replace(/\bmi\b/g, 'km');
};
const DISPLAY_ORIGINAL_TEMP = WidgetRenderer.prototype.temp;
WidgetRenderer.prototype.temp = function() {
  return this.opts.units === 'metric' ? formatDisplayTemperature(this.value('outsideTemp'), 'metric') : DISPLAY_ORIGINAL_TEMP.call(this);
};
const DISPLAY_ORIGINAL_TIRE = WidgetRenderer.prototype.tire;
WidgetRenderer.prototype.tire = function(key) {
  return this.opts.unit === 'kpa' ? formatDisplayPressure(this.value(key), 'kpa') : DISPLAY_ORIGINAL_TIRE.call(this, key);
};
function displayUnitCurrent(controller, prefs) {
  requireApp(); controller.store.assertLease();
  const current = secretGet('vehicle');
  if (!prefs || typeof prefs.vin !== 'string' || prefs.vin.length !== 17 || !vinOK(prefs.vin) || !current || current.vin !== prefs.vin)
    throw new Error('The configured vehicle changed. Run the script again.');
  return current;
}
AppController.prototype.unitsOptions = async function(prefs) {
  for (;;) {
    const current = displayUnitCurrent(this, prefs), options = displayUnitOptions(current);
    const menu = new Alert(); menu.title = 'Units & formats';
    menu.message = 'Choose display units. Auto tire pressure follows the unit preset; an explicit pressure choice stays independent. Widget parameters can override the display without changing saved readings.';
    menu.addAction('Units: ' + (options.units === 'metric' ? 'Metric' : 'US'));
    menu.addAction('Tire pressure: ' + displayUnitTirePreferenceLabel(current)); menu.addCancelAction('Done');
    const choice = await menu.presentSheet(); if (choice < 0) return;
    if (choice !== 0 && choice !== 1) continue;
    const fresh = displayUnitCurrent(this, prefs), next = Object.assign({}, fresh);
    if (choice === 0) next.units = displayUnitOptions(fresh).units === 'metric' ? 'us' : 'metric';
    else next.widget = Object.assign({}, fresh.widget, { unit: nextDisplayUnitTirePreference(fresh) });
    displayUnitCurrent(this, prefs); secretSet('vehicle', next); Object.assign(prefs, next);
  }
};


// One account session, independently bound vehicle profiles. No network activity.
const PROFILE_NAMESPACE = 'FordPassWidgets.v1.';
const PROFILE_CAPABILITIES = Object.freeze(['lock', 'unlock', 'engineControl', 'refresh', 'proPower', 'evCharge']);
let PROFILE_EMPTY_REGISTRY = null;
let PROFILE_RUNTIME_BINDING = null;
let PROFILE_WRITE_STORE = null;
const profileOwn = (o, k) => o && typeof o === 'object' && Object.prototype.hasOwnProperty.call(o, k) ? o[k] : undefined;
const profileCopy = value => JSON.parse(JSON.stringify(value));
const profileID = value => typeof value === 'string' && /^[a-f0-9]{32}$/.test(value);
function profileRawGet(key) {
  try { return Keychain.contains(PROFILE_NAMESPACE + key) ? JSON.parse(Keychain.get(PROFILE_NAMESPACE + key)) : null; }
  catch (_) { return null; }
}
function profileRawSet(key, value) { Keychain.set(PROFILE_NAMESPACE + key, JSON.stringify(value)); }
function profileRawRemove(key) { if (Keychain.contains(PROFILE_NAMESPACE + key)) Keychain.remove(PROFILE_NAMESPACE + key); }
function readVehicleRegistry() {
  const raw = profileRawGet('registry');
  if (raw && raw.version === 1 && profileID(raw.account && raw.account.id) && profileID(raw.account.session) && Array.isArray(raw.profiles)) {
    const ids = new Set(), vins = new Set(), profiles = [];
    for (const item of raw.profiles.slice(0, 64)) {
      if (!item || !profileID(item.id) || ids.has(item.id) || !vinOK(item.vin) || item.vin.length !== 17 ||
          item.accountId !== raw.account.id || vins.has(item.vin)) continue;
      ids.add(item.id); vins.add(item.vin); profiles.push(profileCopy(item));
    }
    return { version: 1, account: { id: raw.account.id, session: raw.account.session, connected: raw.account.connected === true },
      profiles, defaultVehicleId: ids.has(raw.defaultVehicleId) ? raw.defaultVehicleId : null };
  }
  if (!PROFILE_EMPTY_REGISTRY) PROFILE_EMPTY_REGISTRY = { version: 1, account: { id: uid(), session: uid(), connected: false }, profiles: [], defaultVehicleId: null };
  return profileCopy(PROFILE_EMPTY_REGISTRY);
}
function profileAuthorized(profile, registry = readVehicleRegistry()) {
  return !!profile && registry.account.connected && profile.accountId === registry.account.id &&
    profile.authorizedSession === registry.account.session && vinOK(profile.vin) && profile.vin.length === 17;
}
function captureVehicleBinding() {
  const registry = readVehicleRegistry(), active = PROFILE_RUNTIME_BINDING;
  if (active) return profileCopy(active);
  const profile = registry.profiles.find(p => p.id === registry.defaultVehicleId && profileAuthorized(p, registry));
  return { accountId: registry.account.id, session: registry.account.session, profileId: profile ? profile.id : null,
    vin: profile ? profile.vin : null, allowUnauthorized: false };
}
function profileBindingValid(binding, allowPending = false) {
  const registry = readVehicleRegistry();
  if (!binding || binding.accountId !== registry.account.id || binding.session !== registry.account.session) return false;
  if (!binding.profileId) return true;
  const profile = registry.profiles.find(p => p.id === binding.profileId);
  return !!profile && profile.vin === binding.vin && profile.accountId === binding.accountId &&
    (profileAuthorized(profile, registry) || allowPending && binding.allowUnauthorized && registry.account.connected);
}
function profileBindingsEqual(a, b) {
  return !!a && !!b && a.accountId === b.accountId && a.session === b.session && a.profileId === b.profileId && a.vin === b.vin;
}
function vehicleBindingCurrent(prefs, store = null) {
  const binding = store && store.profileBinding || captureVehicleBinding();
  return !!prefs && profileBindingsEqual(binding, captureVehicleBinding()) && profileBindingValid(binding) && binding.profileId === prefs.id && binding.vin === prefs.vin &&
    binding.accountId === prefs.accountId && prefs.authorizedSession === binding.session;
}
function assertVehicleRequestBinding(store, binding) {
  const current = store && store.profileBinding;
  if (!current || !binding || current.accountId !== binding.accountId || current.session !== binding.session ||
      current.profileId !== binding.profileId || current.vin !== binding.vin || !profileBindingValid(binding, true))
    throw new Error('The account or vehicle binding changed. Open the app again.');
}
function assertVehicleClientBinding(auth, store, prefs) {
  const binding = store && store.profileBinding;
  if (!auth || auth.store && auth.store !== store || !binding || !binding.profileId ||
      !profileBindingsEqual(binding, captureVehicleBinding()) || !profileBindingValid(binding, true) || !prefs ||
      prefs.id !== binding.profileId || prefs.vin !== binding.vin || prefs.accountId !== binding.accountId ||
      !binding.allowUnauthorized && prefs.authorizedSession !== binding.session)
    throw new Error('The vehicle client does not match its bound account and vehicle.');
}
function activeVehicleProfile() {
  const binding = captureVehicleBinding(), registry = readVehicleRegistry();
  const profile = registry.profiles.find(p => p.id === binding.profileId);
  return profileBindingValid(binding) && profileAuthorized(profile, registry) ? profileCopy(profile) : null;
}
function bindVehicleProfile(id, store = null, options = {}) {
  const registry = readVehicleRegistry();
  let profile = null;
  if (id !== null && id !== undefined) {
    if (!profileID(id)) throw new Error('Invalid vehicle selection.');
    profile = registry.profiles.find(p => p.id === id);
    if (!profile || !profileAuthorized(profile, registry) && !(options.allowUnauthorized === true && registry.account.connected))
      throw new Error('This vehicle is not authorized in the current account session.');
  }
  const binding = { accountId: registry.account.id, session: registry.account.session, profileId: profile ? profile.id : null,
    vin: profile ? profile.vin : null, allowUnauthorized: options.allowUnauthorized === true && !!profile };
  if (store && store.owner && JSON.stringify(store.profileBinding) !== JSON.stringify(binding))
    throw new Error('Create a new app context before selecting another vehicle.');
  PROFILE_RUNTIME_BINDING = binding;
  if (store) configureProfileStore(store, binding);
  return profile ? profileCopy(profile) : null;
}
function profileMutationStore(store = null) {
  const chosen = store || PROFILE_WRITE_STORE;
  requireApp();
  if (!chosen) throw new Error('An active foreground app session is required.');
  chosen.assertLease(); return chosen;
}
function profileWriteRegistry(registry, store = null) {
  profileMutationStore(store); profileRawSet('registry', registry);
}
function profileText(value, fallback = '') {
  return typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 80) || fallback : fallback;
}
function vehicleCapabilities(prefs) {
  const input = prefs && prefs.capabilities || {}, out = {};
  for (const name of PROFILE_CAPABILITIES) out[name] = ['supported', 'unsupported', 'disabled'].includes(input[name]) ? input[name] : 'unknown';
  return out;
}
function capabilityState(prefs, name) { return PROFILE_CAPABILITIES.includes(name) ? vehicleCapabilities(prefs)[name] : 'unknown'; }
function profilePermissionPrefs(prefs) {
  if (!vehicleBindingCurrent(prefs)) return null;
  return readVehicleRegistry().profiles.find(p => p.id === prefs.id) || null;
}
function proPowerEnabled(prefs) {
  const current = profilePermissionPrefs(prefs);
  return !!current && !!current.features && current.features.proPower === true && !['unsupported', 'disabled'].includes(capabilityState(current, 'proPower'));
}
function engineControlAllowed(prefs) {
  const current = profilePermissionPrefs(prefs);
  return !!current && ['ICE', 'HEV', 'PHEV'].includes(current.engineType) && current.transmission === 'AUTOMATIC' &&
    current.garageEngineType !== 'BEV' && current.garageTransmission !== 'MANUAL' &&
    !['unsupported', 'disabled'].includes(capabilityState(current, 'engineControl')) &&
    (capabilityState(current, 'engineControl') === 'supported' || current.features && current.features.engineControl === true);
}
function vehicleCommandAllowed(prefs, action) {
  const current = profilePermissionPrefs(prefs);
  if (!current || !['lock', 'unlock', 'start', 'stop', 'refresh', 'refreshwidget'].includes(action)) return false;
  const key = action === 'refreshwidget' ? 'refresh' : action;
  if (!current.compatibility || !current.compatibility.commands || current.compatibility.commands[key] !== true) return false;
  if (key === 'start' || key === 'stop') return engineControlAllowed(prefs);
  return !['unsupported', 'disabled'].includes(capabilityState(current, key));
}
function addVehicleProfile(candidate, store = null) {
  profileMutationStore(store);
  candidate = candidate || {};
  const registry = readVehicleRegistry(), vin = typeof candidate.vin === 'string' ? candidate.vin.trim().toUpperCase() : '';
  if (!vinOK(vin) || vin.length !== 17) throw new Error('Enter a valid 17-character VIN.');
  const existing = registry.profiles.find(p => p.vin === vin);
  if (existing) return profileCopy(existing);
  if (registry.profiles.length >= 64) throw new Error('The saved vehicle limit has been reached.');
  const profile = { id: uid(), accountId: registry.account.id, authorizedSession: null, vin,
    name: profileText(candidate.name, 'Ford'), model: profileText(candidate.model),
    engineType: ['ICE', 'HEV', 'PHEV', 'BEV'].includes(candidate.engineType) ? candidate.engineType : 'UNKNOWN',
    transmission: ['AUTOMATIC', 'MANUAL'].includes(candidate.transmission) ? candidate.transmission : 'UNKNOWN',
    capabilities: vehicleCapabilities({}), features: { proPower: false, engineControl: false },
    compatibility: { commands: { lock: false, unlock: false, start: false, stop: false, refresh: false }, verified: {} },
    alerts: { configured: false, enabled: { lock: false, doors: false, tires: false, fuel: false, oil: false, battery: false, engine: false } } };
  registry.profiles.push(profile); profileWriteRegistry(registry, store); return profileCopy(profile);
}
function saveVehicleProfile(prefs, store = null) {
  const chosen = profileMutationStore(store), registry = readVehicleRegistry();
  if (!vehicleBindingCurrent(prefs, chosen)) throw new Error('The selected vehicle or account session changed.');
  const index = registry.profiles.findIndex(p => p.id === prefs.id), previous = registry.profiles[index];
  if (!previous || previous.vin !== prefs.vin) throw new Error('The vehicle identity cannot be changed.');
  const next = profileCopy(prefs);
  next.id = previous.id; next.vin = previous.vin; next.accountId = previous.accountId; next.authorizedSession = previous.authorizedSession;
  next.name = profileText(next.name, 'Ford'); next.model = profileText(next.model);
  next.engineType = ['ICE', 'HEV', 'PHEV', 'BEV'].includes(next.engineType) ? next.engineType : 'UNKNOWN';
  next.transmission = ['AUTOMATIC', 'MANUAL'].includes(next.transmission) ? next.transmission : 'UNKNOWN';
  for (const key of ['garageEngineType', 'garageTransmission']) {
    if (Object.prototype.hasOwnProperty.call(previous, key)) next[key] = previous[key]; else delete next[key];
  }
  next.capabilities = vehicleCapabilities(next);
  // Source capability evidence is not an editable preference. In particular,
  // a dialog opened earlier must not restore a capability disabled meanwhile.
  next.capabilityEvidence = profileCopy(previous.capabilityEvidence || {});
  for (const key of PROFILE_CAPABILITIES) {
    const evidence = next.capabilityEvidence[key];
    if (evidence && evidence.source === 'FordPass garage' && ['supported', 'unsupported', 'disabled'].includes(evidence.state))
      next.capabilities[key] = evidence.state;
  }
  registry.profiles[index] = next; profileWriteRegistry(registry, chosen); return profileCopy(next);
}
function setDefaultVehicle(id, store = null) {
  const registry = readVehicleRegistry(), profile = registry.profiles.find(p => p.id === id);
  if (!profileAuthorized(profile, registry)) throw new Error('Choose an authorized vehicle for the default.');
  registry.defaultVehicleId = id; profileWriteRegistry(registry, store);
}
function vehicleParameter(parameter) {
  const words = String(parameter || '').trim().split(/[\s,;]+/).filter(Boolean), selected = words.filter(word => /^vehicle[=:]/i.test(word));
  const malformed = words.some(word => /^vehicle$/i.test(word));
  const id = selected.length === 1 ? selected[0].replace(/^vehicle[=:]/i, '') : null;
  return { profileId: selected.length === 1 && profileID(id) ? id : null,
    parameter: words.filter(word => !/^vehicle(?:[=:]|$)/i.test(word)).join(' '),
    invalid: malformed || selected.length > 1 || selected.length === 1 && !profileID(id) };
}
function parseGarageVehicles(raw) {
  let list = Array.isArray(raw) ? raw : profileOwn(profileOwn(raw, 'userVehicles'), 'vehicleDetails');
  if (!Array.isArray(list)) list = profileOwn(raw, 'vehicles');
  if (!Array.isArray(list)) list = profileOwn(raw, 'vehicleProfile');
  if (!Array.isArray(list)) return [];
  const seen = new Set(), result = [];
  for (const vehicle of list.slice(0, 128)) {
    const rawVin = profileOwn(vehicle, 'vin') || profileOwn(vehicle, 'VIN');
    const vin = typeof rawVin === 'string' ? rawVin.trim().toUpperCase() : '';
    if (vin.length !== 17 || !vinOK(vin) || seen.has(vin)) continue;
    seen.add(vin);
    const data = profileOwn(vehicle, 'profile') || vehicle;
    const engine = profileOwn(data, 'engineType'), transmission = profileOwn(data, 'transmission');
    const visibility = profileOwn(vehicle, 'capabilities'), capabilities = vehicleCapabilities({}), capabilityEvidence = {};
    const wire = { lock: 'remoteLock', unlock: 'remoteLock', engineControl: 'remoteStart', proPower: 'proPowerOnBoard', evCharge: 'vehicleChargingStatusExtended' };
    for (const name of Object.keys(wire)) {
      const flag = profileOwn(visibility, wire[name]);
      const state = flag === 'Display' ? 'supported' : flag === 'NoDisplay' ? 'unsupported' : flag === 'DisplayDisabled' ? 'disabled' : 'unknown';
      capabilities[name] = state;
      if (state !== 'unknown') capabilityEvidence[name] = { source: 'FordPass garage', field: wire[name], state, at: now() };
    }
    const refresh = profileOwn(data, 'supportsStatusRefresh');
    if (typeof refresh === 'boolean') {
      capabilities.refresh = refresh ? 'supported' : 'unsupported';
      capabilityEvidence.refresh = { source: 'FordPass garage', field: 'supportsStatusRefresh', state: capabilities.refresh, at: now() };
    }
    const tireCount = profileOwn(data, 'numberOfTires'), wattage = profileOwn(data, 'proPowerWattage'), year = profileOwn(data, 'year');
    const equipmentWatts = typeof wattage === 'number' ? wattage : typeof wattage === 'string' && /^\d{1,6}(?:\.\d{1,3})?$/.test(wattage) ? Number(wattage) : NaN;
    result.push({ vin, name: profileText(profileOwn(vehicle, 'nickName') || profileOwn(data, 'nickName') || profileOwn(data, 'nickname') || profileOwn(data, 'name'), 'Ford'),
      model: profileText(profileOwn(data, 'model')), engineType: ['ICE', 'HEV', 'PHEV', 'BEV'].includes(engine) ? engine : 'UNKNOWN',
      transmission: ['AUTOMATIC', 'MANUAL'].includes(transmission) ? transmission : 'UNKNOWN',
      year: Number.isInteger(year) && year >= 1900 && year <= 2100 ? year : null,
      numberOfTires: [4, 6, '4', '6'].includes(tireCount) ? Number(tireCount) : null,
      proPowerWattage: Number.isFinite(equipmentWatts) && equipmentWatts > 0 && equipmentWatts <= 100000 ? equipmentWatts : null,
      capabilities, capabilityEvidence });
    if (result.length === 64) break;
  }
  return result;
}
function beginAccountSession(store = null) {
  const chosen = profileMutationStore(store), registry = readVehicleRegistry();
  if (chosen.profileBinding.profileId) throw new Error('Reconnect using an account-only app context.');
  const oldSession = registry.account.session;
  for (const profile of registry.profiles) profile.authorizedSession = null;
  // Invalidate authorization first. A failed credential deletion must not leave
  // a previous account session usable while a reconnect is being attempted.
  registry.account.session = uid(); registry.account.connected = false; profileRawSet('registry', registry);
  PROFILE_RUNTIME_BINDING = { accountId: registry.account.id, session: registry.account.session, profileId: null, vin: null, allowUnauthorized: false };
  configureProfileStore(chosen, PROFILE_RUNTIME_BINDING); PROFILE_WRITE_STORE = chosen;
  let cleanupFailed = false;
  for (const name of ['token.mobile', 'token.autonomic', 'credentials']) {
    try { profileRawRemove(`account.${registry.account.id}.${oldSession}.${name}`); } catch (_) { cleanupFailed = true; }
  }
  for (const profile of registry.profiles) for (const name of ['official', 'token.official']) {
    try { profileRawRemove(`profile.${profile.id}.${oldSession}.${name}`); } catch (_) { cleanupFailed = true; }
  }
  if (cleanupFailed) throw new Error('The old account session was invalidated, but credential cleanup could not be completed.');
  return profileCopy(registry.account);
}
function completeAccountSession(store = null) {
  const chosen = profileMutationStore(store), registry = readVehicleRegistry(), token = profileSecretGet('token.mobile');
  if (chosen.profileBinding.profileId || !token || typeof token.access !== 'string' || !token.access || !(token.expires > now()))
    throw new Error('FordPass sign-in has not completed.');
  registry.account.connected = true; profileWriteRegistry(registry, chosen); return profileCopy(registry.account);
}
function authorizeGarageVehicles(raw, store = null) {
  const chosen = profileMutationStore(store), registry = readVehicleRegistry();
  if (!registry.account.connected || chosen.profileBinding.profileId) throw new Error('Use the signed-in account context to discover vehicles.');
  if (!Array.isArray(raw) && !Array.isArray(profileOwn(profileOwn(raw, 'userVehicles'), 'vehicleDetails')) &&
      !Array.isArray(profileOwn(raw, 'vehicles')) && !Array.isArray(profileOwn(raw, 'vehicleProfile')))
    throw new Error('The garage response format is not recognized.');
  const vehicles = parseGarageVehicles(raw), memberVINs = new Set(vehicles.map(p => p.vin));
  // Membership is authoritative for this successful garage read, including removals.
  for (const existing of registry.profiles) existing.authorizedSession = memberVINs.has(existing.vin) ? registry.account.session : null;
  for (const candidate of vehicles) {
    let profile = registry.profiles.find(p => p.vin === candidate.vin);
    if (!profile) {
      if (registry.profiles.length >= 64) continue;
      profile = { id: uid(), accountId: registry.account.id, vin: candidate.vin, name: candidate.name, model: candidate.model,
        engineType: candidate.engineType, transmission: candidate.transmission, capabilities: vehicleCapabilities({}),
        features: { proPower: false, engineControl: false }, compatibility: { commands: { lock: false, unlock: false, start: false, stop: false, refresh: false }, verified: {} },
        alerts: { configured: false, enabled: { lock: false, doors: false, tires: false, fuel: false, oil: false, battery: false, engine: false } } };
      registry.profiles.push(profile);
    }
    if (candidate.engineType !== 'UNKNOWN') { profile.engineType = candidate.engineType; profile.garageEngineType = candidate.engineType; }
    if (candidate.transmission !== 'UNKNOWN') { profile.transmission = candidate.transmission; profile.garageTransmission = candidate.transmission; }
    if (candidate.model) profile.model = candidate.model;
    for (const key of ['year', 'numberOfTires', 'proPowerWattage']) if (candidate[key] !== null) profile[key] = candidate[key];
    profile.capabilities = vehicleCapabilities(profile);
    profile.capabilityEvidence = profile.capabilityEvidence || {};
    for (const key of Object.keys(candidate.capabilityEvidence)) {
      profile.capabilities[key] = candidate.capabilities[key]; profile.capabilityEvidence[key] = candidate.capabilityEvidence[key];
    }
    profile.authorizedSession = registry.account.session;
  }
  if (!registry.defaultVehicleId && vehicles.length) {
    const first = registry.profiles.find(p => p.vin === vehicles[0].vin); registry.defaultVehicleId = first ? first.id : null;
  }
  profileWriteRegistry(registry, chosen); return registry.profiles.filter(p => profileAuthorized(p, registry)).map(profileCopy);
}
function validateManualVehicle(id, raw, store = null) {
  const chosen = profileMutationStore(store), registry = readVehicleRegistry(), profile = registry.profiles.find(p => p.id === id);
  if (!registry.account.connected || !profile || chosen.profileBinding.profileId !== id || chosen.profileBinding.vin !== profile.vin)
    throw new Error('Manual vehicle verification requires its bound passive-read context.');
  const wrapped = profileOwn(raw, 'vehicleStatus'), roots = wrapped && typeof wrapped === 'object' ? [raw, wrapped] : [raw];
  let matched = false;
  for (const root of roots) {
    for (const key of ['vin', 'VIN']) {
      const value = profileOwn(root, key);
      if (value === undefined) continue;
      if (typeof value !== 'string' || value.toUpperCase() !== profile.vin) throw new Error('The telemetry VIN did not match the selected vehicle.');
      matched = true;
    }
  }
  const body = wrapped || raw;
  const record = value => value && typeof value === 'object' && !Array.isArray(value);
  if (!matched || !record(body) || !record(profileOwn(body, 'metrics')) && !record(profileOwn(body, 'states')))
    throw new Error('The passive response did not explicitly verify this VIN.');
  profile.authorizedSession = registry.account.session; profileWriteRegistry(registry, chosen);
  chosen.profileBinding.allowUnauthorized = false; PROFILE_RUNTIME_BINDING = profileCopy(chosen.profileBinding);
  if (!registry.defaultVehicleId) setDefaultVehicle(id, chosen);
  return profileCopy(profile);
}
function endAccountSession(store = null) { return beginAccountSession(store); }
function profileSecretKey(name) {
  const binding = captureVehicleBinding(), account = binding.accountId;
  if (name === 'vehicle') return PROFILE_NAMESPACE + 'registry';
  if (name === 'official' || name === 'token.official') {
    if (!binding.profileId) throw new Error('FordConnect requires an explicit vehicle binding.');
    return PROFILE_NAMESPACE + `profile.${binding.profileId}.${binding.session}.${name}`;
  }
  if (name.startsWith('gate.')) return PROFILE_NAMESPACE + `account.${account}.${name}`;
  return PROFILE_NAMESPACE + `account.${account}.${binding.session}.${name}`;
}
function profileSecretGet(name) {
  if (name === 'vehicle') return activeVehicleProfile();
  if (!profileBindingValid(captureVehicleBinding(), true)) return null;
  try { const key = profileSecretKey(name); return Keychain.contains(key) ? JSON.parse(Keychain.get(key)) : null; }
  catch (_) { return null; }
}
function profileSecretSet(name, value) {
  if (name === 'vehicle') return saveVehicleProfile(value);
  if (!PROFILE_WRITE_STORE) throw new Error('An app or background lease is required.');
  PROFILE_WRITE_STORE.assertLease(); const key = profileSecretKey(name); Keychain.set(key, JSON.stringify(value));
}
function profileSecretRemove(name) {
  if (!PROFILE_WRITE_STORE) throw new Error('An app or background lease is required.');
  PROFILE_WRITE_STORE.assertLease();
  if (name === 'vehicle') throw new Error('Vehicle profiles must be managed through the registry.');
  const key = profileSecretKey(name); if (Keychain.contains(key)) Keychain.remove(key);
}
function configureProfileStore(store, binding = captureVehicleBinding()) {
  if (!PROFILE_RUNTIME_BINDING) PROFILE_RUNTIME_BINDING = profileCopy(binding);
  store.profileBinding = profileCopy(binding);
  store.path = store.fm.joinPath(store.dir, binding.profileId ? `vehicle_${binding.accountId}_${binding.profileId}.json` : 'account_no_vehicle.json');
}
function assertProfileStore(store) {
  if (!profileBindingsEqual(store.profileBinding, captureVehicleBinding()) || !profileBindingValid(store.profileBinding, true))
    throw new Error('The account or vehicle session expired. Open the app again.');
}
function assertProfileRequestScope(store, name, url, method) {
  assertProfileStore(store);
  const binding = store.profileBinding;
  if (name.startsWith('auth.')) return;
  if (!binding.profileId) {
    if (method === 'GET' && url === SETTINGS.garage) return;
    throw new Error('Select an authorized vehicle before making this request.');
  }
  const routes = {
    'telemetry.mobile': ['GET', `${SETTINGS.autonomic}/telemetry/sources/fordpass/vehicles/${binding.vin}`],
    'telemetry.proPower': ['POST', `https://api.autonomic.ai/v1beta/telemetry/sources/fordpass/vehicles/${binding.vin}:query`],
    'commands': ['POST', `${SETTINGS.autonomic}/command/vehicles/${binding.vin}/commands`],
    'commands.generalStatus': ['POST', `${SETTINGS.autonomic}/command/vehicles/${binding.vin}/commands`],
    'commands.proPower': ['POST', `https://api.autonomic.ai/v1beta/command/vehicles/${binding.vin}/commands`]
  };
  if (routes[name] && (method !== routes[name][0] || url !== routes[name][1]))
    throw new Error('The request does not match the bound vehicle route.');
  if (profileBindingValid(binding)) return;
  const expected = `${SETTINGS.autonomic}/telemetry/sources/fordpass/vehicles/${binding.vin}`;
  if (!(binding.allowUnauthorized && method === 'GET' && name === 'telemetry.mobile' && url === expected))
    throw new Error('Only passive VIN verification is allowed for this vehicle.');
}
const PROFILE_STORE_ACQUIRE = LocalStore.prototype.acquire;
LocalStore.prototype.acquire = async function() { await PROFILE_STORE_ACQUIRE.call(this); PROFILE_WRITE_STORE = this; };
const PROFILE_STORE_BACKGROUND = LocalStore.prototype.acquireBackground;
LocalStore.prototype.acquireBackground = function() { const acquired = PROFILE_STORE_BACKGROUND.call(this); if (acquired) PROFILE_WRITE_STORE = this; return acquired; };
const PROFILE_STORE_ASSERT = LocalStore.prototype.assertLease;
LocalStore.prototype.assertLease = function() { PROFILE_STORE_ASSERT.call(this); assertProfileStore(this); };
const PROFILE_STORE_READ = LocalStore.prototype.read;
LocalStore.prototype.read = function() {
  if (!profileBindingsEqual(this.profileBinding, captureVehicleBinding()) || !profileBindingValid(this.profileBinding)) return null;
  const profile = readVehicleRegistry().profiles.find(p => p.id === this.profileBinding.profileId);
  if (!profile) return null;
  const cache = PROFILE_STORE_READ.call(this);
  return cache && cache.vin === profile.vin && cache.profileId === profile.id && cache.accountId === profile.accountId ? cache : null;
};
const PROFILE_STORE_WRITE = LocalStore.prototype.write;
LocalStore.prototype.write = function(value) {
  this.assertLease();
  if (!profileBindingValid(this.profileBinding) || !this.profileBinding.profileId || !value || value.vin !== this.profileBinding.vin)
    throw new Error('The telemetry cache does not match the authorized vehicle.');
  const copy = profileCopy(value); copy.profileId = this.profileBinding.profileId; copy.accountId = this.profileBinding.accountId;
  PROFILE_STORE_WRITE.call(this, copy);
};
LocalStore.prototype.imagePath = function(vin, custom) {
  if (!profileBindingValid(this.profileBinding) || vin !== this.profileBinding.vin || !this.profileBinding.profileId)
    throw new Error('The photo does not match the authorized vehicle.');
  return this.fm.joinPath(this.dir, `vehicle_${this.profileBinding.accountId}_${this.profileBinding.profileId}${custom ? '_custom' : ''}.png`);
};
const PROFILE_STORE_IMAGE = LocalStore.prototype.vehicleImage;
LocalStore.prototype.vehicleImage = function(prefs) { return vehicleBindingCurrent(prefs, this) ? PROFILE_STORE_IMAGE.call(this, prefs) : null; };
const PROFILE_API_SEND = FordAPIClient.prototype.sendCommand;
FordAPIClient.prototype.sendCommand = async function(vin, command) {
  if (!vehicleBindingCurrent(this.prefs, this.store) || !vehicleCommandAllowed(this.prefs, command)) throw new Error('This vehicle control is not enabled for the selected vehicle.');
  return PROFILE_API_SEND.call(this, vin, command);
};
const PROFILE_PPO_READ = FordAPIClient.prototype.readProPower;
FordAPIClient.prototype.readProPower = async function(force = false) {
  if (!vehicleBindingCurrent(this.prefs, this.store) || !proPowerEnabled(this.prefs)) {
    this.store.assertLease(); return { cache: this.store.read(), snapshot: null, note: 'Pro Power is not enabled for this vehicle.' };
  }
  return PROFILE_PPO_READ.call(this, force);
};
const PROFILE_PPO_REQUEST = FordAPIClient.prototype.requestProPowerStatus;
FordAPIClient.prototype.requestProPowerStatus = async function(confirmed = false) {
  if (!vehicleBindingCurrent(this.prefs, this.store) || !proPowerEnabled(this.prefs)) throw new Error('Pro Power monitoring is not enabled for this vehicle.');
  return PROFILE_PPO_REQUEST.call(this, confirmed);
};
const PROFILE_RENDERER_URL = WidgetRenderer.prototype.url;
WidgetRenderer.prototype.url = function(action = '') {
  return `scriptable:///run?${form({ scriptName: Script.name(), action, vehicle: profileID(this.prefs && this.prefs.id) ? this.prefs.id : '' })}`;
};


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


// Presentation uses the owner's reviewed vehicle profile. A missing fuel value
// never identifies an electric vehicle, and 12V SOC never stands in for EV SOC.
function modelPowertrain(prefs) {
  const source = prefs && prefs.garageEngineType;
  if (['ICE', 'HEV', 'PHEV', 'BEV'].includes(source)) return source;
  return ['ICE', 'HEV', 'PHEV', 'BEV'].includes(prefs && prefs.engineType) ? prefs.engineType : 'UNKNOWN';
}
function modelElectric(prefs) { return ['BEV', 'PHEV'].includes(modelPowertrain(prefs)); }
function modelIdentity(prefs) {
  for (const value of [prefs && prefs.name, prefs && prefs.model]) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return 'Ford vehicle';
}
function modelMetricAvailable(key, prefs) {
  if (['fuel', 'oil'].includes(key) && modelPowertrain(prefs) === 'BEV') return false;
  if (['evSoc', 'evRange', 'plugStatus', 'chargeStatus'].includes(key)) return modelElectric(prefs);
  if (key.startsWith('ppo')) return proPowerEnabled(prefs);
  return true;
}
function modelMetricKeys(prefs) { return Object.keys(METRICS).filter(key => modelMetricAvailable(key, prefs)); }

const MODEL_ORIGINAL_WIDGET_OPTIONS = widgetOptions;
widgetOptions = function(prefs, parameter = '') {
  const options = MODEL_ORIGINAL_WIDGET_OPTIONS(prefs, parameter);
  for (const key of Object.keys(options.show)) if (!modelMetricAvailable(key, prefs)) options.show[key] = false;
  if (options.view && !modelMetricAvailable(options.view, prefs)) {
    // A filtered first view must not hide a later, supported selection.
    options.view = null;
    for (const word of String(parameter || '').toLowerCase().split(/[\s,;]+/).filter(Boolean)) {
      if (/^(-|no-?)/.test(word)) continue;
      const key = Object.prototype.hasOwnProperty.call(METRICS, word) ? word : METRIC_ALIASES[word];
      if (key && options.show[key] && ACCESSORY_VIEWS.includes(key) && modelMetricAvailable(key, prefs)) { options.view = key; break; }
    }
    options.view = options.view || 'status';
  }
  return options;
};

function modelProPowerEstimate(snapshot, prefs) {
  const estimate = ppoEstimated(snapshot), raw = ppoRawSignals(snapshot);
  const knownOther = value => ['ICE', 'PHEV', 'BEV'].includes(value);
  const verified = modelPowertrain(prefs) === 'HEV' && !knownOther(prefs && prefs.engineType) &&
    !knownOther(prefs && prefs.garageEngineType) && raw.DcacOutPwDsplyMx === 7200 &&
    !(typeof raw.DcacOutScndPwDsplyMx === 'number' && raw.DcacOutScndPwDsplyMx > 0);
  if (verified) return Object.assign({}, estimate, { mappingStatus: 'corroborated_7_2_hev' });
  const unknown = Object.assign({}, estimate, { estimated: false, mappingStatus: 'unverified', capacityScope: 'Capacity',
    secondaryScopeKnown: false, unitAssumption: 'Mapping unverified for this vehicle/rating; raw details only.' });
  for (const key of ['a', 'b', 'abTotal', 'total', 'capacity', 'mainCapacity', 'secondary', 'secondaryCapacity']) unknown[key] = null;
  return unknown;
}
function modelProPowerInterpretation(snapshot, prefs) {
  return modelProPowerEstimate(snapshot, prefs).mappingStatus === 'corroborated_7_2_hev' ?
    'Estimated watts assume 1 raw unit = 1 W, corroborated only on a 7.2 kW HEV. Command time does not establish sample time.' :
    'Watt and capacity mapping is unverified for this vehicle/rating. Use raw details; no watt or capacity estimate is asserted. Command time does not establish sample time.';
}
function modelProPowerReport(snapshot, prefs, request = null) {
  return Object.assign({}, ppoRedactedReport(snapshot, request), { estimates: modelProPowerEstimate(snapshot, prefs),
    interpretation: modelProPowerInterpretation(snapshot, prefs) });
}
function modelProPowerMode(view) {
  const mode = view.latestMode || {};
  return 'Ford ' + (['OFF', 'LOW', 'HIGH'].includes(mode.value) ? mode.value : 'mode unknown') + ' · ' + ppoDashboardAge(mode.at);
}

function modelTireConfiguration(prefs) {
  const saved = prefs && prefs.tireConfiguration || {};
  const front = finite(saved.frontPsi), rear = finite(saved.rearPsi);
  return { layout: saved.layout === 'six' ? 'six' : 'four', frontPsi: front, rearPsi: rear,
    configured: saved.configured === true && front !== null && front > 0 && front <= 150 && rear !== null && rear > 0 && rear <= 150 };
}
function modelTireKeys(prefs) {
  return modelTireConfiguration(prefs).layout === 'six' ? ['fl', 'fr', 'rlo', 'rli', 'rri', 'rro'] : ['fl', 'fr', 'rl', 'rr'];
}
function modelTireThreshold(prefs, key) {
  const config = modelTireConfiguration(prefs);
  return config.configured ? ['fl', 'fr'].includes(key) ? config.frontPsi : config.rearPsi : null;
}
function modelMissingTires(fields, prefs) {
  return modelTireKeys(prefs).filter(key => finite(fields && fields[key] && fields[key].value) === null);
}
function modelPressureInput(value, unit) {
  const number = finite(value);
  if (number === null || number <= 0) return null;
  const converted = number / (unit === 'bar' ? DISPLAY_PSI_TO_BAR : unit === 'kpa' ? DISPLAY_PSI_TO_KPA : 1);
  if (!Number.isFinite(converted) || converted <= 0) return null;
  if (converted > 150) return converted - 150 <= Number.EPSILON * 150 * 8 ? 150 : null;
  return converted;
}
function modelPressureMaximum(unit) { return 150 * (unit === 'bar' ? DISPLAY_PSI_TO_BAR : unit === 'kpa' ? DISPLAY_PSI_TO_KPA : 1); }
function modelReadingAge(field) {
  const at = field && field.at;
  return typeof at === 'number' && Number.isFinite(at) && at > 0 && at <= now() ? ppoDashboardAge(at) : 'time unknown';
}
function modelFieldAge(renderer, key) { return modelReadingAge(renderer.fields[key]); }
function modelReadableEnum(value) {
  return typeof value === 'string' && value.length ? value.replace(/_/g, ' ') : 'Not reported';
}

const MODEL_ORIGINAL_ALERT_SETTINGS = alertSettings;
alertSettings = function(prefs) {
  const options = MODEL_ORIGINAL_ALERT_SETTINGS(prefs);
  if (!modelTireConfiguration(prefs).configured) options.enabled.tires = false;
  if (modelPowertrain(prefs) === 'BEV') { options.enabled.fuel = false; options.enabled.oil = false; }
  if (!engineControlAllowed(prefs)) options.enabled.engine = false;
  return options;
};
const MODEL_ORIGINAL_NIGHT_PROBLEMS = nightProblems;
nightProblems = function(fields, prefs) {
  // Suppress the legacy shared tire threshold; axle thresholds are owner-set.
  const options = alertSettings(prefs);
  const withoutTires = Object.assign({}, prefs, { alerts: Object.assign({}, prefs && prefs.alerts,
    { enabled: Object.assign({}, options.enabled, { tires: false }) }) });
  const result = MODEL_ORIGINAL_NIGHT_PROBLEMS(fields, withoutTires);
  if (options.enabled.tires) {
    const low = modelTireKeys(prefs).filter(key => {
      const value = finite(fields && fields[key] && fields[key].value), threshold = modelTireThreshold(prefs, key);
      return value !== null && threshold !== null && value < threshold;
    });
    if (low.length) result.push('Low tire ' + low.map(key => displayUnitLowTire(key, fields[key].value, prefs)).join(', '));
    const missing = modelMissingTires(fields, prefs);
    if (missing.length) result.push('Tire readings incomplete: ' + missing.map(key => key.toUpperCase()).join(', '));
  }
  return result;
};

const MODEL_ORIGINAL_REMOTE = WidgetRenderer.prototype.remote;
WidgetRenderer.prototype.remote = function() {
  return engineControlAllowed(this.prefs) ? MODEL_ORIGINAL_REMOTE.call(this) : null;
};
WidgetRenderer.prototype.runningBadge = function(stack, size = 11, full = false) {
  const remote = this.remote(); if (!remote) return false;
  const badge = stack.addStack(); badge.centerAlignContent(); badge.spacing = 4;
  badge.setPadding(3, 6, 3, 6); badge.cornerRadius = 7; badge.backgroundColor = this.run;
  const mayStop = vehicleCommandAllowed(this.prefs, 'stop');
  badge.url = this.url(mayStop ? 'stop' : '');
  this.symbol(badge, 'engine.combustion.fill', size + 1, Color.white());
  if (full) this.text(badge, remote.estimated ? 'Engine · estimated' : 'Remote engine', size, true, Color.white());
  const timer = badge.addDate(new Date(remote.until)); timer.applyTimerStyle();
  timer.font = Font.boldMonospacedSystemFont(size); timer.textColor = Color.white(); timer.lineLimit = 1;
  if (full && mayStop) this.text(badge, 'Tap to stop', size - 1, false, Color.white());
  return true;
};
WidgetRenderer.prototype.buttons = function(stack, columns = 4, width = 66, height = 36) {
  const actions = [['lock', 'Lock', 'lock.fill'], ['unlock', 'Unlock', 'lock.open.fill'],
    this.remote() ? ['stop', 'Stop', 'stop.circle.fill'] : ['start', 'Start', 'power']]
    .filter(([action]) => vehicleCommandAllowed(this.prefs, action));
  if (vehicleBindingCurrent(this.prefs)) actions.push(vehicleCommandAllowed(this.prefs, 'refresh') ?
    ['refresh', 'Refresh', 'arrow.clockwise'] : ['fetch', 'Fetch', 'arrow.down.circle']);
  if (!actions.length) return null;
  const grid = stack.addStack(); grid.layoutVertically(); grid.spacing = 4;
  for (let i = 0; i < actions.length; i += columns) {
    const row = grid.addStack(); row.spacing = 5;
    for (const [action, label, icon] of actions.slice(i, i + columns)) {
      const button = row.addStack(); button.layoutVertically(); button.centerAlignContent();
      button.size = new Size(width, height); button.backgroundColor = this.panel; button.cornerRadius = 8;
      button.url = this.url(action === 'refresh' ? 'refreshwidget' : action);
      const top = button.addStack(); top.addSpacer(); this.symbol(top, icon, 13); top.addSpacer();
      const bottom = button.addStack(); bottom.addSpacer(); this.text(bottom, label, 9, true); bottom.addSpacer();
    }
  }
  return grid;
};

function modelEnergyEntries(renderer) {
  const entries = [];
  if (renderer.on('fuel')) {
    entries.push({ key: 'fuel', label: 'Fuel', value: renderer.number('fuel', '%') });
    entries.push({ key: 'range', label: 'Fuel range', value: displayUnitDistance(renderer.value('range'), renderer.opts.units) });
  }
  if (renderer.on('evSoc')) entries.push({ key: 'evSoc', label: 'EV charge', value: renderer.number('evSoc', '%') });
  if (renderer.on('evRange')) entries.push({ key: 'evRange', label: 'EV range', value: displayUnitDistance(renderer.value('evRange'), renderer.opts.units) });
  return entries;
}
function modelStatusEntries(renderer) {
  const entries = [];
  if (renderer.on('battery')) entries.push({ key: renderer.value('battery') === null ? 'batteryHealth' : 'battery', label: '12V',
    value: renderer.value('battery') === null ? modelReadableEnum(renderer.value('batteryHealth')) : renderer.number('battery', '%') });
  if (renderer.on('oil')) entries.push({ key: 'oil', label: 'Oil', value: renderer.number('oil', '%') });
  if (renderer.on('odometer')) entries.push({ key: 'odometer', label: 'Odometer', value: displayUnitDistance(renderer.value('odometer'), renderer.opts.units) });
  if (renderer.on('lock')) entries.push({ key: 'lock', label: 'Locks', value: renderer.value('lock') || 'Not reported' });
  if (renderer.on('doors')) entries.push({ key: 'doors', label: 'Doors', value: renderer.value('doors') || 'Not reported' });
  if (renderer.on('temp')) entries.push({ key: 'outsideTemp', label: 'Outside', value: formatDisplayTemperature(renderer.value('outsideTemp'), renderer.opts.units) });
  if (renderer.on('plugStatus')) entries.push({ key: 'plugStatus', label: 'Plug', value: modelReadableEnum(renderer.value('plugStatus')) });
  if (renderer.on('chargeStatus')) entries.push({ key: 'chargeStatus', label: 'Charging', value: modelReadableEnum(renderer.value('chargeStatus')) });
  return entries;
}
function modelReadingLine(renderer, stack, entry, size = 10, separateAge = false) {
  const row = stack.addStack(); row.layoutVertically(); row.spacing = 0;
  renderer.text(row, entry.label + ' ' + entry.value + (separateAge ? '' : ' · ' + modelFieldAge(renderer, entry.key)), size, true);
  if (separateAge) renderer.text(row, 'Reported ' + modelFieldAge(renderer, entry.key), Math.max(7, size - 3), false, renderer.muted);
  return row;
}
function modelEnergy(renderer, stack, size = 13, separateAge = true) {
  for (const entry of modelEnergyEntries(renderer)) modelReadingLine(renderer, stack, entry, size, separateAge);
}
WidgetRenderer.prototype.tires = function(stack, size = 12) {
  if (!this.on('tires')) return;
  this.text(stack, 'TIRES · ' + displayUnitPressureLabel(this.opts.unit).toUpperCase(), 8, true, this.muted);
  const keys = modelTireKeys(this.prefs);
  for (let i = 0; i < keys.length; i += 2) {
    const row = stack.addStack(); row.spacing = 7;
    for (const key of keys.slice(i, i + 2)) {
      const cell = row.addStack(); cell.layoutVertically(); cell.spacing = 0;
      const value = finite(this.value(key)), threshold = modelTireThreshold(this.prefs, key);
      this.text(cell, key.toUpperCase() + ' ' + this.tire(key), size, true,
        threshold !== null && value !== null && value < threshold ? new Color('DB5D3F') : this.ink);
      this.text(cell, modelFieldAge(this, key), 7, false, this.muted);
    }
  }
};
WidgetRenderer.prototype.extras = function(stack, size = 10, max = 9, parked = true) {
  for (const entry of modelStatusEntries(this).slice(0, max)) modelReadingLine(this, stack, entry, size);
  if (parked) this.parkedRow(stack, size);
};
WidgetRenderer.prototype.parkedRow = function(stack, size = 10) {
  const place = this.place(); if (!place) return;
  const row = stack.addStack(); row.centerAlignContent(); row.spacing = 4; row.url = place.url;
  this.symbol(row, place.home ? 'house.fill' : 'mappin.and.ellipse', size);
  this.text(row, 'Parked · ' + place.label, size, true); row.addSpacer();
  this.text(row, modelFieldAge(this, 'position'), Math.max(7, size - 2), false, this.muted);
};

function modelProPowerPanel(renderer, widget, family, selected) {
  if (!proPowerEnabled(renderer.prefs) || !selected.length) return;
  const panel = widget.addStack(); panel.layoutVertically(); panel.spacing = 2; panel.url = renderer.url('propower');
  const view = ppoView(ppoSnapshotFor(renderer.cache, renderer.prefs));
  const estimates = modelProPowerEstimate(ppoSnapshotFor(renderer.cache, renderer.prefs), renderer.prefs);
  const small = family === 'small', large = ['large', 'extraLarge'].includes(family);
  renderer.text(panel, estimates.mappingStatus === 'unverified' ? 'Pro Power · mapping unverified' : 'Pro Power · last reported estimates', small ? 8 : 10, true);
  renderer.text(panel, 'Status result ' + ppoDashboardAge(view.commandAt) + ' · sample time unknown', small ? 6 : 7, false, renderer.muted);
  renderer.text(panel, modelProPowerMode(view), small ? 7 : 8, false, renderer.muted);
  if (estimates.mappingStatus === 'unverified') {
    renderer.text(panel, 'Raw details · units unverified', small ? 8 : 10, true); return;
  }
  const entries = ppoEntries(estimates, selected);
  if (!large) {
    for (let i = 0; i < entries.length; i += 2) renderer.text(panel,
      entries.slice(i, i + 2).map(entry => entry.label + ' ' + ppoPowerText(entry.value)).join(' · '), small ? 9 : 10, true);
    return;
  }
  for (let i = 0; i < entries.length; i += 2) {
    const row = panel.addStack(); row.spacing = 7;
    for (const entry of entries.slice(i, i + 2)) {
      const cell = row.addStack(); cell.layoutVertically(); cell.spacing = 1;
      if (large) { cell.setPadding(4, 7, 4, 7); cell.backgroundColor = renderer.panel; cell.cornerRadius = 7; cell.size = new Size(132, 0); }
      renderer.text(cell, entry.label + (large ? '' : ' ' + ppoPowerText(entry.value)), large ? 8 : small ? 9 : 10, true, large ? renderer.muted : renderer.ink);
      if (large) renderer.text(cell, ppoPowerText(entry.value), 16, true);
    }
  }
}
function modelHeader(renderer, widget, design, family) {
  const small = family === 'small', row = widget.addStack(); row.centerAlignContent(); row.spacing = 7;
  if (design !== 'showcase') renderer.truck(row, small ? 40 : 60, small ? 18 : 25);
  const titles = row.addStack(); titles.layoutVertically(); titles.spacing = 0;
  renderer.text(titles, modelIdentity(renderer.prefs), small ? 12 : 14, true);
  renderer.text(titles, 'Last reported · ' + modelPowertrain(renderer.prefs), 7, false, renderer.muted);
  if (design === 'showcase') { row.addSpacer(); renderer.truck(row, small ? 60 : 112, small ? 30 : 48); }
}
function modelWidgetFooter(renderer, widget, notice) {
  const issues = alertSettings(renderer.prefs).attention ? nightProblems(renderer.fields, displayUnitPreferences(renderer.prefs, renderer.opts)) : [];
  if (issues.length) renderer.text(widget, '⚠ ' + issues.join(' · '), 8, false, renderer.muted);
  else if (notice || renderer.cache.notice) renderer.text(widget, notice || 'Cached · source unavailable', 8, false, renderer.muted);
}
function modelMediumProPower(renderer, widget, selected) {
  if (!proPowerEnabled(renderer.prefs) || !selected.length) return;
  const snapshot = ppoSnapshotFor(renderer.cache, renderer.prefs), view = ppoView(snapshot), mode = view.latestMode || {};
  const estimates = modelProPowerEstimate(snapshot, renderer.prefs);
  const panel = widget.addStack(); panel.layoutVertically(); panel.spacing = 0; panel.url = renderer.url('propower');
  renderer.text(panel, 'PPO last · Ford ' + (['OFF', 'LOW', 'HIGH'].includes(mode.value) ? mode.value : '?') +
    ' ' + ppoDashboardAge(mode.at) + ' · result ' + ppoShortAge(view.commandAt) + ' · sample unknown', 7, false, renderer.muted);
  if (estimates.mappingStatus === 'unverified') { renderer.text(panel, 'Mapping unverified · raw details', 9, true); return; }
  const entries = ppoEntries(estimates, selected);
  for (let i = 0; i < entries.length; i += 2) renderer.text(panel,
    entries.slice(i, i + 2).map(entry => entry.label + ' ' + ppoPowerText(entry.value)).join(' · '), 9, true);
}
function modelBuildMedium(renderer, design, notice, selected) {
  const widget = renderer.frame([4, 10, 4, 10]); widget.spacing = 2;
  const header = widget.addStack(); header.centerAlignContent(); header.spacing = 5;
  if (design !== 'showcase') renderer.truck(header, 38, 18);
  renderer.text(header, modelIdentity(renderer.prefs), 12, true);
  const energy = modelEnergyEntries(renderer), status = modelStatusEntries(renderer);
  const battery = status.filter(entry => ['battery', 'batteryHealth'].includes(entry.key));
  const leftEntries = [...energy, ...battery];
  if (!leftEntries.length) leftEntries.push(...status.filter(entry => !['lock', 'doors'].includes(entry.key)).slice(0, 5));
  const rightEntries = status.filter(entry => ['lock', 'doors'].includes(entry.key));
  const shownKeys = new Set([...leftEntries, ...rightEntries].map(entry => entry.key));
  const omitted = status.some(entry => !shownKeys.has(entry.key)) || renderer.on('parked');
  header.addSpacer();
  if (omitted) { const link = header.addStack(); link.url = renderer.url('details'); renderer.text(link, 'More readings →', 7, false, renderer.accent); }
  const remote = renderer.remote();
  if (remote) {
    const running = header.addStack(); running.centerAlignContent(); running.spacing = 2;
    renderer.symbol(running, 'engine.combustion.fill', 8, renderer.run);
    const timer = running.addDate(new Date(remote.until)); timer.applyTimerStyle(); timer.font = Font.boldMonospacedSystemFont(9);
    timer.textColor = renderer.run; timer.lineLimit = 1;
    running.url = renderer.url(vehicleCommandAllowed(renderer.prefs, 'stop') ? 'stop' : '');
  }
  if (design === 'showcase') renderer.truck(header, 45, 18);
  const body = widget.addStack(); body.spacing = 8;
  const left = body.addStack(); left.layoutVertically(); left.spacing = 0;
  for (const entry of leftEntries) modelReadingLine(renderer, left, entry, 9);
  const right = body.addStack(); right.layoutVertically(); right.spacing = 0;
  if (renderer.on('tires')) {
    renderer.text(right, 'Tires · ' + displayUnitPressureLabel(renderer.opts.unit), 6, true, renderer.muted);
    const keys = modelTireKeys(renderer.prefs), columns = keys.length === 6 ? 3 : 2;
    for (let i = 0; i < keys.length; i += columns) {
      const row = right.addStack(); row.spacing = 5;
      for (const key of keys.slice(i, i + columns)) {
        const cell = row.addStack(); cell.layoutVertically(); cell.spacing = 0;
        renderer.text(cell, key.toUpperCase() + ' ' + renderer.tire(key), 9, true);
        renderer.text(cell, modelFieldAge(renderer, key), 6, false, renderer.muted);
      }
    }
  }
  for (const entry of rightEntries) modelReadingLine(renderer, right, entry, 8);
  modelMediumProPower(renderer, widget, selected);
  if (renderer.opts.layout.medium === 'controls' || design === 'showcase') renderer.buttons(widget, 4, 60, 26);
  modelWidgetFooter(renderer, widget, notice);
  return widget;
}
const MODEL_ORIGINAL_BUILD = WidgetRenderer.prototype.build;
WidgetRenderer.prototype.build = function(family = 'medium', notice = '') {
  if (String(family).startsWith('accessory')) return this.buildAccessory(family, notice);
  const small = family === 'small', large = ['large', 'extraLarge'].includes(family);
  const design = this.opts.design[large ? 'large' : small ? 'small' : 'medium'] || 'classic';
  const selected = proPowerEnabled(this.prefs) ? ppoSelected(this) : [];
  if (family === 'medium') return modelBuildMedium(this, design, notice, selected);
  const widget = this.frame(small ? [9, 10, 8, 10] : [9, 12, 8, 12]);
  widget.spacing = small ? 3 : 4;
  modelHeader(this, widget, design, family);
  if (small) {
    const energy = modelEnergyEntries(this), status = modelStatusEntries(this);
    const focus = energy.length ? energy : status;
    for (const entry of focus.slice(0, selected.length ? 2 : 4)) modelReadingLine(this, widget, entry, 11);
    if (!selected.length && energy.length) {
      const lock = status.find(entry => entry.key === 'lock');
      if (lock) modelReadingLine(this, widget, lock, 9);
    }
    if (!energy.length && this.on('tires')) this.tires(widget, 10);
    if (!energy.length && !status.length && !this.on('tires')) this.parkedRow(widget, 9);
    modelProPowerPanel(this, widget, family, selected);
    if (!this.runningBadge(widget, 9)) modelWidgetFooter(this, widget, notice);
    return widget;
  }
  const content = widget.addStack(); content.spacing = design === 'dashboard' ? 9 : 13;
  const left = content.addStack(); left.layoutVertically(); left.spacing = large ? 3 : 2;
  const right = content.addStack(); right.layoutVertically(); right.spacing = large ? 2 : 1;
  // Keep the same selected fields in every design. Showcase changes emphasis,
  // Dashboard groups readings, and Classic keeps the familiar two columns.
  modelEnergy(this, left, large ? 12 : 10, large);
  const status = modelStatusEntries(this);
  const energyStatus = status.filter(entry => ['battery', 'batteryHealth', 'plugStatus', 'chargeStatus'].includes(entry.key));
  for (const entry of energyStatus) modelReadingLine(this, left, entry, large ? 9 : 8);
  if (design === 'showcase' && large) this.truck(left, 132, 54);
  this.tires(right, large ? 12 : 10);
  for (const entry of status.filter(entry => !energyStatus.includes(entry))) modelReadingLine(this, right, entry, large ? 9 : 8);
  if (large) this.parkedRow(widget, 9);
  else if (!selected.length) this.parkedRow(widget, 8);
  if (this.remote()) this.runningBadge(widget, large ? 10 : 8, large);
  modelProPowerPanel(this, widget, family, selected);
  const controls = this.opts.layout[large ? 'large' : 'medium'] === 'controls' || design === 'showcase';
  if (controls) {
    if (large) widget.addSpacer();
    this.buttons(widget, 4, large ? 66 : 60, large ? 34 : 29);
  }
  modelWidgetFooter(this, widget, notice);
  return widget;
};

WidgetRenderer.prototype.buildAccessory = function(family, notice = '') {
  const widget = new ListWidget(), white = Color.white();
  widget.url = this.url(); widget.refreshAfterDate = new Date(this.nextRefresh());
  const selected = proPowerEnabled(this.prefs) ? ppoSelected(this) : [];
  const view = this.opts.view || (modelElectric(this.prefs) ? 'evSoc' : 'fuel');
  if (selected.length && PPO_UI_METRICS.includes(view)) {
    const snapshot = ppoSnapshotFor(this.cache, this.prefs), status = ppoView(snapshot);
    const estimates = modelProPowerEstimate(snapshot, this.prefs);
    const entry = ppoEntries(estimates, selected).find(item => item.key === view) || ppoEntries(estimates, selected)[0];
    widget.url = this.url('propower');
    if (family === 'accessoryInline') {
      this.text(widget, 'PPO · ' + modelProPowerMode(status) + ' · ' + (estimates.mappingStatus === 'unverified' ?
        'mapping unverified · raw details' : entry.label + ' est. ' + ppoPowerText(entry.value)) +
        ' · status ' + ppoDashboardAge(status.commandAt) + ' · sample time unknown', 8, true, white);
    } else {
      this.text(widget, 'PPO last · status ' + ppoDashboardAge(status.commandAt), 8, true, white);
      this.text(widget, modelProPowerMode(status), 8, true, white);
      this.text(widget, estimates.mappingStatus === 'unverified' ? 'Mapping unverified · raw details' : entry.label + ' est. ' + ppoPowerText(entry.value), 10, true, white);
      this.text(widget, 'Sample time unknown', 7, false, white);
    }
    return widget;
  }
  if (view === 'parked') {
    const place = this.place();
    this.text(widget, place ? 'Parked · ' + place.label : 'Location not reported', 10, true, white);
    if (family !== 'accessoryInline') this.text(widget, modelFieldAge(this, 'position'), 8, false, white);
    if (place) widget.url = place.url;
    return widget;
  }
  if (view === 'tires') {
    const keys = modelTireKeys(this.prefs);
    const known = keys.filter(key => finite(this.value(key)) !== null);
    if (family === 'accessoryCircular' || family === 'accessoryInline') {
      const lowest = known.sort((a, b) => this.value(a) - this.value(b))[0];
      this.text(widget, lowest ? lowest.toUpperCase() + ' ' + this.tire(lowest) + ' ' + displayUnitPressureLabel(this.opts.unit) : 'Tires not reported', 11, true, white);
      if (family !== 'accessoryInline') this.text(widget, lowest ? modelFieldAge(this, lowest) : 'time unknown', 8, false, white);
    } else for (let i = 0; i < keys.length; i += 2) {
      this.text(widget, keys.slice(i, i + 2).map(key => key.toUpperCase() + ' ' + this.tire(key) + ' · ' + modelFieldAge(this, key)).join(' / '), 9, true, white);
    }
    return widget;
  }
  const energy = modelEnergyEntries(this), status = modelStatusEntries(this);
  let entries;
  if (view === 'status') entries = [...energy.slice(0, 1), ...status.filter(entry => ['lock', 'doors'].includes(entry.key))];
  else entries = [...energy, ...status].filter(entry => entry.key === view || view === 'temp' && entry.key === 'outsideTemp' ||
    view === 'battery' && entry.key === 'batteryHealth' || view === 'fuel' && ['fuel', 'range'].includes(entry.key));
  if (!entries.length) entries = [...energy, ...status].slice(0, 1);
  if (family === 'accessoryInline') {
    const entry = entries[0];
    this.text(widget, entry ? entry.label + ' ' + entry.value + ' · ' + modelFieldAge(this, entry.key) : notice || modelIdentity(this.prefs), 10, true, white);
  } else if (family === 'accessoryCircular') {
    const entry = entries[0]; widget.addAccessoryWidgetBackground = true; widget.addSpacer();
    if (entry) {
      this.centered(widget, row => this.text(row, entry.label, 8, true, white));
      this.centered(widget, row => this.text(row, entry.value, 14, true, white));
      this.centered(widget, row => this.text(row, modelFieldAge(this, entry.key), 7, false, white));
    } else this.text(widget, 'Not reported', 9, true, white);
    widget.addSpacer();
  } else {
    this.text(widget, modelIdentity(this.prefs), 10, true, white);
    for (const entry of entries.slice(0, 3)) this.text(widget, entry.label + ' ' + entry.value + ' · ' + modelFieldAge(this, entry.key), 9, true, white);
  }
  return widget;
};

AppController.prototype.tireOptions = async function(prefs) {
  for (;;) {
    const current = displayUnitCurrent(this, prefs), config = modelTireConfiguration(current), unit = displayUnitOptions(current).unit;
    const menu = new Alert(); menu.title = 'Tires & axle thresholds';
    menu.message = 'Use the pressure specification for this vehicle and load. Enter your chosen low-pressure alert thresholds; these are not recommended inflation pressures. Alerts stay off until both axle thresholds are saved.';
    menu.addAction('Layout: ' + (config.layout === 'six' ? 'Six tires (dual rear)' : 'Four tires'));
    menu.addAction(config.configured ? 'Edit front / rear thresholds' : 'Set front / rear thresholds');
    menu.addAction('Low tire alerts: ' + (alertSettings(current).enabled.tires ? 'On' : 'Off'));
    menu.addCancelAction('Done'); const choice = await menu.presentSheet(); if (choice < 0) return;
    displayUnitCurrent(this, prefs);
    if (choice === 0) prefs.tireConfiguration = Object.assign({}, current.tireConfiguration, { layout: config.layout === 'six' ? 'four' : 'six' });
    if (choice === 1) {
      const frontText = config.frontPsi === null ? '' : formatDisplayPressure(config.frontPsi, unit, true);
      const rearText = config.rearPsi === null ? '' : formatDisplayPressure(config.rearPsi, unit, true);
      const values = await input('Low-pressure thresholds', 'Enter front and rear thresholds above 0 and up to ' + modelPressureMaximum(unit) + ' ' + displayUnitPressureLabel(unit) + '.',
        [{ label: 'Front', value: frontText }, { label: 'Rear', value: rearText }]);
      if (!values) continue;
      const front = String(values[0]).trim() === frontText && config.frontPsi !== null ? config.frontPsi : modelPressureInput(values[0], unit);
      const rear = String(values[1]).trim() === rearText && config.rearPsi !== null ? config.rearPsi : modelPressureInput(values[1], unit);
      if (front === null || rear === null || front <= 0 || rear <= 0 || front > 150 || rear > 150) {
        await message('Invalid thresholds', 'Enter each axle above 0 and up to ' + modelPressureMaximum(unit) + ' ' + displayUnitPressureLabel(unit) + '.'); continue;
      }
      displayUnitCurrent(this, prefs);
      prefs.tireConfiguration = { configured: true, layout: config.layout, frontPsi: front, rearPsi: rear };
    }
    if (choice === 2) {
      if (!config.configured) { await message('Set thresholds first', 'Save both front and rear low-pressure thresholds before enabling tire alerts.'); continue; }
      prefs.alerts = Object.assign({}, current.alerts, { enabled: Object.assign({}, alertSettings(current).enabled, { tires: !alertSettings(current).enabled.tires }) });
    }
    saveVehiclePreferences(this.store, prefs);
  }
};
AppController.prototype.alertOptions = async function(prefs) {
  for (;;) {
    const current = displayUnitCurrent(this, prefs), settings = alertSettings(current);
    const names = { lock: 'Unlocked', doors: 'Door / hood / tailgate open', fuel: 'Low fuel', oil: 'Low oil life', battery: 'Low 12V battery', engine: 'Remote engine running' };
    const keys = Object.keys(names).filter(key => !(['fuel', 'oil'].includes(key) && modelPowertrain(current) === 'BEV') && (key !== 'engine' || engineControlAllowed(current)));
    const menu = new Alert(); menu.title = 'Alerts & attention';
    menu.message = 'Only available readings are checked. Their measurement ages stay visible. Tire alerts require your front and rear thresholds.';
    menu.addAction('Tires & axle thresholds');
    keys.forEach(key => menu.addAction((settings.enabled[key] ? '✓ ' : '○ ') + names[key]));
    const thresholds = ['fuel', 'oil', 'battery'].filter(key => key === 'battery' || modelPowertrain(current) !== 'BEV');
    thresholds.forEach(key => menu.addAction(key[0].toUpperCase() + key.slice(1) + ' threshold: ' + settings[key] + '%'));
    menu.addAction('Widget attention: ' + (settings.attention ? 'On' : 'Off')); menu.addCancelAction('Done');
    const choice = await menu.presentSheet(); if (choice < 0) return;
    displayUnitCurrent(this, prefs);
    if (choice === 0) { await this.tireOptions(prefs); continue; }
    const next = Object.assign({}, current.alerts);
    if (choice <= keys.length) next.enabled = Object.assign({}, settings.enabled, { [keys[choice - 1]]: !settings.enabled[keys[choice - 1]] });
    else if (choice <= keys.length + thresholds.length) {
      const key = thresholds[choice - keys.length - 1];
      const values = await input('Alert threshold', 'Enter a percentage from 0 to 100.', [{ label: key, value: String(settings[key]) }]);
      if (!values) continue;
      const value = finite(values[0]);
      if (value === null || value < 0 || value > 100) { await message('Invalid threshold', 'Enter a number from 0 to 100.'); continue; }
      displayUnitCurrent(this, prefs); next[key] = value;
    } else next.attention = !settings.attention;
    prefs.alerts = next; saveVehiclePreferences(this.store, prefs);
  }
};
AppController.prototype.customize = async function(prefs) {
  for (;;) {
    const current = displayUnitCurrent(this, prefs), options = widgetOptions(current, ''), cfg = current.widget || {};
    const menu = new Alert(); menu.title = 'Customize widgets';
    menu.message = 'Changes apply to this vehicle. Bind each widget with its copied vehicle parameter. Add words such as "dashboard", "controls", "evsoc", "tires", "-photo", "metric", or "psi" to customize one widget.';
    const keys = modelMetricKeys(current);
    keys.forEach(key => menu.addAction((options.show[key] ? '✓ ' : '○ ') + METRICS[key]));
    menu.addAction('Medium layout: ' + (options.layout.medium === 'controls' ? 'Buttons' : 'Status'));
    menu.addAction('Tires & axle thresholds');
    const night = nightSettings(current);
    menu.addAction('Evening check: ' + (night.enabled ? night.hour + ':00' : 'Off'));
    menu.addAction('Evening all-good notice: ' + (night.notifyOk ? 'On' : 'Off'));
    menu.addAction('Preview small'); menu.addAction('Preview medium'); menu.addAction('Preview large'); menu.addCancelAction('Done');
    const choice = await menu.presentSheet(); if (choice < 0) return;
    displayUnitCurrent(this, prefs);
    if (choice === keys.length + 1) { await this.tireOptions(prefs); continue; }
    if (choice >= keys.length + 4) {
      const family = ['small', 'medium', 'large'][choice - keys.length - 4];
      const preview = new WidgetRenderer(prefs, this.store.read()).build(family);
      if (family === 'small') await preview.presentSmall(); else if (family === 'medium') await preview.presentMedium(); else await preview.presentLarge();
      continue;
    }
    const show = Object.assign({}, cfg.show);
    if (choice < keys.length) show[keys[choice]] = !options.show[keys[choice]];
    prefs.widget = Object.assign({}, cfg, { show });
    if (choice === keys.length) prefs.widget.medium = options.layout.medium === 'controls' ? 'status' : 'controls';
    if (choice === keys.length + 2) {
      const order = [null, 20, 21, 22, 23], next = order[(order.indexOf(night.enabled ? night.hour : null) + 1) % order.length];
      prefs.night = Object.assign({}, current.night, next === null ? { enabled: false } : { enabled: true, hour: next });
    }
    if (choice === keys.length + 3) prefs.night = Object.assign({}, current.night, { notifyOk: !night.notifyOk });
    saveVehiclePreferences(this.store, prefs);
  }
};
AppController.prototype.details = async function(prefs) {
  displayUnitCurrent(this, prefs);
  const cache = this.store.read() || {}, fields = cache.fields || {}, options = displayUnitOptions(prefs);
  const keys = Object.keys(FIELD_NAMES).filter(key => {
    if (['fuel', 'range', 'oil'].includes(key) && modelPowertrain(prefs) === 'BEV') return false;
    if (['evSoc', 'evRange', 'plugStatus', 'chargeStatus', 'chargeEndTime'].includes(key)) return modelElectric(prefs);
    if (['remoteStart', 'ignition'].includes(key) && !engineControlAllowed(prefs)) return false;
    return !['fl', 'fr', 'rl', 'rr', 'rli', 'rlo', 'rri', 'rro'].includes(key) || modelTireKeys(prefs).includes(key);
  });
  const lines = keys.map(key => {
    const field = fields[key], raw = field && field.value; let value = raw;
    if (raw === null || raw === undefined) value = 'Not reported';
    else if (['range', 'evRange', 'odometer'].includes(key)) value = displayUnitDistance(raw, options.units, 1);
    else if (modelTireKeys(prefs).includes(key)) value = formatDisplayPressure(raw, options.unit, true) + ' ' + displayUnitPressureLabel(options.unit);
    else if (key === 'outsideTemp') value = formatDisplayTemperature(raw, options.units);
    else if (key === 'chargeEndTime') value = typeof raw === 'number' && Number.isFinite(raw) && raw > 0 ? new Date(raw).toLocaleString() : 'Not reported';
    else if (key === 'position') value = cache.place && cache.place.label || (raw && typeof raw.lat === 'number' && typeof raw.lon === 'number' ? raw.lat.toFixed(4) + ', ' + raw.lon.toFixed(4) : 'Not reported');
    else if (key === 'remoteStart') value = raw.until > now() ? 'Running until ' + new Date(raw.until).toLocaleTimeString() : 'Off';
    else if (typeof raw === 'object') value = 'Available in technical details';
    const label = FIELD_NAMES[key].replace(/ \(mi\)$/, '').replace(/ PSI$/, '');
    return label + ': ' + value + '\n' + (field ? String(field.source || 'Ford') + ' · reported ' + modelReadingAge(field) : 'Not reported');
  });
  const config = modelTireConfiguration(prefs);
  lines.push('Tire alerts: ' + (config.configured ? 'Front below ' + formatDisplayPressure(config.frontPsi, options.unit, true) +
    ', rear below ' + formatDisplayPressure(config.rearPsi, options.unit, true) + ' ' + displayUnitPressureLabel(options.unit) + ' · ' + (alertSettings(prefs).enabled.tires ? 'On' : 'Off') : 'Off · thresholds not configured'));
  if (config.configured && modelMissingTires(fields, prefs).length) lines.push('Tire readings incomplete: ' + modelMissingTires(fields, prefs).map(key => key.toUpperCase()).join(', '));
  lines.push('Photo: ' + (prefs.imageMode === 'custom' ? 'From your Photos' : prefs.imageMode === 'off' ? 'Generic vehicle icon' : cache.image && cache.image.source ? cache.image.source + ' · ' + modelReadingAge(cache.image) : 'Not downloaded'));
  const evening = cache.night;
  lines.push('Evening check: ' + (!nightSettings(prefs).enabled ? 'Off' : evening && evening.done ?
    (evening.problems && evening.problems.length ? evening.problems.join(', ') : evening.securityFresh === true ? 'Locked and closed; no enabled alerts' : 'Current security status unconfirmed') + ' · ' + modelReadingAge(evening) : 'Not run yet'));
  if (cache.lastCommand) lines.push('Last request: ' + cache.lastCommand.action + '\n' + cache.lastCommand.outcome + ' · ' + modelReadingAge(cache.lastCommand));
  await message(modelIdentity(prefs), lines.join('\n\n'));
};

const MODEL_ORIGINAL_PRO_POWER_DETAILS = AppController.prototype.proPowerDetails;
AppController.prototype.proPowerDetails = async function(prefs) {
  if (!proPowerEnabled(prefs)) throw new Error('Enable Pro Power for this vehicle in Vehicle features first.');
  return MODEL_ORIGINAL_PRO_POWER_DETAILS.call(this, prefs);
};
const MODEL_ORIGINAL_PRO_POWER_CONFIRM = AppController.prototype.confirmProPowerStatus;
AppController.prototype.confirmProPowerStatus = async function(prefs) {
  if (!proPowerEnabled(prefs)) throw new Error('Enable Pro Power for this vehicle in Vehicle features first.');
  return MODEL_ORIGINAL_PRO_POWER_CONFIRM.call(this, prefs);
};
const MODEL_ORIGINAL_ACTION = AppController.prototype.action;
AppController.prototype.action = async function(action, prefs, ...rest) {
  if (action === 'details') return this.details(prefs);
  return MODEL_ORIGINAL_ACTION.call(this, action, prefs, ...rest);
};


// Deliberately bounded, cached evidence for model testing. Never uploads data.
function modelSupportReport(prefs, cache, clock = now()) {
  if (!prefs || !cache || !vinOK(prefs.vin) || prefs.vin !== cache.vin ||
      cache.profileId && cache.profileId !== prefs.id || cache.accountId && cache.accountId !== prefs.accountId)
    throw new Error('Report cache does not match the selected vehicle.');
  const fields = cache.fields || {};
  const limits = {
    fuel: [0, 100, '%'], range: [0, 1e8, 'mi'], battery: [0, 100, '% (12V)'],
    oil: [0, 100, '%'], odometer: [0, 1e8, 'mi'], outsideTemp: [-60, 70, 'C'],
    evSoc: [0, 100, '% (traction)'], evRange: [0, 1e8, 'mi'],
    fl: [0, 150, 'psi'], fr: [0, 150, 'psi'], rl: [0, 150, 'psi'], rr: [0, 150, 'psi'],
    rli: [0, 150, 'psi'], rlo: [0, 150, 'psi'], rri: [0, 150, 'psi'], rro: [0, 150, 'psi']
  };
  const enums = {
    plugStatus: VEHICLE_PLUG_STATES, chargeStatus: VEHICLE_EV_CHARGE_STATES,
    lock: ['Locked', 'Unlocked', 'Unknown'], doors: ['Closed', 'Ajar', 'Unknown']
  };
  const ageSeconds = at => typeof at === 'number' && Number.isFinite(at) && at > 0 && at <= clock ? Math.floor((clock - at) / 1000) : null;
  const readings = {};
  for (const key of [...Object.keys(limits), ...Object.keys(enums)]) {
    const entry = vehicleOwn(fields, key) && vehicleRecord(fields[key]) ? fields[key] : null;
    if (!entry) continue;
    const number = limits[key];
    const valid = number ? typeof entry.value === 'number' && Number.isFinite(entry.value) && entry.value >= number[0] && entry.value <= number[1] : enums[key].includes(entry.value);
    readings[key] = { value: valid ? entry.value : null, unit: number ? number[2] : 'enum',
      sampleAgeSeconds: ageSeconds(entry.at), fetchedAgeSeconds: ageSeconds(entry.fetchedAt),
      source: ['FordPass', 'FordConnect'].includes(entry.source) ? entry.source : null };
  }
  const saved = prefs && prefs.tireConfiguration || {};
  const threshold = value => typeof value === 'number' && Number.isFinite(value) && value > 0 && value <= 150 ? value : null;
  const capabilities = vehicleCapabilities(prefs), commands = {};
  for (const action of ['lock', 'unlock', 'start', 'stop', 'refresh'])
    commands[action] = !!(prefs && prefs.compatibility && prefs.compatibility.commands && prefs.compatibility.commands[action] === true);
  return { tool: 'FordPassWidgets model support report', reportVersion: 1, appVersion: FORDWIDGET_VERSION,
    readOnly: true, cachedOnly: true,
    scope: 'Selected cached measurements and capability choices only. Identifiers, names, location, account data and raw payloads are excluded. Review states and ages before sharing.',
    vehicle: { engineType: modelPowertrain(prefs),
      ownerEngineType: ['ICE', 'HEV', 'PHEV', 'BEV'].includes(prefs.engineType) ? prefs.engineType : 'UNKNOWN',
      fordEngineType: ['ICE', 'HEV', 'PHEV', 'BEV'].includes(prefs.garageEngineType) ? prefs.garageEngineType : 'UNKNOWN',
      transmission: ['AUTOMATIC', 'MANUAL'].includes(prefs && prefs.transmission) ? prefs.transmission : 'UNKNOWN',
      capabilities, ownerEnabledCommands: commands, ownerEnabledProPower: !!(prefs && prefs.features && prefs.features.proPower === true) },
    tires: { layout: saved.layout === 'six' ? 'six' : 'four', configured: saved.configured === true && threshold(saved.frontPsi) !== null && threshold(saved.rearPsi) !== null,
      frontThresholdPsi: threshold(saved.frontPsi), rearThresholdPsi: threshold(saved.rearPsi) },
    readings };
}
AppController.prototype.modelSupportReport = async function(prefs) {
  const validate = () => {
    requireApp(); this.store.assertLease();
    if (!vehicleBindingCurrent(prefs, this.store)) throw new Error('The selected vehicle or account session changed.');
    return this.store.read();
  };
  const text = JSON.stringify(modelSupportReport(prefs, validate()), null, 2);
  await QuickLook.present(text); validate();
  const choice = new Alert(); choice.title = 'Model support report';
  choice.message = 'This cached report excludes names, VINs, locations and tokens. It still includes vehicle states and ages. Review it before sharing.';
  choice.addAction('Copy report'); choice.addCancelAction('Close');
  const selected = await choice.presentAlert(); validate();
  if (selected === 0) Pasteboard.copyString(text);
};
AppController.prototype.proPowerReport = async function(prefs, copy = false) {
  const validate = () => {
    if (!appProPowerEnabled(prefs, this.store)) throw new Error('Pro Power monitoring is not enabled for this vehicle.');
    return troubleshootingCache(this, prefs);
  };
  const cache = validate(), snapshot = ppoSnapshotFor(cache, prefs);
  const report = modelProPowerReport(snapshot, prefs, cache.proPowerRequest || null);
  report.tool = 'FordPassWidgets Pro Power'; report.reportVersion = 3;
  report.appVersion = FORDWIDGET_VERSION; report.refreshDiagnostics = widgetDiagnosticContext(cache);
  if (!copy) {
    const lines = ['Pro Power raw signals · last reported', ppoModeLine(ppoView(snapshot)),
      'Status result: ' + ppoCommandAge(ppoView(snapshot)), modelProPowerInterpretation(snapshot, prefs), ''];
    for (const key of PPO_UI_RAW_KEYS) lines.push(key + ': ' +
      (Object.prototype.hasOwnProperty.call(report.rawSignals, key) ? report.rawSignals[key] : 'not reported'));
    await QuickLook.present(lines.join('\n')); validate(); return;
  }
  const text = JSON.stringify(report, null, 2);
  await QuickLook.present(text); validate();
  const review = new Alert(); review.title = 'Review redacted Pro Power report';
  review.message = 'This cached report excludes names, VINs, locations and tokens. It includes raw signals, vehicle states and ages. Review it before sharing.';
  review.addAction('Copy report'); review.addCancelAction('Cancel');
  const selected = await review.presentAlert(); validate();
  if (selected === 0) Pasteboard.copyString(text);
};
AppController.prototype.troubleshooting = async function(prefs) {
  for (;;) {
    requireApp(); this.store.assertLease();
    if (!vehicleBindingCurrent(prefs, this.store)) throw new Error('The selected vehicle or account session changed.');
    const menu = new Alert(); menu.title = 'Troubleshooting';
    menu.message = 'Reports are optional. Nothing is uploaded automatically. Review reports before sharing. The model support report uses only saved readings; the vehicle data report offers one passive cloud read.';
    const items = [['Model support report', () => this.modelSupportReport(prefs)],
      ['Vehicle data report', () => this.vehicleStatusDiagnostic(prefs)]];
    if (proPowerEnabled(prefs)) items.push(['Pro Power report', () => this.proPowerDetails(prefs)]);
    items.forEach(([label]) => menu.addAction(label)); menu.addCancelAction('Close');
    const selected = await menu.presentSheet(); this.store.assertLease();
    if (!vehicleBindingCurrent(prefs, this.store)) throw new Error('The selected vehicle or account session changed.');
    if (selected < 0) return;
    if (selected < items.length) await items[selected][1]();
  }
};


// Foreground account/vehicle navigation. A widget's saved vehicle never follows
// whichever vehicle was most recently opened in the app.
function appVehicleLabel(prefs) {
  return `${prefs && prefs.name || 'Ford'} · ${prefs && typeof prefs.vin === 'string' ? prefs.vin.slice(-4) : 'vehicle'}`;
}
function appAssertProfile(prefs, store) {
  requireApp(); store.assertLease();
  if (!vehicleBindingCurrent(prefs, store)) throw new Error('The selected vehicle or account session changed. Open FordPassWidgets again.');
  const current = readVehicleRegistry().profiles.find(p => p.id === prefs.id);
  if (!current || current.vin !== prefs.vin) throw new Error('The selected vehicle changed.');
  return current;
}
function appAssertAccount(store) {
  requireApp(); store.assertLease();
  if (store.profileBinding.profileId) throw new Error('Use the account context for this operation.');
  return readVehicleRegistry();
}
function appProPowerEnabled(prefs, store) { return proPowerEnabled(appAssertProfile(prefs, store)); }
function appRefreshPrompt(prefs, store) {
  const power = appProPowerEnabled(prefs, store) ? 'vehicle and Pro Power status' : 'vehicle status';
  return `Request ${power} for ${appVehicleLabel(prefs)}, then read Ford's latest available data. This may wake connected electronics; it does not start or stop the engine or switch outlets. Keep Scriptable open while it finishes. Existing cooldowns apply.`;
}
function appUnavailableWidget(text) {
  const w = new ListWidget(); w.addText('FordPassWidgets'); w.addSpacer(8); w.addText(text);
  w.url = `scriptable:///run?${form({scriptName: Script.name()})}`; return w;
}
function appSelectedVehicle() {
  const parsed = vehicleParameter(args.widgetParameter), query = args.queryParameters || {};
  const explicitQuery = Object.prototype.hasOwnProperty.call(query, 'vehicle');
  if (parsed.invalid || explicitQuery && (!profileID(query.vehicle) || parsed.profileId && parsed.profileId !== query.vehicle))
    return {invalid: true, id: null, parameter: parsed.parameter};
  const registry = readVehicleRegistry(); let id = explicitQuery ? query.vehicle : parsed.profileId || registry.defaultVehicleId;
  if (id && !registry.profiles.some(p => p.id === id && profileAuthorized(p, registry))) {
    if (explicitQuery || parsed.profileId) return {invalid: true, id, parameter: parsed.parameter};
    id = null;
  }
  return {invalid: false, id, parameter: parsed.parameter};
}

AppController.prototype.releaseContext = function() {
  if (this.store) this.store.release(); this.store = null; this.auth = null;
};
AppController.prototype.attachAccount = async function() {
  requireApp(); if (this.store) this.store.assertLease();
  this.releaseContext(); bindVehicleProfile(null);
  this.store = new LocalStore(); this.auth = new FordAuthManager(this.store);
  await this.store.acquire(); appAssertAccount(this.store); return readVehicleRegistry();
};
AppController.prototype.attachVehicle = async function(id, options = {}) {
  requireApp(); if (this.store) this.store.assertLease();
  this.releaseContext(); const prefs = bindVehicleProfile(id, null, options);
  this.store = new LocalStore(); this.auth = new FordAuthManager(this.store);
  await this.store.acquire(); this.store.assertLease();
  if (!options.allowUnauthorized) {
    appAssertProfile(prefs, this.store);
    if (!this.store.read()) this.store.write({version: 1, vin: prefs.vin, fields: {}});
  }
  return prefs;
};
AppController.prototype.loadGarage = async function() {
  appAssertAccount(this.store);
  const token = await this.auth.token('mobile'); appAssertAccount(this.store);
  const headers = {'auth-token': token, 'Application-Id': SETTINGS.applicationId, countryCode: 'USA', locale: 'en-US'};
  const raw = await this.auth.request('garage.mobile', SETTINGS.garage, 'GET', null, headers, false, true);
  appAssertAccount(this.store); return authorizeGarageVehicles(raw, this.store);
};
AppController.prototype.connectAccount = async function() {
  await this.attachAccount(); beginAccountSession(this.store);
  Script.setWidget(appUnavailableWidget('Sign in and authorize the vehicle in this account session.'));
  await this.auth.connectMobile(); appAssertAccount(this.store);
  const token = secretGet('token.mobile');
  if (!token || !(token.expires > now())) return false;
  completeAccountSession(this.store);
  try { await this.loadGarage(); }
  catch (_) {
    appAssertAccount(this.store);
    await message('Garage unavailable', 'Sign-in completed, but the garage could not be read. Retry garage discovery or verify a VIN with one passive telemetry read. Previously saved vehicles still need authorization in this account session.');
    appAssertAccount(this.store);
  }
  return true;
};
AppController.prototype.addManualVehicle = async function() {
  appAssertAccount(this.store);
  const values = await input('Verify a vehicle VIN', 'One passive read must explicitly return the same VIN before this vehicle can be used. This does not send a vehicle command.', [
    {label: '17-character VIN'}, {label: 'Vehicle name', value: 'Ford'}]);
  appAssertAccount(this.store); if (!values) return null;
  const pending = addVehicleProfile({vin: values[0], name: values[1]}, this.store);
  const prefs = await this.attachVehicle(pending.id, {allowUnauthorized: true});
  const raw = await new FordAPIClient(this.auth, this.store, prefs).mobileTelemetry();
  this.store.assertLease();
  const verified = validateManualVehicle(prefs.id, raw, this.store);
  appAssertProfile(verified, this.store);
  let fields = {};
  try { fields = normalize(raw, verified.vin, 'FordPass', now()); } catch (_) { /* Identity can be verified before supported readings exist. */ }
  this.store.write({version: 1, vin: verified.vin, fields, fetchedAt: now()});
  return verified.id;
};
AppController.prototype.chooseVehicle = async function() {
  // Garage discovery and manual verification intentionally use account scope.
  await this.attachAccount();
  for (;;) {
    const registry = appAssertAccount(this.store), available = registry.profiles.filter(p => profileAuthorized(p, registry));
    const menu = new Alert(); menu.title = 'Vehicles';
    menu.message = 'Opening a vehicle does not change the default. Each widget can keep its own vehicle parameter.';
    available.forEach(p => menu.addAction(appVehicleLabel(p) + (p.id === registry.defaultVehicleId ? ' · default' : '')));
    menu.addAction('Read FordPass garage'); menu.addAction('Verify a VIN manually'); menu.addCancelAction('Close');
    const choice = await menu.presentSheet(); appAssertAccount(this.store);
    if (choice < 0) return null;
    if (choice < available.length) return available[choice].id;
    if (choice === available.length) {
      try { await this.loadGarage(); }
      catch (_) { appAssertAccount(this.store); await message('Garage unavailable', 'No vehicle commands were sent. Retry later or verify a VIN manually.'); }
    } else {
      try { const id = await this.addManualVehicle(); if (id) return id; }
      catch (_) { this.store.assertLease(); await message('VIN not verified', 'The passive response did not verify this vehicle. No controls were enabled.'); }
      await this.attachAccount();
    }
  }
};
AppController.prototype.setupVehicle = async function(prefs = activeVehicleProfile()) {
  appAssertProfile(prefs, this.store);
  const labels = {lock: 'Lock', unlock: 'Unlock', start: 'Remote start', stop: 'Remote stop', refresh: 'Wake / refresh'};
  for (;;) {
    prefs = appAssertProfile(prefs, this.store);
    const controls = prefs.compatibility && prefs.compatibility.commands || {};
    const menu = new Alert(); menu.title = 'Vehicle features · ' + appVehicleLabel(prefs);
    menu.message = 'Review the powertrain and transmission. Enable only controls available in your Ford app. This screen never tests a command. Unavailable controls remain blocked.';
    menu.addAction('Name: ' + (prefs.name || 'Ford'));
    const knownEngine = ['ICE', 'HEV', 'PHEV', 'BEV'].includes(prefs.garageEngineType);
    const knownTransmission = ['AUTOMATIC', 'MANUAL'].includes(prefs.garageTransmission);
    menu.addAction('Powertrain: ' + (knownEngine ? prefs.garageEngineType + ' · FordPass' : prefs.engineType || 'UNKNOWN'));
    menu.addAction('Transmission: ' + (knownTransmission ? prefs.garageTransmission + ' · FordPass' : prefs.transmission || 'UNKNOWN'));
    menu.addAction(`${prefs.features && prefs.features.engineControl ? '✓' : '○'} I verified remote engine control is available`);
    for (const key of Object.keys(labels)) menu.addAction(`${controls[key] === true ? '✓' : '○'} ${labels[key]}`);
    menu.addAction(`${prefs.features && prefs.features.proPower ? '✓' : '○'} Pro Power monitoring${['unsupported', 'disabled'].includes(capabilityState(prefs, 'proPower')) ? ' · currently unavailable' : ''}`);
    menu.addCancelAction('Done');
    const choice = await menu.presentSheet(); prefs = appAssertProfile(prefs, this.store);
    if (choice < 0) return prefs;
    const next = profileCopy(prefs); next.features = Object.assign({}, next.features);
    if (choice === 0) {
      const values = await input('Vehicle name', 'Used in confirmations and widgets.', [{label: 'Name', value: prefs.name}]);
      appAssertProfile(prefs, this.store); if (!values) continue; next.name = values[0] || 'Ford';
    } else if (choice === 1 || choice === 2) {
      if (choice === 1 && knownEngine || choice === 2 && knownTransmission) {
        await message('Reported vehicle configuration', 'FordPass reported this value. It stays fixed for this vehicle; only unknown configuration needs owner review.');
        appAssertProfile(prefs, this.store); continue;
      }
      const values = choice === 1 ? ['UNKNOWN', 'ICE', 'HEV', 'PHEV', 'BEV'] : ['UNKNOWN', 'AUTOMATIC', 'MANUAL'];
      const a = new Alert(); a.title = choice === 1 ? 'Powertrain' : 'Transmission'; values.forEach(v => a.addAction(v)); a.addCancelAction('Cancel');
      const pick = await a.presentSheet(); appAssertProfile(prefs, this.store); if (pick < 0) continue;
      next[choice === 1 ? 'engineType' : 'transmission'] = values[pick];
    } else if (choice === 3) next.features.engineControl = !next.features.engineControl;
    else if (choice < 9) {
      const key = Object.keys(labels)[choice - 4];
      next.compatibility = Object.assign({}, next.compatibility, {commands: Object.assign({}, controls, {[key]: controls[key] !== true})});
    } else next.features.proPower = !next.features.proPower;
    prefs = saveVehicleProfile(next, this.store);
  }
};
AppController.prototype.compatibility = async function(prefs) { return this.setupVehicle(prefs); };
AppController.prototype.copyVehicleParameter = async function(prefs) {
  appAssertProfile(prefs, this.store); Pasteboard.copyString('vehicle=' + prefs.id);
  await message('Widget parameter copied', 'Paste it into Edit Widget → Parameter. Add existing display options after it, for example: vehicle=' + prefs.id + ' fuel tires lock');
  appAssertProfile(prefs, this.store);
};
AppController.prototype.signOut = async function() {
  const store = this.store; store.assertLease(); const binding = profileCopy(store.profileBinding);
  const a = new Alert(); a.title = 'Sign out of FordPass';
  a.message = 'Disconnects this account and all vehicle profiles. Widgets keep their settings but cannot show saved vehicle data until the vehicles are authorized after sign-in.';
  a.addDestructiveAction('Sign out'); a.addCancelAction('Cancel');
  if (await a.presentAlert() < 0) return false;
  assertVehicleRequestBinding(store, binding); store.assertLease();
  await this.attachAccount(); endAccountSession(this.store);
  Script.setWidget(appUnavailableWidget('Connect FordPass to authorize your vehicles again.'));
  await message('Signed out', 'Connect FordPass again to authorize your vehicles.'); appAssertAccount(this.store); return true;
};
AppController.prototype.notify = async function(body) {
  const prefs = appAssertProfile(activeVehicleProfile(), this.store), note = new Notification();
  note.title = 'FordPassWidgets · ' + appVehicleLabel(prefs); note.body = body;
  note.openURL = new WidgetRenderer(prefs, this.store.read()).url();
  try { await note.schedule(); } catch (_) { /* The foreground result remains available. */ }
  appAssertProfile(prefs, this.store); await message('FordPassWidgets', body); appAssertProfile(prefs, this.store);
};
AppController.prototype.profileMenu = async function(prefs) {
  appAssertProfile(prefs, this.store);
  const menu = new Alert(); menu.title = appVehicleLabel(prefs) + ' · ' + FORDWIDGET_VERSION;
  menu.message = 'Readings retain their measurement times. Vehicle requests always require confirmation.';
  const items = [['Fetch telemetry', () => this.action('fetch', prefs)]];
  if (vehicleCommandAllowed(prefs, 'refresh')) items.push(['Refresh vehicle data', () => this.action('refreshwidget', prefs)]);
  for (const [action, label] of [['lock','Lock'],['unlock','Unlock'],['start','Remote start'],['stop','Remote stop'],['refresh','Wake vehicle']])
    if (vehicleCommandAllowed(prefs, action)) items.push([label, () => this.action(action, prefs)]);
  items.push(['View details', () => this.details(prefs)], ['Customize widgets', () => this.customize(prefs)],
    ['Units & formats', () => this.unitsOptions(prefs)], ['Widget gallery', () => this.chooseDesign(prefs)],
    ['Tires & alerts', () => this.alertOptions(prefs)], ['Vehicle photo', () => this.truckPhoto(prefs)],
    ['Parked location', () => this.parked(prefs)], ['Troubleshooting', () => this.troubleshooting(prefs)]);
  if (appProPowerEnabled(prefs, this.store)) items.push(['Pro Power', () => this.action('propower', prefs)]);
  items.push(['Vehicle features', () => this.setupVehicle(prefs)], ['Copy widget parameter', () => this.copyVehicleParameter(prefs)],
    ['Make default vehicle', async () => { appAssertProfile(prefs, this.store); setDefaultVehicle(prefs.id, this.store); }],
    ['Vehicles', async () => ({select: await this.chooseVehicle()})],
    ['Reconnect FordPass', async () => ({select: await this.connectAccount() ? await this.chooseVehicle() : null, account: true})],
    ['Connect FordConnect', async () => { appAssertProfile(prefs, this.store); await this.auth.connectOfficial(); appAssertProfile(prefs, this.store); }],
    ['Sign out', async () => ({account: await this.signOut()})],
    ['Run self-test', async () => { selfTest(); await message('Self-test', 'Offline checks passed. No vehicle requests were sent.'); appAssertProfile(prefs, this.store); }]);
  items.forEach(([label]) => menu.addAction(label)); menu.addCancelAction('Close');
  const choice = await menu.presentSheet(); appAssertProfile(prefs, this.store);
  if (choice < 0) return null;
  return await items[choice][1]() || null;
};
AppController.prototype.run = async function() {
  const target = appSelectedVehicle();
  if (target.invalid) {
    if (config.runsInWidget) Script.setWidget(appUnavailableWidget('This widget vehicle is unavailable. Select an authorized vehicle in the app and copy its parameter.'));
    else { requireApp(); await message('Vehicle unavailable', 'This explicit vehicle selection is invalid or no longer authorized. No default vehicle was substituted.'); }
    return;
  }
  if (config.runsInWidget) {
    if (!target.id) { Script.setWidget(appUnavailableWidget('Connect FordPass and select a vehicle in the app.')); return; }
    const prefs = bindVehicleProfile(target.id), pinned = widgetOptions(prefs, target.parameter).vin;
    if (pinned && pinned !== prefs.vin) {
      Script.setWidget(appUnavailableWidget('The legacy VIN parameter does not match this widget vehicle. Copy the selected vehicle parameter in the app.')); return;
    }
    this.store = new LocalStore(); this.auth = new FordAuthManager(this.store);
    let cache = this.store.read();
    if (cache) cache = await this.nightlyCheck(prefs) || cache;
    if (!vehicleBindingCurrent(prefs, this.store)) { Script.setWidget(appUnavailableWidget('Reconnect and authorize this vehicle in the app.')); return; }
    Script.setWidget(new WidgetRenderer(prefs, cache, target.parameter).build(config.widgetFamily || 'medium')); return;
  }
  requireApp();
  if ((args.queryParameters || {}).action === 'selftest') { selfTest(); await message('Self-test', 'All offline checks passed. No vehicle requests were sent.'); return; }
  try {
    let id = target.id;
    if (!readVehicleRegistry().account.connected) {
      const a = new Alert(); a.title = 'Connect FordPass'; a.message = 'Sign in to Ford before choosing vehicles. Your account can provide several independently configured vehicle widgets.';
      a.addAction('Connect FordPass'); a.addCancelAction('Cancel'); if (await a.presentAlert() < 0) return;
      if (!await this.connectAccount()) return; id = await this.chooseVehicle();
    } else if (!id) id = await this.chooseVehicle();
    if (!id) return;
    for (;;) {
      let prefs = await this.attachVehicle(id);
      if (!parkedLocationEnabled(prefs)) this.store.purgeLocation();
      const action = (args.queryParameters || {}).action;
      if (action) { await this.action(action, prefs); return; }
      const result = await this.profileMenu(prefs);
      if (result && result.select) { id = result.select; continue; }
      if (!result || !result.account) {
        if (vehicleBindingCurrent(prefs, this.store)) Script.setWidget(new WidgetRenderer(activeVehicleProfile(), this.store.read()).build('large'));
      }
      return;
    }
  } finally { this.releaseContext(); }
};

// Defense at the transport boundary covers direct API use and consent changes
// while token refresh or another asynchronous operation was in progress.
function appTransportPermission(auth, name, url, method, body) {
  if (!['telemetry.proPower', 'commands.proPower', 'commands', 'commands.generalStatus'].includes(name)) return;
  const prefs = activeVehicleProfile(); appAssertProfile(prefs, auth.store);
  if (name === 'telemetry.proPower' || name === 'commands.proPower') {
    if (!appProPowerEnabled(prefs, auth.store)) throw new Error('Pro Power monitoring is not enabled for this vehicle.');
    return;
  }
  if (method !== 'POST') return;
  const action = Object.keys(COMMANDS).find(key => COMMANDS[key] === (body && body.type));
  const startLock = action === 'lock' && auth._appStartIntent === prefs.id && vehicleCommandAllowed(prefs, 'start');
  if (!action || !startLock && !vehicleCommandAllowed(prefs, action)) throw new Error('This vehicle control is not enabled.');
}
const APP_AUTH_REQUEST = FordAuthManager.prototype.request;
FordAuthManager.prototype.request = async function(name, url, method = 'GET', body = null, ...rest) {
  appTransportPermission(this, name, url, method, body);
  const result = await APP_AUTH_REQUEST.call(this, name, url, method, body, ...rest);
  appTransportPermission(this, name, url, method, body); return result;
};
const APP_SEND_COMMAND = FordAPIClient.prototype.sendCommand;
FordAPIClient.prototype.sendCommand = async function(vin, action) {
  const prefs = appAssertProfile(this.prefs, this.store);
  if (vin !== prefs.vin || !vehicleCommandAllowed(prefs, action)) throw new Error('This vehicle control is not enabled.');
  const previous = this.auth._appStartIntent;
  if (action === 'start') this.auth._appStartIntent = prefs.id;
  try { const result = await APP_SEND_COMMAND.call(this, vin, action); appAssertProfile(prefs, this.store); return result; }
  finally { this.auth._appStartIntent = previous; }
};
const APP_POST_COMMAND = FordAPIClient.prototype.postCommand;
FordAPIClient.prototype.postCommand = async function(vin, action, token) {
  const prefs = appAssertProfile(this.prefs, this.store);
  const startLock = action === 'lock' && this.auth._appStartIntent === prefs.id && vehicleCommandAllowed(prefs, 'start');
  if (vin !== prefs.vin || !startLock && !vehicleCommandAllowed(prefs, action)) throw new Error('This vehicle control is not enabled.');
  return APP_POST_COMMAND.call(this, vin, action, token);
};
for (const name of ['proPowerSnapshot', 'requestProPowerStatus']) {
  const original = FordAPIClient.prototype[name];
  FordAPIClient.prototype[name] = async function(...args) {
    if (!appProPowerEnabled(this.prefs, this.store)) throw new Error('Pro Power monitoring is not enabled for this vehicle.');
    const result = await original.apply(this, args);
    if (!appProPowerEnabled(this.prefs, this.store)) throw new Error('Pro Power monitoring was disabled.'); return result;
  };
}
const APP_GENERAL_STATUS = FordAPIClient.prototype.requestGeneralStatus;
FordAPIClient.prototype.requestGeneralStatus = async function(...args) {
  const prefs = appAssertProfile(this.prefs, this.store);
  if (!vehicleCommandAllowed(prefs, 'refresh')) throw new Error('Vehicle refresh is not enabled.');
  return APP_GENERAL_STATUS.apply(this, args);
};
const APP_ACTION = AppController.prototype.action;
AppController.prototype.action = async function(action, prefs, ...rest) {
  const current = appAssertProfile(prefs, this.store);
  if (['propower', 'ppofetch', 'ppostatus'].includes(action) && !appProPowerEnabled(current, this.store)) throw new Error('Pro Power monitoring is not enabled for this vehicle.');
  if ((Object.prototype.hasOwnProperty.call(COMMANDS, action) || action === 'refreshwidget') && !vehicleCommandAllowed(current, action))
    throw new Error('This vehicle control is not enabled.');
  const result = await APP_ACTION.call(this, action, current, ...rest); appAssertProfile(current, this.store); return result;
};


function selfTest() {
  ppoSelfCheck();
  const assert = (condition, label) => { if (!condition) throw new Error('Self-test failed: ' + label); };
  assert(challenge('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk') === 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM', 'RFC 7636 PKCE');
  assert(finite(null) === null && finite('') === null && finite(false) === null, 'missing values');
  assert(vinOK('1FTFW1E50JFA00001') && !vinOK('1FTFW1E50JFA0000I'), 'VIN validation');
  const vin = '1FTFW1E50JFA00001', time = '2025-01-02T00:00:00Z';
  const raw = { vin, metrics: {
    fuelLevel: { value: 0, updateTime: time }, fuelRange: { value: 100, updateTime: time },
    oilLifeRemaining: { value: 0, updateTime: time }, xevBatteryStateOfCharge: { value: 90 },
    tirePressure: [{ value: 241.3165, vehicleWheel: 'FRONT_LEFT', updateTime: time }],
    doorLockStatus: [{ value: 'UNKNOWN', vehicleDoor: 'ALL_DOORS' }], doorStatus: [{ value: 'UNKNOWN' }],
  } };
  const f = normalize(raw, vin, 'FordConnect', now());
  assert(f.fuel.value === 0 && f.oil.value === 0, 'zero fuel/oil');
  assert(Math.abs(f.fl.value - 35) < 0.01 && Math.abs(f.range.value - 62.137) < 0.01, 'units');
  assert(!f.battery && f.lock.value === 'Unknown' && f.doors.value === 'Unknown', 'unknown is not healthy/locked/closed');
  assert(f.fuel.at === Date.parse(time), 'measurement age');
  assert(!normalize({ metrics: { fuelLevel: { value: 10 } } }, vin, 'FordPass', now()).fuel.at, 'unknown timestamp');
  const old = { fuel: { value: 50, at: now(), source: 'FordPass' } };
  assert(mergeFields(old, f, {}).fuel.value === 50, 'stale server sample cannot overwrite newer cache');
  let rejected = false; try { normalize(raw, '1FTFW1E50JFA00002', 'FordConnect', now()); } catch (_) { rejected = true; }
  assert(rejected, 'cross-vehicle rejection');
  assert(query('https://example.test/cb?code=a%2Bb&state=x').code === 'a+b', 'OAuth URL decoding');
  assert(!callbackMatches('https://example.test/cb-evil?code=x', 'https://example.test/cb'), 'callback boundary');
  rejected = false; try { query('https://example.test/?state=a&state=b'); } catch (_) { rejected = true; }
  assert(rejected, 'duplicate OAuth state');
  const t0 = Date.parse('2025-01-02T00:00:00Z');
  const extra = normalize({ vin, metrics: { outsideTemperature: { value: -2, updateTime: time },
    position: { value: { location: { lat: 42.31, lon: -83.21 } }, updateTime: time },
    remoteStartCountdownTimer: { value: 600, updateTime: time }, ignitionStatus: { value: 'on' } } }, vin, 'FordPass', now());
  assert(extra.outsideTemp.value === -2 && fahrenheit(-2) === 28, 'outside temperature');
  assert(extra.position.value.lat === 42.31 && extra.position.value.lon === -83.21, 'parked position');
  assert(extra.remoteStart.value.until === t0 + 600000 && extra.ignition.value === 'ON', 'remote start timer');
  assert(Math.abs(meters({ lat: 42.31, lon: -83.21 }, { lat: 42.311, lon: -83.21 }) - 111) < 2, 'distance');
  const probs = nightProblems({ lock: { value: 'Unlocked' }, rr: { value: 26 }, fl: { value: 35 }, fr: { value: 35 }, rl: { value: 35 }, fuel: { value: 9 } }, { tireConfiguration: { configured: true, layout: 'four', frontPsi: 30, rearPsi: 30 }, alerts: { enabled: { tires: true } } });
  assert(probs.length === 3 && probs[0] === 'Unlocked' && probs.some(text => /RR 26 psi/.test(text)), 'evening problems');
  assert(nightProblems({ lock: { value: 'Locked' }, fl: { value: 35 } }, {}).length === 0, 'evening all good');
  assert(nightProblems({ fuel: { value: 20 } }, { alerts: { fuel: 25 } }).length === 1, 'custom fuel threshold');
  assert(nightProblems({ fuel: { value: 5 } }, { alerts: { enabled: { fuel: false } } }).length === 0, 'disabled fuel alert');
  assert(!alertSettings({}).attention && alertSettings({ alerts: { attention: true } }).attention, 'attention opt in');
  assert(widgetOptions({}, 'lock').view === 'lock' && widgetOptions({}, 'parked').view === 'parked', 'lock screen views');
  const rr = new WidgetRenderer({}, { fields: { remoteStart: { value: { until: now() + 60000 }, at: now() - 1000 } }, startRun: { at: now() - 500, until: 0 } });
  assert(MODEL_ORIGINAL_REMOTE.call(rr) && MODEL_ORIGINAL_REMOTE.call(rr).until > now(), 'unconfirmed stop does not hide running telemetry');
  assert(rr.remote() === null, 'unknown-profile engine countdown is hidden');
  const stopped = new WidgetRenderer({}, { fields: { remoteStart: { value: { until: 0 }, at: now() } }, startRun: { at: now() - 500, until: now() + 60000, estimated: true } });
  assert(MODEL_ORIGINAL_REMOTE.call(stopped) === null, 'newer stopped telemetry ends the start estimate');
  let o = widgetOptions({ widget: { medium: 'controls', unit: 'bar', show: { photo: false } } }, '');
  assert(o.layout.medium === 'controls' && o.unit === 'bar' && !o.show.photo && o.show.tires, 'saved widget options');
  o = widgetOptions({}, 'fuel, tires lock psi');
  assert(o.show.fuel && o.show.tires && o.show.lock && !o.show.oil && !o.show.photo && o.unit === 'psi', 'parameter: show only');
  assert(widgetOptions({ widget: { design: { small: 'showcase' } } }, '').design.small === 'showcase', 'saved design');
  assert(widgetOptions({}, 'dashboard').design.large === 'dashboard', 'design parameter override');
  o = widgetOptions({}, 'buttons -photo no-oil 1FTFW1E50JFA00001');
  assert(o.layout.medium === 'controls' && !o.show.photo && !o.show.oil && o.show.fuel && o.vin === '1FTFW1E50JFA00001', 'parameter: hide, layout, VIN');
  assert(authDetail('{"error":"invalid_grant","error_description":"AADB2C90080: The provided grant has expired."}') === ' invalid_grant: AADB2C90080: The provided grant has expired.', 'login error detail');
  assert(!authDetail('{"error":"x","error_description":"' + 'a'.repeat(60) + '"}').includes('aaaaaaaaaa'), 'no token-like text in errors');
  assert(extractRedirect(`Failed to launch 'fordapp://userauthorized/?code=ab.c-1&state=s1' because the scheme does not have a registered handler.`) === 'fordapp://userauthorized/?code=ab.c-1&state=s1', 'pasted console line');
  assert(callbackMatches('fordapp://userauthorized/?code=x', 'fordapp://userauthorized'), 'redirect with trailing slash');
  assert(findVehicleImageUrl([{ vin: '1FTFW1E50JFA00002' }, { vin, profile: { vehicleImage: 'https://img.ford.com/v.png' } }], vin) === 'https://img.ford.com/v.png', 'garage photo link');
  assert(findVehicleImageUrl([{ vin, profile: { vehicleImage: 'http://img.ford.com/v.png' } }], vin) === null, 'photo link must be HTTPS');
  assert(isFordHost('https://img.ford.com/x') && !isFordHost('https://ford.com.evil.io/x') && !isFordHost('https://evilford.com/') &&
    !isFordHost('https://img.ford.com:x@evil.io/') && !isFordHost('https://img.ford.com@evil.io/'), 'token host boundary');
  assert(findImageRef({ data: { imageUrl: 'https://a.ford.com/i.png' } }).url === 'https://a.ford.com/i.png', 'image link in JSON');
}

// __FORDWIDGET_ENTRY__
try { await new AppController().run(); }
catch (e) {
  if (config.runsInWidget) {
    const w = new ListWidget(); w.addText('FordWidget'); w.addText('Open Scriptable to repair setup/cache.'); Script.setWidget(w);
  } else await message('FordWidget', e.message || 'Unable to complete this run.');
}
Script.complete();
