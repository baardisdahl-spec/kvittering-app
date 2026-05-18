// Storage layer using IndexedDB (handles large image blobs better than localStorage)
const DB_NAME = 'kvitteringer';
const DB_VERSION = 1;
const STORE_TRIPS = 'trips';

let dbPromise = null;

function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_TRIPS)) {
        db.createObjectStore(STORE_TRIPS, { keyPath: 'id' });
      }
    };
  });
  return dbPromise;
}

async function getAllTrips() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_TRIPS, 'readonly');
    const store = tx.objectStore(STORE_TRIPS);
    const req = store.getAll();
    req.onsuccess = () => {
      // Sort by createdAt desc
      const trips = req.result.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
      resolve(trips);
    };
    req.onerror = () => reject(req.error);
  });
}

async function getTrip(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_TRIPS, 'readonly');
    const store = tx.objectStore(STORE_TRIPS);
    const req = store.get(id);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function saveTrip(trip) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_TRIPS, 'readwrite');
    const store = tx.objectStore(STORE_TRIPS);
    const req = store.put(trip);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

async function deleteTrip(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_TRIPS, 'readwrite');
    const store = tx.objectStore(STORE_TRIPS);
    const req = store.delete(id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

// Convert File/Blob to base64 data URL for storage
function fileToDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

// Resize image before storage to keep DB size manageable
async function resizeImage(dataUrl, maxWidth = 1600, quality = 0.85) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxWidth / img.width);
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, w, h);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.src = dataUrl;
  });
}
