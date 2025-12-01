// Minimal service worker – ingen cachinglogikk ennå,
// men nok til at browseren ser appen som PWA-kandidat.

self.addEventListener('install', (event) => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  clients.claim()
})

// Tom fetch-handler (kan fylles med caching senere)
self.addEventListener('fetch', () => {})
