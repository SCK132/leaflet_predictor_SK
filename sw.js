var CACHE_NAME = 'predictor-cache-v10';
var TILE_CACHE_NAME = 'predictor-tiles-v10';
var urlsToCache = [
    './',
    './index.html',
    './css/leaflet.css',
    './css/jquery-ui.css',
    './css/predictor.css',
    './css/mobile.css',
    './js/jquery-3.3.1.min.js',
    './js/jquery-ui.min.js',
    './js/leaflet.js',
    './js/moment.js',
    './js/pred/pred.js',
    './js/pred/pred-ui.js',
    './js/pred/pred-map.js',
    './js/pred/pred-new.js',
    './js/pred/pred-config.js',
    './js/pred/log-overlay.js',
    './js/pred/landsea.js',
    './js/pred/mobile_ui.js',
    './js/pred/launch-window.js',
    './js/pred/phase4-features.js',
    './data/land_japan_raw.geojson',
    './images/target-1-sm.png',
    './images/target-8-sm.png',
    './images/pop-marker.png',
    './images/drag_handle.png',
    './favicon.ico',
    './sites.json',
    './manifest.json',
    './js/chart.min.js',
    './js/html2canvas.min.js',
    './js/pred/pred-collaborate.js',
    './js/pred/pred-chart.js'
];

self.addEventListener('install', function (event) {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(function (cache) {
                console.log('Opened cache');
                return cache.addAll(urlsToCache);
            })
    );
});

// 古いキャッシュを自動削除
self.addEventListener('activate', function (event) {
    event.waitUntil(
        caches.keys().then(function (cacheNames) {
            return Promise.all(
                cacheNames.filter(function (cacheName) {
                    return cacheName !== CACHE_NAME && cacheName !== TILE_CACHE_NAME;
                }).map(function (cacheName) {
                    console.log('Deleting old cache:', cacheName);
                    return caches.delete(cacheName);
                })
            );
        })
    );
});

self.addEventListener('fetch', function (event) {
    var requestUrl = new URL(event.request.url);

    // Handle Tile Caching (OSM/Mapbox tiles)
    if (requestUrl.href.includes('tile.openstreetmap.org') || requestUrl.href.includes('mapbox.com')) {
        event.respondWith(
            caches.open(TILE_CACHE_NAME).then(function (cache) {
                return cache.match(event.request).then(function (response) {
                    var fetchPromise = fetch(event.request).then(function (networkResponse) {
                        cache.put(event.request, networkResponse.clone());
                        return networkResponse;
                    });
                    return response || fetchPromise;
                });
            })
        );
        return;
    }

    // Handle Default Caching (Stale-while-revalidate)
    event.respondWith(
        caches.match(event.request)
            .then(function (response) {
                // Cache hit - return response
                if (response) {
                    return response;
                }
                return fetch(event.request).then(
                    function (response) {
                        // Check if we received a valid response
                        if (!response || response.status !== 200 || response.type !== 'basic') {
                            return response;
                        }

                        // Clone the response
                        var responseToCache = response.clone();

                        caches.open(CACHE_NAME)
                            .then(function (cache) {
                                cache.put(event.request, responseToCache);
                            });

                        return response;
                    }
                );
            })
    );
});
