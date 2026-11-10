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
