// Portable data parser only. These exact names were reviewed by the user.
// Units, scale factors, enum meanings and sentinel codes remain unverified.
function parsePttbStatusV2(raw) {
  const allowed = [
    'DcacEngOnMsgTxtDRq', 'DcacLoFuelMsgTxtDRq', 'DcacElPwDStat',
    'DcacOutPwDsplyMx', 'DcacHwDConfg', 'DcacOutETot',
    'DcacOut1Pw2Dsply', 'DcacOut2Pw2Dsply', 'DcacFaltMsgTxtD2Rq',
    'DcacEngOnMsgTxtD2Rq', 'DcacOutScndPw2Dsply', 'DcacOutScndPwDsplyMx',
    'DcacZone2PwBStat', 'DcacZone3PwBStat', 'VehElRngeL2Dsply',
    'RngPerChrgAvgL2Dsply', 'DcacLoFuelLimLRqMnu', 'DcacPwRsrvSetDStat'
  ];
  const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
  const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
  const child = (value, key) => record(value) && own(value, key) ? value[key] : undefined;
  if (!record(raw)) return null;
  const root = own(raw, 'vehicleStatus') ? raw.vehicleStatus : raw;
  const command = child(child(child(root, 'states'), 'commands'), 'updatePTTBStatusCommand');
  const oem = child(child(command, 'value'), 'oemData');
  const encoded = child(child(oem, 'pttbStatusDataV2'), 'stringValue');
  if (typeof encoded !== 'string' || encoded.length > 32768) return null;
  let decoded;
  try { decoded = JSON.parse(encoded); } catch (_) { return null; }
  if (!record(decoded)) return null;

  const rawSignals = Object.create(null);
  const rejectedSignals = [];
  let recognizedSignalCount = 0;
  for (const key of allowed) {
    if (!own(decoded, key)) continue;
    recognizedSignalCount += 1;
    const value = decoded[key];
    if (typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= Number.MAX_SAFE_INTEGER) rawSignals[key] = value;
    else rejectedSignals.push(key);
  }
  if (!recognizedSignalCount) return null;
  return {
    source: 'pttbStatusDataV2',
    units: 'unverified raw signals; no scaling applied',
    sentinels: 'unverified',
    rawSignals,
    rejectedSignals,
    recognizedSignalCount
  };
}
