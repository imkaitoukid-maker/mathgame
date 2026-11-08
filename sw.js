const CACHE = 'make-ten-adventure-v26';
const FILES = ['./', './index.html', './style.css', './projectiles.css', './companions.css', './volume.css', './modes.css', './study.css', './study.js', './app.js', './game.js', './hundred.js', './db.js', './projectiles.js', './produce-projectiles.js', './insect-projectiles.js', './assets/animals.png', './assets/favicon.svg', ...['bunny','chick','pig'].map(id => './assets/companions/classic-' + id + '-ref-v4.png'), ...['ref-dog','ref-cat','ref-pigeon','ref-clownfish','ref-hamster','ref-sprout','ref-dinosaur','ref-penguin'].map(id => `./assets/companions/${id}.png`)];
FILES.push('./platformer.css','./platform-engine.js','./platform-view.js','./fullscreen.js','./maps/orchard-1.tmj','./assets/platformer/orchard.tsj','./assets/platformer/tiles.svg','./assets/platformer/orchard-background.png');
FILES.push('./pose-input.js','./pose-session.js','./pose/motion.js','./pose/camera.js','./pose/pose-worker.js','./pose/vendor/vision.js','./pose/models/pose_landmarker_lite.task',...['vision_wasm_internal.js','vision_wasm_internal.wasm','vision_wasm_nosimd_internal.js','vision_wasm_nosimd_internal.wasm'].map(name=>'./pose/wasm/'+name));
self.addEventListener('install', event => { event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(FILES))); self.skipWaiting(); });
self.addEventListener('activate', event => { event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('make-ten-adventure-') && key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET' || new URL(event.request.url).origin !== self.location.origin) return;
  event.respondWith(fetch(event.request).then(response => {
    if (response.ok) { const copy = response.clone(); void caches.open(CACHE).then(cache => cache.put(event.request, copy)); }
    return response;
  }).catch(async () => (await caches.match(event.request)) || new Response('请联网后再试一下', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } })));
});




