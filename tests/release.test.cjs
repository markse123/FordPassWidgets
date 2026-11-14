'use strict';
const assert = require('node:assert/strict');
const {test} = require('node:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const cp = require('node:child_process');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
const WIDGET_FILE = 'FordPassWidgets.js';
const WIDGET_URL_FILE = 'FordPassWidgets.js';
const releaseTool = fs.readFileSync(path.join(root, 'source/release.py'));
const installerTemplate = fs.readFileSync(path.join(root, 'docs/installer.js'), 'utf8');
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
function git(dir, ...args) {
  const r = cp.spawnSync('git', ['-c', 'core.hooksPath=/dev/null', '-c', 'commit.gpgsign=false', ...args], {cwd: dir, encoding: 'utf8'});
  assert.equal(r.status, 0, r.stderr); return r.stdout.trim();
}
function fixture(t, options = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fordwidget-release-'));
  t.after(() => fs.rmSync(dir, {recursive: true, force: true}));
  fs.mkdirSync(path.join(dir, 'source')); fs.mkdirSync(path.join(dir, 'docs'));
  fs.writeFileSync(path.join(dir, 'source/release.py'), releaseTool);
  const version = options.version || '0.1.9';
  const widget = '// Variables used by Scriptable.\n/*\nFordPassWidgets ' + (options.header || version) + '\nDerived example.\n*/\n' +
    "const FORDWIDGET_VERSION = '" + (options.runtime || version) + "';\nclass AppController {}\n// Synthetic widget, never executed.\n";
  const manifest = {version, outputSHA256: hash(widget), upstream: 'https://github.com/rushilpunu/FordWidget', ...options.manifest};
  fs.writeFileSync(path.join(dir, WIDGET_FILE), widget);
  fs.writeFileSync(path.join(dir, 'source/version.json'), options.versionRaw || JSON.stringify({version}) + '\n');
  fs.writeFileSync(path.join(dir, 'source/build-manifest.json'), JSON.stringify(manifest) + '\n');
  const installer = installerTemplate
    .replace(/^const INSTALL_VERSION = '[^']+';$/m, "const INSTALL_VERSION = '" + (options.installerVersion || '0.1.8') + "';")
    .replace(/^const INSTALL_SOURCE = '[^']+';$/m, "const INSTALL_SOURCE = 'https://raw.githubusercontent.com/markse123/FordPassWidgets/" + 'a'.repeat(40) + '/' + (options.installerFilename || WIDGET_URL_FILE) + "';")
    .replace(/^const INSTALL_SHA256 = '[^']+';$/m, "const INSTALL_SHA256 = '" + (options.installerHash || 'b'.repeat(64)) + "';");
  const installerPath = path.join(dir, 'docs/installer.js');
  fs.writeFileSync(installerPath, installer); fs.chmodSync(installerPath, 0o644);
  fs.writeFileSync(path.join(dir, 'docs/index.html'), '<p>Installing widget version <strong>0.1.8</strong>. <a href="https://github.com/markse123/FordPassWidgets/blob/' + 'a'.repeat(40) + '/' + WIDGET_URL_FILE + '">Review source</a></p>\n');
  git(dir, 'init', '-q', '--initial-branch=main');
  git(dir, 'config', 'user.name', 'Release Fixture'); git(dir, 'config', 'user.email', 'release@example.test');
  git(dir, 'remote', 'add', 'origin', 'https://github.com/markse123/FordPassWidgets.git');
  git(dir, 'add', '.'); git(dir, 'commit', '-qm', 'Synthetic reviewed release');
  return {dir, installerPath, installer, widget, version, sha: git(dir, 'rev-parse', 'HEAD')};
}
function run(f, sha = f.sha) {
  return cp.spawnSync('python3', ['source/release.py', '--commit', sha], {cwd: f.dir, encoding: 'utf8'});
}
function refuses(f, sha = f.sha, pattern = /Release preparation failed/) {
  const before = fs.readFileSync(f.installerPath);
  const r = run(f, sha); assert.equal(r.status, 1, r.stdout + r.stderr); assert.match(r.stderr, pattern);
  assert.deepEqual(fs.readFileSync(f.installerPath), before, 'Rejected release must not change installer');
}
const stripped = text => text.replace(/^const INSTALL_(VERSION|SOURCE|SHA256) = '[^']+';$/gm, 'const INSTALL_$1 = <release pin>;');

test('release pin verifies exact committed widget and metadata then updates only three constants deterministically', t => {
  const f = fixture(t), otherPaths = [WIDGET_FILE, 'source/version.json', 'source/build-manifest.json', 'source/release.py'];
  const others = otherPaths.map(p => fs.readFileSync(path.join(f.dir, p)));
  const r = run(f); assert.equal(r.status, 0, r.stderr);
  const after = fs.readFileSync(f.installerPath, 'utf8');
  assert.equal(stripped(after), stripped(f.installer));
  assert.match(after, /const INSTALL_VERSION = '0\.1\.9';/);
  assert.ok(after.includes('/' + f.sha + '/' + WIDGET_URL_FILE));
  assert.ok(after.includes("const INSTALL_SHA256 = '" + hash(f.widget) + "';"));
  assert.equal(fs.statSync(f.installerPath).mode & 0o777, 0o644);
  for (const [i, p] of otherPaths.entries()) assert.deepEqual(fs.readFileSync(path.join(f.dir, p)), others[i], p);
  assert.equal(run(f).status, 0); assert.equal(fs.readFileSync(f.installerPath, 'utf8'), after);
  assert.deepEqual(fs.readdirSync(path.dirname(f.installerPath)).sort(), ['index.html', 'installer.js']);
});

test('release pin rejects short, malformed, missing and non-commit object IDs without mutation', t => {
  const f = fixture(t);
  for (const sha of ['main', f.sha.slice(0, 12), f.sha.toUpperCase(), 'f'.repeat(40), 'a'.repeat(64), f.sha + '\n', git(f.dir, 'hash-object', WIDGET_FILE)])
    refuses(f, sha);
});

test('release pin requires current source, version authority and manifest bytes to exist in the selected commit', t => {
  for (const kind of ['widget', 'version-format', 'manifest-format']) {
    const f = fixture(t);
    if (kind === 'widget') {
      const next = f.widget + '// Edited after review.\n'; fs.writeFileSync(path.join(f.dir, WIDGET_FILE), next);
      const p = path.join(f.dir, 'source/build-manifest.json'), m = JSON.parse(fs.readFileSync(p));
      m.outputSHA256 = hash(next); fs.writeFileSync(p, JSON.stringify(m) + '\n');
    } else fs.appendFileSync(path.join(f.dir, kind === 'version-format' ? 'source/version.json' : 'source/build-manifest.json'), '\n');
    refuses(f, f.sha, /does not contain the current reviewed/);
  }
});

test('release pin rejects malformed or disagreeing authority, header, runtime and digest metadata', t => {
  for (const options of [
    {header: '0.1.8'}, {runtime: '0.1.8'}, {header: '0.1.9-beta'},
    {header: '0.1.9\nFordPassWidgets 0.1.8'},
    {manifest: {version: '0.1.8'}}, {manifest: {outputSHA256: 'c'.repeat(64)}},
    {versionRaw: '{"version":"01.1.9"}'}, {versionRaw: '{"version":"0.1.9-beta"}'},
    {versionRaw: '{"version":"0.1.9","version":"0.1.8"}'},
    {versionRaw: '{"version":"0.1.9","unexpected":true}'}, {versionRaw: '[]'}
  ]) refuses(fixture(t, options));
});

test('release pin refuses downgrade and changed bytes under an already pinned version', t => {
  refuses(fixture(t, {version: '0.1.8', installerVersion: '0.1.9'}), undefined, /downgrade/);
  refuses(fixture(t, {installerVersion: '0.1.9'}), undefined, /same release version/);
  const f = fixture(t); assert.equal(run(f).status, 0);
  fs.writeFileSync(path.join(f.dir, 'README.md'), 'Same widget bytes in a later public commit.\n');
  git(f.dir, 'add', '.'); git(f.dir, 'commit', '-qm', 'Synthetic unchanged widget commit');
  const next = git(f.dir, 'rev-parse', 'HEAD');
  assert.equal(run(f, next).status, 0); assert.ok(fs.readFileSync(f.installerPath, 'utf8').includes('/' + next + '/' + WIDGET_URL_FILE));
});

test('release pin refuses malformed or ambiguous existing installer constants and wrong repositories', t => {
  for (const [key, value] of [['VERSION', '0.1.8-beta'], ['SOURCE', 'https://raw.githubusercontent.com/another/repo/main/FordWidget.js'], ['SHA256', 'invalid']]) {
    const f = fixture(t);
    const code = f.installer.replace(new RegExp("^const INSTALL_" + key + " = '[^']+';$", 'm'), "const INSTALL_" + key + " = '" + value + "';");
    fs.writeFileSync(f.installerPath, code); refuses(f);
  }
  const duplicate = fixture(t); fs.appendFileSync(duplicate.installerPath, "\nconst INSTALL_VERSION = '0.1.8';\n"); refuses(duplicate);
  const wrong = fixture(t); git(wrong.dir, 'remote', 'set-url', 'origin', 'https://github.com/another/FordWidget.git'); refuses(wrong, wrong.sha, /origin must be markse123/);
});

test('release input symlinks are refused without writing through them', t => {
  const f = fixture(t), content = fs.readFileSync(f.installerPath);
  const other = path.join(f.dir, 'preserved.js'); fs.writeFileSync(other, content);
  fs.unlinkSync(f.installerPath); fs.symlinkSync(other, f.installerPath);
  refuses(f, f.sha, /regular files/); assert.deepEqual(fs.readFileSync(other), content);
});

function writeIndex(f, version = f.version, sha = f.sha, filename = WIDGET_URL_FILE) {
  fs.writeFileSync(path.join(f.dir, 'docs/index.html'), '<p>Installing widget version <strong>' + version + '</strong>. <a href="https://github.com/markse123/FordPassWidgets/blob/' + sha + '/' + filename + '">Review source</a></p>\n');
}
function check(f, base) {
  return cp.spawnSync('python3', ['source/release.py', '--check', ...(base ? ['--base', base] : [])], {cwd: f.dir, encoding: 'utf8'});
}
function fileSnapshot(dir) {
  const result = [];
  function walk(folder) {
    for (const name of fs.readdirSync(folder).sort()) {
      const file = path.join(folder, name), stat = fs.lstatSync(file);
      if (stat.isDirectory()) walk(file);
      else result.push([path.relative(dir, file), stat.mode, stat.mtimeMs,
        stat.isSymbolicLink() ? fs.readlinkSync(file) : fs.readFileSync(file).toString('base64')]);
    }
  }
  walk(dir);
  return result;
}
function changeWidget(f, version, extra = '') {
  f.version = version;
  f.widget = f.widget.replace(/^FordPassWidgets [^\r\n]*$/m, 'FordPassWidgets ' + version)
    .replace(/^const FORDWIDGET_VERSION = '[^']+';$/m, "const FORDWIDGET_VERSION = '" + version + "';") + extra;
  fs.writeFileSync(path.join(f.dir, WIDGET_FILE), f.widget);
  fs.writeFileSync(path.join(f.dir, 'source/version.json'), JSON.stringify({version}) + '\n');
  fs.writeFileSync(path.join(f.dir, 'source/build-manifest.json'), JSON.stringify({version, outputSHA256: hash(f.widget)}) + '\n');
  git(f.dir, 'add', '.'); git(f.dir, 'commit', '-qm', 'Synthetic next reviewed widget');
  f.sha = git(f.dir, 'rev-parse', 'HEAD');
}

test('read-only release check validates the pin, exact source commit and page without changing files', t => {
  const f = fixture(t); assert.equal(run(f).status, 0); writeIndex(f);
  const files = [WIDGET_FILE, 'source/version.json', 'source/build-manifest.json', 'docs/installer.js', 'docs/index.html'];
  const before = files.map(p => fs.readFileSync(path.join(f.dir, p)));
  const r = check(f); assert.equal(r.status, 0, r.stderr); assert.match(r.stdout, /Verified installer, widget and page v0\.1\.9/);
  files.forEach((p, i) => assert.deepEqual(fs.readFileSync(path.join(f.dir, p)), before[i], p));
  git(f.dir, 'remote', 'set-url', 'origin', 'https://github.com/markse123/FordPassWidgets');
  assert.equal(check(f).status, 0, 'Canonical origin without .git is accepted');
});

test('release pin rejects matching code on a separate temporary branch in preparation and check modes without writes', t => {
  const f = fixture(t);
  git(f.dir, 'switch', '-c', 'temporary-code');
  fs.writeFileSync(path.join(f.dir, 'TEMPORARY.md'), 'Synthetic temporary code branch.\n');
  git(f.dir, 'add', '.'); git(f.dir, 'commit', '-qm', 'Synthetic separate code commit');
  const separate = git(f.dir, 'rev-parse', 'HEAD');
  git(f.dir, 'switch', 'main');
  fs.writeFileSync(path.join(f.dir, 'RELEASE.md'), 'Synthetic release branch.\n');
  git(f.dir, 'add', '.'); git(f.dir, 'commit', '-qm', 'Synthetic release head');
  assert.equal(git(f.dir, 'cat-file', '-t', separate), 'commit', 'The branch pin exists locally');
  for (const name of [WIDGET_FILE, 'source/version.json', 'source/build-manifest.json'])
    assert.equal(git(f.dir, 'show', separate + ':' + name), fs.readFileSync(path.join(f.dir, name), 'utf8').trim(), name);

  let before = fileSnapshot(f.dir);
  const prepare = run(f, separate);
  assert.equal(prepare.status, 1); assert.match(prepare.stderr, /ancestor of HEAD/);
  assert.deepEqual(fileSnapshot(f.dir), before, 'Rejected preparation must not change any file or ref');

  const installer = f.installer
    .replace(/^const INSTALL_VERSION = '[^']+';$/m, "const INSTALL_VERSION = '" + f.version + "';")
    .replace(/^const INSTALL_SOURCE = '[^']+';$/m, "const INSTALL_SOURCE = 'https://raw.githubusercontent.com/markse123/FordPassWidgets/" + separate + '/' + WIDGET_URL_FILE + "';")
    .replace(/^const INSTALL_SHA256 = '[^']+';$/m, "const INSTALL_SHA256 = '" + hash(f.widget) + "';");
  fs.writeFileSync(f.installerPath, installer); writeIndex(f, f.version, separate);
  before = fileSnapshot(f.dir);
  const validation = check(f);
  assert.equal(validation.status, 1); assert.match(validation.stderr, /ancestor of HEAD/);
  assert.deepEqual(fileSnapshot(f.dir), before, 'Rejected validation must not change any file or ref');
});

test('release pin remains valid after the normal same-branch distribution metadata commit', t => {
  const f = fixture(t);
  assert.equal(run(f).status, 0); writeIndex(f);
  git(f.dir, 'add', '.'); git(f.dir, 'commit', '-qm', 'Synthetic distribution metadata');
  const metadataCommit = git(f.dir, 'rev-parse', 'HEAD');
  assert.notEqual(metadataCommit, f.sha);
  git(f.dir, 'merge-base', '--is-ancestor', f.sha, metadataCommit);
  const before = fileSnapshot(f.dir), result = check(f);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(fileSnapshot(f.dir), before, 'Validation of an ancestral pin stays read-only');
  assert.equal(run(f, f.sha).status, 0, 'Preparing the same ancestral pin remains supported');
});

test('read-only release check fails on stale pin, missing source commit and disagreeing page metadata', t => {
  const stale = fixture(t); writeIndex(stale);
  assert.equal(check(stale).status, 1); assert.match(check(stale).stderr, /metadata is stale/);
  const f = fixture(t); assert.equal(run(f).status, 0); writeIndex(f);
  for (const [version, sha] of [['0.1.8', f.sha], [f.version, 'a'.repeat(40)]]) {
    writeIndex(f, version, sha); const r = check(f); assert.equal(r.status, 1); assert.match(r.stderr, /page version\/source/);
  }
  writeIndex(f);
  fs.writeFileSync(f.installerPath, fs.readFileSync(f.installerPath, 'utf8').replace('/' + f.sha + '/', '/' + 'f'.repeat(40) + '/'));
  assert.equal(check(f).status, 1, 'A syntactically valid but absent pin object cannot pass');
});

test('base check requires a version increase for changed bytes and supports legacy bases without version.json', t => {
  const f = fixture(t, {version: '0.1.8', installerVersion: '0.1.7'});
  git(f.dir, 'rm', 'source/version.json'); git(f.dir, 'commit', '-qm', 'Synthetic legacy base without authority file');
  const base = git(f.dir, 'rev-parse', 'HEAD');
  changeWidget(f, '0.1.9', '// New inherited behavior.\n');
  assert.equal(run(f).status, 0); writeIndex(f);
  const r = check(f, base); assert.equal(r.status, 0, r.stderr);
  assert.equal(check(f, f.sha).status, 0, 'Equal version is allowed for identical widget bytes');
  const currentBase = f.sha;
  changeWidget(f, '0.1.9', '// Changed without a version bump.\n');
  const before = fs.readFileSync(f.installerPath);
  const rejected = cp.spawnSync('python3', ['source/release.py', '--commit', f.sha, '--base', currentBase], {cwd: f.dir, encoding: 'utf8'});
  assert.equal(rejected.status, 1); assert.match(rejected.stderr, /strictly newer version/);
  assert.deepEqual(fs.readFileSync(f.installerPath), before);
});

test('base check rejects malformed or inconsistent base version evidence rather than guessing zero', t => {
  const f = fixture(t);
  const base = f.sha;
  fs.writeFileSync(path.join(f.dir, 'source/version.json'), '{"version":"0.1.8"}\n');
  git(f.dir, 'add', '.'); git(f.dir, 'commit', '-qm', 'Synthetic inconsistent base');
  const invalid = git(f.dir, 'rev-parse', 'HEAD');
  fs.writeFileSync(path.join(f.dir, 'source/version.json'), '{"version":"0.1.9"}\n');
  f.sha = base; assert.equal(run(f).status, 0); writeIndex(f);
  for (const candidate of ['main', base.slice(0, 12), invalid]) {
    const r = check(f, candidate); assert.equal(r.status, 1); assert.match(r.stderr, /base commit|base commit's/);
  }
});

test('legacy project and filename pins are refused rather than migrated', t => {
  for (const filename of ['FordWidget.js', 'FordWidget%20Pro%20Power.js']) {
    const f = fixture(t, {installerFilename: filename});
    refuses(f, f.sha, /malformed/);
    assert.equal(check(f).status, 1);
  }
  const f = fixture(t);
  fs.writeFileSync(f.installerPath, f.installer.replace('/markse123/FordPassWidgets/', '/markse123/FordWidget/'));
  refuses(f, f.sha, /malformed/);
});

test('a base containing release metadata without the application artifact is rejected', t => {
  const f = fixture(t);
  git(f.dir, 'mv', WIDGET_FILE, 'FordWidget.js'); git(f.dir, 'commit', '-qm', 'Synthetic metadata without application');
  const base = git(f.dir, 'rev-parse', 'HEAD');
  git(f.dir, 'mv', 'FordWidget.js', WIDGET_FILE); git(f.dir, 'commit', '-qm', 'Synthetic first application artifact');
  f.sha = git(f.dir, 'rev-parse', 'HEAD');
  const before = fs.readFileSync(f.installerPath);
  const r = cp.spawnSync('python3', ['source/release.py', '--commit', f.sha, '--base', base], {cwd: f.dir, encoding: 'utf8'});
  assert.equal(r.status, 1); assert.match(r.stderr, /base commit has release metadata without its widget/);
  assert.deepEqual(fs.readFileSync(f.installerPath), before);
});

test('a source-free bootstrap permits first publication without treating unrelated legacy code as this application', t => {
  const f = fixture(t);
  git(f.dir, 'rm', WIDGET_FILE, 'source/version.json', 'source/build-manifest.json');
  fs.writeFileSync(path.join(f.dir, 'FordWidget.js'), '// Unrelated historical application, not an accepted release source.\n');
  git(f.dir, 'add', '.'); git(f.dir, 'commit', '-qm', 'Synthetic source-free bootstrap');
  const base = git(f.dir, 'rev-parse', 'HEAD');
  fs.writeFileSync(path.join(f.dir, WIDGET_FILE), f.widget);
  fs.writeFileSync(path.join(f.dir, 'source/version.json'), JSON.stringify({version: f.version}) + '\n');
  fs.writeFileSync(path.join(f.dir, 'source/build-manifest.json'), JSON.stringify({version: f.version, outputSHA256: hash(f.widget)}) + '\n');
  git(f.dir, 'add', '.'); git(f.dir, 'commit', '-qm', 'Synthetic first application release');
  f.sha = git(f.dir, 'rev-parse', 'HEAD');
  const r = cp.spawnSync('python3', ['source/release.py', '--commit', f.sha, '--base', base], {cwd: f.dir, encoding: 'utf8'});
  assert.equal(r.status, 0, r.stderr); writeIndex(f); assert.equal(check(f, base).status, 0);
  assert.equal(fs.readFileSync(path.join(f.dir, 'FordWidget.js'), 'utf8'), '// Unrelated historical application, not an accepted release source.\n');
  const first = f.sha; changeWidget(f, f.version, '// Actual application changed.\n');
  assert.equal(check(f, first).status, 1, 'Later application changes still require a version increase');
});

test('release sources and page links require only the exact application filename and repository', t => {
  const filenames = ['FordWidget Pro Power.js', 'FordWidget+Pro+Power.js', 'FordWidget%2520Pro%2520Power.js',
    'FordWidget%20Pro Power.js', 'FordPassWidgets.mjs', 'FordPassWidgets.js?raw=1'];
  for (const filename of filenames) refuses(fixture(t, {installerFilename: filename}));
  const f = fixture(t); assert.equal(run(f).status, 0);
  for (const filename of ['FordWidget.js', ...filenames]) {
    writeIndex(f, f.version, f.sha, filename);
    const r = check(f); assert.equal(r.status, 1); assert.match(r.stderr, /page version\/source/);
  }
  writeIndex(f);
  fs.appendFileSync(path.join(f.dir, 'docs/index.html'), '<a href="https://github.com/markse123/FordPassWidgets/blob/' + f.sha + '/FordWidget.js">Old path</a>');
  assert.equal(check(f).status, 1, 'A mixed canonical/legacy source-link set cannot pass');
});

test('the new release commit must contain the canonical filename rather than falling back to another script', t => {
  const f = fixture(t);
  git(f.dir, 'mv', WIDGET_FILE, 'FordWidget.js'); git(f.dir, 'commit', '-qm', 'Synthetic legacy-only selected commit');
  const legacy = git(f.dir, 'rev-parse', 'HEAD');
  fs.writeFileSync(path.join(f.dir, WIDGET_FILE), f.widget); fs.unlinkSync(path.join(f.dir, 'FordWidget.js'));
  refuses(f, legacy, /Cannot read the requested/);
});
