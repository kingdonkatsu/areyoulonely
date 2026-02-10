// ═══════════════════════════════════════════════════════════════
// EmotionalAR — Main Entry Point
// ═══════════════════════════════════════════════════════════════

import './style.css';
import { initWorld, updateWorld, raycastFromScreen, getScene, getClock, init3DTiles } from './world.js';
import { initNodes, syncNodes, animateNodes, getNodeMeshes, getNodeByMesh, getNodeCount } from './nodes.js';
import { initFirebase, fetchNearbyMessages } from './firebase.js';
import { startGPS, getPosition } from './gps.js';
import { initUI, showCard, closeCard, hideLoadingScreen, showEmptyState, updateHUD, showToast } from './ui.js';

// ── State ─────────────────────────────────────────────────────
let lastFetchTime = 0;
const FETCH_INTERVAL = 10000; // 10s

// ── Boot ──────────────────────────────────────────────────────

async function boot() {
    console.log('[EmotionalAR] Booting…');

    // 1. Init Three.js
    const canvas = document.getElementById('world-canvas');
    const { scene, clock } = initWorld(canvas);
    initNodes(scene);

    // 2. Init UI
    initUI(() => { /* node deselect callback */ });

    // 3. Init Firebase
    await initFirebase();

    // 4. GPS + first fetch
    const pos = await startGPS((update) => {
        console.log(`[GPS] Moved ${update.moved.toFixed(1)}m → refetching…`);
        fetchAndSync();
    });

    // Prompt for API Key (Temporary mechanism for Demo)
    // In a real app, you'd bundle this or proxy it.
    const apiKey = prompt("Please enter your Google Maps API Key to enable 3D Tiles:");
    if (apiKey) {
        init3DTiles(apiKey, pos.lat, pos.lng);
        showToast("Loading 3D World...", "success");
    } else {
        showToast("No API Key provided. World may be empty.", "error");
    }

    await fetchAndSync();

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
