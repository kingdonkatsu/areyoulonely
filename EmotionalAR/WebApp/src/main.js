// ═══════════════════════════════════════════════════════════════
// EmotionalAR — Main Entry Point
// ═══════════════════════════════════════════════════════════════

import './style.css';
import { initWorld, updateWorld, raycastFromScreen, getScene, getClock, smoothTo, updateGroundTexture } from './world.js';
import { initNodes, syncNodes, animateNodes, getNodeMeshes, getNodeByMesh, getNodeCount } from './nodes.js';
import { initFirebase, fetchNearbyMessages } from './firebase.js';
import { initBuildings, updateBuildings, getBuildingCount } from './buildings.js';
import { startGPS, gpsToLocal, getPosition, haversine } from './gps.js';
import { initUI, showCard, closeCard, hideLoadingScreen, showEmptyState, updateHUD, showToast } from './ui.js';
import { initEnvironment, updateEnvironment, getEnvironmentCount } from './environment.js';
import { initCharacter, updateCharacterPosition, setCharacterDirection, setWalking, animateCharacter } from './character.js';

// ── State ─────────────────────────────────────────────────────
let lastFetchTime = 0;
const FETCH_INTERVAL = 10000; // 10s
let lastLoadPos = null;
const REFRESH_DIST = 150; // Refresh map every 150m
let _prevLocal = { x: 0, z: 0 }; // Previous position for direction calc
let _buildingsLoaded = false;
let _environmentLoaded = false;

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
    }, 15000); // Extended to 15s for environment loading

    // 1. Init Three.js
    const canvas = document.getElementById('world-canvas');
    const { scene, clock } = initWorld(canvas);
    initNodes(scene);

    // 2. Init Character, Environment & UI
    initUI(() => { /* node deselect callback */ });
    initCharacter(scene);
    initEnvironment(scene);
    initBuildings(scene);

    // 3. Init Firebase
    await initFirebase();

    // 4. GPS + first fetch
    const pos = await startGPS((update) => {
        if (!lastLoadPos) return;

        // Calculate local XZ relative to the start point
        const local = gpsToLocal(update.lat, update.lng, pos.lat, pos.lng);

        // Calculate movement direction
        const dx = local.x - _prevLocal.x;
        const dz = local.z - _prevLocal.z;
        const dist = Math.sqrt(dx * dx + dz * dz);

        if (dist > 0.5) { // Moved more than 0.5m
            // Set character direction (facing movement direction)
            const angle = Math.atan2(dx, dz);
            setCharacterDirection(angle);
            setWalking(true);

            // Update character position
            updateCharacterPosition(local.x, local.z);

            // Smoothly glide the camera/view
            smoothTo(local.x, local.z);

            _prevLocal = { x: local.x, z: local.z };
        } else {
            setWalking(false);
        }

        // Periodic content sync
        fetchAndSync();

        // Neighborhood refresh
        const distFromLastLoad = haversine(lastLoadPos.lat, lastLoadPos.lng, update.lat, update.lng);
        if (distFromLastLoad > REFRESH_DIST) {
            console.log(`[Main] Moved ${distFromLastLoad.toFixed(0)}m. Refreshing neighborhood.`);
            lastLoadPos = { lat: update.lat, lng: update.lng };
            updateGroundTexture(update.lat, update.lng);
            loadEnvironmentWithRetry(update.lat, update.lng);
        }
    });

    lastLoadPos = { lat: pos.lat, lng: pos.lng };

    // ── Load Environment + Ground Texture ─────────────────────
    updateGroundTexture(pos.lat, pos.lng);
    await loadEnvironmentWithRetry(pos.lat, pos.lng);
    await fetchAndSync();

    // 5. Hide loading screen
    setTimeout(hideLoadingScreen, 500);

    // 6. Tap handler
    setupTapHandler(canvas);

    // 7. RENDER LOOP
    function animate() {
        requestAnimationFrame(animate);
        const t = clock.getElapsedTime();
        const delta = clock.getDelta();

        animateNodes(t);
        animateCharacter(delta);
        updateWorld();

        // Periodic re-fetch
        if (performance.now() - lastFetchTime > FETCH_INTERVAL) {
            fetchAndSync();
        }
    }
    animate();

    console.log('[EmotionalAR] Ready.');
}

// ── Environment Loading with Retry ────────────────────────────

async function loadEnvironmentWithRetry(lat, lng) {
    // Load buildings
    try {
        await updateBuildings(lat, lng);
        _buildingsLoaded = true;
        console.log(`[Boot] Buildings: ✓ (${getBuildingCount()} rendered)`);
    } catch (err) {
        console.error('[Boot] Buildings: ✗', err.message);
        // Retry once after 3s
        setTimeout(async () => {
            try {
                await updateBuildings(lat, lng);
                _buildingsLoaded = true;
                console.log(`[Boot] Buildings (retry): ✓ (${getBuildingCount()} rendered)`);
            } catch (retryErr) {
                console.error('[Boot] Buildings (retry): ✗', retryErr.message);
            }
        }, 3000);
    }

    // Load environment features
    try {
        const count = await updateEnvironment(lat, lng);
        _environmentLoaded = true;
        console.log(`[Boot] Environment: ✓ (${count} features)`);
    } catch (err) {
        console.error('[Boot] Environment: ✗', err.message);
        // Retry once after 5s
        setTimeout(async () => {
            try {
                const count = await updateEnvironment(lat, lng);
                _environmentLoaded = true;
                console.log(`[Boot] Environment (retry): ✓ (${count} features)`);
            } catch (retryErr) {
                console.error('[Boot] Environment (retry): ✗', retryErr.message);
            }
        }, 5000);
    }
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
