import{randomBytes,randomUUID,scrypt as derive,timingSafeEqual,createHash}from'node:crypto';
import{promisify}from'node:util';import{AsyncLocalStorage}from'node:async_hooks';
import{sql,transaction}from'./database.mjs';import{iso,months}from'./model.mjs';
const scrypt=promisify(derive);export const context=new AsyncLocalStorage();export const currentUser=()=>context.getStore()||null;
export const digest=s=>createHash('sha256').update(s).digest('hex');
export function username(v){if(typeof v!=='string'||!/^[a-zA-Z0-9_.-]{3,32}$/.test(v))throw Error('Usa un nombre de usuario de 3 a 32 letras, números, puntos, guiones o guiones bajos.');return v.toLowerCase()}
export function validatePassword(v){if(typeof v!=='string'||v.length<12||v.length>128)throw Error('La contraseña debe tener entre 12 y 128 caracteres. Puedes usar una frase.');return v}
export async function hashPassword(p){validatePassword(p);const salt=randomBytes(16).toString('hex');const key=await scrypt(p,salt,64,{N:32768,r:8,p:1,maxmem:64*1024*1024});return salt+':'+key.toString('hex')}
export async function verifyPassword(p,hash){if(typeof p!=='string'||p.length>128)return false;const [salt,key]=hash.split(':');const check=await scrypt(p,salt,64,{N:32768,r:8,p:1,maxmem:64*1024*1024});return timingSafeEqual(check,Buffer.from(key,'hex'))}
const dummy='00000000000000000000000000000000:'+ '00'.repeat(64);
export function identify(req){const token=(req.headers.get('cookie')||'').split(';').map(s=>s.trim()).find(s=>s.startsWith('alas_session='))?.slice(13);if(!token||!/^[a-f0-9]{64}$/.test(token))return null;return sql.prepare('SELECT a.id,a.username,a.name,a.role,a.participant_id FROM sessions s JOIN accounts a ON a.id=s.account_id WHERE s.token_hash=? AND s.expires>?').get(digest(token),Date.now())||null}
function cookie(token,maxAge=43200){return `alas_session=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${process.env.NODE_ENV==='production'?'; Secure':''}`}
function session(id){const token=randomBytes(32).toString('hex');sql.prepare('DELETE FROM sessions WHERE expires<?').run(Date.now());sql.prepare('INSERT INTO sessions VALUES (?,?,?)').run(digest(token),id,Date.now()+43200000);return cookie(token)}
function limit(key,max,period=900000){const now=Date.now();sql.prepare('DELETE FROM limits WHERE expires<?').run(now);const row=sql.prepare('INSERT INTO limits VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1 RETURNING count').get(key,now+period);if(row.count>max){const e=Error('Demasiados intentos. Espera unos minutos e intenta de nuevo.');e.status=429;throw e}}
export async function auth(req,ip){try{
 const action=new URL(req.url).pathname.split('/').at(-1);
 if(req.method!=='POST')return Response.json({error:'Método no permitido.'},{status:405});
 if(action==='logout'){const token=(req.headers.get('cookie')||'').split(';').map(s=>s.trim()).find(s=>s.startsWith('alas_session='))?.slice(13);if(token)sql.prepare('DELETE FROM sessions WHERE token_hash=?').run(digest(token));return Response.json({ok:true},{headers:{'Set-Cookie':cookie('',0)}})}
 limit('ip:'+digest(ip),200);limit('global',120,60000);
 const b=await req.json();const user=username(b.username);limit('user:'+user,10);
 if(action==='login'){
 const a=sql.prepare('SELECT * FROM accounts WHERE username=?').get(user);const valid=await verifyPassword(b.password,a?.password_hash||dummy);
 if(!a||!valid)return Response.json({error:'Usuario o contraseña incorrectos.'},{status:401});
 sql.prepare('DELETE FROM limits WHERE key=?').run('user:'+user);return Response.json({ok:true},{headers:{'Set-Cookie':session(a.id)}})
 }
 if(action==='register'){
 if(!sql.prepare("SELECT id FROM accounts WHERE role='admin'").get())return Response.json({error:'La asociación todavía está configurando el acceso. Intenta más tarde.'},{status:503});
 const name=typeof b.name==='string'?b.name.trim():'';if(!name||name.length>120)throw Error('Indica tu nombre (máximo 120 caracteres).');
 const alias=typeof b.alias==='string'?b.alias.trim():'';if(!alias||alias.length>50)throw Error('Elige un apodo para aparecer en el top 5.');
 const hash=await hashPassword(b.password);const id=randomUUID(),pid=randomUUID(),start=iso(),created=new Date().toISOString();
 transaction(()=>{sql.prepare('INSERT INTO participants (id,code,name,alias,group_name,start,created) VALUES (?,?,?,?,?,?,?)').run(pid,'USR-'+user,name,alias,'Por asignar',start,created);
 sql.prepare("INSERT INTO accounts VALUES (?,?,?,?,'participant',?,?)").run(id,user,name,hash,pid,created);
 for(let n=1;n<=4;n++){const end=new Date(months(start,n*6)+'T12:00:00Z');end.setUTCDate(end.getUTCDate()-1);sql.prepare('INSERT INTO semesters VALUES (?,?,?,?,?,0)').run(randomUUID(),pid,n,months(start,(n-1)*6),iso(end))}
 sql.prepare('INSERT INTO history VALUES (?,?,?,?,?)').run(randomUUID(),user,'Cuenta creada',JSON.stringify({participant_id:pid}),created)});
 return Response.json({ok:true},{status:201,headers:{'Set-Cookie':session(id)}})
 }
 return Response.json({error:'Acción no disponible.'},{status:404});
 }catch(e){return Response.json({error:e.message?.includes('UNIQUE')?'Ese usuario ya existe. Elige otro.':e.message||'No se pudo completar.'},{status:e.status||400})}}
