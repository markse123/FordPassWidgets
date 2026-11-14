'use strict';
const assert = require('node:assert/strict');
const {test} = require('node:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const cp = require('node:child_process');
const root = path.resolve(__dirname, '..');
const markers = {
  versionStart: '<!-- BEGIN GENERATED:version -->',
  versionEnd: '<!-- END GENERATED:version -->',
  featuresStart: '<!-- BEGIN GENERATED:features -->',
  featuresEnd: '<!-- END GENERATED:features -->'
};
const summary = 'Synthetic **status** with `units` and literal $& text.';
const catalog = () => ({schemaVersion: 1, features: [{id: 'synthetic-status', summary, documentation: 'docs/USAGE.md#synthetic-feature'}]});
const readme = () => '# Synthetic project\n\nManual introduction: $& and `code` remain literal.\n\n' + markers.versionStart + '\nold version\n' + markers.versionEnd +
  '\n\n## What it includes\n\n' + markers.featuresStart + '\n- old feature\n' + markers.featuresEnd +
  '\n\n## Setup\n\nKeep this setup, privacy and credit text exactly as written.\n';

function fixture(t, options = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fordpass-readme-'));
  t.after(() => fs.rmSync(dir, {recursive: true, force: true}));
  fs.mkdirSync(path.join(dir, 'source'));
  fs.mkdirSync(path.join(dir, 'docs'));
  for (const name of fs.readdirSync(path.join(root, 'source')).filter(name => name.endsWith('.py')))
    fs.copyFileSync(path.join(root, 'source', name), path.join(dir, 'source', name));
  fs.writeFileSync(path.join(dir, 'source/version.json'), options.versionRaw || '{"version":"0.2.3"}\n');
  fs.writeFileSync(path.join(dir, 'docs/features.json'), options.catalogRaw || JSON.stringify(catalog()) + '\n');
  fs.writeFileSync(path.join(dir, 'README.md'), options.readme ?? readme());
  fs.writeFileSync(path.join(dir, 'docs/USAGE.md'), '# Usage\n\n## Synthetic feature\n\n## Second feature\n');
  for (const name of ['MODEL-SUPPORT.md', 'ANDROID-FEATURES.md']) fs.writeFileSync(path.join(dir, 'docs', name), '# Synthetic reference\n');
  fs.writeFileSync(path.join(dir, 'FordPassWidgets.js'), '// Synthetic widget that is never executed.\n');
  return dir;
}
function run(dir, ...args) {
  return cp.spawnSync('python3', ['source/readme.py', '--root', dir, ...args], {cwd: dir, encoding: 'utf8'});
}
function snapshot(dir) {
  const files = [];
  function visit(folder) {
    for (const name of fs.readdirSync(folder).sort()) {
      const file = path.join(folder, name), stat = fs.lstatSync(file), relative = path.relative(dir, file);
      if (stat.isSymbolicLink()) files.push([relative, 'symlink', fs.readlinkSync(file)]);
      else if (stat.isDirectory()) visit(file);
      else files.push([relative, stat.mode, fs.readFileSync(file).toString('base64')]);
    }
  }
  visit(dir);
  return files;
}
function passes(dir, ...args) {
  const result = run(dir, ...args);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  return result;
}
function refuses(dir, pattern = /README|readme|catalog|feature|version|marker|document/i) {
  const before = snapshot(dir), result = run(dir);
  assert.notEqual(result.status, 0, 'Invalid inputs must be rejected');
  assert.match(result.stderr, pattern);
  assert.deepEqual(snapshot(dir), before, 'Rejected generation must leave every file unchanged, including Python bytecode');
}
function outsideGenerated(text) {
  for (const [start, end] of [[markers.versionStart, markers.versionEnd], [markers.featuresStart, markers.featuresEnd]]) {
    const begin = text.indexOf(start) + start.length, finish = text.indexOf(end, begin);
    text = text.slice(0, begin) + '<generated interior>' + text.slice(finish);
  }
  return text;
}

test('generation renders version and reviewed features deterministically without altering manual content or other files', t => {
  const dir = fixture(t), original = fs.readFileSync(path.join(dir, 'README.md'), 'utf8');
  const before = snapshot(dir).filter(([name]) => name !== 'README.md');
  passes(dir);
  const first = fs.readFileSync(path.join(dir, 'README.md'), 'utf8');
  assert.match(first, /\*\*v0\.2\.3\*\*/);
  assert.ok(first.includes('- ' + summary));
  assert.ok(first.includes('[Details](docs/USAGE.md#synthetic-feature)'));
  assert.equal(outsideGenerated(first), outsideGenerated(original));
  assert.deepEqual(snapshot(dir).filter(([name]) => name !== 'README.md'), before);
  passes(dir);
  assert.equal(fs.readFileSync(path.join(dir, 'README.md'), 'utf8'), first);
});

test('version and catalog changes update only the generated summaries, retain order and preserve literal Markdown', t => {
  const dir = fixture(t);
  passes(dir);
  const before = fs.readFileSync(path.join(dir, 'README.md'), 'utf8');
  fs.writeFileSync(path.join(dir, 'source/version.json'), '{"version":"0.2.4"}\n');
  const next = catalog();
  next.features.unshift({id: 'first-feature', summary: 'First `feature` keeps $1 and $& literal.', documentation: 'docs/USAGE.md#second-feature'});
  fs.writeFileSync(path.join(dir, 'docs/features.json'), JSON.stringify(next));
  passes(dir);
  const after = fs.readFileSync(path.join(dir, 'README.md'), 'utf8');
  assert.match(after, /\*\*v0\.2\.4\*\*/);
  assert.ok(after.includes('First `feature` keeps $1 and $& literal.'));
  assert.ok(after.indexOf('First `feature`') < after.indexOf(summary));
  assert.equal(outsideGenerated(after), outsideGenerated(before));
});

test('the actual app build regenerates stale feature documentation without changing widget or manifest bytes', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fordpass-readme-build-'));
  t.after(() => fs.rmSync(dir, {recursive: true, force: true}));
  fs.cpSync(path.join(root, 'source'), path.join(dir, 'source'), {
    recursive: true, filter: source => path.basename(source) !== '__pycache__'
  });
  fs.mkdirSync(path.join(dir, 'docs'));
  for (const name of fs.readdirSync(path.join(root, 'docs')).filter(name => name.endsWith('.md') || name === 'features.json'))
    fs.copyFileSync(path.join(root, 'docs', name), path.join(dir, 'docs', name));
  for (const name of ['LICENSE', 'README.md', 'FordPassWidgets.js']) fs.copyFileSync(path.join(root, name), path.join(dir, name));
  passes(dir);
  const before = fs.readFileSync(path.join(dir, 'README.md'), 'utf8');
  const next = JSON.parse(fs.readFileSync(path.join(dir, 'docs/features.json'), 'utf8'));
  next.features[0].summary += ' Synthetic build-integration observation.';
  fs.writeFileSync(path.join(dir, 'docs/features.json'), JSON.stringify(next));
  const stale = run(dir, '--check');
  assert.equal(stale.status, 1, stale.stdout + stale.stderr);
  assert.equal(fs.readFileSync(path.join(dir, 'README.md'), 'utf8'), before);
  const built = cp.spawnSync('python3', ['source/build.py'], {cwd: dir, encoding: 'utf8'});
  assert.equal(built.status, 0, built.stdout + built.stderr);
  passes(dir, '--check');
  const after = fs.readFileSync(path.join(dir, 'README.md'), 'utf8');
  assert.ok(after.includes(next.features[0].summary));
  assert.equal(outsideGenerated(after), outsideGenerated(before));
  for (const name of ['FordPassWidgets.js', 'source/build-manifest.json'])
    assert.deepEqual(fs.readFileSync(path.join(dir, name)), fs.readFileSync(path.join(root, name)), name);
});

test('check mode detects stale output and succeeds after generation without writing any files', t => {
  const dir = fixture(t), before = snapshot(dir);
  const stale = run(dir, '--check');
  assert.equal(stale.status, 1);
  assert.match(stale.stdout + stale.stderr, /stale|out.of.date|regenerat|update/i);
  assert.deepEqual(snapshot(dir), before);
  passes(dir);
  const generated = snapshot(dir);
  passes(dir, '--check');
  assert.deepEqual(snapshot(dir), generated);
  fs.appendFileSync(path.join(dir, 'README.md'), 'An unrelated manual note.\n');
  const edited = snapshot(dir);
  passes(dir, '--check');
  assert.deepEqual(snapshot(dir), edited);
});

test('manual CRLF bytes survive regeneration', t => {
  const original = readme().replace(/\n/g, '\r\n');
  const dir = fixture(t, {readme: original});
  passes(dir);
  const after = fs.readFileSync(path.join(dir, 'README.md'), 'utf8');
  assert.equal(outsideGenerated(after), outsideGenerated(original));
});

test('generated output exceeding the byte limit is rejected before writes, including multibyte manual content', t => {
  const original = readme(), remaining = 511999 - Buffer.byteLength(original);
  for (const character of ['x', 'é']) {
    const count = Math.floor(remaining / Buffer.byteLength(character));
    const padded = original + character.repeat(count) + 'x'.repeat(remaining - count * Buffer.byteLength(character));
    assert.equal(Buffer.byteLength(padded), 511999, 'The source README is below the input byte limit');
    const dir = fixture(t, {readme: padded});
    refuses(dir, /Generated README.*size limit/i);
    const before = snapshot(dir), checked = run(dir, '--check');
    assert.equal(checked.status, 1);
    assert.match(checked.stderr, /Generated README.*size limit/i);
    assert.deepEqual(snapshot(dir), before, '--check must also reject oversized planned output without writes');
  }
});

test('missing, duplicate, reversed, nested or non-standalone generated markers fail closed', t => {
  const malformed = [
    readme().replace(markers.featuresStart, ''),
    readme().replace(markers.featuresEnd, ''),
    readme() + markers.featuresStart + '\n',
    readme() + markers.versionEnd + '\n',
    readme().replace(markers.featuresStart, '<reversed>').replace(markers.featuresEnd, markers.featuresStart).replace('<reversed>', markers.featuresEnd),
    '# Nested\n' + markers.versionStart + '\n' + markers.featuresStart + '\n' + markers.versionEnd + '\n' + markers.featuresEnd + '\n',
    readme().replace(markers.featuresStart, 'prefix ' + markers.featuresStart)
  ];
  for (const text of malformed) refuses(fixture(t, {readme: text}), /marker|section|block|boundary|standalone/i);
});

test('catalog schema, stable identifiers and duplicate JSON keys are validated before writes', t => {
  const invalid = [
    '[]', '{"schemaVersion":1,"schemaVersion":1,"features":[]}',
    JSON.stringify({...catalog(), schemaVersion: 2}),
    JSON.stringify({...catalog(), schemaVersion: true}),
    JSON.stringify({...catalog(), unexpected: true}),
    JSON.stringify({schemaVersion: 1, features: []}),
    JSON.stringify({schemaVersion: 1, features: [catalog().features[0], catalog().features[0]]}),
    JSON.stringify({schemaVersion: 1, features: [{...catalog().features[0], id: 'Bad Identifier'}]}),
    JSON.stringify({schemaVersion: 1, features: [{...catalog().features[0], unexpected: true}]})
  ];
  for (const raw of invalid) refuses(fixture(t, {catalogRaw: raw}));
});

test('feature summaries cannot inject generated boundaries, HTML or additional lines', t => {
  for (const bad of ['', '   ', '<b>HTML</b>', markers.featuresEnd, 'One line\nAnother line', 'Control\u0000text', 'x'.repeat(1201)]) {
    const next = catalog(); next.features[0].summary = bad;
    refuses(fixture(t, {catalogRaw: JSON.stringify(next)}), /summary|feature|catalog|text/i);
  }
});

test('documentation references must name a real local Markdown section without URL or path escape', t => {
  for (const bad of ['https://unreachable.example.invalid/doc#section', '/docs/USAGE.md#synthetic-feature', '../outside.md#section', 'docs/missing.md#section',
    'docs/USAGE.md#missing', 'docs/USAGE.md', 'docs/USAGE.md?query=1#synthetic-feature', 'FordPassWidgets.js#L1']) {
    const next = catalog(); next.features[0].documentation = bad;
    refuses(fixture(t, {catalogRaw: JSON.stringify(next)}), /document|link|path|section|anchor|relative|Markdown|repository|regular/i);
  }
});

test('malformed or ambiguous version authority is rejected without changing documentation', t => {
  for (const raw of ['{"version":"01.2.3"}', '{"version":"0.2.3-beta"}', '{"version":"0.2.3","version":"0.2.4"}', '{"version":"0.2.3","extra":1}', '[]'])
    refuses(fixture(t, {versionRaw: raw}));
});

test('check mode rejects a missing README without recreating it', t => {
  const dir = fixture(t);
  fs.unlinkSync(path.join(dir, 'README.md'));
  const before = snapshot(dir), result = run(dir, '--check');
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /README|readme/i);
  assert.deepEqual(snapshot(dir), before);
});

test('symlinked README, catalog or version inputs and escaping documentation targets are rejected without outside writes', t => {
  for (const input of ['README.md', 'docs/features.json', 'source/version.json', 'docs/USAGE.md']) {
    const dir = fixture(t), outside = fs.mkdtempSync(path.join(os.tmpdir(), 'fordpass-readme-outside-'));
    t.after(() => fs.rmSync(outside, {recursive: true, force: true}));
    const target = path.join(outside, 'preserved'), bytes = fs.readFileSync(path.join(dir, input));
    fs.writeFileSync(target, bytes);
    fs.unlinkSync(path.join(dir, input)); fs.symlinkSync(target, path.join(dir, input));
    refuses(dir, /symlink|regular|outside|escape|repository|document/i);
    assert.deepEqual(fs.readFileSync(target), bytes);
  }
});
