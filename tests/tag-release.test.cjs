'use strict';
const assert = require('node:assert/strict');
const {test} = require('node:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const cp = require('node:child_process');
const root = path.resolve(__dirname, '..');
const validator = fs.readFileSync(path.join(root, 'source/check-tag.py'));
const releaseParser = fs.readFileSync(path.join(root, 'source/release.py'));

function git(dir, ...args) {
  const result = cp.spawnSync('git', ['-c', 'core.hooksPath=/dev/null', '-c', 'commit.gpgsign=false', '-c', 'tag.gpgsign=false', ...args], {cwd: dir, encoding: 'utf8'});
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}
function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fordpasswidgets-tag-'));
  t.after(() => fs.rmSync(dir, {recursive: true, force: true}));
  fs.mkdirSync(path.join(dir, 'source'));
  fs.writeFileSync(path.join(dir, 'source/check-tag.py'), validator);
  fs.writeFileSync(path.join(dir, 'source/release.py'), releaseParser);
  fs.writeFileSync(path.join(dir, 'source/version.json'), '{"version":"0.1.0"}\n');
  git(dir, 'init', '-q', '--initial-branch=main');
  git(dir, 'config', 'user.name', 'Release Tag Fixture');
  git(dir, 'config', 'user.email', 'release-tag@example.test');
  git(dir, 'add', '.'); git(dir, 'commit', '-qm', 'Synthetic reviewed version');
  const sha = git(dir, 'rev-parse', 'HEAD');
  git(dir, 'update-ref', 'refs/remotes/origin/main', sha);
  return {dir, sha};
}
function snapshot(dir) {
  const files = [];
  function walk(folder) {
    for (const name of fs.readdirSync(folder).sort()) {
      const file = path.join(folder, name), stat = fs.lstatSync(file);
      if (stat.isDirectory()) walk(file);
      else files.push([path.relative(dir, file), stat.mode, fs.readFileSync(file).toString('base64')]);
    }
  }
  walk(dir);
  return files;
}
function run(f, tag = 'v0.1.0') {
  const before = snapshot(f.dir);
  const result = cp.spawnSync('python3', ['source/check-tag.py', tag], {cwd: f.dir, encoding: 'utf8'});
  assert.deepEqual(snapshot(f.dir), before, 'Validation must leave every file and Git ref unchanged, including Python bytecode');
  return result;
}
function refuses(f, tag, pattern) {
  const result = run(f, tag);
  assert.equal(result.status, 1, result.stdout + result.stderr);
  assert.match(result.stderr, /Release tag verification failed:/);
  assert.match(result.stderr, pattern);
}

test('lightweight and annotated release tags validate at HEAD without any writes', t => {
  for (const annotated of [false, true]) {
    const f = fixture(t);
    git(f.dir, 'tag', ...(annotated ? ['-a', '-m', 'Synthetic release'] : []), 'v0.1.0');
    const result = run(f);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout.trim(), 'Verified release tag v0.1.0 at ' + f.sha + '.');
  }
});

test('a tagged ancestor remains valid after main advances', t => {
  const f = fixture(t); git(f.dir, 'tag', 'v0.1.0');
  git(f.dir, 'commit', '--allow-empty', '-qm', 'Later reviewed docs');
  git(f.dir, 'update-ref', 'refs/remotes/origin/main', git(f.dir, 'rev-parse', 'HEAD'));
  git(f.dir, 'checkout', '-q', '--detach', f.sha);
  assert.equal(run(f).status, 0);
});

test('mismatched and noncanonical tag names cannot substitute for the release version', t => {
  const f = fixture(t); git(f.dir, 'tag', 'v0.1.0');
  for (const tag of ['v0.1.1', '0.1.0', 'v00.1.0', 'v0.1.0-beta', 'v0.1.0\n', 'refs/tags/v0.1.0', 'v0.1.0^{commit}'])
    refuses(f, tag, /must be exactly v0\.1\.0/);
});

test('a missing tag or tag that does not identify a commit fails closed', t => {
  const absent = fixture(t); refuses(absent, 'v0.1.0', /release tag ref is missing or is not a commit/);
  const blob = fixture(t), object = git(blob.dir, 'hash-object', 'source/version.json');
  git(blob.dir, 'update-ref', 'refs/tags/v0.1.0', object);
  refuses(blob, 'v0.1.0', /release tag ref is missing or is not a commit/);
});

test('a valid release tag cannot validate a different checked-out HEAD', t => {
  const f = fixture(t); git(f.dir, 'tag', 'v0.1.0');
  git(f.dir, 'commit', '--allow-empty', '-qm', 'Different checked-out commit');
  git(f.dir, 'update-ref', 'refs/remotes/origin/main', git(f.dir, 'rev-parse', 'HEAD'));
  refuses(f, 'v0.1.0', /checked-out HEAD/);
});

test('a release tag outside origin/main is refused even when the local main branch contains it', t => {
  const f = fixture(t);
  git(f.dir, 'commit', '--allow-empty', '-qm', 'Unmerged local work');
  git(f.dir, 'tag', 'v0.1.0');
  refuses(f, 'v0.1.0', /ancestor of local origin\/main/);
});

test('missing remote main cannot be replaced by a similarly named local branch', t => {
  const f = fixture(t); git(f.dir, 'tag', 'v0.1.0');
  git(f.dir, 'update-ref', '-d', 'refs/remotes/origin/main');
  git(f.dir, 'branch', 'origin/main');
  refuses(f, 'v0.1.0', /origin\/main ref is missing or is not a commit/);
});

test('malformed, duplicate and noncanonical version authority is refused', t => {
  const f = fixture(t); git(f.dir, 'tag', 'v0.1.0');
  for (const raw of ['not json', '[]', '{"version":"00.1.0"}', '{"version":"0.1.0-beta"}',
    '{"version":"0.1.0","version":"0.1.1"}', '{"version":"0.1.0","extra":true}']) {
    fs.writeFileSync(path.join(f.dir, 'source/version.json'), raw);
    refuses(f, 'v0.1.0', /JSON|Expecting|metadata|version|Version/);
  }
  // A locally edited version cannot relabel the committed code with a new tag.
  fs.writeFileSync(path.join(f.dir, 'source/version.json'), '{"version":"0.2.0"}\n');
  git(f.dir, 'tag', 'v0.2.0');
  refuses(f, 'v0.2.0', /version authority must match the tagged commit/);
});

test('a validator copied into a nested project cannot validate the containing Git repository', t => {
  const f = fixture(t), nested = path.join(f.dir, 'nested');
  fs.mkdirSync(path.join(nested, 'source'), {recursive: true});
  for (const name of ['check-tag.py', 'release.py', 'version.json'])
    fs.copyFileSync(path.join(f.dir, 'source', name), path.join(nested, 'source', name));
  refuses({dir: nested}, 'v0.1.0', /Git checkout root/);
});

test('the actual workflow release step ignores tag predecessors and forwards only valid branch baselines', t => {
  const workflow = fs.readFileSync(path.join(root, '.github/workflows/validate.yml'), 'utf8');
  const lines = workflow.split(/\r?\n/);
  const start = lines.indexOf('      - name: Verify release version and immutable installer pin');
  assert.ok(start >= 0, 'The final release check must remain present');
  const block = [];
  for (let index = start + 1; index < lines.length; index++) {
    if (/^      - /.test(lines[index])) break;
    block.push(lines[index]);
  }
  const run = block.indexOf('        run: |');
  assert.ok(run >= 0, 'Exercise the actual workflow shell, rather than a copied conditional');
  const body = block.slice(run + 1).map(line => {
    assert.ok(!line.trim() || line.startsWith('          '), 'Unexpected workflow shell indentation');
    return line.slice(10);
  }).join('\n');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fordpasswidgets-workflow-'));
  t.after(() => fs.rmSync(dir, {recursive: true, force: true}));
  const bin = path.join(dir, 'bin'), log = path.join(dir, 'argv');
  fs.mkdirSync(bin);
  fs.writeFileSync(path.join(bin, 'python3'), '#!/bin/bash\nprintf \'%s\\0\' "$@" >> "$ARGV_LOG"\n', {mode: 0o755});
  const base = 'a'.repeat(40), zero = '0'.repeat(40);
  for (const [ref, candidate, expected] of [
    ['refs/tags/v0.1.0', base, ['source/release.py', '--check']],
    ['refs/tags/v0.1.0', zero, ['source/release.py', '--check']],
    ['refs/heads/main', base, ['source/release.py', '--check', '--base', base]],
    ['refs/pull/2/merge', base, ['source/release.py', '--check', '--base', base]],
    ['refs/heads/main', zero, ['source/release.py', '--check']],
    ['refs/heads/main', '', ['source/release.py', '--check']]
  ]) {
    fs.writeFileSync(log, '');
    const result = cp.spawnSync('bash', ['--noprofile', '--norc', '-e', '-o', 'pipefail', '-c', body], {
      cwd: dir, encoding: 'utf8',
      env: {...process.env, PATH: bin + path.delimiter + process.env.PATH, ARGV_LOG: log, GITHUB_REF: ref, BASE_COMMIT: candidate}
    });
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(fs.readFileSync(log, 'utf8').split('\0').slice(0, -1), expected, ref + ' / ' + candidate);
  }
});
