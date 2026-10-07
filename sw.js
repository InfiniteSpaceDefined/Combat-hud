/* Combat HUD service worker: caches everything so the app works offline.
   To force every device to refresh after you change files, bump VERSION. */
var VERSION='v2';
var CACHE='combat-hud-'+VERSION;
var ASSETS=[
  './','./index.html','./manifest.webmanifest',
  './icons/icon-192.png','./icons/icon-512.png','./icons/icon-maskable-512.png','./icons/apple-touch-icon.png','./icons/favicon-32.png',
  './lib/pdf.min.js','./lib/pdf.worker.min.js',
  './fonts/barlow-condensed-latin-500-normal.woff2','./fonts/barlow-condensed-latin-600-normal.woff2','./fonts/barlow-condensed-latin-700-normal.woff2',
  './fonts/instrument-sans-latin-400-normal.woff2','./fonts/instrument-sans-latin-500-normal.woff2','./fonts/instrument-sans-latin-600-normal.woff2'
];
self.addEventListener('install',function(e){
  e.waitUntil(caches.open(CACHE).then(function(c){return c.addAll(ASSETS)}).then(function(){return self.skipWaiting()}));
});
self.addEventListener('activate',function(e){
  e.waitUntil(caches.keys().then(function(keys){
    return Promise.all(keys.filter(function(k){return k.indexOf('combat-hud-')===0&&k!==CACHE}).map(function(k){return caches.delete(k)}));
  }).then(function(){return self.clients.claim()}));
});
self.addEventListener('fetch',function(e){
  var req=e.request;
  if(req.method!=='GET'||new URL(req.url).origin!==self.location.origin)return;
  e.respondWith(caches.open(CACHE).then(function(cache){
    return cache.match(req,{ignoreSearch:true}).then(function(hit){
      var net=fetch(req).then(function(res){if(res&&res.ok)cache.put(req,res.clone());return res}).catch(function(){return hit||(req.mode==='navigate'?cache.match('./index.html'):undefined)});
      return hit||net;
    });
  }));
});
