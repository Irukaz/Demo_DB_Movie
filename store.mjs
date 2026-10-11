import { readFileSync } from 'node:fs';
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { buildSeed } from './seed.mjs';
import { project,ledger,databaseView,keyId } from './relational.mjs';

export class DemoError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}
const fail = message => { throw new DemoError(message); };
const start = b => new Date(`${b.date}T${b.time}:00+07:00`).getTime();
const show = b => `${b.room}|${b.date}|${b.time}`;
const price = s => /^[EF]/.test(s) ? 250 : 180;
const fixedSeats = b => {
  const h = [...`${b.movie}|${b.room}|${b.date}|${b.time}`].reduce((s,c)=>s+c.charCodeAt(0),0);
  return h%2===0 ? ['A3','A4','B6','D7'] : ['B3','B4','C7','D1'];
};
const cleanEmail=value=>String(value||'').trim().toLowerCase();
const cleanPhone=value=>String(value||'').replace(/\D/g,'');
const publicCustomer=row=>({id:String(row.customer_id),firstName:row.first_name,lastName:row.last_name,email:row.email,phone:row.phone});
const passwordHash=password=>{const salt=randomBytes(16).toString('hex');return `scrypt$${salt}$${scryptSync(password,salt,64).toString('hex')}`;};
const passwordMatches=(password,encoded)=>{try{const [,salt,hex]=encoded.split('$'),actual=scryptSync(password,salt,64),expected=Buffer.from(hex,'hex');return actual.length===expected.length&&timingSafeEqual(actual,expected)}catch{return false}};
export function expire(data, now = Date.now()) {
  let changed = false;
  for (const b of data.bookings) if (b.status === 'pending' && b.deadline <= now) {
    b.status = 'expired'; changed = true;
  }
  return changed;
}
export function validate(next, previous, {reset = false, now = Date.now()} = {}) {
  if (!next || next.version !== 1) fail('ข้อมูล Demo ไม่ถูกต้อง');
  for (const name of ['movies','cinemas','rooms','times','products','promos','bookings','requests','complaints']) {
    if (!Array.isArray(next[name]) || next[name].length > 5000) fail('ข้อมูลเกินขอบเขต Demo');
    if (name !== 'times') {
      const ids = next[name].map(x=>x?.id);
      if(ids.some(id=>typeof id!=='string'||id.length>80)||new Set(ids).size!==ids.length) fail('รหัสซ้ำหรือไม่ถูกต้อง');
    }
  }
  if(!Number.isSafeInteger(next.nextId)||next.nextId<1004) fail('เลขการจองไม่ถูกต้อง');
  if(next.times.length===0||next.times.some(t=>!/^([01]\d|2[0-3]):[0-5]\d$/.test(t))) fail('รอบฉายไม่ถูกต้อง');
  for(const r of next.rooms) if(!next.cinemas.some(c=>c.id===r.cinema)||!next.movies.some(m=>m.id===r.movie)) fail('ห้องฉายไม่มีสาขาหรือหนังอ้างอิง');
  for(const p of next.products) if(!Number.isFinite(p.price)||p.price<0) fail('ราคาสินค้าไม่ถูกต้อง');
  for(const p of next.promos) if(!['percent','amount'].includes(p.kind)||!Number.isFinite(p.value)||p.value<0||!Number.isFinite(p.min)||p.min<0||(p.kind==='percent'&&p.value>100)) fail('โปรโมชั่นไม่ถูกต้อง');
  const occupied=new Set();
  for(const b of next.bookings) {
    const old=previous?.bookings.find(x=>x.id===b.id);
    const room=next.rooms.find(r=>r.id===b.room), movie=next.movies.find(m=>m.id===b.movie);
    if(!room||!movie||room.cinema!==b.cinema||room.movie!==b.movie) fail('หนังและห้องฉายไม่ตรงกัน');
    if(!/^\d{4}-\d{2}-\d{2}$/.test(b.date)||!Number.isFinite(start(b))||!/^([01]\d|2[0-3]):[0-5]\d$/.test(b.time)) fail('วันหรือรอบฉายไม่ถูกต้อง');
    if(typeof b.email!=='string'||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(b.email)||b.email.length>254||!/^0\d{8,9}$/.test(b.phone)) fail('กรุณาตรวจอีเมลและเบอร์โทร');
    if(!['pending','paid','cancelled','expired'].includes(b.status)||!Array.isArray(b.seats)||!b.seats.length||b.seats.length>48||new Set(b.seats).size!==b.seats.length||b.seats.some(s=>!/^([A-F])[1-8]$/.test(s))) fail('ที่นั่งหรือสถานะไม่ถูกต้อง');
    if(!Number.isFinite(b.amount)||b.amount<0||!Number.isFinite(b.created)) fail('ยอดเงินไม่ถูกต้อง');
    if(b.status==='pending'&&!Number.isFinite(b.deadline)) fail('เวลาชำระไม่ถูกต้อง');
    if(!b.items||typeof b.items!=='object'||Array.isArray(b.items)) fail('สินค้าไม่ถูกต้อง');
    for(const [id,q] of Object.entries(b.items)) if(!next.products.some(p=>p.id===id)||!Number.isInteger(q)||q<0||q>20) fail('จำนวนสินค้าไม่ถูกต้อง');
    if(!reset&&!old) {
      if(b.status!=='pending'||start(b)<=now||!room.active||!movie.active||movie.upcoming||!next.times.includes(b.time)) fail('รอบนี้ไม่เปิดให้จอง');
      b.created=now; b.deadline=now+600000; b.couponUsed=false;
      const sub=b.seats.reduce((s,x)=>s+price(x),0)+Object.entries(b.items).reduce((s,[id,q])=>s+next.products.find(p=>p.id===id).price*q,0);
      const promo=next.promos.find(p=>p.active&&p.code===b.promo);
      b.discount=promo&&sub>=promo.min?Math.min(sub,promo.kind==='percent'?Math.round(sub*promo.value/100):promo.value):0;
      b.amount=sub-b.discount;
    }
    if(!reset&&old) {
      const allowed={pending:['pending','paid','cancelled','expired'],paid:['paid','cancelled'],expired:['expired'],cancelled:['cancelled']};
      if(!allowed[old.status].includes(b.status)) fail('ไม่สามารถเปลี่ยนสถานะนี้ได้');
      if(old.status==='pending'&&old.deadline<=now&&b.status==='paid') fail('หมดเวลาชำระเงินแล้ว');
      if(old.status==='paid'&&b.status==='cancelled'&&start(old)<=now) fail('รอบนี้เริ่มแล้ว ยกเลิกไม่ได้');
      if(b.amount!==old.amount||b.discount!==old.discount||b.email!==old.email||b.phone!==old.phone||JSON.stringify(b.items)!==JSON.stringify(old.items)) fail('แก้ยอดหรือข้อมูลของการจองเดิมไม่ได้');
      if(show(b)!==show(old)||JSON.stringify(b.seats)!==JSON.stringify(old.seats)) {
        if(old.status!=='paid'||start(old)<=now||start(b)<=now||!next.times.includes(b.time)||!room.active||b.room!==old.room||b.movie!==old.movie||b.seats.length!==old.seats.length||b.seats.reduce((s,x)=>s+price(x),0)!==old.seats.reduce((s,x)=>s+price(x),0)||!next.requests.some(r=>r.booking===b.id&&r.status==='approved'&&r.date===b.date&&r.time===b.time)) fail('เปลี่ยนรอบไม่ตรงกับคำขออนุมัติ');
      }
      if(b.status==='pending') b.deadline=Math.min(b.deadline,old.deadline);
      b.created=old.created;
    }
    if(['pending','paid'].includes(b.status)) for(const seat of b.seats) {
      const key=show(b)+'|'+seat;
      if(occupied.has(key)||fixedSeats(b).includes(seat)) throw new DemoError('ที่นั่งถูกจองแล้ว กรุณาเลือกใหม่',409);
      occupied.add(key);
    }
  }
  if(!reset&&previous.bookings.some(b=>!next.bookings.some(n=>n.id===b.id))) fail('ต้องเก็บประวัติการจองเดิม');
  for(const r of next.requests) if(!next.bookings.some(b=>b.id===r.booking)||!['pending','approved','rejected'].includes(r.status)||!Number.isFinite(start(r))) fail('คำขอเปลี่ยนรอบไม่ถูกต้อง');
  for(const c of next.complaints) if(!['pending','working','resolved'].includes(c.status)||typeof c.detail!=='string'||c.detail.length>1000) fail('เรื่องร้องเรียนไม่ถูกต้อง');
  expire(next,now);
  return next;
}

export async function createStore(pool) {
  await pool.query(readFileSync(new URL('./schema.sql',import.meta.url),'utf8'));
  const transact=async action=>{
    const c=await pool.connect();
    try { await c.query('BEGIN'); await c.query('SELECT pg_advisory_xact_lock(670067)'); const result=await action(c); await c.query('COMMIT'); return result; }
    catch(e){await c.query('ROLLBACK'); throw e;} finally {c.release();}
  };
  await transact(async c=>{
    const {rows}=await c.query('SELECT id,data,revision FROM demo_state WHERE id=1');
    if(!rows.length) {const data=ledger(buildSeed(),null);data.relationalVersion=1;await project(c,data);await c.query('INSERT INTO demo_state(id,data) VALUES(1,$1)',[data]);}
    else if((rows[0].data.catalogueVersion||1)<2){const data=rows[0].data,fixtures=buildSeed();for(const m of fixtures.movies)if(Number(m.id.slice(1))>=8&&!data.movies.some(x=>x.id===m.id))data.movies.push(m);for(const r of fixtures.rooms)if(Number(r.movie.slice(1))>=8&&!data.rooms.some(x=>x.id===r.id))data.rooms.push(r);data.catalogueVersion=2;await project(c,data);await c.query('UPDATE demo_state SET data=$1,revision=revision+1,updated_at=now() WHERE id=1',[data]);}
    if(rows.length&&!rows[0].data.relationalVersion){const data=ledger(rows[0].data,null);data.relationalVersion=1;await project(c,data);await c.query('UPDATE demo_state SET data=$1,revision=revision+1,updated_at=now() WHERE id=1',[data]);}
  });
  async function read(c) {
    const {rows}=await c.query('SELECT data,revision FROM demo_state WHERE id=1 FOR UPDATE');
    const row=rows[0];
    const previous=structuredClone(row.data);if(expire(row.data)) {ledger(row.data,previous);await project(c,row.data);row.revision++;await c.query('UPDATE demo_state SET data=$1,revision=$2,updated_at=now() WHERE id=1',[row.data,row.revision]);}
    return row;
  }
  return {
    get:()=>transact(read),
    database:table=>transact(c=>databaseView(c,table)),
    ddl:()=>readFileSync(new URL('./schema.sql',import.meta.url),'utf8'),
    register:input=>transact(async c=>{
      const firstName=String(input.firstName||'').trim(),lastName=String(input.lastName||'').trim(),email=cleanEmail(input.email),phone=cleanPhone(input.phone),password=String(input.password||'');
      if(!firstName||!lastName||firstName.length>100||lastName.length>100)fail('กรุณากรอกชื่อและนามสกุล');
      if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||email.length>254||!/^0\d{8,9}$/.test(phone))fail('กรุณาตรวจอีเมลและเบอร์โทร');
      if(password.length<8||password.length>128)fail('รหัสผ่านต้องมี 8–128 ตัวอักษร');
      const found=(await c.query('SELECT * FROM cinema67.customer WHERE lower(email)=$1 OR phone=$2 FOR UPDATE',[email,phone])).rows;
      const sameEmail=found.find(x=>x.email.toLowerCase()===email),samePhone=found.find(x=>x.phone===phone);
      if(sameEmail?.password_hash)throw new DemoError('อีเมลนี้มีบัญชีแล้ว กรุณาเข้าสู่ระบบ',409);
      if(samePhone&&samePhone.email.toLowerCase()!==email)throw new DemoError('เบอร์โทรนี้ถูกใช้กับบัญชีอื่นแล้ว',409);
      if(sameEmail&&sameEmail.phone!==phone)throw new DemoError('อีเมลนี้ถูกใช้กับเบอร์โทรอื่นแล้ว',409);
      let row;
      if(sameEmail){row=(await c.query('UPDATE cinema67.customer SET first_name=$1,last_name=$2,password_hash=$3 WHERE customer_id=$4 RETURNING *',[firstName,lastName,passwordHash(password),sameEmail.customer_id])).rows[0];}
      else{row=(await c.query('INSERT INTO cinema67.customer(customer_id,first_name,last_name,email,phone,password_hash) VALUES($1,$2,$3,$4,$5,$6) RETURNING *',[keyId(email),firstName,lastName,email,phone,passwordHash(password)])).rows[0];}
      return publicCustomer(row);
    }),
    authenticate:(email,password)=>transact(async c=>{const row=(await c.query('SELECT * FROM cinema67.customer WHERE lower(email)=$1',[cleanEmail(email)])).rows[0];if(!row?.password_hash||!passwordMatches(String(password||''),row.password_hash))throw new DemoError('อีเมลหรือรหัสผ่านไม่ถูกต้อง',401);return publicCustomer(row);}),
    customer:id=>transact(async c=>{const row=(await c.query('SELECT * FROM cinema67.customer WHERE customer_id=$1',[id])).rows[0];return row?publicCustomer(row):null;}),
    put:(data,revision,user)=>transact(async c=>{
      const old=await read(c);
      if(revision!==old.revision) throw new DemoError('ข้อมูลมีการเปลี่ยนแปลง โหลดล่าสุดแล้ว กรุณาทำรายการอีกครั้ง',409);
      const newBookings=data.bookings.filter(b=>!old.data.bookings.some(x=>x.id===b.id));
      const newComplaints=data.complaints.filter(x=>!old.data.complaints.some(c=>c.id===x.id));
      if(newBookings.length||newComplaints.length){if(!user)throw new DemoError('กรุณาเข้าสู่ระบบก่อนทำรายการ',401);for(const x of [...newBookings,...newComplaints])if(cleanEmail(x.email)!==user.email||cleanPhone(x.phone)!==user.phone)throw new DemoError('ข้อมูลผู้ทำรายการไม่ตรงกับบัญชีที่เข้าสู่ระบบ',403);}
      const next=ledger(validate(data,old.data),old.data);next.relationalVersion=1;
      await project(c,next);
      await c.query('UPDATE demo_state SET data=$1,revision=revision+1,updated_at=now() WHERE id=1',[next]);
      return {data:next,revision:old.revision+1};
    }),
    reset:revision=>transact(async c=>{
      const old=await read(c);
      if(revision!==old.revision) throw new DemoError('ข้อมูลเปลี่ยนแล้ว กรุณาตรวจใหม่ก่อนรีเซ็ต',409);
      const data=ledger(buildSeed(),null);data.relationalVersion=1;await project(c,data);
      await c.query('UPDATE demo_state SET data=$1,revision=revision+1,updated_at=now() WHERE id=1',[data]);
      return {data,revision:old.revision+1};
    })
  };
}

