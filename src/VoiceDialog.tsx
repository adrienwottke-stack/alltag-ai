import {useEffect,useRef,useState} from 'react';
import {ArrowRight,Check,FileAudio,LoaderCircle,Mic,RotateCcw,Square,X} from 'lucide-react';

type Transcript={id:string;text:string};
type Props={transcribe:(audio:string,mime:string,clientId:string)=>Promise<Transcript>;onResult:(result:Transcript)=>void;onCancel:()=>void;purpose:'help'|'append'|'shared'};
const fileBase64=(blob:Blob)=>new Promise<string>((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(String(r.result).split(',')[1]);r.onerror=()=>reject(new Error('Die Aufnahme konnte nicht geöffnet werden.'));r.readAsDataURL(blob);});
export function VoiceDialog({transcribe,onResult,onCancel,purpose}:Props){
  const [phase,setPhase]=useState<'idle'|'permission'|'recording'|'transcribing'|'review'|'error'>('idle'),[seconds,setSeconds]=useState(0),[text,setText]=useState(''),[error,setError]=useState('');
  const recorder=useRef<MediaRecorder|null>(null),stream=useRef<MediaStream|null>(null),chunks=useRef<Blob[]>([]),clip=useRef<Blob|null>(null),clientId=useRef(crypto.randomUUID()),receipt=useRef('');
  const cancel=useRef(false),review=useRef(false),clock=useRef<ReturnType<typeof setInterval>|undefined>(undefined),stopTimer=useRef<ReturnType<typeof setTimeout>|undefined>(undefined),mounted=useRef(true),fileRef=useRef<HTMLInputElement>(null);
  const supported=!!navigator.mediaDevices?.getUserMedia&&typeof MediaRecorder!=='undefined';
  function release(){clearInterval(clock.current);clearTimeout(stopTimer.current);stream.current?.getTracks().forEach(t=>t.stop());stream.current=null;}
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;cancel.current=true;if(recorder.current?.state==='recording')recorder.current.stop();release();};},[]);
  async function convert(blob:Blob,checkFirst:boolean){
    clip.current=blob;setPhase('transcribing');setError('');
    try{if(blob.size>2_000_000)throw new Error('Die Aufnahme ist zu groß. Bitte sprich kürzer oder wähle eine kleinere Aufnahme.');const mime=(blob.type||'audio/webm').split(';')[0];const result=await transcribe(await fileBase64(blob),mime,clientId.current);if(!mounted.current)return;receipt.current=result.id;setText(result.text);if(checkFirst||purpose==='shared'&&result.text.length>2000)setPhase('review');else onResult(result);}
    catch(e){if(!mounted.current)return;const code=(e as Error&{code?:string}).code;if(code==='VOICE_PROVIDER'||code==='VOICE_RETRY_NEW')clientId.current=crypto.randomUUID();setError(e instanceof Error?e.message:'Die Aufnahme konnte nicht in Text umgewandelt werden.');setPhase('error');}
  }
  async function start(){
    setPhase('permission');setError('');cancel.current=false;chunks.current=[];clip.current=null;clientId.current=crypto.randomUUID();setSeconds(0);
    try{
      if(!supported)throw new Error('Die Mikrofonaufnahme funktioniert in diesem Browser nicht. Nutze unten eine vorhandene Aufnahme oder die Diktierfunktion deiner Tastatur.');
      const media=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true},video:false});
      if(!mounted.current||cancel.current){media.getTracks().forEach(t=>t.stop());return;}
      stream.current=media;const mime=['audio/webm;codecs=opus','audio/mp4','audio/webm'].find(type=>MediaRecorder.isTypeSupported(type));
      const r=new MediaRecorder(media,{...(mime?{mimeType:mime}:{}),audioBitsPerSecond:32000});recorder.current=r;
      r.ondataavailable=e=>{if(e.data.size)chunks.current.push(e.data);};
      r.onstop=()=>{release();if(cancel.current||!mounted.current)return;const blob=new Blob(chunks.current,{type:r.mimeType||mime||'audio/webm'});chunks.current=[];void convert(blob,review.current);};
      r.onerror=()=>{cancel.current=true;release();setError('Die Aufnahme wurde unterbrochen. Bitte starte sie erneut.');setPhase('error');};
      review.current=false;r.start(1000);setPhase('recording');clock.current=setInterval(()=>setSeconds(s=>s+1),1000);stopTimer.current=setTimeout(()=>finish(false),90_000);
    }catch(e){release();if(!mounted.current)return;const name=(e as Error).name;setError(name==='NotAllowedError'?'Das Mikrofon ist noch nicht erlaubt. Erlaube den Mikrofonzugriff in den Website-Einstellungen oder nutze eine Aufnahme.':name==='NotFoundError'?'Es wurde kein Mikrofon gefunden. Du kannst eine vorhandene Aufnahme auswählen.':e instanceof Error?e.message:'Das Mikrofon konnte nicht gestartet werden.');setPhase('error');}
  }
  function finish(checkFirst:boolean){review.current=checkFirst;if(recorder.current?.state==='recording')recorder.current.stop();}
  function discard(){cancel.current=true;if(recorder.current?.state==='recording')recorder.current.stop();release();onCancel();}
  const action=purpose==='append'?'Text übernehmen':'Hilfe bekommen';
  return <div className="voice-dialog">
    {phase==='idle'||phase==='permission'?<><div className="voice-orb"><Mic size={37}/></div><p className="voice-intro">{purpose==='shared'?'Sag einfach, was Alltag mit der geteilten Nachricht machen soll.':'Sag in deinen Worten, wobei du Hilfe brauchst.'}</p><p className="voice-example">{purpose==='shared'?'„Erklär mir das bitte.“ Oder: „Sag freundlich ab und schlag Sonntag vor.“':'„Schreib eine Einladung zum Kaffee.“ Oder: „Erklär mir diesen Brief.“'}</p><button className="primary full voice-start" disabled={phase==='permission'||!supported} onClick={()=>void start()}>{phase==='permission'?<LoaderCircle className="spin" size={23}/>:<Mic size={23}/>} {phase==='permission'?'Mikrofon wird geöffnet …':'Aufnahme starten'}</button></>:null}
    {phase==='recording'&&<><div className="voice-orb recording"><Mic size={38}/></div><h3>Ich höre zu.</h3><p className="record-time" role="timer">{Math.floor(seconds/60)}:{String(seconds%60).padStart(2,'0')} <span>· höchstens 1:30</span></p><div className="voice-wave" aria-hidden>{[0,1,2,3,4,5,6].map(i=><i key={i} style={{animationDelay:`${i*.12}s`}}/>)}</div><button className="primary full voice-finish" onClick={()=>finish(false)}><Square size={19}/>{purpose==='append'?'Fertig – Text übernehmen':'Fertig & Hilfe bekommen'}</button><button className="text-button voice-review" onClick={()=>finish(true)}>Erkannten Text erst prüfen <ArrowRight size={17}/></button></>}
    {phase==='transcribing'&&<div className="voice-converting" role="status"><LoaderCircle className="spin" size={38}/><h3>Ich verstehe deine Aufnahme …</h3><p>Gleich geht es weiter.</p></div>}
    {phase==='review'&&<><label className="guide-label" htmlFor="voice-review">Das habe ich verstanden<textarea id="voice-review" className="guide-source" value={text} onChange={e=>setText(e.target.value)} maxLength={purpose==='shared'?2000:8000} rows={5}/></label>{purpose==='shared'&&text.length>2000&&<p className="small-note">Bitte kürze deinen Wunsch auf 2.000 Zeichen. Die geteilte Nachricht bleibt vollständig erhalten.</p>}<button className="primary full" disabled={!text.trim()||purpose==='shared'&&text.length>2000} onClick={()=>onResult({id:receipt.current,text:text.trim()})}><Check size={20}/>{action}</button></>}
    {phase==='error'&&<div className="voice-error"><p className="error-box" role="alert">{error}</p>{clip.current&&<button className="primary full" onClick={()=>void convert(clip.current!,true)}><RotateCcw size={19}/>Aufnahme erneut versuchen</button>}{supported&&<button className="secondary full" onClick={()=>void start()}><Mic size={19}/>Neue Aufnahme starten</button>}</div>}
    {phase!=='transcribing'&&phase!=='recording'&&phase!=='review'&&<><input ref={fileRef} className="sr-only" type="file" accept="audio/webm,audio/mp4,audio/mpeg,audio/wav,.m4a,.mp3,.wav,.webm" aria-label="Sprachaufnahme auswählen" onChange={e=>{const f=e.target.files?.[0];if(f){clientId.current=crypto.randomUUID();const type=f.type||(/\.m4a$/i.test(f.name)?'audio/mp4':/\.wav$/i.test(f.name)?'audio/wav':/\.mp3$/i.test(f.name)?'audio/mpeg':'audio/webm');void convert(new Blob([f],{type}),true);}}}/><button className="text-button voice-upload" onClick={()=>fileRef.current?.click()}><FileAudio size={18}/>Vorhandene Aufnahme wählen</button></>}
    <p className="voice-privacy">Nach „Fertig“ wird deine Aufnahme von OpenAI in Text umgewandelt. Eine ausgewählte vorhandene Aufnahme wird direkt zur Umwandlung übertragen. Alltag speichert den Text privat, keine Audiodatei. {phase==='idle'?'Beim Start fragt dein Handy einmal nach dem Mikrofon.':''}</p>
    <button className="text-button voice-cancel" onClick={discard} disabled={phase==='transcribing'}><X size={17}/>{phase==='recording'?'Abbrechen – Aufnahme verwerfen':'Schließen'}</button>
  </div>;
}
