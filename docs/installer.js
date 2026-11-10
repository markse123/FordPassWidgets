// Variables used by Scriptable.
// icon-color: blue; icon-glyph: download;
// FordPassWidgets installer. Name this script "Install FordPassWidgets".
// Review: https://github.com/markse123/FordPassWidgets
// Downloads one reviewed version; it never runs the widget or accesses Ford sign-in.
const INSTALL_VERSION = '0.0.0';
const INSTALL_SOURCE = 'https://raw.githubusercontent.com/markse123/FordPassWidgets/0000000000000000000000000000000000000000/FordPassWidgets.js';
const INSTALL_SHA256 = '0000000000000000000000000000000000000000000000000000000000000000';
class InstallerError extends Error {}

// SHA-256 over bytes, using only JavaScript and Scriptable's documented Data API.
function installerSHA256(input) {
  const k = [0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,
    0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,
    0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,
    0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,
    0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,
    0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,
    0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,
    0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2];
  const h = [0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19];
  const bytes = Array.from(input), bits = bytes.length * 8;
  bytes.push(0x80);
  while (bytes.length % 64 !== 56) bytes.push(0);
  const high = Math.floor(bits / 0x100000000), low = bits >>> 0;
  for (const word of [high, low]) for (let shift = 24; shift >= 0; shift -= 8) bytes.push((word >>> shift) & 255);
  const rotr = (value, count) => (value >>> count) | (value << (32 - count));
  for (let offset = 0; offset < bytes.length; offset += 64) {
    const w = new Array(64);
    for (let i = 0; i < 16; i++) w[i] = (bytes[offset+i*4]<<24) | (bytes[offset+i*4+1]<<16) | (bytes[offset+i*4+2]<<8) | bytes[offset+i*4+3];
    for (let i = 16; i < 64; i++) {
      const x = w[i-15], y = w[i-2];
      w[i] = (w[i-16] + (rotr(x,7)^rotr(x,18)^(x>>>3)) + w[i-7] + (rotr(y,17)^rotr(y,19)^(y>>>10))) | 0;
    }
    let [a,b,c,d,e,f,g,j] = h;
    for (let i = 0; i < 64; i++) {
      const t1 = (j + (rotr(e,6)^rotr(e,11)^rotr(e,25)) + ((e&f)^(~e&g)) + k[i] + w[i]) | 0;
      const t2 = ((rotr(a,2)^rotr(a,13)^rotr(a,22)) + ((a&b)^(a&c)^(b&c))) | 0;
      j=g; g=f; f=e; e=(d+t1)|0; d=c; c=b; b=a; a=(t1+t2)|0;
    }
    for (const [index, word] of [a,b,c,d,e,f,g,j].entries()) h[index] = (h[index] + word) | 0;
  }
  return h.map(word => (word >>> 0).toString(16).padStart(8, '0')).join('');
}
function installerVersionParts(value) {
  if (typeof value !== 'string' || value.length > 64) return null;
  const match = value.match(/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/);
  return match ? match.slice(1) : null;
}
function installerVersion(code) {
  if (typeof code !== 'string') return null;
  const start = code.indexOf('/*');
  if (start < 0 || !/^(?:[ \t]*(?:\/\/[^\r\n]*)?\r?\n)*[ \t]*$/.test(code.slice(0, start))) return null;
  const match = code.slice(start).match(/^\/\*[ \t]*\r?\nFordPassWidgets ([^\r\n]*)\r?\n/);
  const labels = code.match(/^FordPassWidgets [^\r\n]*\r?$/gm) || [];
  if (!match || labels.length !== 1 || !installerVersionParts(match[1])) return null;
  const runtimeLines = code.match(/^const FORDWIDGET_VERSION[^\r\n]*\r?$/gm) || [];
  if (runtimeLines.length && (runtimeLines.length !== 1 || runtimeLines[0].replace(/\r$/, '') !== "const FORDWIDGET_VERSION = '" + match[1] + "';")) return null;
  return match[1];
}
function installerCompareVersions(current, next) {
  const a = installerVersionParts(current), b = installerVersionParts(next);
  if (!a || !b) throw new InstallerError('The script or installer version could not be verified. Copy a reviewed installer and try again.');
  for (let i = 0; i < 3; i++) {
    // Compare decimal strings so large version components never lose precision.
    if (a[i].length !== b[i].length) return a[i].length > b[i].length ? 1 : -1;
    if (a[i] !== b[i]) return a[i] > b[i] ? 1 : -1;
  }
  return 0;
}
function installerFork(code) {
  return !!installerVersion(code) &&
    code.includes('FordPassWidgets.v1.') && code.includes('class AppController');
}
async function installerMessage(title, text) {
  const alert = new Alert(); alert.title = title; alert.message = text; alert.addAction('OK'); await alert.presentAlert();
}
async function installFordWidget() {
  if (!config.runsInApp || config.runsInWidget) {
    await installerMessage('Open Scriptable', 'Run this installer inside the Scriptable app.'); return;
  }
  if (!installerVersionParts(INSTALL_VERSION) || !/^https:\/\/raw\.githubusercontent\.com\/markse123\/FordPassWidgets\/[a-f0-9]{40}\/FordPassWidgets\.js$/.test(INSTALL_SOURCE) || !/^[a-f0-9]{64}$/.test(INSTALL_SHA256))
    throw new InstallerError('This installer has invalid release information. Copy the reviewed installer and try again.');
  const storage = new Alert(); storage.title = 'Install FordPassWidgets';
  storage.message = 'Choose where you keep your Scriptable scripts.';
  storage.addAction('iCloud Drive'); storage.addAction('On My iPhone'); storage.addCancelAction('Cancel');
  const storageChoice = await storage.presentAlert(); if (storageChoice < 0) return;
  const fm = storageChoice === 0 ? FileManager.iCloud() : FileManager.local();
  const directory = fm.documentsDirectory();
  const mode = new Alert(); mode.title = 'Install or update?';
  mode.message = 'Updating keeps the existing script name, so your widgets stay connected.';
  mode.addAction('New installation'); mode.addAction('Update an existing script'); mode.addCancelAction('Cancel');
  const selected = await mode.presentAlert(); if (selected < 0) return;
  const update = selected === 1;
  const naming = new Alert(); naming.title = update ? 'Existing script name' : 'New widget name';
  naming.message = update ? 'Enter the exact name of your current FordPassWidgets script. Custom names are supported.' : 'Keep this separate from the installer, FordWidget and FordWidget Pro Power.';
  naming.addTextField('Script name', 'FordPassWidgets');
  naming.addAction('Continue'); naming.addCancelAction('Cancel');
  if (await naming.presentAlert() < 0) return;
  const name = naming.textFieldValue(0).trim().replace(/\.js$/i, '');
  if (!name || name.length > 120 || /[\\/\x00-\x1f\x7f]/.test(name) || /^\.+$/.test(name))
    throw new InstallerError('Use a script name without folders or special path characters.');
  const path = fm.joinPath(directory, name + '.js');
  let previous = null;
  if (fm.fileExists(path)) {
    await fm.downloadFileFromiCloud(path);
    previous = fm.readString(path);
    if (!installerFork(previous)) throw new InstallerError('That name belongs to another script. Choose your existing FordPassWidgets script or a new name.');
    if (installerCompareVersions(installerVersion(previous), INSTALL_VERSION) > 0)
      throw new InstallerError('Your script is newer than this installer. Get the latest installer before updating.');
    const replace = new Alert(); replace.title = 'Replace ' + name + '?';
    replace.message = 'Install v' + INSTALL_VERSION + ' under this same name. Your current code will be backed up first. Sign-in, settings and vehicle data are kept.';
    replace.addDestructiveAction('Back up and replace'); replace.addCancelAction('Cancel');
    if (await replace.presentAlert() < 0) return;
  } else if (update) throw new InstallerError('That script was not found in the selected storage. Check its name and storage, then try again.');

  const request = new Request(INSTALL_SOURCE); request.timeoutInterval = 25;
  const data = await request.load();
  if (!request.response || request.response.statusCode !== 200 || !data) throw new InstallerError('The script could not be downloaded. Try again later.');
  const bytes = data.getBytes();
  if (bytes.length > 1000000 || installerSHA256(bytes) !== INSTALL_SHA256) throw new InstallerError('The download did not match the reviewed version. Your script was not replaced.');
  const code = data.toRawString();
  if (!installerFork(code) || installerVersion(code) !== INSTALL_VERSION) throw new InstallerError('The downloaded script version did not match this installer. Your script was not replaced.');
  // Recheck after the network wait so an intervening edit is not overwritten.
  if (fm.fileExists(path)) {
    await fm.downloadFileFromiCloud(path);
    if (previous === null || fm.readString(path) !== previous) throw new InstallerError('The existing script changed during installation. Try again after finishing your edits.');
  } else if (previous !== null) throw new InstallerError('The existing script moved during installation. Check its name and try again.');
  const suffix = UUID.string(), staged = path + '.install-' + suffix + '.tmp';
  const backup = path + '.backup-' + suffix, displaced = path + '.displaced-' + suffix;
  if (fm.fileExists(staged) || fm.fileExists(backup) || fm.fileExists(displaced)) throw new InstallerError('A recovery file already exists. Run the installer again.');
  let backedUp = false, displacedOriginal = false;
  const recoveryMessage = () => 'Installation did not finish. Your previous code is saved as ' + name + '.js.backup-' + suffix +
    ' in the selected Scriptable folder.' + (displacedOriginal ? '\nThe file moved during this update is also saved as ' + name + '.js.displaced-' + suffix + '.' : '') +
    '\nAny file now at the widget name was kept. Review the saved files before restoring either one.';
  try {
    if (previous !== null) {
      // copy refuses an existing destination; move would overwrite it.
      fm.copy(path, backup);
      if (fm.readString(backup) !== previous) throw new InstallerError('The backup did not match the selected script.');
      backedUp = true;
    }
    fm.writeString(staged, code);
    if (fm.readString(staged) !== code) throw new InstallerError('The downloaded script could not be saved.');
    if (previous !== null) {
      if (!fm.fileExists(path) || fm.readString(path) !== previous) throw new InstallerError('The existing script changed during installation.');
      // Preserve the actual file atomically: it may change after our read.
      fm.move(path, displaced); displacedOriginal = true;
      if (fm.readString(displaced) !== previous) throw new InstallerError('The existing script changed during installation.');
    }
    // Do not clobber a file created after the final check or original removal.
    fm.copy(staged, path);
    if (fm.readString(path) !== code) throw new InstallerError('The saved script could not be verified.');
  } catch (_) {
    // Never unlink the user-named target, even after a matching read. An
    // intervening edit can happen between that read and a destructive removal.
    if (backedUp) {
      try {
        const restore = displacedOriginal ? displaced : backup, contents = fm.readString(restore);
        if (!fm.fileExists(path)) fm.copy(restore, path);
        if (fm.readString(path) !== contents) throw new InstallerError('The widget name now belongs to another file.');
        if (contents !== previous) throw new InstallerError('The changed file was restored; review the saved copies.');
      } catch (__) { throw new InstallerError(recoveryMessage()); }
      throw new InstallerError('Installation did not finish. Your previous script was restored.');
    }
    throw new InstallerError(previous === null ? 'Installation did not finish. Any file now at that name was kept. Check it or choose another name before trying again.' :
      'Installation did not finish. The existing script was kept. Check your storage and try again.');
  } finally {
    try { if (fm.fileExists(staged)) fm.remove(staged); } catch (_) { /* A leftover staging file is not an executable script. */ }
  }
  await installerMessage('FordPassWidgets installed', 'v' + INSTALL_VERSION + ' is saved as ' + name + '. Return to your script list and run it to finish setup.' +
    (backedUp ? '\n\nA backup of the old code is in the selected Scriptable folder.' : '') + '\n\nYou may delete this installer afterward.');
}

// Installer entry. The downloaded widget is never executed by this script.
try { await installFordWidget(); }
catch (_) { await installerMessage('Installation could not finish', _ instanceof InstallerError ? _.message : 'Check your connection and selected storage, then try again.'); }
Script.complete();
