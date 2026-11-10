'use strict';
const assert = require('node:assert/strict');
const {test} = require('node:test');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const publishedSource = fs.readFileSync(path.join(root, 'docs/installer.js'), 'utf8');
const widget = fs.readFileSync(path.join(root, 'FordPassWidgets.js'), 'utf8');
const boundary = publishedSource.indexOf('// Installer entry.');
assert.ok(boundary > 0);
const widgetVersion = widget.match(/^FordPassWidgets ([^\r\n]*)\r?$/m)[1];
// Installer behavior uses an explicit synthetic reviewed-release pin. A separate
// publication assertion below verifies the actual checked-in release constants.
const source = publishedSource
  .replace(/^const INSTALL_VERSION = '[^']+';$/m, "const INSTALL_VERSION = '" + widgetVersion + "';")
  .replace(/^const INSTALL_SOURCE = '[^']+';$/m, "const INSTALL_SOURCE = 'https://raw.githubusercontent.com/markse123/FordPassWidgets/" + 'a'.repeat(40) + "/FordPassWidgets.js';")
  .replace(/^const INSTALL_SHA256 = '[^']+';$/m, "const INSTALL_SHA256 = '" + crypto.createHash('sha256').update(widget).digest('hex') + "';");
const withVersion = value => widget.replace(/^FordPassWidgets [^\r\n]*\r?$/m, 'FordPassWidgets ' + value)
  .replace(/^const FORDWIDGET_VERSION = '[^'\r\n]*';\r?$/m, "const FORDWIDGET_VERSION = '" + value + "';");
const oldWidget = withVersion('0.0.1');
const versionParts = widgetVersion.split('.');
const nextPatchVersion = versionParts.slice(0, 2).concat(String(BigInt(versionParts[2]) + 1n)).join('.');
const nextMinorVersion = [versionParts[0], String(BigInt(versionParts[1]) + 1n), '0'].join('.');
const nextMajorVersion = [String(BigInt(versionParts[0]) + 1n), '0', '0'].join('.');
function load(options = {}) {
  const state = {files: new Map(options.files || []), choices: [...(options.choices || [])], alerts: [], requests: [], ops: [], downloads: [], complete: 0};
  const data = text => ({getBytes: () => Array.from(Buffer.from(text, 'utf8')), toRawString: () => text});
  const fail = (op, ...args) => {state.ops.push([op, ...args]); if (options.fail) options.fail(op, args, state);};
  function fm(area) {
    return {
      documentsDirectory: () => '/' + area,
      joinPath: (a, b) => a + '/' + b,
      fileExists: p => state.files.has(p),
      downloadFileFromiCloud: async p => {fail('download', p); state.downloads.push(p);},
      readString: p => {fail('read', p); assert.ok(state.files.has(p), 'Missing mock file: ' + p); return state.files.get(p);},
      writeString: (p, value) => {fail('write', p); state.files.set(p, value);},
      move: (from, to) => {fail('move', from, to); assert.ok(state.files.has(from)); state.files.set(to, state.files.get(from)); state.files.delete(from);},
      copy: (from, to) => {fail('copy', from, to); assert.ok(state.files.has(from)); assert.ok(!state.files.has(to)); state.files.set(to, state.files.get(from));},
      remove: p => {fail('remove', p); state.files.delete(p);}
    };
  }
  class Alert {
    constructor() {this.actions = []; this.fields = [];}
    addAction(text) {this.actions.push(text);}
    addDestructiveAction(text) {this.actions.push(text);}
    addCancelAction(text) {this.cancel = text;}
    addTextField(label, value) {this.fields.push(value);}
    textFieldValue(i) {return this.fields[i];}
    async presentAlert() {
      state.alerts.push({title: this.title, message: this.message, actions: this.actions, cancel: this.cancel});
      const answer = state.choices.length ? state.choices.shift() : -1;
      if (typeof answer === 'object') {this.fields[0] = answer.name; return answer.choice === undefined ? 0 : answer.choice;}
      return answer;
    }
  }
  class Request {
    constructor(url) {this.url = url;}
    async load() {
      state.requests.push({url: this.url, timeout: this.timeoutInterval});
      if (options.transportError) throw new Error('Synthetic unavailable network');
      if (options.onRequest) options.onRequest(state);
      this.response = {statusCode: options.status || 200};
      return data(options.download === undefined ? widget : options.download);
    }
  }
  const forbidden = new Proxy({}, {get() {throw new Error('Installer touched forbidden state');}});
  const sandbox = {Alert, Request, FileManager: {iCloud: () => fm('cloud'), local: () => fm('local')},
    UUID: {string: () => 'synthetic-unique'}, config: {runsInApp: options.inApp !== false, runsInWidget: options.inApp === false},
    Keychain: forbidden, Safari: forbidden, WebView: forbidden, Script: {complete: () => state.complete++}};
  const context = vm.createContext(sandbox);
  const code = options.source === undefined ? source : options.source;
  new vm.Script(code.slice(0, code.indexOf('// Installer entry.')) + '\nglobalThis.testAPI={installFordWidget,installerSHA256,installerFork,installerVersion,installerCompareVersions,INSTALL_VERSION,INSTALL_SOURCE,INSTALL_SHA256};').runInContext(context);
  return {state, api: context.testAPI, context};
}
const file = name => '/cloud/' + name + '.js';
const name = 'FordPassWidgets';
const run = h => h.api.installFordWidget();

test('published installer pins the exact current application version, bytes and immutable canonical source', () => {
  assert.equal(publishedSource.match(/^const INSTALL_VERSION = '([^']+)';$/m)[1], widgetVersion);
  assert.equal(publishedSource.match(/^const INSTALL_SHA256 = '([^']+)';$/m)[1], crypto.createHash('sha256').update(widget).digest('hex'));
  const url = publishedSource.match(/^const INSTALL_SOURCE = '([^']+)';$/m)[1];
  assert.match(url, /^https:\/\/raw\.githubusercontent\.com\/markse123\/FordPassWidgets\/[a-f0-9]{40}\/FordPassWidgets\.js$/);
  assert.ok(!url.includes('/' + '0'.repeat(40) + '/'), 'A bootstrap placeholder cannot be published as a reviewed release');
});

test('SHA-256 agrees with standard known vectors, multiblock and UTF-8 source bytes', () => {
  const h = load();
  for (const text of ['', 'abc', 'a'.repeat(1000), 'Power ⚡ / café / 你好', widget])
    assert.equal(h.api.installerSHA256(Buffer.from(text, 'utf8')), crypto.createHash('sha256').update(text).digest('hex'));
  assert.equal(crypto.createHash('sha256').update(widget).digest('hex'), h.api.INSTALL_SHA256);
  assert.match(h.api.INSTALL_SOURCE, /^https:\/\/raw\.githubusercontent\.com\/markse123\/FordPassWidgets\/[a-f0-9]{40}\/FordPassWidgets\.js$/);
});

test('new iCloud installation verifies pinned bytes and saves only the chosen widget script without executing it', async () => {
  const h = load({choices: [0, 0, {name}, 0]}); await run(h);
  assert.equal(h.state.files.get(file(name)), widget);
  assert.deepEqual([...h.state.files.keys()], [file(name)]);
  assert.deepEqual(h.state.requests, [{url: h.api.INSTALL_SOURCE, timeout: 25}]);
  assert.match(h.state.alerts.at(-1).message, /run it to finish setup/);
});

test('local installation writes the selected local folder', async () => {
  const h = load({choices: [1, 0, {name: 'My Power Widget'}, 0]}); await run(h);
  assert.equal(h.state.files.get('/local/My Power Widget.js'), widget);
  assert.equal([...h.state.files.keys()].length, 1);
});

test('updating custom application names retains the name and an exact non-script backup', async () => {
  for (const scriptName of ['My vehicle widget', 'FordPassWidgets', 'Daily driver']) {
    const target = file(scriptName), unrelated = file('Unrelated script');
    const h = load({files: [[target, oldWidget], [unrelated, 'unrelated private code']], choices: [0, 1, {name: scriptName}, 0, 0]});
    await run(h);
    assert.equal(h.state.files.get(target), widget); assert.equal(h.state.files.get(target + '.backup-synthetic-unique'), oldWidget);
    assert.equal(h.state.files.get(unrelated), 'unrelated private code');
    assert.ok(h.state.downloads.includes(target)); assert.equal(h.state.requests.length, 1);
    assert.equal([...h.state.files.keys()].filter(key => key.endsWith('.js')).length, 2);
  }
});

test('cancellation at storage, mode, name and overwrite sends no request or file mutation', async () => {
  for (const choices of [[-1], [0, -1], [0, 1, -1], [0, 1, {name}, -1]]) {
    const h = load({files: [[file(name), oldWidget]], choices}); await run(h);
    assert.equal(h.state.requests.length, 0); assert.equal(h.state.files.get(file(name)), oldWidget);
    assert.equal(h.state.ops.filter(([op]) => ['write', 'move', 'copy', 'remove'].includes(op)).length, 0);
  }
});

test('the original widget and another script are refused even after selecting update', async () => {
  for (const [scriptName, content] of [['FordWidget', 'class AppController {} // original'], ['FordWidget Pro Power', fs.readFileSync(path.join(root, 'source/fordwidget-base.js'), 'utf8')], [name, 'unrelated program'], ['Install FordPassWidgets', source]]) {
    const h = load({files: [[file(scriptName), content]], choices: [0, 1, {name: scriptName}]});
    await assert.rejects(run(h), /another script/); assert.equal(h.state.requests.length, 0);
    assert.deepEqual([...h.state.files], [[file(scriptName), content]]);
  }
});

test('missing update target, invalid names and iCloud download failure leave existing scripts untouched', async () => {
  for (const scriptName of ['', '..', '../truck', 'folder/truck', 'folder\\truck', 'a\nname']) {
    const h = load({choices: [0, 1, {name: scriptName}]});
    await assert.rejects(run(h), /script name/); assert.equal(h.state.requests.length, 0);
  }
  const h = load({choices: [0, 1, {name: 'Not installed'}]});
  await assert.rejects(run(h), /not found/); assert.equal(h.state.requests.length, 0);
  const cloud = load({files: [[file(name), oldWidget]], choices: [0, 1, {name}], fail(op) {if (op === 'download') throw new Error('Synthetic iCloud unavailable');}});
  await assert.rejects(run(cloud)); assert.equal(cloud.state.files.get(file(name)), oldWidget); assert.equal(cloud.state.requests.length, 0);
});

test('HTTP failure, altered bytes and transport failure preserve original code and create no backup', async () => {
  for (const extra of [{status: 500}, {download: widget + '\n'}, {download: '<html>Error</html>'}, {transportError: true}]) {
    const h = load({files: [[file(name), oldWidget]], choices: [0, 1, {name}, 0], ...extra});
    await assert.rejects(run(h)); assert.deepEqual([...h.state.files], [[file(name), oldWidget]]);
    assert.equal(h.state.requests.length, 1);
  }
});

test('intervening edits, a moved target or a new name collision during download are not overwritten', async () => {
  for (const mode of ['edit', 'move', 'new']) {
    const update = mode !== 'new';
    const h = load({files: update ? [[file(name), oldWidget]] : [], choices: [0, update ? 1 : 0, {name}, 0],
      onRequest(state) {if (mode === 'move') state.files.delete(file(name)); else state.files.set(file(name), 'concurrent user edit');}});
    await assert.rejects(run(h), /changed|moved/);
    assert.equal(h.state.files.get(file(name)), mode === 'move' ? undefined : 'concurrent user edit');
    assert.equal([...h.state.files.keys()].some(key => /backup|install-/.test(key)), false);
  }
});

test('failed staged save or backup leaves the original script and cleans staging files', async () => {
  for (const point of ['write', 'backup']) {
    const h = load({files: [[file(name), oldWidget]], choices: [0, 1, {name}, 0], fail(op, args) {
      if (point === 'write' && op === 'write' || point === 'backup' && op === 'copy' && args[1].includes('.backup-')) throw new Error('Synthetic storage failure');
    }});
    await assert.rejects(run(h), /did not finish/); assert.equal(h.state.files.get(file(name)), oldWidget);
    assert.equal([...h.state.files.keys()].some(key => key.endsWith('.tmp')), false);
  }
});

test('failed replacement restores previous code and keeps the recovery backup', async () => {
  const h = load({files: [[file(name), oldWidget]], choices: [0, 1, {name}, 0], fail(op, args) {
    if (op === 'copy' && args[0].includes('.install-')) throw new Error('Synthetic install failure');
  }});
  await assert.rejects(run(h), /previous script was restored/);
  assert.equal(h.state.files.get(file(name)), oldWidget); assert.equal(h.state.files.get(file(name) + '.backup-synthetic-unique'), oldWidget);
  assert.equal([...h.state.files.keys()].some(key => key.endsWith('.tmp')), false);
});

test('failed rollback retains recoverable old code and identifies the exact backup filename', async () => {
  const h = load({files: [[file(name), oldWidget]], choices: [0, 1, {name}, 0], fail(op, args) {
    if (op === 'copy' && (args[0].includes('.install-') || (args[0].includes('.backup-') || args[0].includes('.displaced-')))) throw new Error('Synthetic filesystem unavailable');
  }});
  await assert.rejects(run(h), /FordPassWidgets\.js\.backup-synthetic-unique/);
  assert.equal(h.state.files.get(file(name) + '.backup-synthetic-unique'), oldWidget);
});

test('widget execution is refused before file access or transport', async () => {
  const h = load({inApp: false, choices: [0]}); await run(h);
  assert.equal(h.state.requests.length, 0); assert.equal(h.state.ops.length, 0);
  assert.equal(h.state.alerts[0].title, 'Open Scriptable');
});

test('an unverifiable installed file is preserved and an update retains the recovery backup', async () => {
  for (const update of [false, true]) {
    const h = load({files: update ? [[file(name), oldWidget]] : [], choices: [0, update ? 1 : 0, {name}, 0], fail(op, args, state) {
      if (op === 'read' && args[0] === file(name) && state.files.get(file(name)) === widget) state.files.set(file(name), 'Synthetic truncated save');
    }});
    await assert.rejects(run(h), /did not finish/);
    assert.equal(h.state.files.get(file(name)), 'Synthetic truncated save');
    if (update) assert.equal(h.state.files.get(file(name) + '.backup-synthetic-unique'), oldWidget);
  }
});

test('the top-level installer hides untrusted transport errors and completes without executing downloaded code', async () => {
  const h = load({choices: [0, 0, {name}], transportError: true});
  await new vm.Script('(async () => {' + source.slice(boundary) + '\n})()').runInContext(h.context);
  assert.equal(h.state.complete, 1); assert.equal(h.state.files.size, 0);
  assert.equal(h.state.alerts.at(-1).title, 'Installation could not finish');
  assert.doesNotMatch(h.state.alerts.at(-1).message, /Synthetic unavailable/);
});

test('a pinned installer refuses to downgrade a newer installed application', async () => {
  for (const version of [nextPatchVersion, nextMinorVersion, nextMajorVersion, '9007199254740993.0.0']) {
    const newer = withVersion(version);
    const h = load({files: [[file(name), newer]], choices: [0, 1, {name}]});
    await assert.rejects(run(h), /newer than this installer/);
    assert.equal(h.state.requests.length, 0); assert.deepEqual([...h.state.files], [[file(name), newer]]);
  }
});

test('late name collisions during staging or final copy never overwrite or delete a foreign script', async () => {
  const foreign = 'class AppController {} // another script created after the check';
  for (const update of [false, true]) for (const phase of ['staging', 'final-copy']) {
    const h = load({files: update ? [[file(name), oldWidget]] : [], choices: [0, update ? 1 : 0, {name}, 0], fail(op, args, state) {
      if (phase === 'staging' && op === 'write' && args[0].includes('.install-') ||
          phase === 'final-copy' && op === 'copy' && args[0].includes('.install-')) state.files.set(file(name), foreign);
    }});
    await assert.rejects(run(h), update ? /previous code is saved as/ : /Any file now at that name was kept/);
    assert.equal(h.state.files.get(file(name)), foreign, update + '/' + phase);
    if (update) assert.equal(h.state.files.get(file(name) + '.backup-synthetic-unique'), oldWidget);
    assert.equal(h.state.ops.some(([op, p]) => op === 'move' && p.includes('.install-')), false);
    assert.equal([...h.state.files.keys()].some(key => key.endsWith('.tmp')), false);
  }
});

test('a foreign file appearing at rollback time is kept and the old backup remains recoverable', async () => {
  const foreign = 'another script appeared during recovery';
  const h = load({files: [[file(name), oldWidget]], choices: [0, 1, {name}, 0], fail(op, args, state) {
    if (op === 'copy' && args[0].includes('.install-')) throw new Error('Synthetic install failure');
    if (op === 'copy' && args[0].includes('.displaced-')) state.files.set(file(name), foreign);
  }});
  await assert.rejects(run(h), /Any file now at the widget name was kept/);
  assert.equal(h.state.files.get(file(name)), foreign);
  assert.equal(h.state.files.get(file(name) + '.backup-synthetic-unique'), oldWidget);
});

test('a backup must match the previously reviewed code before the target can be removed', async () => {
  const foreign = 'an edit happened immediately before the backup copy';
  const h = load({files: [[file(name), oldWidget]], choices: [0, 1, {name}, 0], fail(op, args, state) {
    if (op === 'copy' && args[0] === file(name)) state.files.set(file(name), foreign);
  }});
  await assert.rejects(run(h), /existing script was kept/);
  assert.equal(h.state.files.get(file(name)), foreign);
  assert.equal(h.state.ops.some(([op, p]) => op === 'remove' && p === file(name)), false);
  assert.equal(h.state.ops.some(([op, p]) => op === 'write' && p.includes('.install-')), false);
});

test('a revision appearing immediately before displacement is preserved and restored without installation', async () => {
  const latest = 'an iCloud edit arriving just before the original file moves';
  const h = load({files: [[file(name), oldWidget]], choices: [0, 1, {name}, 0], fail(op, args, state) {
    if (op === 'move' && args[0] === file(name)) state.files.set(file(name), latest);
  }});
  await assert.rejects(run(h), /previous code is saved as/);
  assert.equal(h.state.files.get(file(name)), latest);
  assert.equal(h.state.files.get(file(name) + '.backup-synthetic-unique'), oldWidget);
  assert.equal(h.state.files.get(file(name) + '.displaced-synthetic-unique'), latest);
  assert.equal(h.state.ops.some(([op, p]) => op === 'copy' && p.includes('.install-')), false);
  assert.equal(h.state.ops.some(([op, p]) => op === 'remove' && p === file(name)), false);
});

test('another revision appearing while restoring a displaced edit is kept alongside both recovery copies', async () => {
  const first = 'first concurrent revision', second = 'second concurrent revision';
  const h = load({files: [[file(name), oldWidget]], choices: [0, 1, {name}, 0], fail(op, args, state) {
    if (op === 'move' && args[0] === file(name)) state.files.set(file(name), first);
    if (op === 'copy' && args[0].includes('.displaced-')) state.files.set(file(name), second);
  }});
  await assert.rejects(run(h), /\.js\.displaced-synthetic-unique/);
  assert.equal(h.state.files.get(file(name)), second);
  assert.equal(h.state.files.get(file(name) + '.backup-synthetic-unique'), oldWidget);
  assert.equal(h.state.files.get(file(name) + '.displaced-synthetic-unique'), first);
  assert.equal(h.state.ops.some(([op, p]) => op === 'remove' && p === file(name)), false);
});

test('a revision arriving after install but before error cleanup is never unlinked', async () => {
  const latest = 'an iCloud edit arriving after the exclusive install copy';
  for (const update of [false, true]) {
    const h = load({files: update ? [[file(name), oldWidget]] : [], choices: [0, update ? 1 : 0, {name}, 0], fail(op, args, state) {
      if (op === 'read' && args[0] === file(name) && state.files.get(file(name)) === widget) state.files.set(file(name), latest);
    }});
    await assert.rejects(run(h), /Installation did not finish/);
    assert.equal(h.state.files.get(file(name)), latest);
    assert.equal(h.state.ops.some(([op, p]) => op === 'remove' && p === file(name)), false);
    if (update) {
      assert.equal(h.state.files.get(file(name) + '.backup-synthetic-unique'), oldWidget);
      assert.equal(h.state.files.get(file(name) + '.displaced-synthetic-unique'), oldWidget);
    }
  }
});

test('malformed, ambiguous or mismatched installed versions fail closed before requests or replacement', async () => {
  const malformed = ['', '0.1', '01.1.8', '0.1.8-beta', '0.1.8 trailing', 'Preview 0.1.0', '0.1.8.1', 'NaN.1.8', '0.1.8e10', '9'.repeat(65) + '.0.0'];
  const bad = malformed.map(withVersion).concat([
    withVersion(widgetVersion + '\nFordPassWidgets 0.0.1'),
    'const unrelated = true;\n' + widget,
    widget.replace(/^const FORDWIDGET_VERSION = '[^']+';$/m, "const FORDWIDGET_VERSION = '0.0.0';"),
    widget.replace(/^const FORDWIDGET_VERSION = '[^']+';$/m, "const FORDWIDGET_VERSION = '0.0.0';\nconst FORDWIDGET_VERSION = '0.1.0';")
  ]);
  for (const previous of bad) {
    const h = load({files: [[file(name), previous]], choices: [0, 1, {name}, 0]});
    await assert.rejects(run(h), /another script/);
    assert.equal(h.state.requests.length, 0); assert.deepEqual([...h.state.files], [[file(name), previous]]);
    assert.equal(h.state.alerts.some(a => a.title.startsWith('Replace ')), false);
  }
});

test('same-version reinstall and supported older versions retain names and exact recovery copies', async () => {
  for (const version of [widgetVersion, '0.0.0', '0.0.1']) {
    const previous = withVersion(version);
    const h = load({files: [[file(name), previous]], choices: [0, 1, {name}, 0, 0]}); await run(h);
    assert.equal(h.state.files.get(file(name)), widget);
    assert.equal(h.state.files.get(file(name) + '.backup-synthetic-unique'), previous);
  }
  const legacy = oldWidget.replace(/^const FORDWIDGET_VERSION = '[^']+';\n/m, '');
  const h = load({files: [[file(name), legacy]], choices: [0, 1, {name}, 0, 0]}); await run(h);
  assert.equal(h.state.files.get(file(name)), widget);
  assert.equal(load().api.installerVersion(widget.replace(/\n/g, '\r\n')), widgetVersion);
});

test('version comparison is exact for large components and rejects noncanonical metadata', () => {
  const h = load();
  assert.equal(h.api.installerCompareVersions('0.1.9007199254740993', '0.1.9007199254740992'), 1);
  assert.equal(h.api.installerCompareVersions('0.1.9007199254740992', '0.1.9007199254740993'), -1);
  assert.equal(h.api.installerCompareVersions('0.2.0', '0.1.999'), 1);
  assert.equal(h.api.installerCompareVersions('0.1.10', '0.1.9'), 1);
  assert.equal(h.api.installerCompareVersions('0.1.8', '0.1.8'), 0);
  assert.throws(() => h.api.installerCompareVersions('0.1.8-beta', '0.1.8'), /could not be verified/);
});

test('downloaded header must match the advertised version even when the bytes pass SHA-256', async () => {
  const digest = crypto.createHash('sha256').update(widget).digest('hex');
  const alteredInstaller = source.replace(/^const INSTALL_VERSION = '[^']+';$/m, "const INSTALL_VERSION = '" + nextPatchVersion + "';")
    .replace(/^const INSTALL_SHA256 = '[^']+';$/m, "const INSTALL_SHA256 = '" + digest + "';");
  const h = load({source: alteredInstaller, choices: [0, 0, {name}]});
  await assert.rejects(run(h), /version did not match/);
  assert.equal(h.state.requests.length, 1); assert.equal(h.state.files.size, 0);
});

test('malformed installer release metadata is refused before file access or transport', async () => {
  for (const [key, value] of [['INSTALL_VERSION', '0.1.8beta'], ['INSTALL_VERSION', '00.1.8'],
    ['INSTALL_SOURCE', 'https://raw.githubusercontent.com/rushilpunu/FordWidget/main/FordWidget.js'], ['INSTALL_SHA256', 'invalid']]) {
    const code = source.replace(new RegExp("^const " + key + " = '[^']+';$", 'm'), "const " + key + " = '" + value + "';");
    const h = load({source: code});
    await assert.rejects(run(h), /invalid release information/);
    assert.equal(h.state.requests.length, 0); assert.equal(h.state.ops.length, 0);
  }
});

test('download source requires the exact application filename and never falls back to another path', async () => {
  const commit = source.match(/^const INSTALL_SOURCE = 'https:\/\/raw\.githubusercontent\.com\/markse123\/FordPassWidgets\/([a-f0-9]{40})\//m)[1];
  for (const filename of ['FordWidget.js', 'FordWidget Pro Power.js', 'FordWidget+Pro+Power.js',
    'FordWidget%2520Pro%2520Power.js', 'FordWidget%20Pro Power.js', 'FordPassWidgets.mjs', 'FordPassWidgets.js?raw=1']) {
    const url = 'https://raw.githubusercontent.com/markse123/FordPassWidgets/' + commit + '/' + filename;
    const code = source.replace(/^const INSTALL_SOURCE = '[^']+';$/m, "const INSTALL_SOURCE = '" + url + "';");
    const h = load({source: code, files: [[file(name), oldWidget]], choices: [0, 1, {name}, 0]});
    await assert.rejects(run(h), /invalid release information/);
    assert.equal(h.state.requests.length, 0); assert.equal(h.state.ops.length, 0);
    assert.deepEqual([...h.state.files], [[file(name), oldWidget]]);
  }
});
