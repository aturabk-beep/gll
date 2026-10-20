import {PGlite} from '@electric-sql/pglite';
import {pgcrypto} from '@electric-sql/pglite/contrib/pgcrypto';

// Serialize connections because PGlite uses one PostgreSQL connection. Production uses pg.Pool.
export function testPool(){
 const db=new PGlite({extensions:{pgcrypto}});let tail=Promise.resolve();
 const acquire=async()=>{let unlock;const next=new Promise(r=>{unlock=r});const previous=tail;tail=next;await previous;return unlock;};
 async function execute(sql,params){if(params?.length)return db.query(sql,params);const result=await db.exec(sql);return result.at(-1)||{rows:[]};}
 return {db,
  async connect(){const release=await acquire();return {query:execute,release};},
  async query(sql,params){const release=await acquire();try{return await execute(sql,params)}finally{release()}},
  async end(){await tail;await db.close()}
 };
}
