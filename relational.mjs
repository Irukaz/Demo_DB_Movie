// Sixteen business tables from the ER diagram. Snapshot fields support the demo UI.
export const TABLES=['customer','branch','employee','theater','seat','movie','showtime','showtime_seat','promotion','customer_order','payment','ticket','food_drink_coupon','complaint','booking_operation','complaint_operation'];
export const keyId=value=>{let n=2166136261;for(const c of String(value))n=Math.imul(n^c.charCodeAt(0),16777619)>>>0;return n+1;};
const stamp=n=>new Date(n).toISOString().replace('T',' ').slice(0,23);
const day=()=>new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Bangkok'});
const seatIndex=s=>(s.charCodeAt(0)-65)*8+Number(s.slice(1));
const seatId=(room,seat)=>keyId(room)*100+seatIndex(seat);
const slotId=(show,seat)=>keyId(show)*100+seatIndex(seat);
const showKey=b=>`${b.room}|${b.date}|${b.time}`;
const status=s=>({pending:'HELD',paid:'BOOKED',cancelled:'CANCELLED',expired:'EXPIRED'}[s]);
const employeeFor=type=>type.startsWith('COMPLAINT')?4:type.includes('PAY')||type.includes('PAID')?2:type.includes('CHANGE')?3:1;
export function ledger(data,previous){
 data.ticketLedger=structuredClone(previous?.ticketLedger||[]);
 data.auditEvents=structuredClone(previous?.auditEvents||[]);
 for(const t of data.ticketLedger)t.status=['CANCELLED','EXPIRED'].includes(t.status)?t.status:'CHANGED';
 for(const b of data.bookings){
  const old=previous?.bookings.find(x=>x.id===b.id);
  b.paidAt=old?.paidAt||(b.status==='paid'?(old?.status==='paid'?old.created:Date.now()):old?.status==='paid'?old.created:undefined);
  b.redeemedAt=old?.redeemedAt||(b.couponUsed?Date.now():undefined);
  if(b.paidAt===undefined)delete b.paidAt;
  if(b.redeemedAt===undefined)delete b.redeemedAt;
  const type=!old?'BOOKING_CREATED':old.status!==b.status?'BOOKING_'+b.status.toUpperCase():showKey(old)!==showKey(b)||JSON.stringify(old.seats)!==JSON.stringify(b.seats)?'SHOWTIME_CHANGED':old.couponUsed!==b.couponUsed?'COUPON_REDEEMED':null;
  const ids=[];
  for(const seat of b.seats){const id=b.id+'|'+seat+'|'+showKey(b);ids.push(id);let t=data.ticketLedger.find(t=>t.id===id);if(!t){t={id,booking:b.id,movie:b.movie,room:b.room,date:b.date,time:b.time,seat,created:b.created};data.ticketLedger.push(t);}t.status=status(b.status);}
  if(type)for(const ticket of ids)data.auditEvents.push({id:data.auditEvents.length+1,kind:'booking',ticket,type,employee:employeeFor(type),at:Date.now()});
 }
 for(const r of data.requests){const old=previous?.requests.find(x=>x.id===r.id);if(!old||old.status!==r.status)for(const t of data.ticketLedger.filter(t=>t.booking===r.booking&&['HELD','BOOKED'].includes(t.status)))data.auditEvents.push({id:data.auditEvents.length+1,kind:'booking',ticket:t.id,type:'CHANGE_REQUEST_'+r.status.toUpperCase(),employee:3,at:Date.now()});}
 for(const c of data.complaints){const old=previous?.complaints.find(x=>x.id===c.id);if(!old||old.status!==c.status)data.auditEvents.push({id:data.auditEvents.length+1,kind:'complaint',problem:c.id,type:'COMPLAINT_'+c.status.toUpperCase(),employee:4,at:Date.now()});}
 return data;
}
export async function project(client,data){
 const rows=Object.fromEntries(TABLES.map(t=>[t,[]]));
 const add=(table,value)=>rows[table].push(value);
 const existing=(await client.query('SELECT customer_id,first_name,last_name,phone,email,password_hash FROM cinema67.customer')).rows;
 const contacts=new Map(existing.map(c=>[c.email.toLowerCase(),c]));
 const phones=new Map(existing.map(c=>[c.phone,c.email.toLowerCase()]));
 const contact=(email,phone,first,last)=>{email=email.trim().toLowerCase();phone=phone.replace(/\D/g,'');let c=contacts.get(email),phoneOwner=phones.get(phone);if(!c&&phoneOwner)c=contacts.get(phoneOwner);if(!c){c={customer_id:keyId(email),first_name:first||'Guest',last_name:last||'Demo',phone,email,password_hash:null};contacts.set(email,c);phones.set(phone,email)}if(first&&!c.password_hash)c.first_name=first;if(last&&!c.password_hash)c.last_name=last;return c.customer_id;};
 for(const c of data.cinemas)add('branch',{branch_id:keyId(c.id),branch_name:c.name,location:c.address});
 const roles=['ฝ่ายจัดการ','การเงิน','Call Center','HR','พนักงานหน้าโรง'];
 roles.forEach((role,i)=>add('employee',{employee_id:i+1,branch_id:keyId(data.cinemas[i%data.cinemas.length].id),name:'Demo '+role,email:'staff'+(i+1)+'@example.com',phone:null,role,status:'ACTIVE'}));
 for(const m of data.movies)add('movie',{movie_id:keyId(m.id),employee_id:1,movie_name:m.name,movie_description:m.description});
 for(const r of data.rooms){add('theater',{theater_id:keyId(r.id),branch_id:keyId(r.cinema),theater_name:r.name,theater_type:r.type,theater_number:r.name.replace('Theater ','T')});for(const row of ['A','B','C','D','E','F'])for(let col=1;col<=8;col++){const s=row+col;add('seat',{seat_id:seatId(r.id,s),theater_id:keyId(r.id),seat_number:s,zone_type:/^[EF]/.test(s)?'PREMIUM':'STANDARD',base_price:/^[EF]/.test(s)?250:180});}}
 for(const p of data.promos)add('promotion',{promotion_id:keyId(p.id),employee_id:1,promotion_name:p.name,promotion_code:p.code,discount_rate:p.value,is_deleted:p.active?0:1});
 const shows=new Map();
 const addShow=b=>{const key=showKey(b);shows.set(key,{key,room:b.room,movie:b.movie,date:b.date,time:b.time});};
 for(const r of data.rooms)if(r.active&&data.movies.some(m=>m.id===r.movie&&m.active&&!m.upcoming))for(let i=0;i<7;i++){const date=new Date(day()+'T12:00:00+07:00');date.setDate(date.getDate()+i);for(const time of data.times)addShow({room:r.id,movie:r.movie,date:date.toLocaleDateString('en-CA',{timeZone:'Asia/Bangkok'}),time});}
 for(const b of data.bookings)addShow(b);
 for(const t of data.ticketLedger||[])addShow(t);
 const occupied=new Map();for(const b of data.bookings)if(['pending','paid'].includes(b.status))for(const s of b.seats)occupied.set(showKey(b)+'|'+s,status(b.status));
 for(const s of shows.values()){
  add('showtime',{showtime_id:keyId(s.key),theater_id:keyId(s.room),movie_id:keyId(s.movie),show_date:s.date,show_time:s.time,show_status:data.rooms.find(r=>r.id===s.room)?.active?'OPEN':'CLOSED'});
  const h=[...`${s.movie}|${s.key}`].reduce((n,c)=>n+c.charCodeAt(0),0),blocked=h%2===0?['A3','A4','B6','D7']:['B3','B4','C7','D1'];
  for(const row of ['A','B','C','D','E','F'])for(let col=1;col<=8;col++){const seat=row+col;add('showtime_seat',{showtime_seat_id:slotId(s.key,seat),showtime_id:keyId(s.key),seat_id:seatId(s.room,seat),seat_status:occupied.get(s.key+'|'+seat)||(blocked.includes(seat)?'BLOCKED':'AVAILABLE')});}
 }
 for(const b of data.bookings){const order_id=keyId(b.id);add('customer_order',{order_id,customer_id:contact(b.email,b.phone,b.firstName,b.lastName),order_date:stamp(b.created),order_status:({pending:'PENDING',paid:'COMPLETED',cancelled:'CANCELLED',expired:'EXPIRED'}[b.status]),total_amount:b.amount});
  if(b.status==='paid'||b.paidAt)add('payment',{payment_id:order_id,order_id,amount:b.amount,payment_status:b.status==='cancelled'?'CANCELLED':'COMPLETED',payment_datetime:stamp(b.paidAt||b.created)});
  for(const [id,q] of Object.entries(b.items))if(q>0)add('food_drink_coupon',{coupon_id:keyId(b.id+'|'+id),order_id,coupon_code:'FOOD-'+b.id+'-'+id,item_type:(data.products.find(p=>p.id===id)?.name||id)+' × '+q,status:b.status!=='paid'?(b.status==='pending'?'PENDING':'VOID'):b.couponUsed?'REDEEMED':'AVAILABLE',redeem_datetime:b.couponUsed?stamp(b.redeemedAt||b.created):null});
 }
 for(const t of data.ticketLedger||[]){const b=data.bookings.find(b=>b.id===t.booking),promo=data.promos.find(p=>p.code===b.promo);add('ticket',{ticket_id:keyId(t.id),order_id:keyId(t.booking),showtime_seat_id:slotId(showKey(t),t.seat),promotion_id:promo?keyId(promo.id):null,ticket_code:'TCK-'+keyId(t.id),book_datetime:stamp(t.created),ticket_status:t.status});}
 for(const c of data.complaints)add('complaint',{problem_id:keyId(c.id),customer_id:contact(c.email,c.phone),problem_detail:c.detail,status:({pending:'PENDING',working:'WORKING',resolved:'RESOLVED'}[c.status])});
 rows.customer=[...contacts.values()];
 for(const e of data.auditEvents||[])if(e.kind==='booking')add('booking_operation',{operation_id:e.id,employee_id:e.employee,ticket_id:keyId(e.ticket),operation_type:e.type,operation_datetime:stamp(e.at)});else add('complaint_operation',{operation_id:e.id,employee_id:e.employee,problem_id:keyId(e.problem),operation_type:e.type,operation_datetime:stamp(e.at)});
 // Fixed table/column allowlist only. All values remain parameterized.
 await client.query('DELETE FROM cinema67.booking_operation;DELETE FROM cinema67.complaint_operation;DELETE FROM cinema67.food_drink_coupon;DELETE FROM cinema67.ticket;DELETE FROM cinema67.payment;DELETE FROM cinema67.customer_order;DELETE FROM cinema67.complaint;DELETE FROM cinema67.showtime_seat;DELETE FROM cinema67.showtime;DELETE FROM cinema67.seat;DELETE FROM cinema67.theater;DELETE FROM cinema67.movie;DELETE FROM cinema67.promotion;DELETE FROM cinema67.customer;DELETE FROM cinema67.employee;DELETE FROM cinema67.branch;');
 for(const table of TABLES){if(!rows[table].length)continue;const columns=Object.keys(rows[table][0]);const definitions=columns.map(c=>c+' '+(c.endsWith('_id')?'bigint':c.includes('datetime')||c==='order_date'?'timestamp':c==='show_date'||c==='release_date'?'date':c==='is_deleted'||c==='duration_min'?'integer':['amount','total_amount','base_price','discount_rate','minimum_amount'].includes(c)?'numeric':'text')).join(',');
  await client.query(`INSERT INTO cinema67.${table} (${columns.join(',')}) SELECT ${columns.join(',')} FROM jsonb_to_recordset($1::jsonb) AS x(${definitions})`,[JSON.stringify(rows[table])]);
 }
}
export async function databaseView(client,table){if(table){const name=table.toLowerCase();if(!TABLES.includes(name))throw new Error('Unknown table');const rows=await client.query(`SELECT * FROM cinema67.${name} ORDER BY 1 LIMIT 25`);if(name==='customer')for(const row of rows.rows)delete row.password_hash;return {name:name.toUpperCase(),rows:rows.rows};}const tables=[];for(const name of TABLES){const count=await client.query(`SELECT count(*)::int AS n FROM cinema67.${name}`);const columns=await client.query("SELECT column_name,data_type FROM information_schema.columns WHERE table_schema='cinema67' AND table_name=$1 ORDER BY ordinal_position",[name]);tables.push({name:name.toUpperCase(),count:count.rows[0].n,columns:columns.rows});}return {schema:'cinema67',tables};}

