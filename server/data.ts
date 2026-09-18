import { env, sql, transaction } from './database.mjs';
import { currentUser } from './auth.mjs';
import { CATEGORIES, iso, months } from './model.mjs';
export const dynamic='force-dynamic';
function db(){if(!env.DB)throw new Error('Base de datos temporalmente no disponible. Intenta de nuevo.');return env.DB}
const id=()=>crypto.randomUUID();
const now=()=>new Date().toISOString();
function text(v:unknown,max=150){if(typeof v!=='string'||!v.trim()||v.trim().length>max)throw new Error('Revisa los campos obligatorios.');return v.trim()}
function date(v:unknown){const s=text(v,10);if(!/^\d{4}-\d{2}-\d{2}$/.test(s)||isNaN(Date.parse(s))||iso(new Date(s))!==s)throw new Error('Fecha no válida.');return s}
function integer(v:unknown,min:number,max:number){const n=Number(v);if(!Number.isInteger(n)||n<min||n>max)throw new Error(`El valor debe ser un entero entre ${min} y ${max}.`);return n}
function email(v:unknown){if(!v)return null;const s=text(v,200).toLowerCase();if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s))throw new Error('Correo no válido.');return s}
function log(actor:string,action:string,detail:unknown){return db().prepare('INSERT INTO history (id,actor,action,detail,date) VALUES (?,?,?,?,?)').bind(id(),actor,action,JSON.stringify(detail),now())}
async function identity(){const u=currentUser();return u?{...u,member:u}:null}
function responseError(e:unknown){console.error('mis-alas:',e);const message=e instanceof Error?e.message:'No se pudo completar la operación.';return Response.json({error:message.includes('UNIQUE')?'Ya existe un usuario, correo o registro con esos datos.':message},{status:400})}
export async function GET(){try{
 const auth=await identity();if(!auth)return Response.json({error:'Inicia sesión para continuar.',signin:true},{status:401});
 if(!auth.member)return Response.json({needsSetup:true,name:auth.displayName});
 const admin=auth.member.role==='admin';const d=db();
 const participants=await (admin?d.prepare('SELECT * FROM participants ORDER BY name'):d.prepare('SELECT * FROM participants WHERE id=?').bind(auth.participant_id)).all<any>();
 const ids=participants.results.map((p:any)=>p.id);let records:any[]=[],semesters:any[]=[],reviews:any[]=[],redemptions:any[]=[];
 if(admin){[records,semesters,reviews,redemptions]=await Promise.all(['records','semesters','reviews','redemptions'].map(async t=>(await d.prepare(`SELECT * FROM ${t}`).all()).results));}
 else if(ids.length){const pid=ids[0];[records,semesters,reviews,redemptions]=await Promise.all(['records','semesters','reviews','redemptions'].map(async t=>(await d.prepare(`SELECT * FROM ${t} WHERE participant_id=?`).bind(pid).all()).results));}
 const ranking=(await d.prepare(`SELECT p.alias, COALESCE((SELECT SUM(points) FROM records r WHERE r.participant_id=p.id),0) AS total,(SELECT COUNT(*) FROM semesters s WHERE s.participant_id=p.id AND complete=1) AS completed FROM participants p ORDER BY total DESC,p.alias ASC LIMIT 5`).all()).results;
 const history=admin?(await d.prepare('SELECT * FROM history ORDER BY date DESC LIMIT 60').all()).results:[];
 return Response.json({user:auth.member,participants:participants.results,records,semesters,reviews,redemptions,ranking,history},{headers:{'Cache-Control':'no-store'}});
 }catch(e){return responseError(e)}}
export async function POST(req:Request){try{
 const origin=req.headers.get('origin');if(origin&&origin!==new URL(req.url).origin)return Response.json({error:'Solicitud no válida.'},{status:403});
 const u=currentUser();if(!u)return Response.json({error:'Inicia sesión.',signin:true},{status:401});
 const raw=await req.text();if(raw.length>1_000_000)throw new Error('El archivo es demasiado grande. Importa hasta 500 registros por vez.');
 const b=JSON.parse(raw),d=db();const member=u;
 if(!member)return Response.json({error:'Tu cuenta no tiene acceso.'},{status:403});
 if(b.action==='review'){
  const pid=text(b.participant_id);const p=await d.prepare('SELECT * FROM participants WHERE id=?').bind(pid).first<any>();
  if(!p||(member.role!=='admin'&&p.id!==u.participant_id))return Response.json({error:'Sin permiso.'},{status:403});
  await d.prepare('INSERT INTO reviews(id,participant_id,message,status,date) VALUES (?,?,?,?,?)').bind(id(),pid,text(b.message,1000),'Pendiente',now()).run();return Response.json({ok:true});
 }
 if(member.role!=='admin')return Response.json({error:'Solo administración puede modificar los datos.'},{status:403});
 const actor=u.username;
 if(b.action==='participant'){
  const pid=b.id?text(b.id):id(),code=text(b.code,40),name=text(b.name,120),alias=text(b.alias,50),group=text(b.group_name,40),mail=null,start=date(b.start);
  const old=await d.prepare('SELECT * FROM participants WHERE id=?').bind(pid).first<any>();
  if(old&&old.start!==start)throw new Error('Cambia las fechas desde la configuración de semestres para conservar los registros.');
  const stmts=[d.prepare('INSERT INTO participants (id,code,name,alias,group_name,email,start,created) VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET code=excluded.code,name=excluded.name,alias=excluded.alias,group_name=excluded.group_name').bind(pid,code,name,alias,group,mail,start,now())];
  if(!old)for(let s=1;s<=4;s++){const end=new Date(months(start,s*6)+'T12:00:00Z');end.setUTCDate(end.getUTCDate()-1);stmts.push(d.prepare('INSERT INTO semesters(id,participant_id,number,start,end,complete) VALUES (?,?,?,?,?,0)').bind(id(),pid,s,months(start,(s-1)*6),iso(end)));}
  stmts.push(log(actor,old?'Perfil actualizado':'Participante creado',{code,name,alias,group,mail}));await d.batch(stmts);return Response.json({ok:true,id:pid});
 }
 if(b.action==='semester'){
  const sid=text(b.id),start=date(b.start),end=date(b.end),complete=b.complete?1:0;
  const s=await d.prepare('SELECT * FROM semesters WHERE id=?').bind(sid).first<any>();if(!s)throw new Error('Semestre no encontrado.');if(start>end)throw new Error('La fecha final debe ser posterior al inicio.');
  const overlap=await d.prepare('SELECT id FROM semesters WHERE participant_id=? AND id<>? AND start<=? AND end>=?').bind(s.participant_id,sid,end,start).first();if(overlap)throw new Error('Estas fechas se cruzan con otro semestre.');
  const outside=await d.prepare('SELECT id FROM records WHERE participant_id=? AND semester=? AND (date<? OR date>?)').bind(s.participant_id,s.number,start,end).first();if(outside)throw new Error('Existen registros fuera del nuevo rango. Corrige sus fechas primero.');
  if(complete&&end>iso())throw new Error('Espera a la fecha final para validar el semestre.');
  await d.batch([d.prepare('UPDATE semesters SET start=?,end=?,complete=? WHERE id=?').bind(start,end,complete,sid),log(actor,'Semestre actualizado',{before:s,after:{start,end,complete}})]);return Response.json({ok:true});
 }
 if(b.action==='deleteRecord'){
  const rid=text(b.id),reason=text(b.reason,500);
  transaction(()=>{
   const old=sql.prepare('SELECT * FROM records WHERE id=?').get(rid);
   if(!old)throw new Error('La actividad ya no existe. Actualiza la página.');
   sql.prepare('DELETE FROM records WHERE id=?').run(rid);
   log(actor,'Actividad eliminada',{before:old,reason}).run();
  });
  return Response.json({ok:true});
 }
 if(b.action==='record'||b.action==='import'){
  const input=b.action==='record'?[b.record]:b.records;if(!Array.isArray(input)||!input.length||input.length>500)throw new Error('Importa entre 1 y 500 registros.');
  const allSem=(await d.prepare('SELECT * FROM semesters').all<any>()).results;
  const stmts:any[]=[];const seen=new Set();let changed=0,skipped=0;
  for(const r of input){const pid=text(r.participant_id),dt=date(r.date),sem=integer(r.semester,1,4),category=text(r.category),activity=text(r.activity,150),cycle=text(r.cycle,80),points=integer(r.points,0,10000),max=integer(r.max,1,10000);
   if(!CATEGORIES.includes(category)||points>max)throw new Error('Categoría no válida o puntos mayores al máximo.');
   const s=allSem.find((s:any)=>s.participant_id===pid&&s.number===sem);if(!s||dt<s.start||dt>s.end)throw new Error(`La fecha ${dt} no pertenece al semestre ${sem} de la participante.`);
   const key=[pid,dt,category,activity].join('|');if(seen.has(key))throw new Error('El archivo incluye registros duplicados. Corrígelos antes de importar.');seen.add(key);
   const old=r.id?await d.prepare('SELECT * FROM records WHERE id=?').bind(text(r.id)).first<any>():await d.prepare('SELECT * FROM records WHERE participant_id=? AND date=? AND category=? AND activity=?').bind(pid,dt,category,activity).first<any>();
   if(r.id&&!old)throw new Error('Registro no encontrado.');
   if(b.action==='import'&&old&&b.mode!=='replace'){skipped++;continue;}
   const rid=old?.id??id();stmts.push(d.prepare('INSERT INTO records(id,participant_id,semester,date,cycle,category,activity,points,max,updated) VALUES (?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET participant_id=excluded.participant_id,semester=excluded.semester,date=excluded.date,cycle=excluded.cycle,category=excluded.category,activity=excluded.activity,points=excluded.points,max=excluded.max,updated=excluded.updated').bind(rid,pid,sem,dt,cycle,category,activity,points,max,now()));
   stmts.push(log(actor,b.action==='import'?'Registro importado':'Registro guardado',{before:old,after:{...r,id:rid},reason:b.reason||'Captura/importación'}));changed++;
  }
  if(stmts.length)await d.batch(stmts);return Response.json({ok:true,changed,skipped});
 }
 if(b.action==='resolve'){await d.batch([d.prepare("UPDATE reviews SET status='Atendida' WHERE id=?").bind(text(b.id)),log(actor,'Revisión atendida',{id:b.id})]);return Response.json({ok:true});}
 if(b.action==='redeem'){
  const pid=text(b.participant_id),points=integer(b.points,1,1000000),item=text(b.item,150);const rid=id();
  const result=await d.prepare(`INSERT INTO redemptions(id,participant_id,item,points,date) SELECT ?,?,?,?,? WHERE EXISTS(SELECT 1 FROM participants WHERE id=?) AND COALESCE((SELECT SUM(points) FROM records WHERE participant_id=?),0)-COALESCE((SELECT SUM(points) FROM redemptions WHERE participant_id=?),0)>=?`).bind(rid,pid,item,points,now(),pid,pid,pid,points).run();
  if(!result.meta.changes)throw new Error('El saldo no alcanza para este canje.');await log(actor,'Canje registrado',{pid,item,points}).run();return Response.json({ok:true});
 }
 throw new Error('Acción no disponible.');
 }catch(e){return responseError(e)}}
