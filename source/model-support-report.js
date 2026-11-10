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
