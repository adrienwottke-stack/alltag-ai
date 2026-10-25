export type LocalShare={id:string;text:string;file:File|null;expiresAt:number};
const DB='alltag-shares',STORE='incoming';
function database():Promise<IDBDatabase>{return new Promise((resolve,reject)=>{const r=indexedDB.open(DB,1);r.onupgradeneeded=()=>r.result.createObjectStore(STORE,{keyPath:'id'});r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(new Error('Die geteilte Nachricht konnte nicht geöffnet werden. Bitte teile sie noch einmal.'));});}
export async function getLocalShare(id:string):Promise<LocalShare>{
  const db=await database();try{return await new Promise((resolve,reject)=>{const tx=db.transaction(STORE,'readwrite'),store=tx.objectStore(STORE),r=store.get(id);let value:LocalShare|undefined;
    r.onsuccess=()=>{value=r.result;if(value&&value.expiresAt<Date.now()){store.delete(id);value=undefined;}};
    tx.oncomplete=()=>value?resolve(value):reject(new Error('Diese Übergabe ist abgelaufen. Teile die Nachricht bitte erneut.'));
    tx.onerror=()=>reject(new Error('Die geteilte Nachricht konnte nicht geöffnet werden.'));});}finally{db.close();}
}
export async function removeLocalShare(id:string){const db=await database();try{await new Promise<void>((resolve,reject)=>{const tx=db.transaction(STORE,'readwrite');tx.objectStore(STORE).delete(id);tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);});}finally{db.close();}}
export async function clearLocalShares(){const db=await database();try{await new Promise<void>((resolve,reject)=>{const tx=db.transaction(STORE,'readwrite');tx.objectStore(STORE).clear();tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);});}finally{db.close();}}
async function pruneLocalShares(){const db=await database();try{await new Promise<void>((resolve,reject)=>{const tx=db.transaction(STORE,'readwrite'),r=tx.objectStore(STORE).openCursor();r.onsuccess=()=>{const c=r.result;if(c){if(c.value.expiresAt<Date.now())c.delete();c.continue();}};tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);});}finally{db.close();}}
export async function imageData(file:File):Promise<string>{
  if(file.size>15*1024*1024)throw new Error('Bitte wähle ein Foto mit höchstens 15 MB.');
  const url=URL.createObjectURL(file);
  try{const picture=new Image();picture.src=url;await picture.decode();const scale=Math.min(1,1800/Math.max(picture.width,picture.height)),canvas=document.createElement('canvas');canvas.width=Math.round(picture.width*scale);canvas.height=Math.round(picture.height*scale);const ctx=canvas.getContext('2d');if(!ctx)throw new Error('Dieses Bild konnte nicht geöffnet werden.');ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(picture,0,0,canvas.width,canvas.height);const data=canvas.toDataURL('image/jpeg',.82);if(data.length>2_800_000)throw new Error('Bitte teile einen kleineren Screenshot.');return data;}catch(error){throw new Error(error instanceof Error&&error.message.startsWith('Bitte')?error.message:'Dieses Bildformat konnte nicht geöffnet werden. Teile bitte einen Screenshot als JPG oder PNG.');}finally{URL.revokeObjectURL(url);}
}
export function registerSharing(){void pruneLocalShares().catch(()=>{});if('serviceWorker'in navigator)navigator.serviceWorker.register('/sw.js').catch(()=>{});}
