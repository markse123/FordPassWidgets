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

function ppoDetailsText(snapshot, request = null) {
  const view = ppoView(snapshot), e = ppoEstimated(snapshot);
  const lines = [
    'Estimated A: ' + ppoPowerText(e.a), 'Estimated B: ' + ppoPowerText(e.b),
    'Estimated total: ' + ppoPowerText(e.total), e.capacityScope + ': ' + ppoPowerText(e.capacity),
    'A+B subtotal: ' + ppoPowerText(e.abTotal),
    'Secondary usage: ' + ppoPowerText(e.secondary),
    'Command result: ' + (ppoUIAt(view.commandAt) ? new Date(view.commandAt).toLocaleString() : 'time unknown') + ' · ' + ppoCommandAge(view),
    ppoRequestLine(request), ppoModeLine(view), 'Embedded sample time is unverified.',
    ppoStaleText(view),
    'Experimental estimates assume 1 raw unit = 1 W. Corroborated only on a 7.2 kW truck; other ratings and sentinel codes need validation.'
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
  const alert = new Alert(); alert.title = 'Request Pro Power status once?';
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
    requireApp();
    const cache = this.store.read(), snapshot = ppoSnapshotFor(cache, prefs);
    const request = cache && cache.vin === prefs.vin ? cache.proPowerRequest : null;
    const menu = new Alert(); menu.title = 'Pro Power · last reported'; menu.message = ppoDetailsText(snapshot, request);
    ['Read cached Pro Power', 'Request status once…'].forEach(label => menu.addAction(label));
    menu.addCancelAction('Close');
    const choice = await menu.presentSheet();
    requireApp();
    if (choice < 0) return;
    if (choice === 0) {
      try { const result = await new FordAPIClient(this.auth, this.store, prefs).readProPower(true); await message('Pro Power cloud cache', result.note); }
      catch (error) { await message('Pro Power', ppoUIError(error)); }
    } else if (choice === 1) await this.confirmProPowerStatus(prefs);
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
