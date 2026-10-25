import { useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import { ArrowLeft, ArrowRight, Check, ChevronDown, ImagePlus, LoaderCircle, Mail, MessageCircle, PenLine, X } from 'lucide-react';

export type Intent = 'accept'|'decline'|'question'|'custom'|'explain'|'spoken';
export type ReplyGuide = { intent: Intent; details: string };
export const intentNames: Record<Intent,string> = { accept:'Zusagen',decline:'Freundlich absagen',question:'Etwas nachfragen',custom:'Eigene Antwort',explain:'Erst einmal verstehen',spoken:'Gesprochener Wunsch' };
export const exampleMessage = 'Hallo, wir würden am Samstag um 15 Uhr gern zum Kaffee vorbeikommen. Passt euch das? Liebe Grüße, Alex';

type Props = {
  text: string; image: string|null; imageBusy: boolean;
  sourceRef: RefObject<HTMLTextAreaElement|null>;
  onText: (text:string)=>void; onPhoto: ()=>void; onRemovePhoto: ()=>void;
  onBack: ()=>void; onSend: (guide:ReplyGuide)=>void;
  initialStep?:1|2;
};

export function MessageHelper({text,image,imageBusy,sourceRef,onText,onPhoto,onRemovePhoto,onBack,onSend,initialStep=1}:Props) {
  const [step,setStep]=useState<1|2>(initialStep),[intent,setIntent]=useState<Intent|null>(null),[details,setDetails]=useState('');
  const heading=useRef<HTMLHeadingElement>(null), detailInput=useRef<HTMLTextAreaElement>(null);
  const needsDetails=intent==='question'||intent==='custom';
  useEffect(()=>{heading.current?.focus();},[step]);
  useEffect(()=>{if(intent==='question'||intent==='custom')detailInput.current?.focus();},[intent]);
  const detailLabel=intent==='question'?'Was möchtest du wissen?':intent==='custom'?'Was möchtest du sagen?':'Möchtest du etwas ergänzen?';
  const placeholder=intent==='accept'?'Zum Beispiel: Wir freuen uns auf euch.':intent==='decline'?'Zum Beispiel: Samstag geht nicht. Sonntag ab 15 Uhr anbieten.':intent==='question'?'Zum Beispiel: Wie viele Personen kommen mit?':'Zum Beispiel: Danke für die Einladung. Wir sind dabei und bringen einen Kuchen mit.';
  return <section className="message-helper" aria-label="Nachrichtenhelfer">
    <div className="conversation-heading"><button className="back-button" type="button" onClick={step===1?onBack:()=>setStep(1)}><ArrowLeft size={18}/>{step===1?'Neue Aufgabe':'Nachricht ändern'}</button><span className="task-badge blue"><Mail size={17}/>Nachrichtenhelfer</span></div>
    <ol className="guide-progress" aria-label="Dein Fortschritt"><li aria-current={step===1?'step':undefined} className={step===1?'current':'done'}><span>{step===2?<Check size={15}/>:1}</span>Nachricht</li><li aria-current={step===2?'step':undefined} className={step===2?'current':''}><span>2</span>Dein Wunsch</li></ol>
    <h1 ref={heading} tabIndex={-1} className="guide-title">{step===1?<>Eine Nachricht.<br/><em>Die richtigen Worte.</em></>:<>Was möchtest du<br/><em>antworten?</em></>}</h1>
    <p className="guide-intro">{step===1?'Für die Absage, die schwerfällt. Die E-Mail, die liegenbleibt. Oder den Text, der Fragen aufwirft.':'Wähle aus, was du sagen möchtest. Ein paar Stichworte reichen – Alltag formuliert den Rest.'}</p>
    <form className="guide-card" onSubmit={e=>{e.preventDefault();if(step===1){if(text.trim()||image)setStep(2);}else if(intent&&(!needsDetails||details.trim()))onSend({intent,details:intent==='explain'?'':details});}}>
      {step===1?<>
        <label className="guide-label" htmlFor="guide-source">Welche Nachricht hast du bekommen?</label>
        <textarea ref={sourceRef} id="guide-source" className="guide-source" value={text} onChange={e=>onText(e.target.value)} maxLength={8000} rows={5} placeholder="Den Text aus WhatsApp oder einer E-Mail hier einfügen …"/>
        {image&&<div className="attachment guide-attachment"><img src={image} alt="Dein Screenshot oder Foto"/><div><strong>Bild hinzugefügt</strong><span>Nur für diese Anfrage.</span></div><button className="icon-button" type="button" onClick={onRemovePhoto} aria-label="Foto entfernen"><X size={20}/></button></div>}
        <div className="guide-source-actions"><button className="photo-button" type="button" onClick={onPhoto} disabled={imageBusy}>{imageBusy?<LoaderCircle className="spin" size={20}/>:<ImagePlus size={20}/>}Screenshot oder Foto</button><button className="text-button" type="button" onClick={()=>{onText(exampleMessage);onRemovePhoto();sourceRef.current?.focus();}}>Beispiel einsetzen</button></div>
        <details className="transfer-help"><summary>Wie bekomme ich meine Nachricht hierher?<ChevronDown size={16}/></summary><p>Öffne WhatsApp oder deine E-Mail. Halte den Nachrichtentext gedrückt, wähle „Kopieren“ und wechsle zurück zu Alltag. Halte hier das Textfeld gedrückt und wähle „Einfügen“.</p><p>Falls das nicht klappt: Mache einen Screenshot und wähle ihn über „Screenshot oder Foto“ aus. Schneide unnötige persönliche Angaben möglichst weg.</p></details>
        {text===exampleMessage&&!image&&<p className="guide-example-note">Erfundenes Beispiel zum Ausprobieren. Du kannst es jederzeit ändern.</p>}
        <button className="primary full guide-next" disabled={imageBusy||(!text.trim()&&!image)}>Weiter zu meinem Wunsch<ArrowRight size={19}/></button>
      </>:<>
        <details className="source-review"><summary><span><MessageCircle size={18}/>Deine erhaltene Nachricht</span><ChevronDown size={16}/></summary>{text&&<p>{text}</p>}{image&&<img src={image} alt="Dein hinzugefügtes Bild"/>}</details>
        <fieldset className="intent-fieldset"><legend>Was passt für dich?</legend><div className="intent-options">{(Object.entries(intentNames) as [Intent,string][]).filter(([value])=>value!=='spoken').map(([value,label])=><button type="button" key={value} className={`intent-option ${intent===value?'chosen':''} ${value==='explain'?'explain-option':''}`} aria-pressed={intent===value} onClick={()=>{if(value!==intent){setIntent(value);setDetails('');}}}>{intent===value?<Check size={19}/>:value==='custom'?<PenLine size={19}/>:<span className="intent-circle" aria-hidden/>}{label}</button>)}</div></fieldset>
        {intent&&intent!=='explain'&&<label className="guide-label details-label" htmlFor="guide-details">{detailLabel}<span>{needsDetails?'Ein paar Stichworte genügen.':'Freiwillig – Gründe, Zeiten oder persönliche Worte.'}</span><textarea ref={detailInput} id="guide-details" value={details} onChange={e=>setDetails(e.target.value)} maxLength={1000} rows={3} placeholder={placeholder} required={needsDetails}/></label>}
        {intent==='explain'&&<p className="explain-hint">Du bekommst eine kurze Erklärung: Worum geht es, und was wird von dir erwartet?</p>}
        <button className="primary full guide-next" disabled={!intent||needsDetails&&!details.trim()}>{intent==='explain'?'Nachricht erklären':'Antwort formulieren'}<ArrowRight size={19}/></button>
        <p className="guide-footnote">{intent==='explain'?'Du kannst danach jederzeit nachfragen.':'Du prüfst den Entwurf und kopierst ihn selbst in deine Nachricht.'}</p>
      </>}
    </form>
  </section>;
}
