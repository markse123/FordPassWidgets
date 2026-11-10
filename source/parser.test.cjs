const fs = require('fs'), vm = require('vm'), assert = require('assert');
const source = fs.readFileSync(require('path').join(__dirname, 'pttb-v2.js'), 'utf8');
// Deliberately load only this file: no shared filter, Map or application helpers.
const parse = vm.runInNewContext(source + '\nparsePttbStatusV2;');
const approved = ["DcacEngOnMsgTxtDRq", "DcacLoFuelMsgTxtDRq", "DcacElPwDStat", "DcacOutPwDsplyMx", "DcacHwDConfg", "DcacOutETot", "DcacOut1Pw2Dsply", "DcacOut2Pw2Dsply", "DcacFaltMsgTxtD2Rq", "DcacEngOnMsgTxtD2Rq", "DcacOutScndPw2Dsply", "DcacOutScndPwDsplyMx", "DcacZone2PwBStat", "DcacZone3PwBStat", "VehElRngeL2Dsply", "RngPerChrgAvgL2Dsply", "DcacLoFuelLimLRqMnu", "DcacPwRsrvSetDStat"];
let passed = 0;
function check(label, fn) { fn(); passed++; console.log('PASS:', label); }
function payload(encoded) {
  return { vin: 'PRIVATE_VIN', states: { commands: { updatePTTBStatusCommand: {
    commandId: 'PRIVATE_COMMAND_ID', timestamp: 1794100000, message: 'PRIVATE_MESSAGE',
    value: { oemData: { vehicle_common_correlation_id: { stringValue: 'PRIVATE_CORRELATION' },
      pttbStatusDataV2: { stringValue: encoded } } }
  } } } };
}
function decoded(raw) { const result = parse(raw); return result === null ? null : JSON.parse(JSON.stringify(result)); }
function sample(signals) { return decoded(payload(JSON.stringify(signals))); }

check('standalone parser recognizes exactly the 18 reviewed numeric names', () => {
  const signals = Object.fromEntries(approved.map((key, n) => [key, n]));
  signals.UNREVIEWED_PRIVATE_FIELD = 998887776665544;
  const result = sample(signals);
  assert.equal(approved.length, 18);
  assert.deepEqual(Object.keys(result.rawSignals), approved);
  assert.deepEqual(result.rawSignals, Object.fromEntries(approved.map((key, n) => [key, n])));
  assert.deepEqual(result.rejectedSignals, []);
  assert.equal(result.recognizedSignalCount, 18);
  assert.equal(result.source, 'pttbStatusDataV2');
  assert.equal(result.units, 'unverified raw signals; no scaling applied');
  assert.equal(result.sentinels, 'unverified');
});
check('19th field name, value, metadata and correlation never enter output', () => {
  const raw = payload('{"DcacOut1Pw2Dsply":123,"PRIVATE_19TH_FIELD":998887776665544}');
  const text = JSON.stringify(parse(raw));
  for (const secret of ['PRIVATE_19TH_FIELD', '998887776665544', 'PRIVATE_VIN', 'PRIVATE_COMMAND_ID',
    'PRIVATE_MESSAGE', 'PRIVATE_CORRELATION', 'vehicle_common_correlation_id', 'timestamp', '1794100000']) assert(!text.includes(secret));
  assert.deepEqual(Object.keys(decoded(raw)), ['source', 'units', 'sentinels', 'rawSignals', 'rejectedSignals', 'recognizedSignalCount']);
});
check('unknown scalar and structured fields are entirely ignored', () => {
  const result = sample({ DcacOut1Pw2Dsply: 123, SECRET_STRING: 'PRIVATE_TEXT', SECRET_OBJECT: { token: 'PRIVATE_TOKEN' }, SECRET_ARRAY: [998887776665544] });
  assert.deepEqual(result.rawSignals, { DcacOut1Pw2Dsply: 123 });
  assert.equal(result.recognizedSignalCount, 1);
  assert(!JSON.stringify(result).includes('SECRET'));
});
check('partial payload preserves zero without invented B or totals', () => {
  const result = sample({ DcacOut1Pw2Dsply: 0 });
  assert.deepEqual(result.rawSignals, { DcacOut1Pw2Dsply: 0 });
  assert.equal(result.recognizedSignalCount, 1);
  assert.deepEqual(result.rejectedSignals, []);
  assert(!Object.prototype.hasOwnProperty.call(result.rawSignals, 'DcacOut2Pw2Dsply'));
});
check('raw sentinel-like values, fractions, signed values and energy remain unchanged', () => {
  for (const value of [0, -1, 255, 65535, 4294967295, -12.5, 123.125, Number.MAX_SAFE_INTEGER, -Number.MAX_SAFE_INTEGER]) {
    const result = sample({ DcacOut1Pw2Dsply: value, DcacOutETot: value, DcacHwDConfg: value });
    assert.deepEqual(result.rawSignals, { DcacHwDConfg: value, DcacOutETot: value, DcacOut1Pw2Dsply: value });
  }
});
check('both raw candidates stay independent with no sum or wattage conversion', () => {
  const result = sample({ DcacOut1Pw2Dsply: 120, DcacOut2Pw2Dsply: 30, DcacOutPwDsplyMx: 7200, DcacOutETot: 654321 });
  assert.deepEqual(result.rawSignals, { DcacOutPwDsplyMx: 7200, DcacOutETot: 654321, DcacOut1Pw2Dsply: 120, DcacOut2Pw2Dsply: 30 });
  assert(!JSON.stringify(result).includes('150'));
  assert(!Object.keys(result).some(key => /watts|total|capacity|mode/i.test(key)));
});
check('known numeric strings, booleans, null, arrays and objects are rejected without zero fallback', () => {
  for (const invalid of ['123', '', true, false, null, [], {}, { value: 123 }]) {
    const result = sample({ DcacOut1Pw2Dsply: invalid });
    assert.deepEqual(result.rawSignals, {});
    assert.deepEqual(result.rejectedSignals, ['DcacOut1Pw2Dsply']);
    assert.equal(result.recognizedSignalCount, 1);
  }
});
check('overflow and nonfinite JSON numbers are rejected while valid siblings survive', () => {
  for (const literal of ['9007199254740992', '-9007199254740992', '1e400', '-1e400']) {
    const result = decoded(payload('{"DcacOut1Pw2Dsply":' + literal + ',"DcacOut2Pw2Dsply":0}'));
    assert.deepEqual(result.rawSignals, { DcacOut2Pw2Dsply: 0 });
    assert.deepEqual(result.rejectedSignals, ['DcacOut1Pw2Dsply']);
    assert.equal(result.recognizedSignalCount, 2);
  }
});
check('malformed encoded JSON and non-object decoded roots return null', () => {
  for (const encoded of ['', '{BAD', 'null', '[]', '[123]', '7', 'true', '"text"', '{"DcacOut1Pw2Dsply":NaN}', '{"DcacOut1Pw2Dsply":Infinity}']) assert.equal(parse(payload(encoded)), null);
  for (const encoded of [null, 123, true, {}, []]) assert.equal(parse(payload(encoded)), null);
});
check('empty, unknown-only and case-near-match field objects do not qualify', () => {
  for (const signals of [{}, { Unknown: 123 }, { dcacOut1Pw2Dsply: 123 }, { DcacOut1Pw2DsplyExtra: 123 }]) assert.equal(sample(signals), null);
});
check('vehicleStatus wrapper is supported and an invalid own wrapper never falls back', () => {
  const raw = payload('{"DcacOut1Pw2Dsply":0}');
  assert.equal(decoded({ vehicleStatus: raw }).rawSignals.DcacOut1Pw2Dsply, 0);
  assert.equal(parse({ ...raw, vehicleStatus: null }), null);
  assert.equal(parse({ ...raw, vehicleStatus: [] }), null);
});
check('wrong commands, near-match wrappers and missing stringValue cannot qualify', () => {
  for (const wrapper of ['pttbStatusDataV2_extra', 'PTTBStatusDataV2', 'pttbStatusDataV2\n']) {
    const raw = payload('{"DcacOut1Pw2Dsply":123}');
    raw.states.commands.updatePTTBStatusCommand.value.oemData[wrapper] = raw.states.commands.updatePTTBStatusCommand.value.oemData.pttbStatusDataV2;
    delete raw.states.commands.updatePTTBStatusCommand.value.oemData.pttbStatusDataV2;
    assert.equal(parse(raw), null);
  }
  const raw = payload('{"DcacOut1Pw2Dsply":123}');
  raw.states.commands.updatePTTBStatusCommand_extra = raw.states.commands.updatePTTBStatusCommand;
  delete raw.states.commands.updatePTTBStatusCommand;
  assert.equal(parse(raw), null);
  assert.equal(parse({ metrics: payload('{"DcacOut1Pw2Dsply":123}') }), null);
});
check('all structural path links must be own properties and objects', () => {
  const path = ['states', 'commands', 'updatePTTBStatusCommand', 'value', 'oemData', 'pttbStatusDataV2', 'stringValue'];
  for (let inherited = 0; inherited < path.length; inherited++) {
    const raw = payload('{"DcacOut1Pw2Dsply":123}');
    let node = raw;
    for (let n = 0; n < inherited; n++) node = node[path[n]];
    const key = path[inherited], value = node[key];
    delete node[key]; Object.setPrototypeOf(node, { [key]: value });
    assert.equal(parse(raw), null);
  }
  for (const raw of [null, undefined, 123, true, [], 'text']) assert.equal(parse(raw), null);
});
check('prototype-looking encoded keys cannot pollute or expose unreviewed values', () => {
  const result = decoded(payload('{"__proto__":{"polluted":"PRIVATE_PROTO"},"constructor":998887776665544,"DcacOut1Pw2Dsply":0}'));
  assert.deepEqual(result.rawSignals, { DcacOut1Pw2Dsply: 0 });
  assert.equal({}.polluted, undefined);
  assert(!JSON.stringify(result).includes('PRIVATE_PROTO'));
});
check('encoded length limit applies to the original text before trimming', () => {
  const inner = '{"DcacOut1Pw2Dsply":123}';
  assert.notEqual(parse(payload(inner + ' '.repeat(32768 - inner.length))), null);
  assert.equal(parse(payload(inner + ' '.repeat(32769 - inner.length))), null);
});
console.log(passed + ' standalone PTTB-v2 parser checks passed. Offline only.');
