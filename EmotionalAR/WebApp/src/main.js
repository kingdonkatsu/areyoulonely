// ═══════════════════════════════════════════════════════════════
// EmotionalAR — Main Entry Point
// ═══════════════════════════════════════════════════════════════

import './style.css';
import { initWorld, updateWorld, raycastFromScreen, getScene, getClock, smoothTo, setOrigin, getMap } from './world.js';
import { initNodes, syncNodes, animateNodes, getNodeMeshes, getNodeByMesh, getNodeCount } from './nodes.js';
import { initFirebase, fetchNearbyMessages } from './firebase.js';
import { startGPS, gpsToLocal, getPosition, haversine } from './gps.js';
import { initUI, showCard, closeCard, hideLoadingScreen, showEmptyState, updateHUD, showToast } from './ui.js';
import { initCharacter, updateCharacterPosition, setCharacterDirection, setWalking, animateCharacter } from './character.js';

// ── State ─────────────────────────────────────────────────────
let lastFetchTime = 0;
const FETCH_INTERVAL = 10000; // 10s
let _prevLocal = { x: 0, z: 0 }; // Previous position for direction calc
let idleTimer = null; // Timer to check if user stopped walking

// ── Boot ──────────────────────────────────────────────────────

async function boot() {
    console.log('[EmotionalAR] Booting…');

    // Safety timeout
    setTimeout(() => {
        const loader = document.getElementById('loading-screen');
        if (loader && !loader.classList.contains('fade-out')) {
            console.warn('[Boot] Safety timeout triggered. Forcing load.');
            hideLoadingScreen();
        }
    }, 15000);

    // 1. Init Mapbox GL + Three.js custom layer
    const { scene, clock } = await initWorld();
    initNodes(scene);

    // 2. Init Character & UI
    initUI(() => { /* node deselect callback */ });
    initCharacter(scene);

    // 3. Init Firebase
    await initFirebase();

    // 4. GPS + first fetch
    const pos = await startGPS((update) => {
        // Calculate local XZ relative to the start point
        const local = gpsToLocal(update.lat, update.lng, pos.lat, pos.lng);

        // Calculate movement direction
        const dx = local.x - _prevLocal.x;
        const dz = local.z - _prevLocal.z;
        const dist = Math.sqrt(dx * dx + dz * dz);


        // Calculate movement
        if (dist > 0.5) { // Moved more than 0.5m
            // Set character direction (facing movement direction)
            const angle = Math.atan2(dx, dz);
            setCharacterDirection(angle);
            setWalking(true);

            // Update character position in Three.js scene
            updateCharacterPosition(update.lat, update.lng, local.x, local.z);

            // Move the map to follow the user
            smoothTo(update.lat, update.lng);

            _prevLocal = { x: local.x, z: local.z };

            // Reset idle timer
            if (idleTimer) clearTimeout(idleTimer);
            idleTimer = setTimeout(() => {
                setWalking(false);
            }, 2500); // Stop walking if no update after 2.5s
        } else {
            setWalking(false);
        }

        // Periodic content sync
        fetchAndSync();
    });

    // Set GPS origin for the Three.js coordinate system
    setOrigin(pos.lat, pos.lng);

    // First fetch of nearby messages
    await fetchAndSync();

    // 5. Hide loading screen
    setTimeout(hideLoadingScreen, 500);

    // 6. Tap handler (use Mapbox's canvas)
    setupTapHandler(getMap().getCanvas());

    // 7. RENDER LOOP (for Three.js animations — Mapbox handles map rendering)
    function animate() {
        requestAnimationFrame(animate);
        const t = clock.getElapsedTime();
        const delta = clock.getDelta();

        animateNodes(t);
        animateCharacter(delta);

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

// ── Start ─────────────────────────────────────────────────────
boot();
