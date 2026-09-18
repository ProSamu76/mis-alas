import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
const path=resolve(process.env.DB_PATH||'data/mis-alas.sqlite');mkdirSync(dirname(path),{recursive:true});
export const sql=new DatabaseSync(path);sql.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;');
if(!sql.prepare("SELECT name FROM sqlite_master WHERE name='participants'").get())sql.exec(readFileSync(new URL('./schema.sql',import.meta.url),'utf8'));
sql.exec(`CREATE TABLE IF NOT EXISTS accounts(id TEXT PRIMARY KEY,username TEXT NOT NULL UNIQUE,name TEXT NOT NULL,password_hash TEXT NOT NULL,role TEXT NOT NULL CHECK(role IN ('admin','participant')),participant_id TEXT UNIQUE REFERENCES participants(id),created TEXT NOT NULL);
CREATE UNIQUE INDEX IF NOT EXISTS one_admin ON accounts(role) WHERE role='admin';
CREATE TABLE IF NOT EXISTS sessions(token_hash TEXT PRIMARY KEY,account_id TEXT NOT NULL REFERENCES accounts(id),expires INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS sessions_account ON sessions(account_id);
CREATE TABLE IF NOT EXISTS limits(key TEXT PRIMARY KEY,count INTEGER NOT NULL,expires INTEGER NOT NULL);`);
export function transaction(fn){sql.exec('BEGIN IMMEDIATE');try{const result=fn();sql.exec('COMMIT');return result}catch(e){sql.exec('ROLLBACK');throw e}}
class Query {constructor(text,args=[]){this.text=text;this.args=args}bind(...args){return new Query(this.text,args)}first(){return sql.prepare(this.text).get(...this.args)||null}all(){return {results:sql.prepare(this.text).all(...this.args)}}run(){const r=sql.prepare(this.text).run(...this.args);return {meta:{changes:Number(r.changes)}}}}
export const env={DB:{prepare:text=>new Query(text),batch:queries=>transaction(()=>queries.map(q=>q.run()))}};
