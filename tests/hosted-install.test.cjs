'use strict';
const assert = require('node:assert/strict');
const {test} = require('node:test');
const path = require('node:path');
const cp = require('node:child_process');
const root = path.resolve(__dirname, '..');

function python(body) {
  const result = cp.spawnSync('python3', ['-c', `
import hashlib, http.client, importlib.util, io, sys, urllib.error
from email.message import Message
from pathlib import Path
sys.path.insert(0, str(Path('source').resolve()))
spec = importlib.util.spec_from_file_location('hosted', 'source/check-hosted-install.py')
h = importlib.util.module_from_spec(spec)
spec.loader.exec_module(h)
widget = b"// Synthetic, never executed.\\n/*\\nFordPassWidgets 0.1.9\\n*/\\nconst FORDWIDGET_VERSION = '0.1.9';\\n"
digest = hashlib.sha256(widget).hexdigest()
source = 'https://raw.githubusercontent.com/markse123/FordPassWidgets/' + 'a' * 40 + '/FordPassWidgets.js'
installer = ("const INSTALL_VERSION = '0.1.9';\\nconst INSTALL_SOURCE = '" + source + "';\\nconst INSTALL_SHA256 = '" + digest + "';\\n").encode()
def rejects(fn, contains):
    try:
        fn()
    except (ValueError, UnicodeError) as error:
        assert contains in str(error), str(error)
    else:
        raise AssertionError('Expected rejected distribution')
class Response(io.BytesIO):
    def __init__(self, body=b'example', status=200, url=h.INSTALLER_URL, length=None, encoding=None):
        super().__init__(body)
        self.status, self.url = status, url
        self.headers = Message()
        if length is not None:
            self.headers['Content-Length'] = str(length)
        if encoding is not None:
            self.headers['Content-Encoding'] = encoding
        self.read_sizes = []
    def geturl(self):
        return self.url
    def read(self, limit):
        self.read_sizes.append(limit)
        return super().read(limit)
class Opener:
    def __init__(self, response=None, error=None):
        self.response, self.error, self.calls = response, error, []
    def open(self, request, timeout):
        self.calls.append((request.full_url, timeout, dict(request.header_items())))
        if self.error:
            raise self.error
        return self.response
${body}
`], {cwd: root, encoding: 'utf8'});
  assert.equal(result.status, 0, result.stdout + result.stderr);
}

test('hosted check validates the reviewed installer, exact immutable URL and widget without executing downloaded code', () => python(`
requests = []
def fetch(url, limit):
    requests.append((url, limit))
    return installer if url == h.INSTALLER_URL else widget
assert h.verify_distribution(installer, widget, fetch) == ('0.1.9', digest)
assert requests == [(h.INSTALLER_URL, 60000), (source, 1000000)]
`));

test('hosted check establishes the checkout release before making any public request', () => python(`
root = Path.cwd()
local_installer = (root / 'docs/installer.js').read_bytes()
local_widget = (root / 'FordPassWidgets.js').read_bytes()
requests = []
def fetch(url, limit):
    requests.append(url)
    return local_installer if url == h.INSTALLER_URL else local_widget
assert h.check_hosted(root, fetch)[0] == h.installer_metadata(local_installer)[0]
assert len(requests) == 2
rejects(lambda: h.check_hosted(root / 'tests', lambda *args: (_ for _ in ()).throw(AssertionError('No request before local verification'))), 'checkout')
`));

test('hosted check refuses stale/corrupt installers before following their metadata', () => python(`
for other in [installer + b'changed', installer.replace(b'0.1.9', b'0.1.8'), installer.replace(source.encode(), b'https://example.test/widget.js')]:
    calls = []
    def fetch(url, limit):
        calls.append(url)
        return other
    rejects(lambda: h.verify_distribution(installer, widget, fetch), 'hosted installer')
    assert calls == [h.INSTALLER_URL]
`));

test('hosted check refuses corrupt widgets and invalid local versions, hashes and moving/foreign pins', () => python(`
rejects(lambda: h.verify_distribution(installer, widget, lambda url, limit: installer if url == h.INSTALLER_URL else widget + b'changed'), 'hosted widget')
for other in [installer.replace(b'0.1.9', b'01.1.9'), installer.replace(digest.encode(), b'z' * 64), installer.replace(b'a' * 40, b'main'), installer.replace(b'raw.githubusercontent.com', b'example.test')]:
    rejects(lambda: h.verify_distribution(other, widget, lambda *args: (_ for _ in ()).throw(AssertionError('No network before local validation'))), '')
rejects(lambda: h.verify_distribution(installer, widget.replace(b'0.1.9', b'0.1.8'), lambda *args: None), 'reviewed widget')
`));

test('public downloader allows only the exact HTTPS project installer and commit-pinned raw widget', () => python(`
for url in ['http://markse123.github.io/FordPassWidgets/installer.js', h.INSTALLER_URL + '?x=1', h.INSTALLER_URL + '#x', h.INSTALLER_URL.replace('markse123.', 'user:pass@markse123.'), source.replace('a' * 40, 'main'), source.replace('FordPassWidgets.js', 'other.js'), source.replace('markse123/', 'other/'), 'https://api.ford.com/status', 'https://127.0.0.1/widget.js']:
    opener = Opener()
    rejects(lambda: h.fetch_public(url, h.INSTALLER_LIMIT, opener), 'not an allowed')
    assert opener.calls == []
for url in [h.INSTALLER_URL, source]:
    response = Response(url=url, length=7)
    opener = Opener(response)
    assert h.fetch_public(url, h.INSTALLER_LIMIT, opener) == b'example'
    assert opener.calls[0][:2] == (url, 20)
    assert response.read_sizes == [60001]
`));

test('public downloader rejects redirects, non-200, oversized, incomplete and encoded responses', () => python(`
for response, message in [(Response(status=404), 'HTTP 200'), (Response(url=source), 'canonical URL'), (Response(length=60001), 'content length'), (Response(length='bad'), 'content length'), (Response(body=b'x' * 60001), 'size limit'), (Response(length=8), 'incomplete'), (Response(encoding='gzip'), 'content encoding')]:
    rejects(lambda: h.fetch_public(h.INSTALLER_URL, h.INSTALLER_LIMIT, Opener(response)), message)
for target in [h.INSTALLER_URL, source, 'https://api.ford.com/status', 'http://127.0.0.1/']:
    rejects(lambda: h.RejectRedirects().redirect_request(None, None, 302, 'Found', {}, target), 'redirected')
`));

test('public downloader reports network failures without exposing raw upstream details', () => python(`
for error in [TimeoutError('sensitive upstream detail'), urllib.error.URLError('sensitive upstream detail'), OSError('sensitive upstream detail'), http.client.IncompleteRead(b'sensitive upstream detail')]:
    rejects(lambda: h.fetch_public(h.INSTALLER_URL, h.INSTALLER_LIMIT, Opener(error=error)), 'failed or timed out')
`));
