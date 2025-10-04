// Service Worker for Pi Camera Control PWA
const CACHE_NAME = "camera-control-v1";
const STATIC_CACHE_NAME = "camera-static-v1";
const RUNTIME_CACHE_NAME = "camera-runtime-v1";

// Files to cache for offline functionality
const STATIC_FILES = [
  "/",
  "/index.html",
  "/css/main.css",
  "/js/app.js",
  "/js/camera.js",
  "/js/websocket.js",
  "/manifest.json",
];

// API routes that should be cached with network-first strategy
const API_ROUTES = ["/api/camera/status", "/api/system/power", "/health"];

// Install event - cache static assets
self.addEventListener("install", (event) => {
  console.log("Service Worker installing...");

  event.waitUntil(
    caches
      .open(STATIC_CACHE_NAME)
      .then((cache) => {
        console.log("Caching static files");
        return cache.addAll(STATIC_FILES);
      })
      .then(() => {
        // Skip waiting to activate immediately
        return self.skipWaiting();
      })
      .catch((error) => {
        console.error("Failed to cache static files:", error);
      }),
  );
});

// Activate event - cleanup old caches
self.addEventListener("activate", (event) => {
  console.log("Service Worker activating...");

  event.waitUntil(
    caches
      .keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cacheName) => {
            // Delete old cache versions
            if (
              cacheName !== STATIC_CACHE_NAME &&
              cacheName !== RUNTIME_CACHE_NAME
            ) {
              console.log("Deleting old cache:", cacheName);
              return caches.delete(cacheName);
            }
          }),
        );
      })
      .then(() => {
        // Claim all clients immediately
        return self.clients.claim();
      }),
  );
});

// Fetch event - handle network requests
self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Only handle requests from our origin
  if (url.origin !== location.origin) {
    return;
  }

  // Handle different types of requests
  if (request.method === "GET") {
    if (isStaticFile(request.url)) {
      // Static files: cache first, then network
      event.respondWith(cacheFirst(request));
    } else if (isAPIRoute(request.url)) {
      // API routes: network first, then cache
      event.respondWith(networkFirst(request));
    } else {
      // Other requests: network first with cache fallback
      event.respondWith(networkFirst(request));
    }
  } else {
    // POST/PUT/DELETE requests: network only (camera control)
    event.respondWith(networkOnly(request));
  }
});

// Cache-first strategy (for static assets)
async function cacheFirst(request) {
  try {
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
      return cachedResponse;
    }

    const networkResponse = await fetch(request);
    if (networkResponse.ok) {
      const cache = await caches.open(STATIC_CACHE_NAME);
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch (error) {
    console.warn("Cache-first failed for:", request.url, error);

    // Return offline fallback for HTML requests
    if (request.headers.get("accept")?.includes("text/html")) {
      return caches.match("/index.html");
    }

    // Return basic error response for other requests
    return new Response("Offline", {
      status: 503,
      statusText: "Service Unavailable",
    });
  }
}

// Network-first strategy (for API calls)
async function networkFirst(request) {
  try {
    const networkResponse = await fetch(request);

    if (networkResponse.ok && request.method === "GET") {
      const cache = await caches.open(RUNTIME_CACHE_NAME);
      cache.put(request, networkResponse.clone());
    }

    return networkResponse;
  } catch (error) {
    console.warn("Network-first failed for:", request.url, error);

    // Try to return cached version
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
      return cachedResponse;
    }

    // Return appropriate offline response
    if (isAPIRoute(request.url)) {
      return new Response(
        JSON.stringify({
          error: "Offline - cached data not available",
          offline: true,
        }),
        {
          headers: { "Content-Type": "application/json" },
          status: 503,
        },
      );
    }

    return new Response("Offline", {
      status: 503,
      statusText: "Service Unavailable",
    });
  }
}

// Network-only strategy (for camera control)
async function networkOnly(request) {
  try {
    return await fetch(request);
  } catch (error) {
    console.warn("Network-only failed for:", request.url, error);

    return new Response(
      JSON.stringify({
        error: "Network unavailable - camera control requires connection",
        offline: true,
      }),
      {
        headers: { "Content-Type": "application/json" },
        status: 503,
      },
    );
  }
}

// Helper functions
function isStaticFile(url) {
  const staticExtensions = [
    ".css",
    ".js",
    ".png",
    ".jpg",
    ".jpeg",
    ".svg",
    ".ico",
  ];
  const pathname = new URL(url).pathname;

  return (
    staticExtensions.some((ext) => pathname.endsWith(ext)) ||
    pathname === "/" ||
    pathname === "/index.html"
  );
}

function isAPIRoute(url) {
  const pathname = new URL(url).pathname;
  return API_ROUTES.some((route) => pathname.startsWith(route));
}

// Background sync for camera operations (future enhancement)
self.addEventListener("sync", (event) => {
  if (event.tag === "camera-sync") {
    console.log("Background sync triggered for camera operations");
    // Could implement queued camera operations here
  }
});

// Push notifications (future enhancement)
self.addEventListener("push", (event) => {
  if (event.data) {
    const data = event.data.json();
    console.log("Push notification received:", data);

    event.waitUntil(
      self.registration.showNotification(data.title, {
        body: data.body,
        icon: "/assets/icon-192.png",
        badge: "/assets/icon-72.png",
        vibrate: [100, 50, 100],
        data: data.data,
        actions: [
          {
            action: "open",
            title: "Open App",
          },
        ],
      }),
    );
  }
});

// Notification click handling
self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  if (event.action === "open" || !event.action) {
    event.waitUntil(
      clients.matchAll({ type: "window" }).then((clientList) => {
        // Focus existing window if available
        for (const client of clientList) {
          if (client.url === location.origin && "focus" in client) {
            return client.focus();
          }
        }

        // Open new window
        if (clients.openWindow) {
          return clients.openWindow("/");
        }
      }),
    );
  }
});

// Message handling from main thread
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }

  if (event.data && event.data.type === "GET_VERSION") {
    event.ports[0].postMessage({ version: CACHE_NAME });
  }

  if (event.data && event.data.type === "CLEAR_CACHE") {
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          console.log("Clearing cache:", cacheName);
          return caches.delete(cacheName);
        }),
      );
    });
  }
});

console.log("Service Worker loaded:", CACHE_NAME);
