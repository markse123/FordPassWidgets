'use strict';
const copyButton = document.getElementById('copy-installer');
const installerCode = document.getElementById('installer-code');
const installerDetails = document.getElementById('installer-details');
const feedback = document.getElementById('copy-feedback');
let installer = '';

// Preload before the tap so Safari's clipboard write stays within the gesture.
async function loadInstaller() {
  try {
    const response = await fetch('installer.js', {cache: 'no-store'});
    if (!response.ok) throw new Error('Installer unavailable');
    const text = await response.text();
    if (!text.includes('FordPassWidgets installer') || text.length > 60000) throw new Error('Installer unavailable');
    installer = text;
    installerCode.value = text;
    copyButton.disabled = false;
    copyButton.textContent = 'Copy installer script ↓';
  } catch (_) {
    copyButton.textContent = 'Installer unavailable';
    installerCode.placeholder = 'Use Open installer source above, or the manual installation guide.';
    feedback.textContent = 'Couldn’t load the installer. Open its source or use the manual guide below.';
  }
}
copyButton.addEventListener('click', async () => {
  if (!installer) return;
  try {
    if (!navigator.clipboard || !navigator.clipboard.writeText) throw new Error('Clipboard unavailable');
    await navigator.clipboard.writeText(installer);
    copyButton.textContent = 'Installer copied ✓';
    feedback.textContent = 'Paste into a new Scriptable script, then run it.';
  } catch (_) {
    installerDetails.open = true;
    installerCode.focus();
    installerCode.select();
    feedback.textContent = 'Copy the selected installer code manually, then paste it in Scriptable.';
  }
});
loadInstaller();
