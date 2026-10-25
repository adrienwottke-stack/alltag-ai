import {randomUUID} from 'node:crypto';
import {Problem,requireValue} from './problem.mjs';
import {DAY} from './store.mjs';
import {VOICE_RESERVE,isUnbilledRejection} from './budget.mjs';

const MIME={ 'audio/webm':'webm','audio/mp4':'m4a','audio/x-m4a':'m4a','audio/m4a':'m4a','audio/wav':'wav','audio/x-wav':'wav','audio/mpeg':'mp3','audio/mp3':'mp3' };
export function decodeAudio(audio,mime){
  requireValue(typeof mime==='string'&&Object.hasOwn(MIME,mime),'Bitte nutze eine WebM-, M4A-, MP3- oder WAV-Aufnahme.');
  requireValue(typeof audio==='string'&&audio.length<=2_800_000&&/^[A-Za-z0-9+/]+={0,2}$/.test(audio),'Die Aufnahme ist zu groß oder unvollständig. Bitte nimm eine kürzere Nachricht auf.');
  const bytes=Buffer.from(audio,'base64'),kind=MIME[mime];
  requireValue(bytes.length>=48&&bytes.length<=2_000_000,'Bitte nutze eine Aufnahme bis 2 MB.');
  const valid=kind==='webm'?bytes.subarray(0,4).equals(Buffer.from([0x1a,0x45,0xdf,0xa3])):kind==='m4a'?bytes.toString('ascii',4,8)==='ftyp':kind==='wav'?bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WAVE':bytes.toString('ascii',0,3)==='ID3'||bytes[0]===255&&(bytes[1]&224)===224;
  requireValue(valid,'Dieses Aufnahmeformat konnte nicht gelesen werden. Bitte versuche eine neue Aufnahme.');
  if(kind==='wav'&&bytes.toString('ascii',12,16)==='fmt '&&bytes.length>=44){const rate=bytes.readUInt32LE(28);requireValue(rate>0&&bytes.length/rate<=92,'Bitte nutze eine Aufnahme mit höchstens 90 Sekunden.');}
  return {bytes,extension:kind};
}

export function createVoice({store,config,active,body,json,monthlyBudget}){
  const {get,run,hash,seal,open}=store;
  const model='gpt-transcribe';
  run("UPDATE voice_requests SET state='failed',error_code='RESTART' WHERE state='running'");
  return async function transcribe(req,res,user){
    requireValue(user.accepted_at,'Bitte bestätige zuerst die Hinweise zum Test.',403);
    const data=await body(req);
    requireValue(typeof data.clientId==='string'&&/^[a-z0-9-]{16,64}$/i.test(data.clientId),'Bitte starte eine neue Aufnahme.');
    const {bytes,extension}=decodeAudio(data.audio,data.mime);
    const fingerprint=hash(data.mime+':'+hash(bytes.toString('base64')));
    const previous=get('SELECT * FROM voice_requests WHERE user_id=? AND client_id=?',user.id,data.clientId);
    if(previous){
      requireValue(previous.input_hash===fingerprint,'Diese Aufnahme hat sich verändert. Bitte starte eine neue Aufnahme.',409);
      if(previous.state==='completed'&&previous.transcript)return json(res,200,{id:previous.id,text:open(previous.transcript),replayed:true});
      if(previous.state==='running')throw new Problem(409,'Deine Aufnahme wird noch in Text umgewandelt. Bitte versuche es gleich noch einmal.','VOICE_RUNNING');
      throw new Problem(409,'Bitte versuche diese Aufnahme erneut.','VOICE_RETRY_NEW');
    }
    requireValue(!active.has(user.id)&&active.size<2,'Gerade wird eine Antwort vorbereitet. Bitte versuche es gleich noch einmal.',429);
    const day=Math.floor(Date.now()/DAY)*DAY;
    requireValue(get('SELECT count(*) n FROM voice_requests WHERE user_id=? AND created_at>=?',user.id,day).n<25,'Heute sind alle 25 Sprachaufnahmen genutzt. Morgen geht es weiter.',429);
    monthlyBudget.check(VOICE_RESERVE);
    requireValue(config.apiKey,'Die Spracheingabe ist gerade nicht eingerichtet. Bitte gib Adrien Bescheid.',503);
    const id=randomUUID(),started=Date.now();
    active.add(user.id);
    run('INSERT INTO voice_requests(id,user_id,client_id,input_hash,state,model,created_at) VALUES(?,?,?,?,?,?,?)',id,user.id,data.clientId,fingerprint,'running',model,started);
    try{
      const form=new FormData();form.set('model',model);form.set('file',new Blob([bytes],{type:data.mime}),'aufnahme.'+extension);form.append('languages[]','de');
      const response=await (config.fetchImpl||fetch)('https://api.openai.com/v1/audio/transcriptions',{method:'POST',headers:{Authorization:`Bearer ${config.apiKey}`},body:form,signal:AbortSignal.timeout(config.providerTimeout||65_000)});
      if(!response.ok){
        if(isUnbilledRejection(response.status))run('UPDATE voice_requests SET seconds=0,cost_micros=0,usage_known=1 WHERE id=?',id);
        throw new Error('PROVIDER_'+response.status);
      }
      const result=await response.json(),text=typeof result.text==='string'?result.text.trim():'';
      const seconds=typeof result.usage?.seconds==='number'?result.usage.seconds:typeof result.duration==='number'?result.duration:null;
      const known=Number.isFinite(seconds)&&seconds>=0;
      const cost=known?Math.ceil(seconds/60*4500):30000;
      run('UPDATE voice_requests SET seconds=?,cost_micros=?,usage_known=?,latency_ms=? WHERE id=?',known?seconds:null,cost,Number(known),Date.now()-started,id);
      if(!text||text.length>8000)throw new Error('EMPTY_OR_LONG_TRANSCRIPT');
      requireValue(get('SELECT id FROM users WHERE id=?',user.id),'Der Zugang wurde inzwischen gelöscht.',409);
      run("UPDATE voice_requests SET state='completed',transcript=? WHERE id=?",seal(text),id);
      return json(res,200,{id,text});
    }catch(error){
      run("UPDATE voice_requests SET state='failed',error_code=?,latency_ms=? WHERE id=?",String(error.message||'VOICE_FAILURE').slice(0,50),Date.now()-started,id);
      if(error instanceof Problem)throw error;
      throw new Problem(503,error.message==='EMPTY_OR_LONG_TRANSCRIPT'?'Ich konnte keine ausreichend klare Sprache erkennen. Bitte versuche es noch einmal.':'Die Aufnahme konnte gerade nicht in Text umgewandelt werden. Du kannst sie erneut versuchen.','VOICE_PROVIDER');
    }finally{active.delete(user.id);}
  };
}
