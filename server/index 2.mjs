import{createServer}from'node:http';import{readFile,stat}from'node:fs/promises';import{resolve,extname}from'node:path';
import{auth,identify,context,hashPassword,username}from'./auth.mjs';import{GET,POST}from'./data.mjs';
import{randomUUID}from'node:crypto';import{sql,transaction}from'./database.mjs';
const port=Number(process.env.PORT||3000);const production=process.env.NODE_ENV==='production';const origin=process.env.PUBLIC_ORIGIN||`http://localhost:${port}`;
if(production&&(!process.env.PUBLIC_ORIGIN||new URL(origin).protocol!=='https:'))throw Error('Configura PUBLIC_ORIGIN con la dirección HTTPS pública.');
// Bootstrap only from hosting settings, never from a public request.
// Existing administrators and passwords are preserved on every restart.
if(!sql.prepare("SELECT id FROM accounts WHERE role='admin'").get()){
 const initialUser=process.env.ADMIN_USERNAME,initialPassword=process.env.ADMIN_PASSWORD;
 if(initialUser!==undefined||initialPassword!==undefined){
  const user=username(initialUser);const hash=await hashPassword(initialPassword);
  transaction(()=>{
   if(sql.prepare("SELECT id FROM accounts WHERE role='admin'").get())return;
   if(sql.prepare('SELECT id FROM accounts WHERE username=?').get(user))throw Error('ADMIN_USERNAME ya pertenece a una cuenta. Elige otro usuario para administrar.');
   sql.prepare("INSERT INTO accounts VALUES (?,?,?,?,'admin',NULL,?)").run(randomUUID(),user,'Administración',hash,new Date().toISOString());
  });
  console.log('Administrador inicial configurado.');
 }
}
delete process.env.ADMIN_PASSWORD;
const root=resolve('dist');let authActive=0;
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.png':'image/png','.svg':'image/svg+xml','.woff2':'font/woff2','.ico':'image/x-icon'};
const server=createServer(async(req,res)=>{try{
 res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','same-origin');res.setHeader('X-Frame-Options','DENY');res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; font-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'");
 if(production)res.setHeader('Strict-Transport-Security','max-age=31536000');
 const url=new URL(req.url,origin);if(url.pathname.startsWith('/api/')){
 res.setHeader('Cache-Control','no-store');
 if(req.method==='POST'&&(req.headers.origin!==origin||!req.headers['content-type']?.startsWith('application/json'))){res.writeHead(403);res.end(JSON.stringify({error:'Solicitud no válida.'}));return}
 let size=0;const chunks=[];for await(const chunk of req){size+=chunk.length;if(size>1_000_000){res.writeHead(413);res.end();return}chunks.push(chunk)}
 const request=new Request(url,{method:req.method,headers:req.headers,...(req.method==='POST'?{body:Buffer.concat(chunks)}:{})});let result;
 if(url.pathname.startsWith('/api/auth/')){if(authActive>=4){res.writeHead(429);res.end(JSON.stringify({error:'Intenta de nuevo en unos segundos.'}));return}authActive++;try{result=await auth(request,req.socket.remoteAddress||'unknown')}finally{authActive--}}
 else if(url.pathname==='/api/data'&&['GET','POST'].includes(req.method)){result=await context.run(identify(request),()=>req.method==='GET'?GET():POST(request))}
 else result=Response.json({error:'No encontrado.'},{status:404});
 res.writeHead(result.status,Object.fromEntries(result.headers));res.end(Buffer.from(await result.arrayBuffer()));return
 }
 if(!['GET','HEAD'].includes(req.method)){res.writeHead(405);res.end();return}
 const path=resolve(root,'.'+decodeURIComponent(url.pathname==='/'?'/index.html':url.pathname));if(!path.startsWith(root+'/')){res.writeHead(403);res.end();return}
 try{if(!(await stat(path)).isFile())throw Error();res.setHeader('Content-Type',mime[extname(path)]||'application/octet-stream');res.setHeader('Cache-Control',path.includes('/assets/')?'public,max-age=31536000,immutable':'no-cache');res.end(req.method==='HEAD'?undefined:await readFile(path))}catch{res.writeHead(404);res.end('Página no encontrada.')}
 }catch(e){console.error('Solicitud fallida',e.message);if(!res.headersSent)res.writeHead(500);res.end('No se pudo completar la solicitud.')}});
server.requestTimeout=15000;server.headersTimeout=10000;server.listen(port,'0.0.0.0',()=>console.log(`Mis Alas disponible en ${origin}`));
