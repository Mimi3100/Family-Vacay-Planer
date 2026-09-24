/* =========================================================
   NUESTRA AVENTURA · SERVICE WORKER
   ========================================================= */

/*
   Esta versión NO cachea la aplicación.

   La aplicación utiliza Supabase para los datos online
   y localStorage para el modo offline.

   Dejamos este archivo solamente para retirar cualquier
   Service Worker/caché anterior que pudiera estar atrapado
   en un teléfono o computadora.
*/

self.addEventListener("install", event => {
  self.skipWaiting();
});

self.addEventListener("activate", event => {
  event.waitUntil(
    (async () => {

      const cacheNames = await caches.keys();

      await Promise.all(
        cacheNames.map(cacheName =>
          caches.delete(cacheName)
        )
      );

      await self.clients.claim();

      const clients = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true
      });

      clients.forEach(client => {
        client.postMessage({
          type: "NUESTRA_AVENTURA_CACHE_CLEARED"
        });
      });

    })()
  );
});

/*
   No interceptamos las solicitudes.
   Todo se carga directamente desde la red.
*/

self.addEventListener("fetch", event => {
  return;
});
