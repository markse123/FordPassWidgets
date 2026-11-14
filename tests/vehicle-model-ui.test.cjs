'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const {load, TIME, VIN, plain} = require('./scriptable.cjs');

function fixture() {
  const folder = path.join(__dirname, '../source');
  let source = fs.readFileSync(path.join(folder, 'fordwidget-base.js'), 'utf8');
  for (const name of ['profile', 'telemetry', 'model-ui']) {
    for (const patch of JSON.parse(fs.readFileSync(path.join(folder, name + '-patches.json'), 'utf8')).patches) {
      assert.equal(source.split(patch.before).length - 1, 1, patch.label);
      source = source.replace(patch.before, patch.after);
    }
    const module = {'profile':'vehicle-profiles.js','telemetry':'vehicle-telemetry.js','model-ui':'vehicle-model-ui.js'}[name];
    source = source.replace('function selfTest() {', fs.readFileSync(path.join(folder, module), 'utf8') + '\nfunction selfTest() {');
  }
  const names = ['beginAccountSession','completeAccountSession','authorizeGarageVehicles','bindVehicleProfile','activeVehicleProfile',
    'saveVehicleProfile','modelTireKeys','modelTireConfiguration','modelPressureInput','modelPressureMaximum','modelMetricKeys','modelMissingTires','alertSettings',
    'modelProPowerEstimate','modelProPowerReport','ppoDetailsText','ppoEstimated','ppoRedactedReport'];
  source = source.replace('function selfTest() {', 'globalThis.ModelTests={' + names.join(',') + '};\nfunction selfTest() {');
  const h = load(source); Object.assign(h.api, h.context.ModelTests); return h;
}
async function setup(extra = {}) {
  const h = fixture(), a = h.api;
  a.bindVehicleProfile(null); let store = new a.LocalStore(); await store.acquire();
  a.beginAccountSession(store); a.secretSet('token.mobile', {access:'synthetic-access',expires:TIME+3600000});
  a.completeAccountSession(store);
  const [profile] = a.authorizeGarageVehicles([{vin:VIN,profile:{name:'Synthetic vehicle',model:'Synthetic model',
    engineType:extra.engineType||'HEV',transmission:extra.transmission||'AUTOMATIC'}}], store);
  store.release(); a.bindVehicleProfile(profile.id); store = new a.LocalStore(); await store.acquire();
  const prefs = Object.assign(a.activeVehicleProfile(), {imageMode:'off',night:{enabled:false}}, extra);
  a.saveVehicleProfile(prefs,store);
  return {h,a,store,prefs};
}
function snapshot(extra = {}) {
  const fields = {};
  for (const [key,value] of Object.entries({fuel:63,range:304,battery:58,batteryHealth:'GOOD',oil:72,odometer:32123,
    fl:35,fr:36,rl:35,rr:36,rli:61,rlo:62,rri:63,rro:64,lock:'Locked',doors:'Closed',outsideTemp:20,
    evSoc:82,evRange:140,plugStatus:'CONNECTED',chargeStatus:'IN_PROGRESS',chargeEndTime:TIME+3600000,
    remoteStart:{until:TIME+600000},position:{lat:42.31,lon:-83.21}})) fields[key]={value,at:TIME-30000,source:'FordPass'};
  return Object.assign({version:1,vin:VIN,fields},extra);
}
function nodes(tree) { const out=[]; const walk=n=>{if(!n||typeof n!=='object')return;out.push(n);for(const c of n.children||[])walk(c);};walk(tree);return out; }
function texts(tree) { return nodes(tree).filter(n=>n.kind==='text').map(n=>n.value); }
function links(tree) { return nodes(tree).filter(n=>String(n.url||'').startsWith('scriptable:')).map(n=>new URL(n.url)); }
function allCommands(prefs) { prefs.features={proPower:true,engineControl:true}; prefs.compatibility.commands={lock:true,unlock:true,start:true,stop:true,refresh:true}; }
function powerSnapshot(extra = {}) {
  return Object.assign({version:1,vin:VIN,rawSignals:{DcacOut1Pw2Dsply:1500,DcacOut2Pw2Dsply:200,DcacOutPwDsplyMx:7200,
    DcacOutScndPw2Dsply:0,DcacOutScndPwDsplyMx:0},commandAt:TIME-60000,commandState:'COMMAND_SUCCEEDED_ON_DEVICE',
    latestMode:{value:'OFF',at:TIME-10000},fetchedAt:TIME},extra);
}
// Conservative layout estimate at normal font sizes; this is a structural
// budget, not a substitute for native iOS rendering on each device.
function normalHeight(node) {
  if (node.kind==='text'||node.kind==='date') return (node.font&&node.font.values[0]||12)*1.2;
  if (node.kind==='image') return node.imageSize&&node.imageSize.height||0;
  if (node.kind==='spacer') return node.size||0;
  const children=node.children||[], heights=children.map(normalHeight), vertical=node.kind==='widget'||node.layout==='vertical';
  const padding=node.padding||[0,0,0,0];
  const content=vertical?heights.reduce((sum,h)=>sum+h,0)+(node.spacing||0)*Math.max(0,children.length-1):Math.max(0,...heights);
  return Math.max(node.size&&node.size.height||0,content+padding[0]+padding[2]);
}

test('every family and gallery design uses distinct BEV charge/range and never exposes an engine timer',async()=>{
  const {h,a,store,prefs}=await setup({engineType:'BEV'}); allCommands(prefs);a.saveVehicleProfile(prefs,store);
  for(const design of ['classic','showcase','dashboard']) for(const family of ['small','medium','large','extraLarge','accessoryInline','accessoryCircular','accessoryRectangular']) {
    prefs.widget={design:{small:design,medium:design,large:design}};
    const widget=new a.WidgetRenderer(prefs,snapshot()).build(family), text=texts(widget).join('\n');
    assert.match(text,/EV charge[\s\S]*82%/,design+' '+family);
    assert.doesNotMatch(text,/\bFuel\b|\bOil\b|\bStart\b|Remote engine|Tap to stop/);
    assert.equal(nodes(widget).filter(n=>n.kind==='date'&&n.dateStyle==='timer').length,0);
    assert.ok(links(widget).every(url=>url.searchParams.get('vehicle')===prefs.id));
  }
  assert.equal(h.state.requests.length,0);store.release();
});

test('PHEV dashboard keeps fuel, EV charge, EV range, plug and 12V readings separate',async()=>{
  const {a,store,prefs}=await setup({engineType:'PHEV',units:'metric'});
  const data=snapshot(); data.fields.outsideTemp.at=TIME-7200000; data.fields.chargeStatus.at=null;
  const text=texts(new a.WidgetRenderer(prefs,data,'dashboard').build('large')).join('\n');
  assert.match(text,/Fuel 63%/);assert.match(text,/Fuel range 489 km/);assert.match(text,/EV charge 82%/);
  assert.match(text,/EV range 225 km/);assert.match(text,/12V 58%/);assert.match(text,/Plug CONNECTED/);
  assert.match(text,/Charging IN PROGRESS · time unknown/);assert.match(text,/Outside 20°C · 2h 0m ago/);
  store.release();
});

test('model metadata and explicit per-widget parameters filter fields without guessing from missing values',async()=>{
  const {a,store,prefs}=await setup({engineType:'BEV'});
  let options=a.widgetOptions(prefs,'fuel oil evsoc evrange ppototal');
  assert.equal(options.show.fuel,false);assert.equal(options.show.oil,false);assert.equal(options.show.evSoc,true);
  assert.equal(options.show.evRange,true);assert.equal(options.show.ppototal,false);assert.equal(options.view,'evSoc');
  const charge=texts(new a.WidgetRenderer(prefs,snapshot(),'evsoc').build('accessoryCircular')).join('\n');
  assert.match(charge,/EV charge\n82%/);assert.doesNotMatch(charge,/58%/);
  const battery=texts(new a.WidgetRenderer(prefs,snapshot(),'battery').build('accessoryCircular')).join('\n');
  assert.match(battery,/12V\n58%/);assert.doesNotMatch(battery,/82%/);
  prefs.engineType='UNKNOWN';a.saveVehicleProfile(prefs,store);
  options=a.widgetOptions(prefs,'');assert.equal(options.show.fuel,false);assert.equal(options.show.evSoc,true);
  assert.ok(a.modelMetricKeys(prefs).includes('evSoc'));store.release();
  const unknown=await setup({engineType:'UNKNOWN'});
  options=unknown.a.widgetOptions(unknown.prefs,'');assert.equal(options.show.fuel,true);assert.equal(options.show.evSoc,false);unknown.store.release();
});

test('owner permissions select Fetch versus Refresh and hard-block BEV/manual/unknown engine controls',async()=>{
  const {a,store,prefs}=await setup();
  let widget=new a.WidgetRenderer(prefs,snapshot(),'controls').build('large');
  assert.ok(texts(widget).includes('Fetch'));assert.ok(!texts(widget).includes('Refresh'));
  assert.ok(links(widget).some(url=>url.searchParams.get('action')==='fetch'));
  allCommands(prefs);a.saveVehicleProfile(prefs,store);
  widget=new a.WidgetRenderer(prefs,snapshot(),'controls').build('large');
  assert.ok(texts(widget).includes('Refresh'));assert.ok(texts(widget).includes('Stop'));
  for(const change of [{engineType:'BEV'},{engineType:'HEV',transmission:'MANUAL'},{transmission:'UNKNOWN'},{engineType:'UNKNOWN',transmission:'AUTOMATIC'}]) {
    Object.assign(prefs,change);a.saveVehicleProfile(prefs,store);
    widget=new a.WidgetRenderer(prefs,snapshot(),'controls').build('large');
    assert.ok(!texts(widget).some(t=>['Start','Stop'].includes(t)));
    assert.equal(nodes(widget).filter(n=>n.dateStyle==='timer').length,0);
  }
  store.release();
});

test('Pro Power metrics, panels and details require the latest per-vehicle owner opt-in',async()=>{
  const {h,a,store,prefs}=await setup();
  prefs.widget={show:{ppoa:true,ppob:true,ppototal:true,ppocapacity:true}};a.saveVehicleProfile(prefs,store);
  assert.equal(a.widgetOptions(prefs,'ppototal').show.ppototal,false);
  assert.doesNotMatch(texts(new a.WidgetRenderer(prefs,snapshot()).build('large')).join('\n'),/Pro Power/);
  const app=new a.AppController();app.store=store;
  await assert.rejects(app.proPowerDetails(prefs),/Enable Pro Power/);
  await assert.rejects(app.confirmProPowerStatus(prefs),/Enable Pro Power/);
  prefs.features.proPower=true;a.saveVehicleProfile(prefs,store);
  assert.match(texts(new a.WidgetRenderer(prefs,snapshot()).build('large')).join('\n'),/Pro Power · mapping unverified/);
  const stale=plain(prefs);prefs.features.proPower=false;a.saveVehicleProfile(prefs,store);
  assert.equal(a.widgetOptions(stale,'ppototal').show.ppototal,false);
  assert.equal(h.state.requests.length,0);store.release();
});

test('six-wheel selection uses exact inner/outer readings and independent axle thresholds without generic rear fallbacks',async()=>{
  const {a,store,prefs}=await setup();
  prefs.alerts.enabled.tires=true;a.saveVehicleProfile(prefs,store);
  assert.equal(a.alertSettings(prefs).enabled.tires,false);
  assert.equal(a.nightProblems(snapshot().fields,prefs).length,0);
  prefs.tireConfiguration={configured:true,layout:'six',frontPsi:34,rearPsi:63};a.saveVehicleProfile(prefs,store);
  assert.deepEqual(plain(a.modelTireKeys(prefs)),['fl','fr','rlo','rli','rri','rro']);
  const data=snapshot();data.fields.rl.value=1;data.fields.rr.value=1;delete data.fields.rri;
  const issues=plain(a.nightProblems(data.fields,prefs));
  assert.ok(issues.some(x=>x==='Low tire RLO 62 psi, RLI 61 psi'));
  assert.ok(issues.includes('Tire readings incomplete: RRI'));
  const text=texts(new a.WidgetRenderer(prefs,data,'tires').build('large')).join('\n');
  assert.match(text,/RRI —/);assert.doesNotMatch(text,/(?:^|\n)RL 1(?:\n|$)|(?:^|\n)RR 1(?:\n|$)/);
  const pressure=data.fields.rlo.value;
  const metric=texts(new a.WidgetRenderer(prefs,data,'tires metric bar').build('large')).join('\n');
  assert.match(metric,/TIRES · BAR/);assert.match(metric,/RLO 4\.3/);assert.equal(data.fields.rlo.value,pressure);
  assert.equal(a.modelPressureInput('0','psi'),null);assert.equal(a.modelPressureInput('-1','psi'),null);
  assert.equal(a.modelPressureInput('abc','psi'),null);assert.ok(Math.abs(a.modelPressureInput('241.316505255','kpa')-35)<1e-8);
  store.release();
});

test('canonical tire alert thresholds are bounded in every display unit, including conversion roundoff and invalid saved values',async()=>{
  const {a,store,prefs}=await setup();
  for(const unit of ['psi','kpa','bar']) {
    const max=a.modelPressureMaximum(unit);
    assert.ok(Math.abs(a.modelPressureInput(String(max),unit)-150)<1e-10);
    assert.equal(a.modelPressureInput(String(max+Number.EPSILON*max*2),unit),150);
    assert.equal(a.modelPressureInput(String(max*1.001),unit),null);
    assert.equal(a.modelPressureInput('Infinity',unit),null);
    assert.equal(a.modelPressureInput('1e309',unit),null);
    assert.ok(a.modelPressureInput(String(max-1e-7),unit)<150);
  }
  for(const value of [0,-1,151,Infinity,null,'invalid']) {
    prefs.tireConfiguration={configured:true,layout:'four',frontPsi:value,rearPsi:40};
    assert.equal(a.modelTireConfiguration(prefs).configured,false);
  }
  store.release();
});

test('friendly generic identity, location and every field age use their own reading rather than root freshness',async()=>{
  const {h,a,store,prefs}=await setup({name:'',model:''});
  const data=snapshot();data.fetchedAt=TIME;data.fields.outsideTemp.at=null;data.fields.lock.at=TIME-3600000;
  const widget=new a.WidgetRenderer(prefs,data).build('large'),text=texts(widget).join('\n');
  assert.match(text,/Ford vehicle/);assert.doesNotMatch(text,/F-150|F150/);
  assert.match(text,/Outside 68°F · time unknown/);assert.match(text,/Locks Locked \(partial\) · 1h 0m ago/);
  assert.match(text,/FL 35\n30s ago/);assert.equal(h.state.requests.length,0);store.release();
});

test('tire setup refuses enabled alerts before configuration and preserves exact canonical thresholds across units',async()=>{
  const {h,a,store,prefs}=await setup({units:'metric',widget:{unit:'bar'}});
  const app=new a.AppController();app.store=store;
  h.state.choices.push('Low tire alerts: Off',-1,-1);
  await app.tireOptions(prefs);assert.equal(a.alertSettings(a.activeVehicleProfile()).enabled.tires,false);
  prefs.tireConfiguration={configured:true,layout:'six',frontPsi:36.123456,rearPsi:67.654321};a.saveVehicleProfile(prefs,store);
  h.state.choices.push('Edit front / rear thresholds','Save',-1);
  await app.tireOptions(prefs);
  const saved=a.activeVehicleProfile();assert.equal(saved.tireConfiguration.frontPsi,36.123456);assert.equal(saved.tireConfiguration.rearPsi,67.654321);
  assert.equal(h.state.requests.length,0);store.release();
});

test('a dialog cannot save tire settings after its account/profile binding changes',async()=>{
  const {h,a,store,prefs}=await setup();const app=new a.AppController();app.store=store;
  const show=h.context.Alert.prototype.presentSheet;
  h.context.Alert.prototype.presentSheet=async function(){const result=await show.call(this);store.release();a.bindVehicleProfile(null);return result;};
  h.state.choices.push('Layout: Four tires');
  await assert.rejects(app.tireOptions(prefs),/session|binding|lease|vehicle/i);
  assert.equal(h.state.requests.length,0);
});

test('unsupported first accessory fields choose the remaining supported tire view in all accessory families',async()=>{
  for(const engineType of ['BEV','HEV']) {
    const {a,store,prefs}=await setup({engineType});
    const parameters=engineType==='BEV'?['fuel tires','ppoa tires','ppoa fuel tires']:['ppoa tires','ppototal tires'];
    for(const parameter of parameters) for(const family of ['accessoryInline','accessoryCircular','accessoryRectangular']) {
      const renderer=new a.WidgetRenderer(prefs,snapshot(),parameter);
      assert.equal(renderer.opts.view,'tires',engineType+' '+parameter);
      const text=texts(renderer.build(family)).join('\n');assert.match(text,/FL 35/);assert.doesNotMatch(text,/Not reported|PPO last/);
    }
    store.release();
  }
});

test('every compact PPO view keeps newer OFF and its own age beside historic watts',async()=>{
  const {h,a,store,prefs}=await setup();prefs.features.proPower=true;a.saveVehicleProfile(prefs,store);
  const data=snapshot({proPower:powerSnapshot()});
  for(const family of ['small','medium','large','extraLarge','accessoryInline','accessoryCircular','accessoryRectangular']) {
    const text=texts(new a.WidgetRenderer(prefs,data,'ppoa').build(family)).join('\n');
    assert.match(text,/Ford OFF(?: ·)? 10s ago/,family);
    assert.match(text,/~1\.5 kW/,family);assert.match(text,/1m(?: ago)?/,family);
    assert.match(text,/sample (?:time )?unknown/i,family);
  }
  assert.equal(h.state.requests.length,0);store.release();
});

test('watts require noncontradictory HEV metadata, main 7200 and no positive secondary rating while pure decoding stays unchanged',()=>{
  const {api:a}=fixture(), base=powerSnapshot();
  for(const profile of [{engineType:'HEV'},{engineType:'UNKNOWN',garageEngineType:'HEV'}]) {
    const result=a.modelProPowerEstimate(base,profile);assert.equal(result.a,1500);assert.equal(result.b,200);assert.equal(result.total,1700);assert.equal(result.capacity,7200);
    assert.equal(result.mappingStatus,'corroborated_7_2_hev');
  }
  const cases=[
    ...['ICE','PHEV','BEV','UNKNOWN'].map(engineType=>({profile:{engineType},snapshot:base})),
    ...['ICE','PHEV','BEV'].map(garageEngineType=>({profile:{engineType:'HEV',garageEngineType},snapshot:base})),
    {profile:{engineType:'ICE',garageEngineType:'HEV'},snapshot:base},
    ...[0,2000,2400,9600,undefined].map(value=>({profile:{engineType:'HEV'},snapshot:powerSnapshot({rawSignals:{...base.rawSignals,DcacOutPwDsplyMx:value}})})),
    {profile:{engineType:'HEV'},snapshot:powerSnapshot({rawSignals:{...base.rawSignals,DcacOutScndPwDsplyMx:2400}})}
  ];
  for(const item of cases) {
    const result=a.modelProPowerEstimate(item.snapshot,item.profile);assert.equal(result.mappingStatus,'unverified');
    for(const key of ['a','b','abTotal','total','capacity','mainCapacity','secondary','secondaryCapacity']) assert.equal(result[key],null);
    const report=a.modelProPowerReport(item.snapshot,item.profile);
    assert.equal(report.rawSignals.DcacOut1Pw2Dsply,1500);assert.equal(report.estimates.estimated,false);
    assert.match(report.interpretation,/mapping is unverified/);
    assert.doesNotMatch(a.ppoDetailsText(item.snapshot,null,item.profile),/~1\.5 kW|~7\.2 kW/);
    assert.match(a.ppoDetailsText(item.snapshot,null,item.profile),/Mapping unverified · raw details/);
  }
  const noSecondary=powerSnapshot({rawSignals:{...base.rawSignals}});delete noSecondary.rawSignals.DcacOutScndPwDsplyMx;
  const strict=a.modelProPowerEstimate(noSecondary,{engineType:'HEV'});assert.equal(strict.a,1500);assert.equal(strict.total,null);
  assert.equal(a.ppoEstimated(base).a,1500);assert.equal(a.ppoRedactedReport(base).estimates.a,1500);
});

test('unverified PPO mappings remain raw-only on home/accessory widgets and the actual copied user report',async()=>{
  const {h,a,store,prefs}=await setup({engineType:'BEV'});prefs.features.proPower=true;a.saveVehicleProfile(prefs,store);
  const data=snapshot({proPower:powerSnapshot()});store.write(data);
  for(const family of ['small','medium','large','accessoryInline','accessoryCircular','accessoryRectangular']) {
    const text=texts(new a.WidgetRenderer(prefs,data,'ppoa').build(family)).join('\n');
    assert.match(text,/mapping unverified/i);assert.match(text,/raw details/i);assert.doesNotMatch(text,/~[\d.]+ (?:W|kW)/);
    assert.match(text,/Ford OFF(?: ·)? 10s ago/);
  }
  const app=new a.AppController();app.store=store;
  h.state.choices.push('Copy redacted Pro Power report','Copy report',-1,-1);
  await app.troubleshooting(prefs);
  assert.equal(h.state.clipboard.length,1);
  const report=JSON.parse(h.state.clipboard[0]);assert.equal(report.estimates.a,null);assert.equal(report.estimates.mappingStatus,'unverified');
  assert.equal(report.rawSignals.DcacOut1Pw2Dsply,1500);assert.equal(h.state.requests.length,0);store.release();
});

test('medium budgets the densest PHEV/dually/PPO/timer/control combination at normal font sizes and links omitted readings',async()=>{
  const {a,store,prefs}=await setup({engineType:'PHEV'});allCommands(prefs);
  prefs.tireConfiguration={configured:true,layout:'six',frontPsi:34,rearPsi:60};
  prefs.widget={show:{ppoa:true,ppob:true,ppototal:true,ppocapacity:true}};a.saveVehicleProfile(prefs,store);
  const data=snapshot({proPower:powerSnapshot()});
  for(const design of ['classic','showcase','dashboard']) {
    const widget=new a.WidgetRenderer(prefs,data,design+' controls').build('medium'),text=texts(widget).join('\n');
    assert.ok(normalHeight(widget)<=151.5,design+' height '+normalHeight(widget));
    assert.match(text,/Fuel 63%/);assert.match(text,/EV charge 82%/);assert.match(text,/12V 58%/);
    assert.ok(nodes(widget).some(n=>n.kind==='date'&&n.dateStyle==='timer'));
    assert.match(text,/More readings →/);assert.ok(links(widget).some(url=>url.searchParams.get('action')==='details'&&url.searchParams.get('vehicle')===prefs.id));
    assert.doesNotMatch(text,/Outside|Odometer|Charging|Plug/);
    const large=texts(new a.WidgetRenderer(prefs,data,design).build('large')).join('\n');
    assert.match(large,/Outside/);assert.match(large,/Odometer/);assert.match(large,/Charging/);assert.match(large,/Plug/);
  }
  store.release();
  // Also budget the corroborated HEV layout with all four estimated PPO values.
  const hev=await setup();allCommands(hev.prefs);
  hev.prefs.tireConfiguration={configured:true,layout:'six',frontPsi:34,rearPsi:60};
  hev.prefs.widget={show:{ppoa:true,ppob:true,ppototal:true,ppocapacity:true}};hev.a.saveVehicleProfile(hev.prefs,hev.store);
  const height=normalHeight(new hev.a.WidgetRenderer(hev.prefs,data,'controls').build('medium'));
  assert.ok(height<=151.5,'mapped height '+height);hev.store.release();
});
