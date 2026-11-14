'use strict';
const assert = require('node:assert/strict');
const {test} = require('node:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const cp = require('node:child_process');
const tool = path.resolve(__dirname, '../source/check-doc-links.py');

function fixture(t, files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fordpass-doc-links-'));
  t.after(() => fs.rmSync(dir, {recursive: true, force: true}));
  for (const [name, contents] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, name)), {recursive: true});
    fs.writeFileSync(path.join(dir, name), contents);
  }
  return dir;
}
function run(dir) {
  return cp.spawnSync('python3', [tool, '--root', dir], {encoding: 'utf8'});
}
function passes(dir) {
  const result = run(dir);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /local links.*offline/);
}

test('local Markdown, HTML, repository-root, percent-encoded and reference links resolve offline', t => {
  const dir = fixture(t, {
    'README.md': '# Home\n[Setup](docs/Setup%20Guide.md#start-here "Setup")\n[Site](docs/)\n[Home](/README.md#home)\n[Reference][setup]\n[setup][]\n[setup]: <docs/Setup Guide.md#start-here>\n![Icon](docs/icon.svg#bolt)\n[Code](source/sample.py#L1)\n',
    'docs/Setup Guide.md': '# Start here\n[Home](../README.md#home)\n[Top](#start-here)\n[Self]()\n',
    'docs/index.html': '<main id="main"><a href="Setup%20Guide.md#start-here">Guide</a><img src="icon.svg"><a href="#main">Main</a></main>',
    'docs/icon.svg': '<svg><symbol id="bolt"></symbol></svg>',
    'source/sample.py': '# Synthetic code fixture.\n'
  });
  passes(dir);
});

test('missing files and section anchors report their source document and line', t => {
  const dir = fixture(t, {
    'README.md': '# Home\n[Missing](docs/missing.md)\n[Section](docs/guide.md#missing)\n',
    'docs/guide.md': '# Present\n'
  });
  const result = run(dir);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /README\.md:2:.*docs\/missing\.md.*target file does not exist/);
  assert.match(result.stderr, /README\.md:3:.*guide\.md#missing.*target anchor does not exist/);
});

test('GitHub-style duplicate heading slugs, inline formatting, Unicode and explicit HTML anchors work', t => {
  const dir = fixture(t, {
    'README.md': '# Repeated\n# Repeated\n# Repeated-1\n# Repeated\n## **Units** & `formats`!\n## Café settings\n<a id="custom-anchor"></a>\n<a name="legacy-anchor"></a>\nSetext title\n------------\n[First](#repeated) [Second](#repeated-1) [Collision](#repeated-1-1) [Third](#repeated-2)\n[Units](#units--formats) [Unicode](#caf%C3%A9-settings) [Explicit](#custom-anchor) [Legacy](#legacy-anchor) [Setext](#setext-title)\n'
  });
  passes(dir);
});

test('fenced code, inline code and HTML comments do not create links or heading anchors', t => {
  const dir = fixture(t, {
    'README.md': '# Visible\n```md\n[Ignored](missing.md)\n# Hidden\n```\n~~~\n[Ignored too][undefined]\n~~~\n`[Inline](missing.md)` and ``[Other](missing.md)``.\n<!-- [Comment](missing.md) -->\n[Visible](#visible)\n'
  });
  passes(dir);
  fs.appendFileSync(path.join(dir, 'README.md'), '[Hidden](#hidden)\n');
  const result = run(dir);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /#hidden.*target anchor does not exist/);
});

test('external URLs and non-HTTP schemes are skipped without network-dependent validation', t => {
  const dir = fixture(t, {
    'README.md': '[External](https://unreachable.example.invalid/nope#missing)\n[Mail](mailto:maintainer@example.invalid)\n[Protocol relative](//unreachable.example.invalid/file)\n[App](scriptable:///run)\n'
  });
  passes(dir);
});

test('missing full and collapsed reference definitions are rejected while plain bracket text remains text', t => {
  const dir = fixture(t, {'README.md': '# Home\n[Plain text]\n[Missing][unknown]\n[Collapsed][]\n'});
  const result = run(dir);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /README\.md:3: undefined link reference \[unknown\]/);
  assert.match(result.stderr, /README\.md:4: undefined link reference \[Collapsed\]/);
  assert.doesNotMatch(result.stderr, /Plain text/);
});

test('escaped and balanced parentheses in local destinations retain the actual filename', t => {
  const dir = fixture(t, {
    'README.md': '[Balanced](docs/guide(copy).md#heading)\n[Escaped](docs/guide\\(copy\\).md#heading)\n[Angle](<docs/with space.md#heading>)\n',
    'docs/guide(copy).md': '# Heading\n',
    'docs/with space.md': '# Heading\n'
  });
  passes(dir);
});

test('linked badge images validate both the enclosing destination and the nested image', t => {
  const dir = fixture(t, {
    'README.md': '[![badge](badge.svg)](existing.md)\n',
    'badge.svg': '<svg></svg>',
    'existing.md': '# Existing\n'
  });
  passes(dir);
  fs.writeFileSync(path.join(dir, 'README.md'), '[![badge](badge.svg)](missing.md)\n');
  let result = run(dir);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /README\.md:1:.*missing\.md.*target file does not exist/);
  fs.writeFileSync(path.join(dir, 'README.md'), '[![badge](missing.svg)](existing.md)\n');
  result = run(dir);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /README\.md:1:.*missing\.svg.*target file does not exist/);
});

test('inline link titles are consumed as literal text without hiding following reference errors', t => {
  const dir = fixture(t, {
    'README.md': '[link](existing.md "[label][literal]")\n[link](existing.md \'[label][literal]\')\n[link](existing.md ([label][literal]))\n[link](existing.md "escaped \\"[label][literal]\\" title")\n[caption [brackets]](existing.md "![not an image](missing.svg)")\n',
    'existing.md': '# Existing\n'
  });
  passes(dir);
  fs.appendFileSync(path.join(dir, 'README.md'), '[Actual][undefined]\n');
  const result = run(dir);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /README\.md:6: undefined link reference \[undefined\]/);
  assert.doesNotMatch(result.stderr, /literal|missing\.svg/);
});

test('repository escapes, including symlinks, are refused rather than reading outside files', t => {
  const dir = fixture(t, {'README.md': '[Escape](../outside.md)\n'});
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'fordpass-doc-outside-'));
  t.after(() => fs.rmSync(outside, {recursive: true, force: true}));
  fs.writeFileSync(path.join(outside, 'outside.md'), '# Outside\n');
  fs.symlinkSync(path.join(outside, 'outside.md'), path.join(dir, 'linked.md'));
  fs.appendFileSync(path.join(dir, 'README.md'), '[Linked](linked.md#outside)\n');
  fs.mkdirSync(path.join(dir, 'docs'));
  fs.symlinkSync(path.join(outside, 'outside.md'), path.join(dir, 'docs/README.md'));
  fs.appendFileSync(path.join(dir, 'README.md'), '[Directory](docs/)\n');
  const result = run(dir);
  assert.equal(result.status, 1);
  assert.equal((result.stderr.match(/target escapes the repository/g) || []).length, 3);
});

test('source-file line anchors must identify an existing ordered line range', t => {
  const dir = fixture(t, {
    'README.md': '[Valid](source/example.py#L1-L2)\n',
    'source/example.py': '# Synthetic line one.\n# Synthetic line two.\n'
  });
  passes(dir);
  fs.appendFileSync(path.join(dir, 'README.md'), '[Too far](source/example.py#L3)\n[Reversed](source/example.py#L2-L1)\n');
  const result = run(dir);
  assert.equal(result.status, 1);
  assert.equal((result.stderr.match(/target line range does not exist/g) || []).length, 2);
});

test('vendored/environment directories are excluded and directory links require an actual document', t => {
  const dir = fixture(t, {
    'README.md': '[Good](docs/)\n',
    'docs/README.md': '# Documentation\n',
    'node_modules/example/README.md': '[Ignored](missing.md)\n',
    '.git/example.md': '[Ignored](missing.md)\n'
  });
  passes(dir);
  fs.mkdirSync(path.join(dir, 'empty'));
  fs.appendFileSync(path.join(dir, 'README.md'), '[Empty](empty/)\n');
  const result = run(dir);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /empty\/.*target file does not exist/);
});
