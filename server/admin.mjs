import{createInterface}from'node:readline';import{Writable}from'node:stream';import{randomUUID}from'node:crypto';import{sql,transaction}from'./database.mjs';import{hashPassword,username}from'./auth.mjs';
let muted=false;const output=new Writable({write(chunk,encoding,callback){if(!muted)process.stdout.write(chunk,encoding);callback()}});const rl=createInterface({input:process.stdin,output,terminal:true});
const ask=q=>new Promise(resolve=>rl.question(q,resolve));
try{const requested=process.argv[2];const existing=sql.prepare("SELECT * FROM accounts WHERE role='admin'").get();
 let account;if(requested){account=sql.prepare('SELECT * FROM accounts WHERE username=?').get(username(requested));if(!account)throw Error('Usuario no encontrado.')}else account=existing;
 const user=account?.username||username(await ask('Usuario del administrador: '));
 process.stdout.write('Contraseña nueva (12 caracteres mínimo; no se mostrará): ');muted=true;const password=await ask('');muted=false;process.stdout.write('\n');
 process.stdout.write('Repite la contraseña: ');muted=true;const repeat=await ask('');muted=false;process.stdout.write('\n');if(password!==repeat)throw Error('Las contraseñas no coinciden.');
 const hash=await hashPassword(password);transaction(()=>{if(account){sql.prepare('UPDATE accounts SET password_hash=? WHERE id=?').run(hash,account.id);sql.prepare('DELETE FROM sessions WHERE account_id=?').run(account.id)}else sql.prepare("INSERT INTO accounts VALUES (?,?,?,?,'admin',NULL,?)").run(randomUUID(),user,'Administración',hash,new Date().toISOString())});
 console.log('Cuenta lista. Puedes ingresar con tu usuario y contraseña.');
}catch(e){console.error(e.message);process.exitCode=1}finally{rl.close();sql.close()}
