import { useEffect, useId, useRef, useState } from 'react';
import { Check, Copy, LoaderCircle, PenLine, Square, Volume2 } from 'lucide-react';

type Props = {
  initialText:string; copied:boolean; previouslyCopied:boolean; used:boolean; speaking:boolean;
  onSave:(text:string)=>Promise<string>; onCopy:(text:string)=>Promise<boolean>;
  onUse:()=>Promise<void>; onSpeak:(text:string)=>void; onNotice:(text:string)=>void;
};
export function DraftAnswer({initialText,copied,previouslyCopied,used,speaking,onSave,onCopy,onUse,onSpeak,onNotice}:Props) {
  const [text,setText]=useState(initialText),[saved,setSaved]=useState(initialText),[editing,setEditing]=useState(false),[saving,setSaving]=useState(false),[wasCopied,setWasCopied]=useState(previouslyCopied),[isUsed,setIsUsed]=useState(used);
  const editorId=useId();
  const editor=useRef<HTMLTextAreaElement>(null);
  useEffect(()=>{setIsUsed(used);},[used]);
  useEffect(()=>{if(editing&&editor.current){editor.current.style.height='auto';editor.current.style.height=editor.current.scrollHeight+'px';editor.current.focus();}},[editing]);
  async function persist() {
    if(text.trim()===saved)return saved;
    const value=await onSave(text);setSaved(value);setText(value);return value;
  }
  async function finish(copy=false) {
    if(saving||!text.trim())return;
    setSaving(true);
    try{
      // Invoke the clipboard during the tap, before a possible network save (also for mobile Safari).
      if(copy){if(!await onCopy(text.trim()))return;setWasCopied(true);}
      await persist();setEditing(false);
    }
    catch(e){onNotice(e instanceof Error?e.message:'Der Entwurf konnte nicht gespeichert werden. Bitte versuche es erneut.');}
    finally{setSaving(false);}
  }
  return <div className="draft-answer">
    <div className="draft-heading"><span>Dein Antwortentwurf</span><button className="text-button" disabled={saving} onClick={()=>{if(editing)void finish();else setEditing(true);}}>{saving?<LoaderCircle className="spin" size={16}/>:editing?<Check size={16}/>:<PenLine size={16}/>} {editing?'Fertig':'Bearbeiten'}</button></div>
    {editing?<><label className="sr-only" htmlFor={editorId}>Antwortentwurf bearbeiten</label><textarea ref={editor} id={editorId} className="draft-editor" value={text} onChange={e=>setText(e.target.value)} maxLength={8000} disabled={saving}/><p className="draft-edit-hint">Mit „Fertig“ oder „Antwort kopieren“ speicherst du deine Änderung privat in diesem Gespräch.</p></>:<p className="draft-text">{text}</p>}
    <div className="answer-actions"><button className="primary draft-copy" onClick={()=>void finish(true)} disabled={saving||!text.trim()}>{saving?<LoaderCircle className="spin" size={18}/>:copied?<Check size={18}/>:<Copy size={18}/>} {copied?'Kopiert':'Antwort kopieren'}</button>{'speechSynthesis' in window&&<button className="action-button" disabled={saving} onClick={()=>onSpeak(text)}>{speaking?<Square size={17}/>:<Volume2 size={18}/>} {speaking?'Vorlesen stoppen':'Vorlesen'}</button>}</div>
    {(wasCopied||isUsed)&&<div className="draft-outcome"><span>{isUsed?'Als verwendet bestätigt. Danke!':'Hast du den Text verwendet?'}</span>{!isUsed&&<button className="text-button" disabled={saving} onClick={async()=>{setSaving(true);try{await onUse();setIsUsed(true);}catch(e){onNotice(e instanceof Error?e.message:'Bitte versuche es erneut.');}finally{setSaving(false);}}}><Check size={17}/>Ja, verwendet</button>}</div>}
  </div>;
}
