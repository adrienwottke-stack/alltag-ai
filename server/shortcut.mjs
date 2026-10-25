import {randomBytes} from 'node:crypto';
import {DAY,normalizeCode,publicUser} from './store.mjs';
import {Problem,requireValue} from './problem.mjs';

export function createShortcut({store,config,incoming,checkLoginRate,body,json,cookie}){
  const {get,run,hash}=store,tickets=new Map();
  function cleanup(){for(const [id,t]of tickets)if(t.expiresAt<=Date.now())tickets.delete(id);}
  const timer=setInterval(cleanup,30_000);timer.unref();
  function clearUser(userId){for(const [id,t]of tickets)if(t.userId===userId)tickets.delete(id);run('DELETE FROM shortcut_invites WHERE user_id=?',userId);}
  function invitation(userId,method){
    const user=get("SELECT * FROM users WHERE id=? AND role='tester' AND disabled=0",userId);
    requireValue(user,'Dieser Testzugang ist nicht verfügbar.',404);
    run('DELETE FROM shortcut_invites WHERE user_id=?',userId);
    if(method==='DELETE')return {ok:true};
    const token=randomBytes(32).toString('base64url'),expiresAt=Date.now()+7*DAY;
    run('INSERT INTO shortcut_invites VALUES(?,?,?,?)',hash(token),userId,expiresAt,Date.now());
    return {url:config.origin+'/iphone#einladung='+token,expiresAt};
  }
  async function connect(req,res){
    try{
      checkLoginRate(req);
      const data=await body(req);
      requireValue(Boolean(data.invite)!==Boolean(data.code),'Bitte öffne deinen persönlichen Einladungslink oder gib deinen Testcode ein.');
      let user;
      if(data.invite){
        requireValue(typeof data.invite==='string'&&/^[A-Za-z0-9_-]{43}$/.test(data.invite),'Dieser Einladungslink ist ungültig.');
        user=get('SELECT u.* FROM users u JOIN shortcut_invites i ON i.user_id=u.id WHERE i.token_hash=? AND i.expires_at>? AND u.disabled=0',hash(data.invite),Date.now());
        requireValue(user,'Dieser Einladungslink wurde schon verwendet oder ist abgelaufen. Bitte lass dir von Adrien einen neuen Link geben.',401);
      }else{
        requireValue(typeof data.code==='string'&&data.code.length<=100,'Bitte gib deinen persönlichen Testcode ein.');
        user=get('SELECT * FROM users WHERE code_hash=? AND disabled=0',hash(normalizeCode(data.code)));
        requireValue(user,'Dieser Testcode stimmt noch nicht. Bitte prüfe ihn.',401);
      }
      cleanup();requireValue(tickets.size<100,'Bitte versuche die Verbindung in drei Minuten erneut.',429);
      const ticket=randomBytes(32).toString('base64url');
      store.db.exec('BEGIN');
      let key;
      try{key=incoming.issue(user.id);run('DELETE FROM shortcut_invites WHERE user_id=?',user.id);store.db.exec('COMMIT');}catch(e){store.db.exec('ROLLBACK');throw e;}
      for(const [id,t]of tickets)if(t.userId===user.id)tickets.delete(id);
      tickets.set(hash(ticket),{userId:user.id,expiresAt:Date.now()+3*60_000});
      return json(res,200,{ok:true,...key,ticket,openUrl:config.origin+'/#connect='+ticket});
    }catch(error){if(error instanceof Problem)return json(res,200,{ok:false,error:error.message});throw error;}
  }
  async function redeem(req,res){
    const data=await body(req);cleanup();
    requireValue(typeof data.ticket==='string'&&/^[A-Za-z0-9_-]{43}$/.test(data.ticket),'Die Anmeldung ist abgelaufen. Bitte verbinde den Kurzbefehl erneut.',401);
    const id=hash(data.ticket),ticket=tickets.get(id);
    const user=ticket&&get('SELECT * FROM users WHERE id=? AND disabled=0',ticket.userId);
    requireValue(user,'Diese Anmeldung wurde schon verwendet oder ist abgelaufen. Bitte melde dich mit deinem Testcode an.',401);
    const token=randomBytes(32).toString('hex');run('INSERT INTO sessions VALUES(?,?,?)',hash(token),user.id,Date.now()+30*DAY);tickets.delete(id);
    res.setHeader('Set-Cookie',cookie(token,30*86400));return json(res,200,{user:publicUser(user)});
  }
  async function share(req,res){
    try{return await incoming.receive(req,res);}catch(error){if(error instanceof Problem)return json(res,200,{error:error.message,reauth:error.status===401?'reconnect':''});throw error;}
  }
  return {invitation,connect,redeem,share,clearUser,close(){clearInterval(timer);tickets.clear();}};
}
