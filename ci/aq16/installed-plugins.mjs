// SPDX-License-Identifier: AGPL-3.0-only
// Real installed Rapier and first local optional-package registration in one process.
// No Store acquisition, native reply, resource byte, or renderer is simulated.
// node installed-plugins.mjs MAIN_MSIX OPTIONAL_MSIX OUT MAIN_EXE_SHA256 SOURCE
import {createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import {mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {basename, dirname, join, resolve} from 'node:path';

const [mainArgument, optionalArgument, outputArgument, expectedExe, source] = process.argv.slice(2);
if (process.platform !== 'win32' || process.argv.length !== 7 || !/^[a-f0-9]{64}$/.test(expectedExe || '') || !/^[a-f0-9]{40}$/.test(source || ''))
  throw Error('usage on Windows: MAIN_MSIX OPTIONAL_MSIX OUT MAIN_EXE_SHA256 SOURCE');
const mainMsix = resolve(mainArgument), optionalMsix = resolve(optionalArgument), out = resolve(outputArgument);
mkdirSync(out, {recursive:true});
const report = {schema:1, source, status:'NOT PROVEN', scope:'Test-certificate MSIX installation, real local optional-package registration, native pinned reads and Math rendering in the same running Rapier process',
  liveStore:'NOT PROVEN', limitations:['No Microsoft Store acquisition or account ownership is proved', 'No purchase contention with the live Store is proved', 'Network observations begin when DevTools attaches'],
  processes:[], pictures:[], pluginResponses:[], externalRequests:[], pageExceptions:[], stages:[], cleanup:[]};
const hash = (bytes, algorithm = 'sha256', encoding = 'hex') => createHash(algorithm).update(bytes).digest(encoding);
const jsonFile = (name, value) => writeFileSync(join(out, name), JSON.stringify(value, null, 2) + '\n');
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
// Leave the outer ten-minute launcher enough time for bounded process/package cleanup.
const deadline = Date.now() + 7 * 60 * 1000;
let app, socket, serial = 0, registrationAttempted = false, cleanupMode = false;
const pending = new Map();
function remaining(maximum) { return cleanupMode ? maximum : Math.max(1, Math.min(maximum, deadline - Date.now())); }
function run(file, args, name, maximum = 60000) {
  return new Promise((resolveRun, reject) => {
    const child = spawn(file, args, {windowsHide:true, stdio:['ignore', 'pipe', 'pipe']});
    let stdout = '', stderr = '', problem = '';
    const timer = setTimeout(() => { problem = 'Timed out'; child.kill(); }, remaining(maximum));
    const take = (stream, value) => {
      if (stream === 'out') stdout += value; else stderr += value;
      if (stdout.length + stderr.length > 1024 * 1024) { problem = 'Log exceeded 1 MiB'; child.kill(); }
    };
    child.stdout.on('data', data => take('out', data.toString('utf8')));
    child.stderr.on('data', data => take('err', data.toString('utf8')));
    child.once('error', error => { clearTimeout(timer); reject(error); });
    child.once('close', (code, signal) => {
      clearTimeout(timer);
      writeFileSync(join(out, name + '.stdout.log'), stdout.slice(0, 1024 * 1024));
      writeFileSync(join(out, name + '.stderr.log'), stderr.slice(0, 1024 * 1024));
      report.stages.push({name, exit:code, signal, problem:problem || null});
      if (problem || code !== 0) reject(Error(name + ': ' + (problem || 'exit ' + code) + '\n' + stderr.slice(-4000)));
      else resolveRun(stdout);
    });
  });
}
async function powershell(name, script, args, maximum = 60000) {
  const path = join(out, name + '.ps1');
  writeFileSync(path, script);
  return run('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', path, ...args], name, maximum);
}
function send(method, params = {}) {
  return new Promise((resolveSend, reject) => {
    const id = ++serial;
    const timer = setTimeout(() => {pending.delete(id); reject(Error('DevTools timeout: ' + method));}, remaining(30000));
    pending.set(id, {resolve:resolveSend, reject, timer});
    socket.send(JSON.stringify({id, method, params}));
  });
}
async function evaluate(expression) {
  const response = await send('Runtime.evaluate', {expression, awaitPromise:true, returnByValue:true});
  if (response.exceptionDetails) throw Error(JSON.stringify(response.exceptionDetails));
  return response.result?.value;
}
async function until(get, accept, name, maximum = 60000) {
  const end = Date.now() + remaining(maximum);
  do { const value = await get(); if (accept(value)) return value; await delay(200); } while (Date.now() < end);
  throw Error('Timed out: ' + name);
}
async function visible(selector) {
  return evaluate(`(() => {
    const e=document.querySelector(${JSON.stringify(selector)}); if(!e) return null;
    e.scrollIntoView({block:'nearest'}); const s=getComputedStyle(e),r=e.getBoundingClientRect();
    return s.display!=='none' && s.visibility!=='hidden' && r.width>0 && r.height>0 && r.right>0 && r.bottom>0 && r.x<innerWidth && r.y<innerHeight
      ? {selector:${JSON.stringify(selector)},text:e.innerText,box:{x:r.x,y:r.y,width:r.width,height:r.height}} : null;
  })()`);
}
async function click(selector) {
  const subject = await until(() => visible(selector), Boolean, 'visible ' + selector, 15000);
  const x = subject.box.x + subject.box.width / 2, y = subject.box.y + subject.box.height / 2;
  const clear = await evaluate(`(() => {const e=document.querySelector(${JSON.stringify(selector)}),at=document.elementFromPoint(${x},${y});return !!(e&&at&&(e===at||e.contains(at)))})()`);
  if (!clear) throw Error('Control is covered: ' + selector);
  await send('Input.dispatchMouseEvent', {type:'mousePressed', x, y, button:'left', clickCount:1});
  await send('Input.dispatchMouseEvent', {type:'mouseReleased', x, y, button:'left', clickCount:1});
}
async function picture(name, selector) {
  const subject = await until(() => visible(selector), Boolean, 'picture subject ' + name, 15000);
  await evaluate('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))');
  const capture = await send('Page.captureScreenshot', {format:'png', captureBeyondViewport:false});
  const bytes = Buffer.from(capture.data, 'base64');
  if (bytes.length > 1536 * 1024) throw Error('Picture exceeds 1.5 MiB');
  const file = name + '.png'; writeFileSync(join(out, file), bytes);
  report.pictures.push({file,bytes:bytes.length,sha256:hash(bytes),subject});
}
const inspectScript = String.raw`param([string]$Main,[string]$Optional,[string]$Output)
$ErrorActionPreference='Stop';Set-StrictMode -Version Latest;$ProgressPreference='SilentlyContinue'
$identity=[Security.Principal.WindowsIdentity]::GetCurrent()
$principal=[Security.Principal.WindowsPrincipal]::new($identity)
if($principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)){throw 'Standard user required'}
if(@(Get-AppxPackage -Name 'JackSkipworth.rapier' -PackageTypeFilter Main).Count -or @(Get-AppxPackage -Name 'JackSkipworth.rapierplugins' -PackageTypeFilter Optional).Count){throw 'Fresh profile required: Rapier or its optional pack already exists'}
Add-Type -AssemblyName System.IO.Compression.FileSystem
function EntryHash($Entry,[string]$Algorithm){
  $stream=$Entry.Open();$digest=[Security.Cryptography.HashAlgorithm]::Create($Algorithm)
  try{$bytes=$digest.ComputeHash($stream);if($Algorithm -eq 'SHA384'){return [Convert]::ToBase64String($bytes)};return ([BitConverter]::ToString($bytes)).Replace('-','').ToLowerInvariant()}
  finally{$stream.Dispose();$digest.Dispose()}
}
function Inspect([string]$Path,[string]$Expected){
  $zip=[IO.Compression.ZipFile]::OpenRead($Path)
  try{
    $entries=@($zip.Entries|Where-Object {$_.FullName -eq 'AppxManifest.xml'})
    if($entries.Count -ne 1 -or $entries[0].Length -gt 65536){throw 'Invalid package manifest'}
    $reader=[IO.StreamReader]::new($entries[0].Open());try{[xml]$xml=$reader.ReadToEnd()}finally{$reader.Dispose()}
    if($xml.Package.Identity.Name -ne $Expected){throw 'Wrong package identity'}
    $r=[ordered]@{name=[string]$xml.Package.Identity.Name;version=[string]$xml.Package.Identity.Version;publisher=[string]$xml.Package.Identity.Publisher;architecture=[string]$xml.Package.Identity.ProcessorArchitecture}
    if($Expected -eq 'JackSkipworth.rapier'){
      $entry=$zip.GetEntry('rapier-host.exe');if(-not $entry){throw 'Main executable missing'}
      $r.executableSha256=EntryHash $entry 'SHA256'
    }else{
      $namespaces=[Xml.XmlNamespaceManager]::new($xml.NameTable);$namespaces.AddNamespace('uap3','http://schemas.microsoft.com/appx/manifest/uap/windows10/3')
      $dependency=$xml.SelectSingleNode('//uap3:MainPackageDependency',$namespaces)
      if(-not $dependency -or $dependency.GetAttribute('Name') -ne 'JackSkipworth.rapier'){throw 'Wrong main package dependency'}
      $entries=@($zip.Entries|Where-Object {$_.FullName -eq 'plugins/rapier-math.bin'})
      if($entries.Count -ne 1 -or $entries[0].Length -le 0 -or $entries[0].Length -gt 4MB){throw 'Math content absent or invalid'}
      $r.math=@{bytes=$entries[0].Length;sha256=(EntryHash $entries[0] 'SHA256');sri=(EntryHash $entries[0] 'SHA384')}
    }
    return $r
  }finally{$zip.Dispose()}
}
$mainInfo=Inspect $Main 'JackSkipworth.rapier';$optionalInfo=Inspect $Optional 'JackSkipworth.rapierplugins'
if($mainInfo.publisher -ne $optionalInfo.publisher -or $mainInfo.version -ne $optionalInfo.version -or $optionalInfo.architecture -ne 'neutral'){throw 'Package version, publisher or architecture mismatch'}
$result=@{identity=$identity.Name;sid=$identity.User.Value;elevated=$false;main=$mainInfo;optional=$optionalInfo}
[IO.File]::WriteAllText($Output,($result|ConvertTo-Json -Depth 10),[Text.UTF8Encoding]::new($false))
`;
const registerScript = String.raw`param([string]$Path,[string]$Name,[string]$Kind,[string]$Output)
$ErrorActionPreference='Stop';Set-StrictMode -Version Latest;$ProgressPreference='SilentlyContinue'
# No forced shutdown and no deferred registration: same-process detection is the assertion under test.
Add-AppxPackage -Path $Path -ErrorAction Stop
$found=@(Get-AppxPackage -Name $Name -PackageTypeFilter $Kind)
if($found.Count -ne 1){throw 'Registered package missing or ambiguous'}
$p=$found[0]
$result=@{name=$p.Name;fullName=$p.PackageFullName;family=$p.PackageFamilyName;installLocation=$p.InstallLocation;publisher=$p.Publisher;version=$p.Version.ToString();kind=$Kind}
[IO.File]::WriteAllText($Output,($result|ConvertTo-Json -Depth 8),[Text.UTF8Encoding]::new($false))
`;
let helper, preflight;
async function identity(name) {
  if (!app || app.exitCode !== null || app.signalCode !== null) throw Error('Rapier exited before ' + name);
  const text = await run(helper, ['--process', String(app.pid)], name, 30000);
  const rows = text.split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line));
  if (rows.length !== 1 || rows[0].case !== 'installed-process' || rows[0].pass !== true || rows[0].elevated !== false ||
      rows[0].pid !== app.pid || rows[0].sha256 !== expectedExe || rows[0].packageFullName !== report.main.fullName ||
      rows[0].sid !== preflight.sid || rows[0].callerSid !== preflight.sid)
    throw Error('Installed process identity, bytes or elevation differ');
  report.processes.push({name,...rows[0]});
  return rows[0];
}
try {
  if (dirname(mainMsix).toLowerCase() !== dirname(optionalMsix).toLowerCase()) throw Error('Packages must share the verified handoff folder');
  const handoff = JSON.parse(readFileSync(join(dirname(mainMsix), 'handoff.json'), 'utf8'));
  if (handoff.source !== source || handoff.rapierExecutableSha256 !== expectedExe || handoff.rapierMsix !== basename(mainMsix) || handoff.optionalMsix !== basename(optionalMsix))
    throw Error('Arguments differ from verified handoff');
  if (!/^[A-Za-z0-9_.-]+$/.test(handoff.helper || '')) throw Error('Invalid helper path');
  helper = join(dirname(mainMsix), handoff.helper);
  const helperPin = handoff.files.find(file => file.path === handoff.helper), helperBytes = readFileSync(helper);
  if (!helperPin || helperBytes.length !== helperPin.bytes || hash(helperBytes) !== helperPin.sha256) throw Error('Native process helper differs from handoff');
  report.inputs = {mainMsix:basename(mainMsix),mainSignedSha256:hash(readFileSync(mainMsix)),optionalMsix:basename(optionalMsix),optionalSignedSha256:hash(readFileSync(optionalMsix)),mainExecutableSha256:expectedExe,helperSha256:helperPin.sha256};
  await powershell('inspect-packages', inspectScript, [mainMsix,optionalMsix,join(out,'package-inspection.json')]);
  preflight = JSON.parse(readFileSync(join(out,'package-inspection.json'),'utf8'));
  report.preflight = preflight;
  if (preflight.main.executableSha256 !== expectedExe) throw Error('Packaged main executable differs from exact source handoff');
  registrationAttempted = true;
  await powershell('register-main', registerScript, [mainMsix,'JackSkipworth.rapier','Main',join(out,'main-registration.json')], 120000);
  report.main = JSON.parse(readFileSync(join(out,'main-registration.json'),'utf8'));
  if (report.main.publisher !== preflight.main.publisher || report.main.version !== preflight.main.version) throw Error('Registered main identity differs');
  const exe = join(report.main.installLocation, 'rapier-host.exe');
  if (hash(readFileSync(exe)) !== expectedExe) throw Error('Installed main executable differs from package');
  app = spawn(exe, ['--new'], {env:{...process.env,RAPIER_TEST_DEVTOOLS_PORT:'9227'},stdio:'ignore'});
  await new Promise((resolveSpawn,reject) => {app.once('spawn',resolveSpawn);app.once('error',reject);});
  await identity('main-process-before');
  const target = await until(async () => {
    try { const response=await fetch('http://127.0.0.1:9227/json/list',{signal:AbortSignal.timeout(1500)});return (await response.json()).find(t=>t.type==='page'&&t.url==='https://rapier.local/rapier.html'); } catch {return null;}
  }, Boolean, 'installed Rapier WebView2', 90000);
  report.target = {id:target.id,url:target.url,title:target.title};
  socket = new WebSocket(target.webSocketDebuggerUrl);
  socket.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    if (message.id && pending.has(message.id)) {
      const call=pending.get(message.id);pending.delete(message.id);clearTimeout(call.timer);
      message.error ? call.reject(Error(JSON.stringify(message.error))) : call.resolve(message.result);
    } else if (message.method === 'Runtime.exceptionThrown') report.pageExceptions.push(message.params.exceptionDetails);
    else if (message.method === 'Network.responseReceived') {
      const response=message.params.response;
      if (response.url.startsWith('https://rapier.local/plugins/')) report.pluginResponses.push({url:response.url,status:response.status,requestId:message.params.requestId});
    } else if (message.method === 'Network.requestWillBeSent') {
      const url=message.params.request.url;
      if (/^https?:/.test(url) && !url.startsWith('https://rapier.local/')) report.externalRequests.push(url);
    }
  });
  await new Promise((resolveOpen,reject) => {const timer=setTimeout(()=>reject(Error('DevTools socket timeout')),remaining(10000));socket.addEventListener('open',()=>{clearTimeout(timer);resolveOpen();},{once:true});socket.addEventListener('error',event=>{clearTimeout(timer);reject(Error(String(event)));},{once:true});});
  await send('Runtime.enable');await send('Page.enable');await send('Network.enable');
  await until(()=>evaluate(`!!(window.RapierPlatform?.resources?.status && typeof _rapierProviders!=='undefined' && _rapierProviders.math)`),Boolean,'production native page API');
  report.initial = await evaluate(`(async()=>({url:location.href,timeOrigin:performance.timeOrigin,platform:RapierPlatform.environment.id,native:RapierPlatform.environment.native,math:_rapierProviders.math.status,pins:_rapierProviders.math.files.map(f=>({name:f.name,bytes:f.bytes,sri:f.sri,version:f.version})),resource:await RapierPlatform.resources.status('rapier-math')}))()`);
  if (report.initial.platform !== 'windows' || report.initial.native !== true || report.initial.resource.status !== 'absent') throw Error('Main startup is not the native absent-pack state');
  const mathPin = report.initial.pins;
  if (mathPin.length !== 1 || mathPin[0].bytes !== preflight.optional.math.bytes || mathPin[0].sri !== preflight.optional.math.sri) throw Error('Optional Math payload differs from shipped page pin');
  await evaluate(`(() => {
    window.__installedPluginEvents=[];
    window.addEventListener('rapier:mathplugin',e=>window.__installedPluginEvents.push({type:'math',detail:e.detail}));
    chrome.webview.addEventListener('message',e=>{try{
      const v=e.data?.channel==='host'?JSON.parse(e.data.payload):null;
      if(window.__installedPluginEvents.length>=100)return;
      if(v?.type==='event'&&v.event==='resources.changed')window.__installedPluginEvents.push({type:'native-event',message:v});
      else if(v?.type==='response'&&(v.result?.pack==='rapierplugins'||v.ok===false))window.__installedPluginEvents.push({type:'native-response',message:v});
    }catch{}});
    const close=[...document.querySelectorAll('button')].find(e=>e.textContent.trim()==='×'&&e.getBoundingClientRect().width>0&&e.getBoundingClientRect().height>0);
    if(close)close.click();
  })()`);
  await picture('rapier-startup','#btn-overflow');
  await click('#btn-overflow');
  if (await evaluate(`document.querySelector('#settings-plugins-word')?.getAttribute('aria-expanded')!=='true'`)) await click('#settings-plugins-word');
  await until(()=>evaluate(`_rapierProviders.math.status`),state=>state==='absent','Math initially absent');
  await picture('rapier-math-absent','#math-plugin-action');
  await powershell('register-optional', registerScript, [optionalMsix,'JackSkipworth.rapierplugins','Optional',join(out,'optional-registration.json')], 120000);
  report.optional = JSON.parse(readFileSync(join(out,'optional-registration.json'),'utf8'));
  if (report.optional.publisher !== report.main.publisher || report.optional.version !== report.main.version || report.optional.kind !== 'Optional') throw Error('Registered optional identity differs');
  await identity('main-process-after-registration');
  report.afterRegistration = await evaluate(`(async()=>({timeOrigin:performance.timeOrigin,resource:await RapierPlatform.resources.status('rapier-math')}))()`);
  if (report.afterRegistration.timeOrigin !== report.initial.timeOrigin || report.afterRegistration.resource.status !== 'ready') throw Error('Running process did not discover newly registered optional content');
  const installedMath = readFileSync(join(report.optional.installLocation,'plugins','rapier-math.bin'));
  report.installedMath = {bytes:installedMath.length,sha256:hash(installedMath),sri:hash(installedMath,'sha384','base64')};
  if (report.installedMath.bytes!==preflight.optional.math.bytes || report.installedMath.sha256!==preflight.optional.math.sha256 || report.installedMath.sri!==preflight.optional.math.sri) throw Error('Installed Math differs from packaged pins');
  const beforeLoad = report.pluginResponses.length;
  const beforeInstallEvents = await evaluate('window.__installedPluginEvents.length');
  await click('#math-plugin-action');
  await until(()=>evaluate(`({status:_rapierProviders.math.status,error:_rapierProviders.math.error})`),state=>{
    if(state.status==='error')throw Error('Real Math install failed: '+state.error);return state.status==='ready';
  },'actual Math installation',90000);
  await until(()=>visible('#math-plugin-overlay'),subject=>!subject,'Math install dialog closed');
  report.installReads = report.pluginResponses.slice(beforeLoad);
  if (!report.installReads.some(row=>row.url==='https://rapier.local/plugins/rapier-math'&&row.status===200)) throw Error('Math installation did not read actual native content');
  // Reopen the existing settings after the production installer closes them.
  if (!(await visible('#math-plugin-installed'))) {
    await click('#btn-overflow');
    if (await evaluate(`document.querySelector('#settings-plugins-word')?.getAttribute('aria-expanded')!=='true'`)) await click('#settings-plugins-word');
  }
  await picture('rapier-math-installed','#math-plugin-installed');
  report.math = await evaluate(`(async()=>{
    const p=_rapierProviders.math,svg=p.renderToString('x^2 + y^2 = z^2',{displayMode:true});
    if(typeof svg!=='string')throw Error('Math renderer returned no markup');
    const xml=new DOMParser().parseFromString(svg,'image/svg+xml');
    if(xml.querySelector('parsererror')||!xml.querySelector('svg'))throw Error('Math renderer returned invalid SVG');
    const response=await fetch('/plugins/rapier-math',{cache:'no-store',credentials:'omit'});
    if(!response.ok)throw Error('Native pinned Math reread failed');
    const bytes=await response.arrayBuffer();
    const sha256=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');
    const sri=btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.digest('SHA-384',bytes))));
    return {status:p.status,version:p.version,svg,timeOrigin:performance.timeOrigin,read:{bytes:bytes.byteLength,sha256,sri}};
  })()`);
  writeFileSync(join(out,'math-render.svg'),report.math.svg);
  report.math.svgSha256=hash(Buffer.from(report.math.svg));delete report.math.svg;
  if (report.math.status!=='ready'||report.math.timeOrigin!==report.initial.timeOrigin||report.math.read.bytes!==report.installedMath.bytes||report.math.read.sha256!==report.installedMath.sha256||report.math.read.sri!==mathPin[0].sri) throw Error('Rendered Math or native served bytes differ');
  report.events=await evaluate('window.__installedPluginEvents');
  if(!report.events.slice(beforeInstallEvents).some(row=>row.type==='native-response'&&row.message.ok===true&&row.message.result?.pack==='rapierplugins'&&row.message.result.status==='ready')) throw Error('No actual native ready answer during Math installation');
  await identity('main-process-after-math');
  if (report.externalRequests.length || report.pageExceptions.length) throw Error('Installed page had an external request or uncaught exception');
  report.sameProcess={pid:app.pid,timeOrigin:report.initial.timeOrigin,targetId:report.target.id};
  report.status='PASS';
} catch (error) {
  report.status='FAIL';report.error=String(error.stack||error);process.exitCode=1;
  if(socket?.readyState===WebSocket.OPEN){try{report.failurePage=await evaluate(`({url:location.href,text:document.body?.innerText.slice(0,16000),events:window.__installedPluginEvents||[]})`);await picture('rapier-plugin-failure','body');}catch{}}
} finally {
  cleanupMode=true;
  for(const call of pending.values()){clearTimeout(call.timer);call.reject(Error('Driver closed'));}pending.clear();
  socket?.close();
  if(app && app.pid && app.exitCode===null && app.signalCode===null){
    try {
      await powershell('close-main',String.raw`param([int]$IdToClose)
$ErrorActionPreference='Stop';$p=Get-Process -Id $IdToClose -ErrorAction Stop
if(-not $p.CloseMainWindow()){throw 'Installed window did not accept close'}
if(-not $p.WaitForExit(15000)){throw 'Installed window did not close'}
`,[String(app.pid)],20000);
      report.cleanup.push({step:'close-main',pass:true});
    }catch(error){report.cleanup.push({step:'close-main',pass:false,error:String(error)});report.status='FAIL';process.exitCode=1;app.kill();}
  }
  if(registrationAttempted && preflight){
    try {
      await powershell('remove-test-packages',String.raw`param([string]$Publisher,[string]$Version)
$ErrorActionPreference='Stop';Set-StrictMode -Version Latest;$ProgressPreference='SilentlyContinue'
foreach($name in @('JackSkipworth.rapierplugins','JackSkipworth.rapier')){
  foreach($p in @(Get-AppxPackage -Name $name -PackageTypeFilter Main,Optional)){
    if($p.Publisher -ne $Publisher -or $p.Version.ToString() -ne $Version){throw 'Cleanup identity changed'}
    Remove-AppxPackage -Package $p.PackageFullName -ErrorAction Stop
  }
  if(@(Get-AppxPackage -Name $name -PackageTypeFilter Main,Optional).Count){throw 'Test package remained registered'}
}
`,[preflight.main.publisher,preflight.main.version],60000);
      report.cleanup.push({step:'remove-test-packages',pass:true});
    }catch(error){report.cleanup.push({step:'remove-test-packages',pass:false,error:String(error)});report.status='FAIL';process.exitCode=1;}
  }
  jsonFile('installed-plugins.json',report);
}
console.log(JSON.stringify({status:report.status,source,pictures:report.pictures.map(row=>row.file),liveStore:report.liveStore}));
