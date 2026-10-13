import { build } from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root=fileURLToPath(new URL('../',import.meta.url));
const resultsDir=path.join(root,'test-results','pdf-reports');
fs.mkdirSync(resultsDir,{recursive:true});
const source=fs.readFileSync(path.join(root,'src/lib/authControl.ts'),'utf8');
const roles=source.slice(source.indexOf('export const ROLE_DETAILS'),source.indexOf('\n};',source.indexOf('export const ROLE_DETAILS'))+3);
const permissions=source.slice(source.indexOf('export const canAccessScreen'));
const bundle=await build({
  absWorkingDir:root,entryPoints:['scripts/report-browser-cases.jsx'],bundle:true,write:false,
  platform:'browser',format:'iife',define:{'process.env.NODE_ENV':'"development"'},
  plugins:[{name:'isolated-report-browser',setup(b){
    // Run the real permission functions without loading Firebase credentials.
    b.onResolve({filter:/lib\/authControl$/},()=>({path:'auth',namespace:'test-auth'}));
    b.onLoad({filter:/.*/,namespace:'test-auth'},()=>({contents:roles+'\n'+permissions+`
      export const PRIMARY_ADMIN_EMAIL='admin@example.com';
      export const getAuthorizedUsers=async()=>[];
      export const saveAuthorizedUser=async()=>{};
      export const removeAuthorizedUser=async()=>{};
      export const toggleUserStatus=async()=>null;
    `,loader:'ts'}));
    b.onResolve({filter:/lib\/firebase$/},()=>({path:'firebase',namespace:'test-firebase'}));
    b.onLoad({filter:/.*/,namespace:'test-firebase'},()=>({contents:`
      export const loginWithGoogle=async()=>{if(window.__loginError)throw Error(window.__loginError);return window.__loginUser;};
      export const getRoleInfo=()=>({roleLabel:'Test role',department:'Test department'});
      export const saveImportBatchToFirestore=async()=> 'test-batch';
      export const saveKPISummaryToFirestore=async()=>{};
    `,loader:'js'}));
    b.onResolve({filter:/lib\/kpiSettings$/},()=>({path:'kpi',namespace:'test-kpi'}));
    b.onLoad({filter:/.*/,namespace:'test-kpi'},()=>({contents:`export const saveKpiTargets=async targets=>{window.__savedTargets=targets;};`,loader:'js'}));
    b.onResolve({filter:/^xlsx$/},()=>({path:'xlsx',namespace:'capture-xlsx'}));
    b.onResolve({filter:/^actual-xlsx$/},()=>({path:path.join(root,'node_modules/xlsx/xlsx.mjs')}));
    b.onLoad({filter:/.*/,namespace:'capture-xlsx'},()=>({contents:`
      export * from 'actual-xlsx';
      import { utils } from 'actual-xlsx';
      export const writeFile = (book, name) => {window.__excelExports ||= []; window.__excelExports.push({name, rows:utils.sheet_to_json(book.Sheets[book.SheetNames[0]])});};
    `,loader:'js'}));
    b.onResolve({filter:/^jspdf$/},()=>({path:'jspdf',namespace:'capture-pdf'}));
    b.onResolve({filter:/^actual-jspdf$/},()=>({path:path.join(root,'node_modules/jspdf/dist/jspdf.es.min.js')}));
    b.onLoad({filter:/.*/,namespace:'capture-pdf'},()=>({contents:`
      import { jsPDF as RealPDF } from 'actual-jspdf';
      export default function CapturedPDF(options) {
        const pdf = new RealPDF(options);
        pdf.save = name => {
          const bytes = pdf.output('arraybuffer');
          window.__exports.push({name, size: bytes.byteLength, pages: pdf.getNumberOfPages(), width: pdf.internal.pageSize.getWidth(), height: pdf.internal.pageSize.getHeight(), text: document.getElementById('technicpet-pdf-printable-report').textContent.replace(/\\s+/g,' ').trim()});
          window.__pdfWrites.push(fetch('/artifact/'+encodeURIComponent(name), {method:'POST',body:bytes}).then(r=>{if(!r.ok)throw Error('Unable to save PDF artifact');}));
        };
        return pdf;
      }`,loader:'js'}));
  }}],
});
console.log('Built browser report fixture.');
const cssFile=fs.readdirSync(path.join(root,'dist/assets')).find(name=>name.endsWith('.css'));
if(!cssFile) throw Error('Run npm run build before the browser check.');
const css=fs.readFileSync(path.join(root,'dist/assets',cssFile),'utf8').replace(/@import[^;]+;/g,'');
const server=http.createServer((req,res)=>{
  if(req.url.startsWith('/artifact/')&&req.method==='POST'){
    const name=path.basename(decodeURIComponent(req.url.slice('/artifact/'.length)));
    if(!/^TechnicPet_[A-Za-z0-9_.-]+\.pdf$/.test(name)){res.writeHead(400);res.end();return;}
    const chunks=[];req.on('data',chunk=>chunks.push(chunk));req.on('end',()=>{fs.writeFileSync(path.join(resultsDir,name),Buffer.concat(chunks));res.end('ok');});return;
  }
  if(req.url==='/bundle.js'){res.setHeader('Content-Type','text/javascript; charset=utf-8');res.end(bundle.outputFiles[0].text);return;}
  if(req.url==='/app.css'){res.setHeader('Content-Type','text/css; charset=utf-8');res.end(css);return;}
  res.setHeader('Content-Type','text/html; charset=utf-8');
  res.end('<!doctype html><html><meta charset="utf-8"><link rel="stylesheet" href="/app.css"><body><div id="root"></div><script src="/bundle.js"></script></body></html>');
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const browserPath=process.env.REPORT_TEST_BROWSER || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const profile=fs.mkdtempSync(path.join(os.tmpdir(),'technicpet-report-check-'));
const browser=spawn(browserPath,['--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check','--remote-debugging-port=0',`--user-data-dir=${profile}`,'about:blank'],{windowsHide:true,stdio:['ignore','ignore','pipe']});
let socket;
try {
  const endpoint=await new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>reject(Error('Browser debugger did not start')),15000);
    browser.once('error',reject);
    browser.stderr.on('data',chunk=>{
      const match=String(chunk).match(/DevTools listening on (ws:\/\/\S+)/);
      if(match){clearTimeout(timer);resolve(match[1]);}
    });
  });
  socket=new WebSocket(endpoint);
  await new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>reject(Error('Browser debugger connection timed out')),10000);
    socket.onopen=()=>{clearTimeout(timer);resolve();};
    socket.onerror=()=>{clearTimeout(timer);reject(Error('Browser debugger connection failed'));};
  });
  console.log('Connected to headless browser.');
  let id=0;
  const waiting=new Map();
  socket.onmessage=event=>{
    const message=JSON.parse(event.data);
    if(message.id&&waiting.has(message.id)){
      const {resolve,reject,timer}=waiting.get(message.id);waiting.delete(message.id);clearTimeout(timer);
      message.error?reject(Error(JSON.stringify(message.error))):resolve(message.result);
    }
    if(message.method==='Runtime.consoleAPICalled'){
      const words=message.params.args.map(a=>a.value).filter(v=>typeof v==='string');
      if(words[0]==='PASS:') console.log(words.join(' '));
    }
  };
  socket.onclose=()=>{
    for(const {reject,timer} of waiting.values()){clearTimeout(timer);reject(Error('Browser debugger closed unexpectedly'));}
    waiting.clear();
  };
  const send=(method,params={},sessionId)=>new Promise((resolve,reject)=>{
    const msgId=++id;
    const timer=setTimeout(()=>{waiting.delete(msgId);reject(Error(`Timeout: ${method}`));},180000);
    waiting.set(msgId,{resolve,reject,timer});socket.send(JSON.stringify({id:msgId,method,params,...(sessionId?{sessionId}:{})}));
  });
  const {targetId}=await send('Target.createTarget',{url:'about:blank'});
  const {sessionId}=await send('Target.attachToTarget',{targetId,flatten:true});
  await send('Runtime.enable',{},sessionId);
  await send('Page.enable',{},sessionId);
  await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1100,deviceScaleFactor:1,mobile:false},sessionId);
  await send('Page.navigate',{url:`http://127.0.0.1:${server.address().port}`},sessionId);
  console.log('Opened report test page.');
  let ready=false;
  for(let i=0;i<100;i++){
    const r=await send('Runtime.evaluate',{expression:'typeof window.runReportChecks === "function"',returnByValue:true},sessionId);
    if(r.result.value){ready=true;break;}
    await new Promise(resolve=>setTimeout(resolve,100));
  }
  if(!ready) throw Error('Report fixture failed to load');
  const outcome=await send('Runtime.evaluate',{expression:'window.runReportChecks()',awaitPromise:true,returnByValue:true},sessionId);
  const shot=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false},sessionId);
  fs.writeFileSync(path.join(resultsDir,'warehouse-preview.png'),Buffer.from(shot.data,'base64'));
  if(outcome.exceptionDetails) throw Error(outcome.exceptionDetails.exception?.description || JSON.stringify(outcome.exceptionDetails));
  const system=await send('Runtime.evaluate',{expression:'window.runSystemChecks()',awaitPromise:true,returnByValue:true},sessionId);
  if(system.exceptionDetails) throw Error(system.exceptionDetails.exception?.description || JSON.stringify(system.exceptionDetails));
  const pagination=await send('Runtime.evaluate',{expression:'window.runPaginationChecks()',awaitPromise:true,returnByValue:true},sessionId);
  if(pagination.exceptionDetails) throw Error(pagination.exceptionDetails.exception?.description || JSON.stringify(pagination.exceptionDetails));
  // The full native print path must produce the same A4 pages as the preview.
  const printed=await send('Page.printToPDF',{printBackground:true,preferCSSPageSize:true,displayHeaderFooter:false},sessionId);
  const printedBytes=Buffer.from(printed.data,'base64');
  fs.writeFileSync(path.join(resultsDir,'Sales_Native_Print_A4.pdf'),printedBytes);
  const printedPageCount=(printedBytes.toString('latin1').match(/\/Type\s*\/Page\b/g)||[]).length;
  if(printedPageCount!==pagination.result.value.pages) throw Error(`Native print page count ${printedPageCount} differs from preview ${pagination.result.value.pages}`);
  console.log(`PASS: Native browser print matches preview (${printedPageCount} A4 pages)`);
  // Scroll the preview to the table page for a useful visual regression artifact.
  await send('Runtime.evaluate',{expression:`document.querySelector('#technicpet-pdf-printable-report [data-pdf-table="sales-products"]').closest('[data-pdf-page]').scrollIntoView({block:'start'});`},sessionId);
  const tableShot=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false},sessionId);
  fs.writeFileSync(path.join(resultsDir,'sales-table-pagination.png'),Buffer.from(tableShot.data,'base64'));
  const latest=await send('Runtime.evaluate',{expression:'({passed:window.__passes,exports:window.__exports})',returnByValue:true},sessionId);
  Object.assign(outcome.result.value,latest.result.value);
  outcome.result.value.pagination={...pagination.result.value,nativePrintPages:printedPageCount};
  fs.writeFileSync(path.join(resultsDir,'results.json'),JSON.stringify(outcome.result.value,null,2));
  console.log(`Verified ${outcome.result.value.passed.length} checks. Artifacts: ${resultsDir}`);
  await send('Browser.close');
} finally {
  socket?.close();
  browser.kill();
  server.close();
  // The profile is disposable, uniquely generated under the OS temporary root.
  const resolved=path.resolve(profile), tempRoot=path.resolve(os.tmpdir())+path.sep;
  if(resolved.startsWith(tempRoot)&&path.basename(resolved).startsWith('technicpet-report-check-')){
    try {fs.rmSync(resolved,{recursive:true,force:true,maxRetries:5,retryDelay:200});} catch { /* Edge may finish releasing the temporary profile later. */ }
  }
}
