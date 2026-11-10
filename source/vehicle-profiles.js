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
