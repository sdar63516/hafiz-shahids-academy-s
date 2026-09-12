const CACHE='hsa-shell-v3';
const SHELL=['/','/index.html','/style.css','/academy-mark.png','/academy-logo.png','/shahid.jpg','/manifest.webmanifest'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(SHELL)).then(()=>self.skipWaiting()));});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));});
self.addEventListener('fetch',e=>{const u=new URL(e.request.url);if(u.origin!==location.origin||e.request.method!=='GET'||u.pathname.startsWith('/api/')||u.pathname.startsWith('/uploads/'))return;
const isNav=e.request.mode==='navigate'||u.pathname==='/'||u.pathname.endsWith('.html')||u.pathname.endsWith('.js')||u.pathname.endsWith('.css');
if(isNav){e.respondWith(fetch(e.request,{cache:'no-store'}).then(r=>{const copy=r.clone();caches.open(CACHE).then(c=>c.put(e.request,copy));return r;}).catch(()=>caches.match(e.request).then(r=>r||caches.match('/index.html'))));return;}
e.respondWith(fetch(e.request).then(r=>{const copy=r.clone();caches.open(CACHE).then(c=>c.put(e.request,copy));return r;}).catch(()=>caches.match(e.request)));
});
