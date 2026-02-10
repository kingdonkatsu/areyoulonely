// ═══════════════════════════════════════════════════════════════
// EmotionalAR — Main Entry Point
// ═══════════════════════════════════════════════════════════════

import './style.css';
import { initWorld, updateWorld, raycastFromScreen, getScene, getClock, smoothTo } from './world.js';
import { initNodes, syncNodes, animateNodes, getNodeMeshes, getNodeByMesh, getNodeCount } from './nodes.js';
import { initFirebase, fetchNearbyMessages } from './firebase.js';
import { initBuildings, updateBuildings } from './buildings.js';
import { startGPS, gpsToLocal, getPosition, haversine } from './gps.js';
import { initUI, showCard, closeCard, hideLoadingScreen, showEmptyState, updateHUD, showToast } from './ui.js';
import { initFurniture, updateFurniture } from './furniture.js';

// ── State ─────────────────────────────────────────────────────
let lastFetchTime = 0;
const FETCH_INTERVAL = 10000; // 10s
let lastLoadPos = null; // Track where we last loaded buildings
const REFRESH_DIST = 150; // Refresh map every 150m of walking

// ── Boot ──────────────────────────────────────────────────────

async function boot() {
    console.log('[EmotionalAR] Booting…');

    // Safety timeout: If boot takes too long (>8s), force hide loading screen
    setTimeout(() => {
        const loader = document.getElementById('loading-screen');
        if (loader && !loader.classList.contains('fade-out')) {
            console.warn('[Boot] Safety timeout triggered. Forcing load.');
            hideLoadingScreen();
        }
    }, 8000);

    // 1. Init Three.js
    const canvas = document.getElementById('world-canvas');
    const { scene, clock } = initWorld(canvas);
    initNodes(scene);

    // 2. Init UI & Features
    initUI(() => { /* node deselect callback */ });
    initFurniture(scene);
    initBuildings(scene);

    // 3. Init Firebase
    await initFirebase();

    // 4. GPS + first fetch
    const pos = await startGPS((update) => {
        if (!lastLoadPos) return;
        // Pokémon Go style movement:
        // 1. Calculate local XZ relative to the start point (0,0,0)
        const local = gpsToLocal(update.lat, update.lng, pos.lat, pos.lng);
        // 2. Smoothly glide the camera/view to this new spot
        smoothTo(local.x, local.z);

        // 3. Periodic content sync
        fetchAndSync();

        // 4. Neighborhood refresh: If moved > 150m, get new map data
        const distFromLastLoad = haversine(lastLoadPos.lat, lastLoadPos.lng, update.lat, update.lng);
        if (distFromLastLoad > REFRESH_DIST) {
            console.log(`[Main] Walking... Moved ${distFromLastLoad.toFixed(0)}m. Refreshing neighborhood.`);
            lastLoadPos = { lat: update.lat, lng: update.lng };
            updateBuildings(update.lat, update.lng);
            updateFurniture(update.lat, update.lng);
        }
    });

    lastLoadPos = { lat: pos.lat, lng: pos.lng };

    // ── Stylized World Setup ──────────────────────────────────
    // We now use OSM data to generate building extrusions.
    await updateBuildings(pos.lat, pos.lng);

    await fetchAndSync();
    await updateFurniture(pos.lat, pos.lng);

    // 5. Hide loading screen
    setTimeout(hideLoadingScreen, 500);

    // 6. Tap handler
    setupTapHandler(canvas);

    // 7. RENDER LOOP
    function animate() {
        requestAnimationFrame(animate);
        const t = clock.getElapsedTime();

        animateNodes(t);
        updateWorld();

        // Periodic re-fetch
        if (performance.now() - lastFetchTime > FETCH_INTERVAL) {
            fetchAndSync();
        }
    }
    animate();

    console.log('[EmotionalAR] Ready.');
}

// ── Fetch & Sync ──────────────────────────────────────────────

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

// ── Tap-to-Select ─────────────────────────────────────────────

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
        if (dt > 400) return; // Long press, not a tap

        const hits = raycastFromScreen(e.clientX, e.clientY, getNodeMeshes());
        if (hits.length > 0) {
            const hit = hits[0].object;
            // Walk up to find the group
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

// ── Start ─────────────────────────────────────────────────────
boot();
