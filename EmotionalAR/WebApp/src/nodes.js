// ═══════════════════════════════════════════════════════════════
// Emotion Nodes — 3D glowing spheres with terrain-aware placement
// ═══════════════════════════════════════════════════════════════

import * as THREE from 'three';
import { nodeGlowVertex, nodeGlowFragment, createNodeUniforms } from './shaders/nodeGlow.js';
import { gpsToLocal, getPosition } from './gps.js';
import { getTilesRenderer } from './world.js'; // Need to raycast against tiles

const nodes = new Map();   // id → { mesh, data, discs[], dots[], group }
let _scene = null;
const _raycaster = new THREE.Raycaster();
const _down = new THREE.Vector3(0, -1, 0);

const EMOTION_COLORS = {
    comfort: '#6EE7B7',
    hope: '#FFD93D',
    sadness: '#6B9BD1',
    stress: '#A78BFA',
    loneliness: '#F9A8D4',
};

/** Initialize with scene reference. */
export function initNodes(scene) {
    _scene = scene;
}

/** Sync nodes with fetched messages. Spawns new, updates existing, removes gone. */
export function syncNodes(messages) {
    const currentIds = new Set();

    for (const msg of messages) {
        currentIds.add(msg.id);
        if (nodes.has(msg.id)) {
            updateNode(msg);
        } else {
            spawnNode(msg);
        }
    }

    // Remove nodes no longer present
    for (const [id, node] of nodes) {
        if (!currentIds.has(id)) {
            fadeOutNode(id);
        }
    }

    return nodes.size;
}

// ── Spawn ──────────────────────────────────────────────────────

function spawnNode(msg) {
    const pos = getPosition();
    const local = gpsToLocal(msg.latitude, msg.longitude, pos.lat, pos.lng);

    const group = new THREE.Group();

    // Initial height 50m to raycast down
    group.position.set(local.x, 50, local.z);

    // Find ground height if tiles exist
    const groundY = findGroundHeight(local.x, local.z) || 0;
    // Hover 1.5m above ground/building
    group.position.y = groundY + 1.5;

    group.name = `node_${msg.id}`;

    const color = new THREE.Color(msg.colorHex || EMOTION_COLORS[msg.emotion] || '#A78BFA');
    const intensity = msg.intensity || 0.5;

    // Main sphere
    const geo = new THREE.SphereGeometry(0.3, 32, 32);
    const uniforms = createNodeUniforms(color, intensity);
    const mat = new THREE.ShaderMaterial({
        vertexShader: nodeGlowVertex,
        fragmentShader: nodeGlowFragment,
        uniforms,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.FrontSide,
    });

    const mesh = new THREE.Mesh(geo, mat);

    // Size based on intensity
    const size = THREE.MathUtils.lerp(0.25, 0.45, intensity);
    const growth = Math.min(1 + (msg.responseCount || 0) * 0.08, 1.5);
    const finalSize = size * growth;
    mesh.scale.set(finalSize, finalSize * 0.9, finalSize);

    group.add(mesh);

    // Inner glow point light
    const light = new THREE.PointLight(color, intensity * 0.8, 4);
    light.position.set(0, 0, 0);
    group.add(light);

    // Response discs
    const discs = [];
    const visibleResponses = Math.min(msg.responseCount || 0, 5);
    for (let i = 0; i < visibleResponses; i++) {
        const disc = createResponseDisc(color, i);
        group.add(disc);
        discs.push(disc);
    }

    // Presence dots (will be updated later)
    const dots = [];

    _scene.add(group);

    // Spawn animation
    group.scale.set(0, 0, 0);
    const entry = {
        mesh, group, data: msg, uniforms, discs, dots, color,
        spawnTime: performance.now(),
        baseY: group.position.y // Remember base height
    };
    nodes.set(msg.id, entry);
}

function findGroundHeight(x, z) {
    const tilesComp = getTilesRenderer();
    if (!tilesComp || !tilesComp.group) return 0;

    _raycaster.set(new THREE.Vector3(x, 1000, z), _down);
    // Intersect with the tiles group
    const hits = _raycaster.intersectObject(tilesComp.group, true);
    if (hits.length > 0) {
        return hits[0].point.y;
    }
    return 0; // Default to 0 if no tile hit
}

function createResponseDisc(color, index) {
    const geo = new THREE.CylinderGeometry(0.35, 0.35, 0.03, 16);
    const mat = new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.25,
    });
    const disc = new THREE.Mesh(geo, mat);
    disc.position.y = -(index + 1) * 0.1;
    return disc;
}

// ── Update ─────────────────────────────────────────────────────

function updateNode(msg) {
    const entry = nodes.get(msg.id);
    if (!entry) return;

    const oldResponseCount = entry.data.responseCount || 0;
    entry.data = msg;

    // Add new response discs
    if (msg.responseCount > oldResponseCount) {
        const newCount = Math.min(msg.responseCount, 5);
        for (let i = entry.discs.length; i < newCount; i++) {
            const disc = createResponseDisc(entry.color, i);
            entry.group.add(disc);
            entry.discs.push(disc);
        }
    }
}

// ── Animate (called each frame) ────────────────────────────────

export function animateNodes(time) {
    // Periodically check ground height? (Expensive, maybe only on spawn or slow interval)

    for (const [id, entry] of nodes) {
        const { mesh, group, uniforms, spawnTime, dots, baseY } = entry;
        const age = (performance.now() - spawnTime) / 1000;

        // Spawn scale-in
        if (group.scale.x < 1) {
            const t = Math.min(age / 0.8, 1);
            const ease = 1 - Math.pow(1 - t, 3);
            group.scale.setScalar(ease);
        }

        // Float animation relative to baseY
        group.position.y = baseY + Math.sin(time * 0.8 + id.charCodeAt(0)) * 0.12;

        // Rotate
        group.rotation.y += 0.003;

        // Shader time
        uniforms.uTime.value = time;

        // Presence dots orbit
        dots.forEach((dot, i) => {
            const angle = time * (0.3 + i * 0.1) + i * (Math.PI * 2 / dots.length);
            dot.position.set(
                Math.cos(angle) * 0.7,
                dot.userData.yOff || 0,
                Math.sin(angle) * 0.7
            );
            const breathe = 1 + Math.sin(time * 2 + i) * 0.1;
            dot.scale.setScalar(0.04 * breathe);
        });
    }
}

// ── Presence ───────────────────────────────────────────────────

export function setPresenceDots(messageId, count) {
    const entry = nodes.get(messageId);
    if (!entry) return;

    const target = Math.min(count, 10);

    // Add dots
    while (entry.dots.length < target) {
        const geo = new THREE.SphereGeometry(0.04, 8, 8);
        const mat = new THREE.MeshBasicMaterial({
            color: 0xffffff,
            transparent: true,
            opacity: 0.7,
        });
        const dot = new THREE.Mesh(geo, mat);
        dot.userData.yOff = (Math.random() - 0.5) * 0.3;
        entry.group.add(dot);
        entry.dots.push(dot);
    }

    // Remove excess dots
    while (entry.dots.length > target) {
        const dot = entry.dots.pop();
        entry.group.remove(dot);
        dot.geometry.dispose();
        dot.material.dispose();
    }
}

// ── Fade Out ───────────────────────────────────────────────────

function fadeOutNode(id) {
    const entry = nodes.get(id);
    if (!entry) return;

    const { group } = entry;
    const start = performance.now();
    const duration = 400;

    function tick() {
        const elapsed = performance.now() - start;
        const t = Math.min(elapsed / duration, 1);
        group.scale.setScalar(1 - t);
        if (t < 1) {
            requestAnimationFrame(tick);
        } else {
            _scene.remove(group);
            // Dispose
            group.traverse(child => {
                if (child.geometry) child.geometry.dispose();
                if (child.material) child.material.dispose();
            });
            nodes.delete(id);
        }
    }
    tick();
}

// ── Getters ────────────────────────────────────────────────────

export function getNodeMeshes() {
    return Array.from(nodes.values()).map(n => n.group);
}

export function getNodeByMesh(mesh) {
    for (const [id, entry] of nodes) {
        if (entry.group === mesh || entry.mesh === mesh) return entry;
        // Check children
        let found = false;
        entry.group.traverse(child => { if (child === mesh) found = true; });
        if (found) return entry;
    }
    return null;
}

export function getNodeById(id) {
    return nodes.get(id) || null;
}

export function getNodeCount() { return nodes.size; }
