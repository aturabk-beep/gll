import http2 from 'node:http2';
import {createPrivateKey,sign} from 'node:crypto';
import {pushDiagnostic} from './apns-errors.mjs';

// Token auth is required for the APNs `location` push type. Never log keys,
// device tokens, payloads, or raw APNs responses.
export function createLocationPushSender(env=process.env,connect=http2.connect){
  const {APNS_KEY_ID:keyId,APNS_TEAM_ID:teamId,APNS_PRIVATE_KEY:pem,APNS_BUNDLE_ID:bundle}=env;
  if(!keyId||!teamId||!pem||!bundle)return null;
  const key=createPrivateKey(pem.replace(/\\n/g,'\n'));
  if(key.asymmetricKeyType!=='ec'||key.asymmetricKeyDetails?.namedCurve!=='prime256v1')throw Error('APNs requires an ES256 key');
  let cached='',issued=0;
  return async({token,environment,payload,expiresAt})=>{
    const now=Math.floor(Date.now()/1000);
    if(!cached||now-issued>3000){
      const encode=value=>Buffer.from(JSON.stringify(value)).toString('base64url');
      const unsigned=encode({alg:'ES256',kid:keyId})+'.'+encode({iss:teamId,iat:now});
      cached=unsigned+'.'+sign('sha256',Buffer.from(unsigned),{key,dsaEncoding:'ieee-p1363'}).toString('base64url');issued=now;
    }
    return new Promise((resolve)=>{
      const client=connect(environment==='development'?'https://api.sandbox.push.apple.com':'https://api.push.apple.com');
      let settled=false;
      const finish=(reason,value)=>{if(settled)return;settled=true;clearTimeout(timeout);client.destroy();resolve(reason?{accepted:false,invalidToken:false,reason,httpStatus:null}:value);};
      const timeout=setTimeout(()=>finish('RequestTimeout'),10000);
      client.on('error',()=>finish('NetworkError'));
      const request=client.request({':method':'POST',':path':'/3/device/'+token,authorization:'bearer '+cached,
        'apns-topic':bundle+'.location-query','apns-push-type':'location','apns-priority':'10',
        'apns-expiration':String(Math.floor(new Date(expiresAt).getTime()/1000)),'content-type':'application/json'});
      let status=0,body='';
      request.on('response',headers=>{status=Number(headers[':status']);});
      request.on('data',chunk=>{body=(body+chunk).slice(0,4096);});
      request.on('error',()=>finish('NetworkError'));
      request.on('end',()=>{let reason;try{reason=JSON.parse(body).reason}catch{}
        const accepted=status===200,diagnostic=pushDiagnostic({accepted,reason,httpStatus:status});
        finish(null,{accepted,invalidToken:status===410||reason==='BadDeviceToken'||reason==='DeviceTokenNotForTopic',reason:diagnostic.error_code,httpStatus:diagnostic.http_status});
      });
      request.end(JSON.stringify(payload));
    });
  };
}
