import {transaction} from './database.mjs';
const properties={name:{type:'string',minLength:1,maxLength:100},latitude:{type:'number',minimum:-90,maximum:90},longitude:{type:'number',minimum:-180,maximum:180},radius:{type:'integer',minimum:5,maximum:1000},url:{type:'string',maxLength:2048}};
const body={type:'object',additionalProperties:false,required:Object.keys(properties),properties};
const params={type:'object',required:['id'],properties:{id:{type:'string',format:'uuid'}}};
export function cameraRoutes(app,pool,admin){
 const validate=b=>{
  if(!b.name.trim())throw Object.assign(Error('Kamera adı gerekli'),{statusCode:400});
  if(b.url){let u;try{u=new URL(b.url)}catch{}
   if(!u||!['https:','http:'].includes(u.protocol)||u.username||u.password)throw Object.assign(Error('Şifresiz HTTP/HTTPS kamera bağlantısı gerekli'),{statusCode:400});
  }
 };
 app.get('/api/admin/cameras',{preHandler:admin},()=>transaction(pool,'gulel_admin',async c=>(await c.query('select * from public.cameras order by name,id')).rows));
 app.post('/api/admin/cameras',{preHandler:admin,schema:{body}},req=>{
  validate(req.body);const b=req.body;
  return transaction(pool,'gulel_admin',async c=>(await c.query('insert into public.cameras(name,latitude,longitude,radius,url) values($1,$2,$3,$4,$5) returning *',[b.name.trim(),b.latitude,b.longitude,b.radius,b.url])).rows[0]);
 });
 app.put('/api/admin/cameras/:id',{preHandler:admin,schema:{body,params}},req=>{
  validate(req.body);const b=req.body;
  return transaction(pool,'gulel_admin',async c=>{const r=await c.query('update public.cameras set name=$1,latitude=$2,longitude=$3,radius=$4,url=$5 where id=$6 returning *',[b.name.trim(),b.latitude,b.longitude,b.radius,b.url,req.params.id]);if(!r.rows.length)throw Object.assign(Error('Camera not found'),{statusCode:404});return r.rows[0]});
 });
 app.delete('/api/admin/cameras/:id',{preHandler:admin,schema:{params}},req=>transaction(pool,'gulel_admin',async c=>{const r=await c.query('delete from public.cameras where id=$1 returning id',[req.params.id]);if(!r.rows.length)throw Object.assign(Error('Camera not found'),{statusCode:404});return {ok:true}}));
}
