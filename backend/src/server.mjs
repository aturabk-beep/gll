import {createPool,migrate,prune} from './database.mjs';
import {bootstrapAdmin} from './auth.mjs';
import {buildApp} from './app.mjs';

const pool=createPool();
const origin=process.env.PUBLIC_ORIGIN||(process.env.RAILWAY_PUBLIC_DOMAIN?`https://${process.env.RAILWAY_PUBLIC_DOMAIN}`:'');
let app,timer;
try{
 await migrate(pool);await bootstrapAdmin(pool,process.env);await prune(pool);
 app=await buildApp({pool,origin,production:process.env.NODE_ENV!=='development',logger:true});
 let pruning=false;
 timer=setInterval(async()=>{if(pruning)return;pruning=true;try{await prune(pool)}catch{app.log.error('Retention job failed')}finally{pruning=false}},3600000);timer.unref();
 await app.listen({port:Number(process.env.PORT||3000),host:'0.0.0.0'});
 const stop=async()=>{clearInterval(timer);await app.close();await pool.end();process.exit(0)};
 process.once('SIGTERM',stop);process.once('SIGINT',stop);
}catch(err){console.error('Startup failed:',err.code||err.message);clearInterval(timer);await pool.end();process.exitCode=1;}
