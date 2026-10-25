import {randomBytes} from 'node:crypto';
import {requireValue} from './problem.mjs';
import {DAY} from './store.mjs';

export function createIncoming({store,config,body,json,validateImage}){
  const {get,run,hash}=store,pending=new Map();
  function cleanup(){for(const [id,item]of pending)if(item.expiresAt<Date.now())pending.delete(id);}
  const timer=setInterval(cleanup,30_000);timer.unref();
  const clearUser=userId=>{for(const [id,item]of pending)if(item.userId===userId)pending.delete(id);};
  function issue(userId){
    const key=randomBytes(32).toString('base64url'),expiresAt=Date.now()+30*DAY;
    run('INSERT INTO share_keys VALUES(?,?,?) ON CONFLICT(user_id) DO UPDATE SET token_hash=excluded.token_hash,expires_at=excluded.expires_at',userId,hash(key),expiresAt);clearUser(userId);
    return {key,expiresAt};
  }
  function setup(req,res,user,method){
    requireValue(user.accepted_at,'Bitte bestätige zuerst die Hinweise zum Test.',403);
    if(method==='GET'){const key=get('SELECT expires_at FROM share_keys WHERE user_id=? AND expires_at>?',user.id,Date.now());return json(res,200,{active:Boolean(key),expiresAt:key?.expires_at||null});}
    if(method==='DELETE'){run('DELETE FROM share_keys WHERE user_id=?',user.id);clearUser(user.id);return json(res,200,{ok:true});}
    const {key,expiresAt}=issue(user.id);
    return json(res,201,{key,expiresAt,endpoint:config.origin+'/api/incoming-share'});
  }
  async function receive(req,res){
    if(req.headers.origin)requireValue(req.headers.origin===config.origin,'Dieser Zugriff ist nicht erlaubt.',403);
    requireValue((req.headers['content-type']||'').startsWith('application/json'),'Bitte sende die Nachricht über deinen Alltag-Kurzbefehl.',415);
    const key=req.headers['x-alltag-share-key'];requireValue(typeof key==='string'&&key.length<=100,'Der Einrichtungs-Schlüssel fehlt.',401);
    const user=get('SELECT u.* FROM users u JOIN share_keys k ON k.user_id=u.id WHERE k.token_hash=? AND k.expires_at>? AND u.disabled=0',hash(key),Date.now());
    requireValue(user,'Der Einrichtungs-Schlüssel ist abgelaufen oder widerrufen. Öffne Alltag und richte das Teilen erneut ein.',401);
    const data=await body(req);requireValue(typeof data.text==='string'&&data.text.length<=8000,'Bitte teile einen Text mit höchstens 8.000 Zeichen.');
    requireValue(get('SELECT u.id FROM users u JOIN share_keys k ON k.user_id=u.id WHERE u.id=? AND k.token_hash=? AND k.expires_at>? AND u.disabled=0',user.id,hash(key),Date.now()),'Diese Übergabe wurde inzwischen gesperrt.',401);
    const text=data.text.trim(),image=validateImage(data.image===''?null:data.image);
    requireValue(text||image,'Die geteilte Nachricht ist leer.');cleanup();
    requireValue([...pending.values()].filter(i=>i.userId===user.id).length<3,'Es liegen noch drei geteilte Nachrichten bereit. Öffne oder verwerfe sie zuerst.',429);
    const size=text.length+(image?.length||0);
    requireValue(pending.size<10&&[...pending.values()].reduce((n,i)=>n+i.size,0)+size<20_000_000,'Gerade ist der Übergabespeicher voll. Bitte versuche es in fünf Minuten erneut.',429);
    const id=randomBytes(24).toString('hex'),expiresAt=Date.now()+5*60_000;
    pending.set(id,{userId:user.id,text,image,expiresAt,size});
    return json(res,201,{openUrl:config.origin+'/#handoff='+id,expiresAt});
  }
  function read(req,res,user,id,method){
    cleanup();const item=pending.get(id);
    requireValue(item&&item.userId===user.id,'Diese Übergabe ist abgelaufen oder gehört zu einem anderen Testzugang. Teile die Nachricht bitte erneut.',404);
    if(method==='DELETE'){pending.delete(id);return json(res,200,{ok:true});}
    return json(res,200,{text:item.text,image:item.image,expiresAt:item.expiresAt});
  }
  return {setup,issue,receive,read,clearUser,close(){clearInterval(timer);pending.clear();}};
}
