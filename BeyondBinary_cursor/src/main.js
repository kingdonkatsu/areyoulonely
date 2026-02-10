import './style.css';
import { initWorld, updateWorld, raycastFromScreen, getClock, smoothTo } from './world.js';
import { initNodes, syncNodes, animateNodes, getNodeMeshes, getNodeByMesh } from './nodes.js';
import { initFirebase, fetchNearbyMessages } from './firebase.js';
import { initBuildings, updateBuildings } from './buildings.js';
import { startGPS, gpsToLocal, getPosition, haversine } from './gps.js';
import { initUI, showCard, closeCard, hideLoadingScreen, showEmptyState, updateHUD } from './ui.js';
import { initFurniture, updateFurniture } from './furniture.js';

let lastFetchTime = 0;
const FETCH_INTERVAL = 10000;
let lastLoadPos = null;
const REFRESH_DIST = 150;

async function boot() {
  console.log('[EmotionalAR] Booting…');

  setTimeout(() => {
    const loader = document.getElementById('loading-screen');
    if (loader && !loader.classList.contains('fade-out')) {
      console.warn('[Boot] Safety timeout triggered. Forcing load.');
      hideLoadingScreen();
    }
  }, 8000);

  const canvas = document.getElementById('world-canvas');
  const { scene, clock } = initWorld(canvas);
  initNodes(scene);

  initUI(() => {});
  initFurniture(scene);
  initBuildings(scene);

  await initFirebase();

  const pos = await startGPS((update) => {
    if (!lastLoadPos) return;
    const local = gpsToLocal(update.lat, update.lng, pos.lat, pos.lng);
    smoothTo(local.x, local.z);

    fetchAndSync();

    const distFromLastLoad = haversine(
      lastLoadPos.lat,
      lastLoadPos.lng,
      update.lat,
      update.lng,
    );
    if (distFromLastLoad > REFRESH_DIST) {
      console.log(
        `[Main] Walking... Moved ${distFromLastLoad.toFixed(0)}m. Refreshing neighborhood.`,
      );
      lastLoadPos = { lat: update.lat, lng: update.lng };
      updateBuildings(update.lat, update.lng);
      updateFurniture(update.lat, update.lng);
    }
  });

  lastLoadPos = { lat: pos.lat, lng: pos.lng };

  await updateBuildings(pos.lat, pos.lng);
  await fetchAndSync();
  await updateFurniture(pos.lat, pos.lng);

  setTimeout(hideLoadingScreen, 500);

  setupTapHandler(canvas);

  function animate() {
    requestAnimationFrame(animate);
    const t = clock.getElapsedTime();

    animateNodes(t);
    updateWorld();

    if (performance.now() - lastFetchTime > FETCH_INTERVAL) {
      fetchAndSync();
    }
  }
  animate();

  console.log('[EmotionalAR] Ready.');
}

async function fetchAndSync() {
  lastFetchTime = performance.now();
  try {
    const pos = getPosition();
    const messages = await fetchNearbyMessages(pos.lat, pos.lng, 20);
    const count = syncNodes(messages);
    updateHUD(count);
    showEmptyState(count === 0);
  } catch (err) {
    console.error('[Fetch] Error:', err);
  }
}

function setupTapHandler(canvas) {
  let touchStart = null;
  let touchMoved = false;

  canvas.addEventListener('pointerdown', (e) => {
    touchStart = { x: e.clientX, y: e.clientY, time: performance.now() };
    touchMoved = false;
  });

  canvas.addEventListener('pointermove', (e) => {
    if (!touchStart) return;
    const dx = e.clientX - touchStart.x;
    const dy = e.clientY - touchStart.y;
    if (Math.sqrt(dx * dx + dy * dy) > 8) touchMoved = true;
  });

  canvas.addEventListener('pointerup', (e) => {
    if (!touchStart || touchMoved) return;
    const dt = performance.now() - touchStart.time;
    if (dt > 400) return;

    const hits = raycastFromScreen(e.clientX, e.clientY, getNodeMeshes());
    if (hits.length > 0) {
      const hit = hits[0].object;
      let obj = hit;
      while (obj.parent && !obj.name.startsWith('node_')) obj = obj.parent;
      const entry = getNodeByMesh(obj) || getNodeByMesh(hit);
      if (entry) {
        showCard(entry);
      }
    } else {
      closeCard();
    }
    touchStart = null;
  });
}

boot();

