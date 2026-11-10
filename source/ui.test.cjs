const assert = require('assert'), fs = require('fs'), vm = require('vm');
const instant = 1794100000000;
const prelude = `
const now = () => ${instant};
const age = at => typeof at === 'number' && at > 0 && at <= now() ? Math.floor((now()-at)/60000)+'m ago' : 'unknown';
const SETTINGS = {timeout:12,commandInterval:30000};
class FordAPIClient {}
class APIError extends Error {}
class WidgetRenderer { build(family) {return 'original:'+family;} }
class AppController { async action(action) {return 'original:'+action;} }
function requireApp() {throw new Error('Foreground API must not run in helper tests');}
`;
const source = prelude + fs.readFileSync(require('path').join(__dirname, 'pro-power-core.js'), 'utf8') + '\n' +
  fs.readFileSync(require('path').join(__dirname, 'pro-power-ui.js'), 'utf8');
const api = vm.runInNewContext(source + '\n({ppoEstimated,ppoPowerText,ppoRedactedReport,ppoRequestLine,ppoDetailsText,ppoSnapshotFor,ppoView,ppoCommandAge,WidgetRenderer});');
let passed = 0;
function check(name, fn) { fn(); passed++; console.log('PASS:', name); }
function packet(overrides = {}, extra = {}) {
  return {version:1,vin:'1FTFW1E50JFA00001',commandAt:instant-4647000,commandState:'COMMAND_SUCCEEDED_ON_DEVICE',
    latestMode:{value:'OFF',at:instant-1909000},
    rawSignals:{DcacOut1Pw2Dsply:1450,DcacOut2Pw2Dsply:0,DcacOutPwDsplyMx:7200,
      DcacOutScndPw2Dsply:0,DcacOutScndPwDsplyMx:0,DcacOutETot:200,...overrides},...extra};
}
check('known 7.2 packet estimates A/B usage without adding capacity or energy', () => {
  const e=api.ppoEstimated(packet());
  assert.strictEqual(e.a,1450);assert.strictEqual(e.b,0);assert.strictEqual(e.total,1450);
  assert.strictEqual(e.abTotal,1450);assert.strictEqual(e.capacity,7200);assert.strictEqual(e.secondaryScopeKnown,true);
});
check('missing B stays unknown and blocks totals', () => {
  const p=packet();delete p.rawSignals.DcacOut2Pw2Dsply;const e=api.ppoEstimated(p);
  assert.strictEqual(e.a,1450);assert.strictEqual(e.b,null);assert.strictEqual(e.abTotal,null);assert.strictEqual(e.total,null);
});
check('missing secondary scope blocks overall total and labels A+B capacity', () => {
  const p=packet();delete p.rawSignals.DcacOutScndPw2Dsply;delete p.rawSignals.DcacOutScndPwDsplyMx;
  const e=api.ppoEstimated(p);assert.strictEqual(e.abTotal,1450);assert.strictEqual(e.total,null);
  assert.strictEqual(e.capacity,7200);assert.strictEqual(e.capacityScope,'A+B capacity');
});
check('split installation adds its valid secondary usage and capacity', () => {
  const e=api.ppoEstimated(packet({DcacOutScndPw2Dsply:200,DcacOutScndPwDsplyMx:2400}));
  assert.strictEqual(e.total,1650);assert.strictEqual(e.capacity,9600);assert.strictEqual(e.capacityScope,'Combined capacity');
});
check('known secondary capacity with missing usage preserves capacity but not total', () => {
  const p=packet({DcacOutScndPwDsplyMx:2400});delete p.rawSignals.DcacOutScndPw2Dsply;
  const e=api.ppoEstimated(p);assert.strictEqual(e.capacity,9600);assert.strictEqual(e.secondary,null);assert.strictEqual(e.total,null);
});
check('zero secondary capacity requires actual zero usage before total exists', () => {
  const e=api.ppoEstimated(packet({DcacOutScndPw2Dsply:1}));
  assert.strictEqual(e.secondary,null);assert.strictEqual(e.total,null);
});
check('unrecognized rating blocks estimated main values', () => {
  const e=api.ppoEstimated(packet({DcacOutPwDsplyMx:7201}));
  for(const key of ['a','b','abTotal','total','capacity'])assert.strictEqual(e[key],null);
});
check('negative sentinels overflow and numeric strings never become estimated usage', () => {
  for(const bad of [-1,65535,NaN,Infinity,'1450',true,null]){
    const e=api.ppoEstimated(packet({DcacOut1Pw2Dsply:bad}));assert.strictEqual(e.a,null);assert.strictEqual(e.total,null);
  }
});
check('inconsistent combined usage blocks totals without inventing zero', () => {
  const e=api.ppoEstimated(packet({DcacOut1Pw2Dsply:6000,DcacOut2Pw2Dsply:2000}));
  assert.strictEqual(e.a,6000);assert.strictEqual(e.b,2000);assert.strictEqual(e.abTotal,null);assert.strictEqual(e.total,null);
});
check('newer OFF event retains historical usage and explains its age', () => {
  const p=packet();assert.strictEqual(api.ppoEstimated(p).a,1450);
  const text=api.ppoDetailsText(p);assert(text.includes('OFF'));assert(text.includes('earlier readings are retained'));
  assert(text.includes('77m ago'));assert(text.includes('31m ago'));
});
check('request age is separate from packet age and contains no identifiers', () => {
  const request={attemptAt:instant-10000,outcome:'device_succeeded',id:'PRIVATE_REQUEST_ID',vin:'1FTFW1E50JFA00001'};
  const report=api.ppoRedactedReport(packet(),request),text=JSON.stringify(report);
  assert.strictEqual(report.sourceCommandAgeSeconds,4647);assert.strictEqual(report.lastStatusRequest.attemptAgeSeconds,10);
  assert.strictEqual(report.lastStatusRequest.outcome,'device_succeeded');
  assert(!text.includes('PRIVATE_REQUEST_ID'));assert(!text.includes('1FTFW1E50JFA00001'));
});
check('request outcome allowlist rejects arbitrary status text', () => {
  const report=api.ppoRedactedReport(packet(),{attemptAt:instant-10000,outcome:'PRIVATE_SERVER_TEXT'});
  assert.strictEqual(report.lastStatusRequest,null);assert(!JSON.stringify(report).includes('PRIVATE_SERVER_TEXT'));
});
check('future or malformed request times never imply recent completion', () => {
  for(const at of [instant+1,0,-1,NaN,Infinity,'1794099990000']){
    const report=api.ppoRedactedReport(packet(),{attemptAt:at,outcome:'accepted_unconfirmed'});
    assert.strictEqual(report.lastStatusRequest.attemptAgeSeconds,null);
  }
});
check('future packet and mode timestamps export unknown ages', () => {
  const p=packet({}, {commandAt:instant+1000,latestMode:{value:'OFF',at:instant+500}});
  const r=api.ppoRedactedReport(p);assert.strictEqual(r.sourceCommandAgeSeconds,null);assert.strictEqual(r.latestFordMode.ageSeconds,null);
  assert.strictEqual(api.ppoCommandAge(api.ppoView(p)),'unknown');
});
check('raw report rejects unapproved names, private strings and state enums', () => {
  const p=packet({PRIVATE_FIELD:99887766,DcacElPwScndDStat:77889911,DcacHwDConfg:'PRIVATE_SECRET'},
    {commandState:'PRIVATE_STATE',latestMode:{value:'PRIVATE_MODE',at:instant-1000},correlation:'PRIVATE_CORRELATION'});
  const r=api.ppoRedactedReport(p),text=JSON.stringify(r);
  for(const token of ['PRIVATE_','99887766','77889911','DcacElPwScndDStat'])assert(!text.includes(token));
  assert.strictEqual(r.sourceCommandState,null);assert.strictEqual(r.latestFordMode.value,null);
});
check('inherited raw values cannot become estimates or copied signals', () => {
  const p=packet();p.rawSignals=Object.create({DcacOut1Pw2Dsply:1450,DcacOut2Pw2Dsply:0,DcacOutPwDsplyMx:7200});
  assert.strictEqual(api.ppoEstimated(p).a,null);assert.strictEqual(Object.keys(api.ppoRedactedReport(p).rawSignals).length,0);
});
check('same-VIN snapshot gate rejects another truck', () => {
  const p=packet(),prefs={vin:p.vin};
  assert.strictEqual(api.ppoSnapshotFor({vin:'1FTFW1E50JFA00002',proPower:p},prefs),null);
  assert.strictEqual(api.ppoSnapshotFor({vin:p.vin,proPower:{...p,vin:'1FTFW1E50JFA00002'}},prefs),null);
});
check('original views remain selected without PPO and for existing accessory first view', () => {
  const renderer=new api.WidgetRenderer();renderer.opts={show:{ppoa:false},view:null};
  assert.strictEqual(renderer.build('medium'),'original:medium');
  renderer.opts={show:{ppoa:true},view:'fuel'};assert.strictEqual(renderer.build('accessoryCircular'),'original:accessoryCircular');
});
check('power formatting preserves explicit zero and denotes estimates', () => {
  assert.strictEqual(api.ppoPowerText(0),'~0 W');assert.strictEqual(api.ppoPowerText(null),'—');
  assert.strictEqual(api.ppoPowerText(1450),'~1.45 kW');assert.strictEqual(api.ppoPowerText(7200),'~7.2 kW');
});
console.log(passed+' independent UI estimate/privacy checks passed. No Scriptable or Ford calls.');
