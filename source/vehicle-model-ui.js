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
