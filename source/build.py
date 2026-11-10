"""Build the standalone Scriptable app from a reviewed base and scoped modules."""
from pathlib import Path
import hashlib
import json
import re
from release import read_version

root = Path(__file__).resolve().parent.parent
folder = root / 'source'
version = read_version((folder / 'version.json').read_bytes())
if not re.fullmatch(r'(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)', version):
    raise ValueError('Invalid release version')
base_bytes = (folder / 'fordwidget-base.js').read_bytes()
base = base_bytes.decode('utf-8')
base_hash = 'f865ea1480ccf65d5409cd418525fb4c4e1c7a91a5ccabef228769344f52f808'
if hashlib.sha256(base_bytes).hexdigest() != base_hash:
    raise ValueError('Reviewed base changed')
source = base
changes = []
modules = [
    ('profile-patches.json', 'vehicle-profiles.js'),
    ('telemetry-patches.json', 'vehicle-telemetry.js'),
    ('model-ui-patches.json', 'vehicle-model-ui.js'),
    ('support-report-patches.json', 'model-support-report.js'),
    ('app-patches.json', 'vehicle-app.js'),
    ('selftest-patches.json', 'vehicle-selftest.js'),
]
module_hashes = {}
for patch_name, module_name in modules:
    path = folder / patch_name
    if path.exists():
        patches = json.loads(path.read_text())['patches']
        for patch in patches:
            if source.count(patch['before']) != 1:
                raise ValueError(patch['label'] + ': expected exactly one target')
            source = source.replace(patch['before'], patch['after'])
            changes.append(patch['label'])
    path = folder / module_name
    if path.exists():
        module = path.read_text()
        marker = 'function selfTest() {'
        if source.count(marker) != 1:
            raise ValueError('Self-test insertion boundary changed')
        source = source.replace(marker, module + '\n\n' + marker)
        module_hashes[module_name] = hashlib.sha256(module.encode()).hexdigest()

# Preserve the upstream license while identifying this independent application.
start = source.index('/*\nFordWidget Pro Power ')
end = source.index('*/', start) + 2
license_text = (root / 'LICENSE').read_text().rstrip()
header = ('/*\nFordPassWidgets ' + version + '\n'
    'An independent FordPass vehicle widget for Scriptable.\n'
    'Derived from rushilpunu/FordWidget and markse123/FordWidget.\n'
    'Contributor credits: https://github.com/markse123/FordPassWidgets/blob/main/CREDITS.md\n'
    'Base: markse123/FordWidget commit d83436970a1051c21ecc73092eedd06035c9c50d.\n'
    'Separate account storage; per-vehicle widgets; optional Pro Power monitoring.\n'
    'Vehicle capabilities and measurement times remain explicit.\n\n' + license_text + '\n*/')
source = source[:start] + header + source[end:]
source = source.replace("const FORDWIDGET_VERSION = '0.1.11';", "const FORDWIDGET_VERSION = '" + version + "';")
source = source.replace('icon-glyph: truck;', 'icon-glyph: car;')
source = source.replace('FordWidget.ProPowerPreview.v1.', 'FordPassWidgets.v1.')
source = source.replace('FordWidget Pro Power Preview', 'FordPassWidgets')
source = source.replace('console.log(`FordWidget start', 'console.log(`FordPassWidgets start')
output = root / 'FordPassWidgets.js'
output.write_text(source)
manifest = {'version': version, 'baseRepository': 'https://github.com/markse123/FordWidget',
    'baseCommit': 'd83436970a1051c21ecc73092eedd06035c9c50d', 'baseSHA256': base_hash,
    'upstreamRepository': 'https://github.com/rushilpunu/FordWidget',
    'outputSHA256': hashlib.sha256(source.encode()).hexdigest(), 'modules': module_hashes, 'changes': changes}
(folder / 'build-manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
print('Built FordPassWidgets ' + version + '; SHA-256 ' + manifest['outputSHA256'])
