// Enhanced Service Worker with improved offline handling
const CACHE_NAME = 'chat-app-offline-v2';
const DYNAMIC_CACHE = 'chat-dynamic-v2';
const OFFLINE_FALLBACK = '/offline.html';

// Static assets to cache
const STATIC_ASSETS = [
  '/',
  '/static/js/bundle.js',
  '/static/css/main.css',
  '/manifest.json',
  '/icons/icon-192x192.png',
  '/icons/icon-512x512.png',
  '/offline.html'
];

// Install event - cache static assets
self.addEventListener('install', (event) => {
  console.log('Service Worker installing...');
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('Caching static assets');
      return cache.addAll(STATIC_ASSETS);
    }).then(() => {
      // Skip waiting to activate immediately
      return self.skipWaiting();
    })
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  console.log('Service Worker activating...');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME && cacheName !== DYNAMIC_CACHE) {
            console.log('Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
      // Take control immediately
      return self.clients.claim();
    })
  );
});

// Fetch event - comprehensive caching strategy
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests
  if (request.method !== 'GET') {
    return;
  }

  // Handle Firebase API calls
  if (url.hostname.includes('firestore.googleapis.com') || 
      url.hostname.includes('firebase.googleapis.com')) {
    event.respondWith(handleFirebaseRequest(request));
    return;
  }

  // Handle navigation requests (HTML documents)
  if (request.mode === 'navigate') {
    event.respondWith(handleNavigationRequest(request));
    return;
  }

  // Handle static assets
  if (request.destination === 'script' || 
      request.destination === 'style' || 
      request.destination === 'image' ||
      request.destination === 'manifest') {
    event.respondWith(handleStaticAssets(request));
    return;
  }

  // Default: try network first, fallback to cache
  event.respondWith(
    fetch(request).catch(() => {
      return caches.match(request);
    })
  );
});

// Handle Firebase requests with cache-first strategy for offline support
async function handleFirebaseRequest(request) {
  try {
    // Try cache first for offline capability
    const cachedResponse = await caches.match(request);
    
    if (cachedResponse) {
      // Return cached data immediately
      // Try to update cache in background
      fetch(request).then((response) => {
        if (response.ok && response.status === 200) {
          const responseClone = response.clone();
          caches.open(DYNAMIC_CACHE).then((cache) => {
            cache.put(request, responseClone);
          });
        }
      }).catch(() => {
        // Network failed, but we have cache
        console.log('Background update failed, using cached data');
      });
      
      return cachedResponse;
    }

    // No cache, try network
    const networkResponse = await fetch(request);
    
    if (networkResponse.ok && networkResponse.status === 200) {
      // Cache successful responses
      const responseClone = networkResponse.clone();
      const cache = await caches.open(DYNAMIC_CACHE);
      await cache.put(request, responseClone);
    }
    
    return networkResponse;
  } catch (error) {
    console.log('Firebase request failed:', error);
    
    // Return offline indicator for failed Firebase requests
    return new Response(
      JSON.stringify({ 
        error: 'offline', 
        message: 'No internet connection',
        timestamp: Date.now()
      }),
      { 
        status: 503,
        statusText: 'Service Unavailable',
        headers: { 'Content-Type': 'application/json' } 
      }
    );
  }
}

// Handle navigation requests with offline fallback
async function handleNavigationRequest(request) {
  try {
    // Try network first for navigation
    const networkResponse = await fetch(request);
    
    // Cache successful navigation responses
    if (networkResponse.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, networkResponse.clone());
    }
    
    return networkResponse;
  } catch (error) {
    // Network failed, try cache
    const cachedResponse = await caches.match(request);
    
    if (cachedResponse) {
      return cachedResponse;
    }
    
    // No cache available, return offline page
    const offlineResponse = await caches.match(OFFLINE_FALLBACK);
    return offlineResponse || new Response(
      '<html><body><h1>Offline</h1><p>You are currently offline. Please check your internet connection.</p></body></html>',
      { headers: { 'Content-Type': 'text/html' } }
    );
  }
}

// Handle static assets with cache-first strategy
async function handleStaticAssets(request) {
  try {
    // Try cache first for static assets
    const cachedResponse = await caches.match(request);
    
    if (cachedResponse) {
      return cachedResponse;
    }
    
    // Not in cache, fetch from network
    const networkResponse = await fetch(request);
    
    // Cache the response
    if (networkResponse.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, networkResponse.clone());
    }
    
    return networkResponse;
  } catch (error) {
    // Both cache and network failed
    console.log('Static asset request failed:', error);
    return new Response('', { status: 404, statusText: 'Not Found' });
  }
}

// Handle background sync for queued messages
self.addEventListener('sync', (event) => {
  console.log('Background sync event:', event.tag);
  
  if (event.tag === 'chat-messages-sync') {
    event.waitUntil(syncQueuedMessages());
  }
});

// Sync queued messages when online
async function syncQueuedMessages() {
  try {
    // This would typically communicate with your IndexedDB
    // through the main app context via postMessage
    const clients = await self.clients.matchAll();
    
    clients.forEach(client => {
      client.postMessage({
        type: 'SYNC_QUEUED_MESSAGES',
        timestamp: Date.now()
      });
    });
    
    console.log('Sync message sent to clients');
  } catch (error) {
    console.error('Error syncing queued messages:', error);
  }
}

// Listen for messages from the main app
self.addEventListener('message', (event) => {
  const { data } = event;
  
  if (data && data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  
  if (data && data.type === 'CLAIM_CLIENTS') {
    self.clients.claim();
  }
});

// Periodic cleanup of old cached data
self.addEventListener('activate', (event) => {
  event.waitUntil(
    cleanupOldCaches()
  );
});

async function cleanupOldCaches() {
  try {
    const cache = await caches.open(DYNAMIC_CACHE);
    const requests = await cache.keys();
    
    // Remove cache entries older than 7 days
    const oneWeekAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
    
    const deletePromises = requests.map(async (request) => {
      const response = await cache.match(request);
      const dateHeader = response?.headers.get('date');
      
      if (dateHeader) {
        const responseDate = new Date(dateHeader).getTime();
        if (responseDate < oneWeekAgo) {
          return cache.delete(request);
        }
      }
    });
    
    await Promise.all(deletePromises);
    console.log('Cache cleanup completed');
  } catch (error) {
    console.error('Cache cleanup failed:', error);
  }
}
