import { readFileSync, writeFileSync } from 'node:fs';
let app=readFileSync(new URL('../../sites/cinema67/dist/app.js',import.meta.url),'utf8');
const begin=app.indexOf('let db;'), end=app.indexOf("let booking=",begin);
app=app.slice(0,begin)+`let db; let revision=0, ready=false, busy=false;
const accept=value=>{db=value.data;revision=value.revision;};
async function loadRemote(){const r=await fetch('/api/state',{cache:'no-store'});if(!r.ok)throw new Error('โหลดข้อมูลไม่สำเร็จ');accept(await r.json());}
async function save(){const r=await fetch('/api/state',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({data:db,revision})});const result=await r.json();if(!r.ok)throw new Error(result.error||'บันทึกไม่สำเร็จ');accept(result);}
function guarded(handler){return async e=>{if(!ready||busy){if(e.type==='submit')e.preventDefault();return}busy=true;try{await handler(e)}catch(err){try{await loadRemote();render()}catch{}toast(err.message||'ทำรายการไม่สำเร็จ')}finally{busy=false}}}
`+app.slice(end);
app=app.replace('function render(){expireBookings();','function render(){');
const expStart=app.indexOf('function expireBookings()'), expEnd=app.indexOf("window.addEventListener('hashchange'",expStart);
app=app.slice(0,expStart)+`function expireBookings(){return false}\n`+app.slice(expEnd);
const intervalStart=app.indexOf('setInterval('), intervalEnd=app.indexOf("document.addEventListener('input'",intervalStart);
app=app.slice(0,intervalStart)+`setInterval(()=>{const [route,id]=location.hash.slice(1).split('/');const b=db?.bookings.find(x=>x.id===id);if(route==='payment'&&$('#countdown')&&b)$('#countdown').textContent=remaining(b)},1000);
setInterval(async()=>{if(!ready||busy||document.hidden||$('#dialog').open)return;busy=true;try{const old=revision;await loadRemote();if(revision!==old)render()}catch{}finally{busy=false}},3000);
`+app.slice(intervalEnd);
app=app.replace("document.addEventListener('submit',e=>{","document.addEventListener('submit',guarded(async e=>{");
app=app.replace("document.addEventListener('click',e=>{","document.addEventListener('click',guarded(async e=>{");
app=app.replace("toast('เพิ่มรอบฉายแล้ว')}});","toast('เพิ่มรอบฉายแล้ว')}}));");
app=app.replace("\n}});\nfunction changeDialog", "\n}}));\nfunction changeDialog");
for(const name of ['approveRequest','saveRecord','toggleRecord']) {
  app=app.replace('function '+name+'(', 'async function '+name+'(');
  if(name==='approveRequest')app=app.replace("case 'approve-request':approveRequest(id);","case 'approve-request':await approveRequest(id);");
  if(name==='toggleRecord')app=app.replace("case 'toggle-record':toggleRecord(type,id);","case 'toggle-record':await toggleRecord(type,id);");
  if(name==='saveRecord')app=app.replace("if(f.id==='record-form')saveRecord(","if(f.id==='record-form')await saveRecord(");
}
app=app.replaceAll('save();','await save();');
app=app.replace("b.deadline=Date.now()-1;expireBookings();render()","b.deadline=Date.now()-1;b.status='expired';await save();render()");
app=app.replace("case 'reset-demo':db=applyFilmData(seed());await save();", "case 'reset-demo':{const r=await fetch('/api/reset',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({revision})});const value=await r.json();if(!r.ok)throw new Error(value.error);accept(value);}");
app=app.replaceAll('ข้อมูลเก็บในเบราว์เซอร์นี้','ข้อมูลจำลองเก็บใน PostgreSQL ร่วมกันทุกเครื่อง');
app=app.replaceAll('คืนข้อมูลตัวอย่างทั้งหมด และล้างรายการที่สร้างเพิ่มในเบราว์เซอร์นี้','คืนข้อมูลตัวอย่างทั้งหมดในฐานข้อมูลร่วม ทุกเครื่องจะเห็นข้อมูลใหม่');
app=app.replace("window.addEventListener('hashchange',()=>{render();","window.addEventListener('hashchange',()=>{if(!ready)return;render();");
app=app.replace(/render\(\);\s*$/,`$('#app').innerHTML='<div class="empty"><strong>กำลังโหลด Cinema67…</strong></div>';
loadRemote().then(()=>{ready=true;render()}).catch(()=>{$('#app').innerHTML='<div class="empty"><strong>ยังเชื่อมฐานข้อมูลไม่ได้</strong><p>กรุณาลองโหลดหน้าใหม่อีกครั้ง</p><button class="button" onclick="location.reload()">ลองอีกครั้ง</button></div>'});
`);
writeFileSync(new URL('./dist/app.js',import.meta.url),app);
let html=readFileSync(new URL('./dist/index.html',import.meta.url),'utf8');
html=html.replace('ข้อมูล การชำระเงิน และ QR ทั้งหมดเป็นตัวอย่างสำหรับการนำเสนอ','Demo ใช้ฐานข้อมูลร่วม · กรุณาใช้ข้อมูลติดต่อสมมติ · การชำระและ QR เป็นตัวอย่าง');
writeFileSync(new URL('./dist/index.html',import.meta.url),html);
