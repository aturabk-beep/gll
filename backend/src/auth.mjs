import {randomBytes,createHash,scrypt as rawScrypt,timingSafeEqual} from 'node:crypto';
import {promisify} from 'node:util';
const scrypt=promisify(rawScrypt);
const options={N:32768,r:8,p:1,maxmem:64*1024*1024};
export const randomToken=()=>randomBytes(32).toString('hex');
export const digest=value=>createHash('sha256').update(value).digest('hex');
export async function passwordHash(password){const salt=randomBytes(16).toString('hex');const hash=await scrypt(password,salt,32,options);return `scrypt$${salt}$${hash.toString('hex')}`;}
export async function passwordMatches(password,encoded){
  const [kind,salt,hex]=String(encoded).split('$');
  if(kind!=='scrypt'||!salt||!hex)return false;
  const hash=await scrypt(password,salt,32,options),expected=Buffer.from(hex,'hex');
  return hash.length===expected.length&&timingSafeEqual(hash,expected);
}
export async function bootstrapAdmin(pool,{ADMIN_EMAIL:email,ADMIN_PASSWORD:password}){
  if(!email||!password||password.length<14||password.length>200)throw Error('ADMIN_EMAIL and ADMIN_PASSWORD (14–200 characters) are required');
  email=email.trim().toLowerCase();if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))throw Error('ADMIN_EMAIL must be an email address');
  const old=(await pool.query('select id,password_hash from private.admin_users where email=$1',[email])).rows[0];
  if(!old){await pool.query('insert into private.admin_users(email,password_hash) values($1,$2) on conflict(email) do nothing',[email,await passwordHash(password)]);}
  else if(!await passwordMatches(password,old.password_hash)){
    const c=await pool.connect();try{await c.query('begin');await c.query('update private.admin_users set password_hash=$1 where id=$2',[await passwordHash(password),old.id]);await c.query('delete from private.sessions where admin_id=$1',[old.id]);await c.query('commit');}catch(e){await c.query('rollback');throw e;}finally{c.release();}
  }
}
export async function limited(pool,key,max,seconds){
  const result=await pool.query(`insert into private.http_limits(key,window_start,attempts)
    values($1,to_timestamp(floor(extract(epoch from now())/$2)*$2),1)
    on conflict(key,window_start) do update set attempts=private.http_limits.attempts+1 returning attempts`,[digest(key),seconds]);
  return result.rows[0].attempts>max;
}
