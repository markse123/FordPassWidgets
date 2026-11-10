'use strict';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const assert = require('node:assert/strict');
const {load, TIME, VIN, plain} = require('./scriptable.cjs');
const VIN2 = '1FTFW1E50JFA00002';
function fixture() {
  const dir = path.join(__dirname, '../source');
  let source = fs.readFileSync(path.join(dir, 'fordwidget-base.js'), 'utf8');
  for (const {label,before,after} of JSON.parse(fs.readFileSync(path.join(dir, 'profile-patches.json'))).patches) {
    assert.equal(source.split(before).length - 1, 1, label); source = source.replace(before, after);
  }
  const names = ['readVehicleRegistry','activeVehicleProfile','bindVehicleProfile','addVehicleProfile','saveVehicleProfile','setDefaultVehicle',
    'vehicleBindingCurrent','vehicleParameter','capabilityState','proPowerEnabled','engineControlAllowed','vehicleCommandAllowed',
    'parseGarageVehicles','beginAccountSession','completeAccountSession','authorizeGarageVehicles','endAccountSession','validateManualVehicle'];
  source = source.replace('function selfTest() {', fs.readFileSync(path.join(dir, 'vehicle-profiles.js'),'utf8') +
    '\nglobalThis.ProfileTests={' + names.join(',') + '};\nfunction selfTest() {');
  const h = load(source); Object.assign(h.api, h.context.ProfileTests); return h;
}
async function account(h, vehicles = [{vin:VIN,profile:{name:'Synthetic one',engineType:'HEV',transmission:'AUTOMATIC'}}]) {
  const a = h.api; a.bindVehicleProfile(null); const store = new a.LocalStore(); await store.acquire();
  a.beginAccountSession(store); a.secretSet('token.mobile',{access:'synthetic-cat',expires:TIME+3600000});
  a.secretSet('token.autonomic',{access:'synthetic-tmc',expires:TIME+3600000});
  a.completeAccountSession(store); const profiles = a.authorizeGarageVehicles(vehicles,store); store.release(); return profiles;
}
async function selected(h,id) {
  const a=h.api; a.bindVehicleProfile(id); const store=new a.LocalStore(); await store.acquire();
  return {store,prefs:a.activeVehicleProfile(),auth:new a.FordAuthManager(store)};
}
function empty(vin=VIN) { return {version:1,vin,fields:{}}; }

test('garage parser is bounded, own-property based and does not infer powertrain from model names',()=>{
  const {api:a}=fixture();
  const raw={userVehicles:{vehicleDetails:[{vin:VIN,profile:{model:'Mustang Mach-E',engineType:'electric',transmission:'automatic'}},{VIN:VIN2,profile:{engineType:'BEV'}},{vin:VIN}]}};
  const cars=a.parseGarageVehicles(raw); assert.equal(cars.length,2); assert.equal(cars[0].engineType,'UNKNOWN'); assert.equal(cars[0].transmission,'UNKNOWN'); assert.equal(cars[1].engineType,'BEV');
  assert.equal(a.parseGarageVehicles(Object.create({vehicles:[{vin:VIN}]})).length,0);
  assert.equal(a.parseGarageVehicles({vehicles:[{vin:VIN,profile:{engineType:'ICE'}}]})[0].engineType,'ICE');
});
test('new garage profiles have stable opaque IDs, disabled controls and disabled alerts',async()=>{
  const h=fixture(), a=h.api, [p]=await account(h); assert.match(p.id,/^[a-f0-9]{32}$/); assert.ok(!p.id.includes(VIN));
  assert.deepEqual(Object.values(plain(p.compatibility.commands)),[false,false,false,false,false]);
  assert.equal(p.features.proPower,false); assert.ok(Object.values(p.alerts.enabled).every(v=>v===false));
  const s=await selected(h,p.id); assert.equal(a.vehicleCommandAllowed(s.prefs,'lock'),false); assert.equal(a.engineControlAllowed(s.prefs),false); s.store.release();
});
test('source-verified garage capability states and equipment metadata stay separate from owner permissions',async()=>{
  const h=fixture(),a=h.api,[p]=await account(h,[{vin:VIN,nickName:'Synthetic garage label',profile:{engineType:'PHEV',numberOfTires:'6',proPowerWattage:'7200',supportsStatusRefresh:true,year:2026},capabilities:{remoteLock:'Display',remoteStart:'DisplayDisabled',proPowerOnBoard:'NoDisplay',vehicleChargingStatusExtended:'Display'}}]);
  assert.equal(p.name,'Synthetic garage label'); assert.equal(p.numberOfTires,6); assert.equal(p.proPowerWattage,7200);
  assert.equal(p.capabilities.lock,'supported'); assert.equal(p.capabilities.unlock,'supported'); assert.equal(p.capabilities.engineControl,'disabled');
  assert.equal(p.capabilities.proPower,'unsupported'); assert.equal(p.capabilities.evCharge,'supported'); assert.equal(p.capabilities.refresh,'supported');
  const s=await selected(h,p.id); const next={...s.prefs,capabilities:{proPower:'supported',engineControl:'supported'},features:{proPower:true,engineControl:true},transmission:'AUTOMATIC'};
  next.compatibility.commands.start=true; a.saveVehicleProfile(next,s.store);
  assert.equal(a.proPowerEnabled(next),false); assert.equal(a.vehicleCommandAllowed(next,'start'),false); assert.equal(a.vehicleCommandAllowed(next,'lock'),false); s.store.release();
  const unknown=a.parseGarageVehicles([{vin:VIN,profile:{numberOfTires:'99',proPowerWattage:'7200W'},capabilities:{remoteLock:'display'}}])[0];
  assert.equal(unknown.numberOfTires,null); assert.equal(unknown.proPowerWattage,null); assert.equal(unknown.capabilities.lock,'unknown');
});
test('cache, photos and cooldowns remain isolated while account tokens and gates are shared',async()=>{
  const h=fixture(), a=h.api, profiles=await account(h,[{vin:VIN},{vin:VIN2}]);
  let s=await selected(h,profiles[0].id); s.store.write({...empty(),commandAfter:TIME+30000});
  a.secretSet('gate.telemetry.mobile',{next:TIME+60000,failures:1}); a.secretSet('official',{clientId:'synthetic-one'});
  const onePath=s.store.path,photo=s.store.imagePath(VIN,false); assert.ok(!onePath.includes(VIN)); assert.ok(!photo.includes(VIN)); s.store.release();
  s=await selected(h,profiles[1].id); assert.equal(s.store.read(),null); assert.equal(a.secretGet('token.mobile').access,'synthetic-cat');
  assert.equal(a.secretGet('gate.telemetry.mobile').failures,1); assert.equal(a.secretGet('official'),null);
  s.store.write(empty(VIN2)); assert.notEqual(s.store.path,onePath); assert.equal(s.store.read().commandAfter,undefined); s.store.release();
  s=await selected(h,profiles[0].id); assert.equal(s.store.read().commandAfter,TIME+30000); assert.equal(a.secretGet('official').clientId,'synthetic-one'); s.store.release();
  assert.ok([...h.state.secrets.keys()].every(k=>k.startsWith('FordPassWidgets.v1.')));
});
test('browsing leaves the default unchanged and explicit unknown selectors never fall back',async()=>{
  const h=fixture(),a=h.api,[p,q]=await account(h,[{vin:VIN},{vin:VIN2}]);
  await selected(h,q.id).then(s=>s.store.release()); assert.equal(a.readVehicleRegistry().defaultVehicleId,p.id);
  assert.throws(()=>a.bindVehicleProfile('f'.repeat(32)),/not authorized/);
  const parsed=a.vehicleParameter('metric,vehicle='+q.id+' tires'); assert.equal(parsed.profileId,q.id); assert.equal(parsed.parameter,'metric tires');
  assert.equal(a.vehicleParameter('vehicle='+p.id+' vehicle='+q.id).invalid,true); assert.equal(a.vehicleParameter('vehicle='+VIN).invalid,true);
  const s=await selected(h,q.id); const url=new a.WidgetRenderer(s.prefs,s.store.read()).url('lock'); assert.ok(url.includes('vehicle='+q.id)); assert.ok(!url.includes(VIN2)); s.store.release();
});
test('vehicle selectors share widget delimiters and malformed reserved forms fail closed',()=>{
  const {api:a}=fixture(),id='a'.repeat(32);
  for(const input of ['vehicle','vehicle ='+id,'vehicle = '+id,'vehicle=','vehicle:'+VIN,'vehicle=='+id,'vehicle;'+id,'vehicle='+id+';vehicle='+id,'vehicle vehicle='+id])
    assert.equal(a.vehicleParameter(input).invalid,true,input);
  for(const input of ['vehicle='+id,'metric;vehicle='+id+';tires','metric,vehicle='+id+' tires']){
    const parsed=a.vehicleParameter(input);assert.equal(parsed.invalid,false,input);assert.equal(parsed.profileId,id,input);
    assert.ok(!parsed.parameter.includes('vehicle'),input);
  }
  assert.equal(a.vehicleParameter('metric;tires').parameter,'metric tires');
  assert.equal(a.vehicleParameter('metric;tires').invalid,false);
});
test('manual fallback cannot write telemetry or control before a matching passive response verifies the VIN',async()=>{
  const h=fixture(),a=h.api; await account(h,[]); a.bindVehicleProfile(null); let store=new a.LocalStore(); await store.acquire();
  const p=a.addVehicleProfile({vin:VIN,authorizedSession:a.readVehicleRegistry().account.session},store); store.release(); assert.equal(p.authorizedSession,null);
  assert.throws(()=>a.bindVehicleProfile(p.id),/not authorized/); a.bindVehicleProfile(p.id,null,{allowUnauthorized:true}); store=new a.LocalStore(); await store.acquire();
  assert.throws(()=>store.write(empty()),/authorized vehicle/); const auth=new a.FordAuthManager(store);
  await assert.rejects(auth.request('commands','https://api.autonomic.ai/v1/command/vehicles/'+VIN+'/commands','POST',{}),/passive VIN/); assert.equal(h.state.requests.length,0);
  assert.throws(()=>a.validateManualVehicle(p.id,{metrics:{}},store),/explicitly verify/);
  assert.throws(()=>a.validateManualVehicle(p.id,{vin:VIN,vehicleStatus:{vin:VIN2,metrics:{}}},store),/did not match/);
  const verified=a.validateManualVehicle(p.id,{vin:VIN,metrics:{}},store); assert.equal(verified.authorizedSession,a.readVehicleRegistry().account.session);
  store.write(empty()); assert.equal(store.read().vin,VIN); store.release();
});
test('reconnect invalidates old bindings and cached display; garage membership restores the same profile ID',async()=>{
  const h=fixture(),a=h.api,[p]=await account(h); let s=await selected(h,p.id); s.store.write(empty()); const stale=s; s.store.release();
  a.bindVehicleProfile(null); const accountStore=new a.LocalStore(); await accountStore.acquire(); a.beginAccountSession(accountStore);
  assert.equal(a.activeVehicleProfile(),null); assert.equal(a.secretGet('token.mobile'),null); assert.equal(stale.store.read(),null);
  assert.throws(()=>a.bindVehicleProfile(p.id),/not authorized/);
  a.secretSet('token.mobile',{access:'synthetic-new',expires:TIME+3600000}); a.completeAccountSession(accountStore);
  const restored=a.authorizeGarageVehicles([{vin:VIN}],accountStore); assert.equal(restored[0].id,p.id); accountStore.release();
  s=await selected(h,p.id); assert.equal(s.store.read().vin,VIN); s.store.release();
});
test('another account garage never authorizes an old absent VIN or falls back to its cache',async()=>{
  const h=fixture(),a=h.api,[p]=await account(h); let s=await selected(h,p.id); s.store.write(empty()); s.store.release();
  a.bindVehicleProfile(null); const store=new a.LocalStore(); await store.acquire(); a.beginAccountSession(store);
  a.secretSet('token.mobile',{access:'synthetic-other',expires:TIME+3600000}); a.completeAccountSession(store); const [other]=a.authorizeGarageVehicles([{vin:VIN2}],store);
  assert.notEqual(other.id,p.id); assert.equal(a.readVehicleRegistry().profiles.find(x=>x.id===p.id).authorizedSession,null); store.release();
  assert.throws(()=>a.bindVehicleProfile(p.id),/not authorized/);
});
test('backend permission checks use latest saved preferences, with BEV/manual/unknown-transmission engine blocks',async()=>{
  const h=fixture(),a=h.api,[p]=await account(h); const s=await selected(h,p.id),prefs=s.prefs;
  prefs.features={proPower:true,engineControl:true}; prefs.compatibility.commands={lock:true,unlock:true,start:true,stop:true,refresh:true}; a.saveVehicleProfile(prefs,s.store);
  assert.equal(a.engineControlAllowed(prefs),true); assert.equal(a.proPowerEnabled(prefs),true); assert.equal(a.vehicleCommandAllowed(prefs,'start'),true);
  for(const change of [{engineType:'BEV'},{engineType:'HEV',transmission:'MANUAL'},{transmission:'UNKNOWN'}]){
    const next={...a.activeVehicleProfile(),...change};a.saveVehicleProfile(next,s.store);assert.equal(a.engineControlAllowed(prefs),false);
  }
  let next=a.activeVehicleProfile(); next.capabilities.proPower='disabled'; a.saveVehicleProfile(next,s.store); assert.equal(a.proPowerEnabled(prefs),false);
  next=a.activeVehicleProfile(); next.compatibility.commands.lock=false;a.saveVehicleProfile(next,s.store);assert.equal(a.vehicleCommandAllowed(prefs,'lock'),false);s.store.release();
});
test('owner preferences cannot erase garage BEV or manual-transmission engine restrictions',async()=>{
  for(const metadata of [{engineType:'BEV',transmission:'AUTOMATIC'},{engineType:'ICE',transmission:'MANUAL'}]){
    const h=fixture(),a=h.api,[p]=await account(h,[{vin:VIN,profile:metadata}]); const s=await selected(h,p.id);
    const edited={...s.prefs,engineType:'ICE',transmission:'AUTOMATIC',garageEngineType:'ICE',garageTransmission:'AUTOMATIC',features:{engineControl:true}};
    edited.compatibility.commands.start=true; a.saveVehicleProfile(edited,s.store);
    assert.equal(a.engineControlAllowed(edited),false); assert.equal(a.vehicleCommandAllowed(edited,'start'),false);
    const saved=a.activeVehicleProfile(); assert.equal(saved.garageEngineType,metadata.engineType); assert.equal(saved.garageTransmission,metadata.transmission); s.store.release();
  }
});
test('wrong VIN/account cache is rejected and profile identity cannot be edited',async()=>{
  const h=fixture(),a=h.api,[p]=await account(h); const s=await selected(h,p.id);
  assert.throws(()=>s.store.write(empty(VIN2)),/does not match/); assert.throws(()=>a.saveVehicleProfile({...s.prefs,vin:VIN2},s.store),/changed|identity/);
  h.state.files.set(s.store.path,JSON.stringify({...empty(VIN2),profileId:p.id,accountId:p.accountId})); assert.equal(s.store.read(),null); s.store.release();
});
test('known transport scopes reject other VINs and methods before any request',async()=>{
  const h=fixture(),a=h.api,[p]=await account(h);const s=await selected(h,p.id);
  for(const [name,url,method] of [
    ['telemetry.mobile',a.SETTINGS.autonomic+'/telemetry/sources/fordpass/vehicles/'+VIN2,'GET'],
    ['commands',a.SETTINGS.autonomic+'/command/vehicles/'+VIN2+'/commands','POST'],
    ['telemetry.proPower','https://api.autonomic.ai/v1beta/telemetry/sources/fordpass/vehicles/'+VIN2+':query','POST'],
    ['commands.proPower','https://api.autonomic.ai/v1beta/command/vehicles/'+VIN+'/commands','GET']
  ]) await assert.rejects(s.auth.request(name,url,method),/bound vehicle route/);
  assert.equal(h.state.requests.length,0);s.store.release();
});
test('vehicle client constructor rejects mismatched profile, account, VIN and auth store',async()=>{
  const h=fixture(),a=h.api,[p]=await account(h);const s=await selected(h,p.id);
  for(const changed of [{id:'f'.repeat(32)},{vin:VIN2},{accountId:'e'.repeat(32)},{authorizedSession:'d'.repeat(32)}])
    assert.throws(()=>new a.FordAPIClient(s.auth,s.store,{...s.prefs,...changed}),/does not match/);
  assert.throws(()=>new a.FordAPIClient({store:{}},s.store,s.prefs),/does not match/);
  assert.ok(new a.FordAPIClient(s.auth,s.store,s.prefs)); assert.equal(h.state.requests.length,0);s.store.release();
});
test('late HTTP response from a replaced account cannot mutate shared gates or new credentials',async()=>{
  const h=fixture(),a=h.api,[p]=await account(h); const s=await selected(h,p.id); let successor;
  h.state.responses.push(async()=>{
    s.store.release(); a.bindVehicleProfile(null); successor=new a.LocalStore(); await successor.acquire(); a.beginAccountSession(successor);
    a.secretSet('token.mobile',{access:'synthetic-replacement',expires:TIME+3600000}); a.completeAccountSession(successor);
    a.secretSet('gate.telemetry.mobile',{failures:8,next:TIME+999999}); return {status:200,body:{vin:VIN,metrics:{}}};
  });
  await assert.rejects(s.auth.request('telemetry.mobile',a.SETTINGS.autonomic+'/telemetry/sources/fordpass/vehicles/'+VIN),/binding changed|session expired/);
  assert.equal(a.secretGet('gate.telemetry.mobile').failures,8); assert.equal(a.secretGet('token.mobile').access,'synthetic-replacement'); successor.release();
});
test('valid background leases can update auth gates without permitting registry changes',async()=>{
  const h=fixture(),a=h.api,[p]=await account(h); const s=await selected(h,p.id); s.store.write(empty()); s.store.release();
  h.config.runsInApp=false;h.config.runsInWidget=true; const store=new a.LocalStore(); assert.equal(store.acquireBackground(),true);
  a.secretSet('gate.telemetry.mobile',{next:TIME-1,failures:1}); h.state.responses.push({body:{vin:VIN,metrics:{}}});
  const auth=new a.FordAuthManager(store); await auth.request('telemetry.mobile',a.SETTINGS.autonomic+'/telemetry/sources/fordpass/vehicles/'+VIN);
  assert.equal(a.secretGet('gate.telemetry.mobile'),null); assert.throws(()=>a.setDefaultVehicle(p.id,store),/app|foreground/i); store.release();
});
test('malformed garage envelopes do not silently revoke valid authorizations',async()=>{
  const h=fixture(),a=h.api,[p]=await account(h); a.bindVehicleProfile(null); const store=new a.LocalStore(); await store.acquire();
  assert.throws(()=>a.authorizeGarageVehicles({unexpected:[{vin:VIN}]},store),/not recognized/);
  assert.equal(a.readVehicleRegistry().profiles.find(x=>x.id===p.id).authorizedSession,a.readVehicleRegistry().account.session); store.release();
});
test('base offline self-test remains valid without an account or a vehicle',()=>{const h=fixture();h.api.selfTest();assert.equal(h.state.requests.length,0);});
