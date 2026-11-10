'use strict';
const assert = require('node:assert/strict');
const {test} = require('node:test');
const {load, prefs, cache, prepared, plain, TIME, VIN} = require('./scriptable.cjs');

test('model report whitelists cached evidence without copying identity, location or raw payloads', () => {
  const h = load();
  const owner = prefs({name: 'PRIVATE_NICKNAME', model: 'PRIVATE_MODEL', id: 'PRIVATE_PROFILE', accountId: 'PRIVATE_ACCOUNT',
    engineType: 'BEV', transmission: 'AUTOMATIC', features: {proPower: true},
    capabilities: {lock: 'supported', proPower: 'disabled', EXTRA_PRIVATE: 'PRIVATE_CAPABILITY'},
    tireConfiguration: {configured: true, layout: 'six', frontPsi: 60, rearPsi: 65},
    home: {lat: 42.123456, lon: -83.654321}});
  const snapshot = cache({token: 'PRIVATE_TOKEN', raw: {secret: 'PRIVATE_RAW'}, fields: {
    evSoc: {value: 0, at: TIME - 5000, fetchedAt: TIME - 1000, source: 'FordPass'},
    evRange: {value: 120.5, at: null, fetchedAt: TIME - 1000, source: 'PRIVATE_SOURCE'},
    battery: {value: 70, at: TIME - 60000, source: 'FordPass'},
    rli: {value: 62, at: TIME - 4000, source: 'FordPass'},
    chargeStatus: {value: 'IN_PROGRESS', at: TIME - 2000},
    position: {value: {lat: 42.123456, lon: -83.654321}},
    UNKNOWN_PRIVATE: {value: 'PRIVATE_FIELD'}
  }});
  const before = JSON.stringify({owner, snapshot});
  const report = plain(h.context.modelSupportReport(owner, snapshot, TIME));
  assert.equal(report.readings.evSoc.value, 0);
  assert.equal(report.readings.evSoc.sampleAgeSeconds, 5);
  assert.equal(report.readings.evRange.sampleAgeSeconds, null);
  assert.equal(report.readings.evRange.source, null);
  assert.equal(report.readings.battery.unit, '% (12V)');
  assert.equal(report.readings.evSoc.unit, '% (traction)');
  assert.equal(report.tires.layout, 'six');
  assert.equal(report.vehicle.capabilities.proPower, 'disabled');
  assert.equal(report.cachedOnly, true);
  const text = JSON.stringify(report);
  assert.ok(!text.includes('PRIVATE_'));
  assert.ok(!text.includes(VIN));
  assert.ok(!text.includes('42.123456'));
  assert.ok(!text.includes('-83.654321'));
  assert.equal(JSON.stringify({owner, snapshot}), before);
  assert.equal(h.state.requests.length, 0);
});

test('model report rejects arbitrary values and future sample times while preserving unknown', () => {
  const h = load();
  const report = plain(h.context.modelSupportReport(prefs({engineType: 'PRIVATE', transmission: 'PRIVATE',
    tireConfiguration: {configured: true, frontPsi: 1e100, rearPsi: -1}}), cache({fields: {
    evSoc: {value: 'PRIVATE_VALUE', at: TIME + 60000},
    plugStatus: {value: 'PRIVATE_ENUM', at: TIME + 1000},
    chargeStatus: {value: 'COMPLETED', at: 0}
  }}), TIME));
  assert.equal(report.vehicle.engineType, 'UNKNOWN');
  assert.equal(report.vehicle.transmission, 'UNKNOWN');
  assert.equal(report.readings.evSoc.value, null);
  assert.equal(report.readings.evSoc.sampleAgeSeconds, null);
  assert.equal(report.readings.plugStatus.value, null);
  assert.equal(report.readings.chargeStatus.sampleAgeSeconds, null);
  assert.equal(report.tires.configured, false);
  assert.equal(report.tires.frontThresholdPsi, null);
  assert.ok(!JSON.stringify(report).includes('PRIVATE'));
});

test('model report rejects a cache belonging to another vehicle or profile', () => {
  const h = load();
  assert.throws(() => h.context.modelSupportReport(prefs(), cache({vin: '1FTFW1E50JFA00002'})), /does not match/);
  assert.throws(() => h.context.modelSupportReport(prefs({id: 'one'}), cache({profileId: 'two'})), /does not match/);
  assert.equal(h.state.requests.length, 0);
});

test('support report copy refuses lease takeover after preview and sends no cloud request', async () => {
  const h = load(), app = await prepared(h);
  const current = h.api.activeVehicleProfile();
  h.context.QuickLook.present = async () => {
    h.state.files.set(app.store.lockPath, JSON.stringify({owner: 'new-owner', started: TIME, until: TIME + 90000}));
  };
  await assert.rejects(app.modelSupportReport(current), /expired|session|owner/i);
  assert.equal(h.state.clipboard.length, 0);
  assert.equal(h.state.requests.length, 0);
});

test('support report copy uses the reviewed cached snapshot only', async () => {
  const h = load(), app = await prepared(h, prefs(), cache({fields: {evSoc: {value: 41, at: TIME - 5000}}}));
  const before = JSON.stringify(app.store.read());
  h.state.choices.push('Copy report');
  await app.modelSupportReport(h.api.activeVehicleProfile());
  assert.equal(h.state.clipboard.length, 1);
  assert.equal(JSON.parse(h.state.clipboard[0]).readings.evSoc.value, 41);
  assert.equal(JSON.stringify(app.store.read()), before);
  assert.equal(h.state.requests.length, 0);
});

test('model report distinguishes effective Ford powertrain from owner configuration', () => {
  const h = load(), report = plain(h.context.modelSupportReport(prefs({engineType:'HEV', garageEngineType:'BEV'}),cache(),TIME));
  assert.equal(report.vehicle.engineType,'BEV');
  assert.equal(report.vehicle.ownerEngineType,'HEV');
  assert.equal(report.vehicle.fordEngineType,'BEV');
});

function powerCache() {
  return cache({proPower:{version:1,vin:VIN,commandAt:TIME-300000,commandState:'COMMAND_SUCCEEDED_ON_DEVICE',fetchedAt:TIME,
    latestMode:{value:'OFF',at:TIME-1000},rawSignals:{DcacOut1Pw2Dsply:1513,DcacOut2Pw2Dsply:193,DcacOutPwDsplyMx:7200,
      DcacOutScndPw2Dsply:0,DcacOutScndPwDsplyMx:0,PRIVATE_FIELD:998877}, rejectedSignals:[]}});
}

test('assembled Troubleshooting reaches cached raw and copied Pro Power details without transport',async()=>{
  for(const choice of ['View raw signals','Copy redacted report']) {
    const h=load(),app=await prepared(h,prefs({engineType:'BEV'}),powerCache()),current=h.api.activeVehicleProfile();
    const before=h.state.files.get(app.store.path),secrets=[...h.state.secrets];
    h.state.choices.push('Pro Power report',choice,...(choice==='Copy redacted report'?['Copy report']:[]),-1,-1);
    await app.troubleshooting(current);
    assert.equal(h.state.requests.length,0);assert.equal(h.state.previews.length,1);
    assert.match(h.state.previews[0],/DcacOut1Pw2Dsply/);assert.match(h.state.previews[0],/1513/);
    assert.match(h.state.previews[0],/unverified/);assert.doesNotMatch(h.state.previews[0],new RegExp(VIN+'|PRIVATE_FIELD|998877'));
    assert.equal(h.state.files.get(app.store.path),before);assert.deepEqual([...h.state.secrets],secrets);
    if(choice==='Copy redacted report') {
      const report=JSON.parse(h.state.clipboard[0]);assert.equal(report.estimates.a,null);assert.equal(report.estimates.capacity,null);
      assert.equal(report.rawSignals.DcacOut2Pw2Dsply,193);assert.equal(report.tool,'FordPassWidgets Pro Power');
    } else assert.equal(h.state.clipboard.length,0);
  }
});

test('Pro Power raw/copy preview rechecks lease and owner opt-in before clipboard changes',async()=>{
  for(const takeover of [false,true]) {
    const h=load(),app=await prepared(h,prefs(),powerCache()),current=h.api.activeVehicleProfile();
    h.context.QuickLook.present=async()=>{
      if(takeover) h.state.files.set(app.store.lockPath,JSON.stringify({owner:'new-owner',started:TIME,until:TIME+90000}));
      else {current.features.proPower=false;h.api.saveVehicleProfile(current,app.store);}
    };
    await assert.rejects(app.proPowerReport(current,true),/expired|session|owner|enabled/i);
    assert.equal(h.state.clipboard.length,0);assert.equal(h.state.requests.length,0);
  }
});
