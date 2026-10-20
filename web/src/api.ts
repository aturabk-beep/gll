export type Session={user:{id:string;email:string};csrfToken:string};
// Same-origin backend and HttpOnly cookies. No tokens/passwords in localStorage.
let session:Session|null=null;
const wait=(milliseconds:number)=>new Promise(resolve=>setTimeout(resolve,milliseconds));

async function fetchResponse(path:string,init:RequestInit,canRetry:boolean):Promise<Response>{
 try{return await fetch(path,init)}
 catch(error){
  if(canRetry){await wait(350);return fetch(path,init)}
  throw error;
 }
}

export async function request<T>(path:string,method='GET',body?:unknown):Promise<T>{
 let r:Response;
 try{
  r=await fetchResponse(path,{method,credentials:'same-origin',headers:{...(body!==undefined?{'Content-Type':'application/json'}:{}),...(session?{'X-CSRF-Token':session.csrfToken}:{})},body:body===undefined?undefined:JSON.stringify(body)},method==='GET');
 }catch{
  throw Error('Sunucuya ulaşılamadı. Lütfen bağlantınızı kontrol edip tekrar deneyin.');
 }
 let data:unknown;
 try{data=await r.json()}catch{throw Error(r.ok?'Sunucudan geçersiz yanıt alındı.':`Sunucu hatası (HTTP ${r.status}).`)}
 if(!r.ok){if(r.status===401){session=null;window.dispatchEvent(new Event('gulel:session-ended'));}const detail=typeof data==='object'&&data!==null&&'error' in data?String((data as {error:unknown}).error):`HTTP ${r.status}`;throw Error(detail)}return data as T;
}
export async function restoreSession(){try{session=await request<Session>('/api/session')}catch{session=null}return session;}
export async function signIn(email:string,password:string){session=await request<Session>('/api/login','POST',{email,password});return session;}
export async function signOut(){await request('/api/logout','POST',{});session=null;}
