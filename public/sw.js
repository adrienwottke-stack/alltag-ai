function redirect(path,status=303){return Response.redirect(new URL(path,self.location.origin).href,status);}
const SHELL='alltag-shell-2.1.0',DB='alltag-shares',STORE='incoming',TTL=15*60*1000;
function database(){return new Promise((resolve,reject)=>{const r=indexedDB.open(DB,1);r.onupgradeneeded=()=>r.result.createObjectStore(STORE,{keyPath:'id'});r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}
async function saveShare(value){const db=await database();try{await new Promise((resolve,reject)=>{const tx=db.transaction(STORE,'readwrite'),store=tx.objectStore(STORE),q=store.openCursor();q.onsuccess=()=>{const c=q.result;if(c){if(c.value.expiresAt<Date.now())c.delete();c.continue();}};store.put(value);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);});}finally{db.close();}}
self.addEventListener('install',event=>event.waitUntil((async()=>{
  const cache=await caches.open(SHELL),r=await fetch('/',{cache:'reload'});
  if(!r.ok)throw new Error('App unavailable');const html=await r.clone().text();await cache.put('/',r);
  const assets=[...html.matchAll(/(?:src|href)="(\/assets\/[^"\s]+)"/g)].map(m=>m[1]);
  await cache.addAll([...new Set([...assets,'/manifest.webmanifest','/sun.svg','/icon-192.png','/icon-512.png'])]);await self.skipWaiting();
})()));
self.addEventListener('activate',event=>event.waitUntil((async()=>{for(const name of await caches.keys())if(name.startsWith('alltag-shell-')&&name!==SHELL)await caches.delete(name);await self.clients.claim();})()));
async function receive(request){
  try{
    const form=await request.formData(),files=form.getAll('files').filter(f=>f instanceof File&&f.size);
    if(files.length>1)return redirect('/?shareError=many',303);
    const file=files[0]||null;
    if(file&&(file.size>15*1024*1024||!/^image\/(jpeg|png|webp|heic|heif)$/i.test(file.type)))return redirect('/?shareError=image',303);
    const parts=['title','text','url'].map(k=>form.get(k)).filter(v=>typeof v==='string'&&v.trim()).map(v=>v.trim());
    const text=[...new Set(parts)].join('\n\n');
    if(text.length>8000)return redirect('/?shareError=long',303);
    if(!text&&!file)return redirect('/?shareError=empty',303);
    const id=crypto.randomUUID();await saveShare({id,text,file,expiresAt:Date.now()+TTL});
    return redirect('/#share='+id,303);
  }catch{return redirect('/?shareError=failed',303);}
}
self.addEventListener('fetch',event=>{
  const url=new URL(event.request.url);if(url.origin!==self.location.origin)return;
  if(event.request.method==='POST'&&url.pathname==='/teilen'){event.respondWith(receive(event.request));return;}
  if(event.request.method!=='GET'||url.pathname.startsWith('/api/'))return;
  // Only the public shell is cached. Account data, requests and shared content never enter Cache Storage.
  if(event.request.mode==='navigate'){event.respondWith(fetch(event.request).catch(async()=>await caches.match('/')||Response.error()));return;}
  if(url.pathname.startsWith('/assets/')||['/sun.svg','/icon-192.png','/icon-512.png'].includes(url.pathname))event.respondWith(caches.match(event.request).then(r=>r||fetch(event.request)));
});
