// ═══════════════════════════════════════════════════════════════
// Environment — OSM-driven street features, vegetation, furniture
// Replaces furniture.js with expanded coverage
// ═══════════════════════════════════════════════════════════════

import * as THREE from 'three';
import { gpsToLocal, getPosition } from './gps.js';

let _scene = null;
let _envGroup = null;
const _items = new Map(); // id → { group, type }
const _raycaster = new THREE.Raycaster();
const _down = new THREE.Vector3(0, -1, 0);

// ── Warm Animal Crossing Palette ───────────────────────────────
const COLORS = {
    road: 0x8A8A7A,        // Muted grey-beige (AC path style)
    footpath: 0xDEB887,    // BurlyWood (dirt path)
    cycleway: 0xB0C4DE,    // Light steel blue
    fence: 0xA0522D,       // Sienna (wooden fence)
    wall: 0xD2B48C,        // Tan (stone wall)
    treeTrunk: 0x8B6914,   // Dark goldenrod
    treeLeaf1: 0x5DAA68,   // Sage green
    treeLeaf2: 0x7EC87E,   // Light green
    treeLeaf3: 0x42A55F,   // Deep green
    bush: 0x4A8B5C,        // Darker green
    flower1: 0xFF6B8A,     // Pink
    flower2: 0xFFD93D,     // Yellow
    flower3: 0xB19CD9,     // Lavender
    flower4: 0xFF9656,     // Orange
    grass: 0x7FC97E,       // Grass green
    bench_wood: 0x8B4513,  // Saddlebrown
    bench_metal: 0xCD7F32, // Bronze
    station_platform: 0xC0C0C0, // Silver-grey
    station_roof: 0x6B4C7D,     // Purple-mauve
    busstop_metal: 0xCD7F32,    // Bronze
    busstop_glass: 0xADD8E6,    // Light blue
    busstop_glow: 0xFFAB76,     // Warm orange sign
    bin_body: 0xCD7F32,    // Bronze
    bin_lid: 0xFFAB76,     // Warm orange
};

const OVERPASS_MIRRORS = [
    'https://overpass-api.de/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter',
    'https://overpass.osm.ch/api/interpreter'
];
let currentMirrorIndex = 0;

/** Initialize the environment manager. */
export function initEnvironment(scene) {
    _scene = scene;
    _envGroup = new THREE.Group();
    _envGroup.name = 'environment';
    _scene.add(_envGroup);
}

/** Fetch all environment data from OSM and render it. */
export async function updateEnvironment(lat, lng, radius = 300) {
    console.log(`[Environment] Fetching OSM features near ${lat.toFixed(5)}, ${lng.toFixed(5)}...`);

    // Single comprehensive query for all environment types
    const query = `[out:json][timeout:30];(
        way["highway"](around:${radius},${lat},${lng});
        node["highway"="bus_stop"](around:${radius},${lat},${lng});
        node["railway"="station"](around:${radius},${lat},${lng});
        way["railway"="platform"](around:${radius},${lat},${lng});
        node["amenity"="bench"](around:${radius},${lat},${lng});
        node["amenity"="waste_basket"](around:${radius},${lat},${lng});
        way["barrier"](around:${radius},${lat},${lng});
        node["natural"="tree"](around:${radius},${lat},${lng});
        way["natural"="tree_row"](around:${radius},${lat},${lng});
        way["landuse"="grass"](around:${radius},${lat},${lng});
        way["leisure"="garden"](around:${radius},${lat},${lng});
        way["leisure"="park"](around:${radius},${lat},${lng});
    );(._;>;);out body;`;

    const data = await fetchWithMirrors(query);
    if (!data || !data.elements) {
        console.warn('[Environment] No data received.');
        return 0;
    }

    clearEnvironment();
    const count = processEnvironmentData(data, lat, lng);
    console.log(`[Environment] Rendered ${count} features.`);
    return count;
}

/** Get count of rendered environment items. */
export function getEnvironmentCount() {
    return _items.size;
}

// ═══════════════════════════════════════════════════════════════
// DATA FETCHING
// ═══════════════════════════════════════════════════════════════

async function fetchWithMirrors(query, attempt = 0, maxAttempts = 5) {
    if (attempt >= maxAttempts) {
        console.error(`[Environment] All ${maxAttempts} fetch attempts exhausted.`);
        return null;
    }

    const mirror = OVERPASS_MIRRORS[currentMirrorIndex];
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    try {
        const res = await fetch(`${mirror}?data=${encodeURIComponent(query)}`, {
            signal: controller.signal
        });
        clearTimeout(timeoutId);

        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        const text = await res.text();
        if (text.trim().startsWith('<')) {
            throw new Error('Received HTML instead of JSON (Server Busy)');
        }

        return JSON.parse(text);
    } catch (err) {
        clearTimeout(timeoutId);
        currentMirrorIndex = (currentMirrorIndex + 1) % OVERPASS_MIRRORS.length;

        const isNewCycle = (attempt + 1) % OVERPASS_MIRRORS.length === 0;
        const delay = isNewCycle ? 10000 : 1500;

        console.warn(`[Environment] Mirror fail: ${err.message}. Retrying mirror ${currentMirrorIndex} in ${delay / 1000}s... (attempt ${attempt + 1}/${maxAttempts})`);

        await new Promise(r => setTimeout(r, delay));
        return fetchWithMirrors(query, attempt + 1, maxAttempts);
    }
}

function clearEnvironment() {
    for (const [id, item] of _items) {
        _envGroup.remove(item.group);
        item.group.traverse(child => {
            if (child.geometry) child.geometry.dispose();
            if (child.material) {
                if (Array.isArray(child.material)) child.material.forEach(m => m.dispose());
                else child.material.dispose();
            }
        });
    }
    _items.clear();
}

// ═══════════════════════════════════════════════════════════════
// DATA PROCESSING
// ═══════════════════════════════════════════════════════════════

function processEnvironmentData(data, refLat, refLng) {
    const nodeMap = {};
    let count = 0;

    // First pass: index all nodes (for way geometry resolution)
    data.elements.forEach(el => {
        if (el.type === 'node') nodeMap[el.id] = el;
    });

    // Second pass: process features
    data.elements.forEach(el => {
        if (el.type === 'node' && el.tags) {
            const local = latLonToMeters(el.lat, el.lon, refLat, refLng);

            if (el.tags.highway === 'bus_stop') {
                spawnBusStop(el.id, local);
                count++;
            } else if (el.tags.amenity === 'bench') {
                spawnBench(el.id, local);
                count++;
            } else if (el.tags.amenity === 'waste_basket') {
                spawnBin(el.id, local);
                count++;
            } else if (el.tags.natural === 'tree') {
                spawnTree(el.id, local);
                count++;
            } else if (el.tags.railway === 'station') {
                spawnStation(el.id, local);
                count++;
            }
        }

        if (el.type === 'way' && el.tags && el.nodes) {
            const points = resolveWayPoints(el.nodes, nodeMap, refLat, refLng);
            if (points.length < 2) return;

            if (el.tags.highway) {
                spawnRoad(el.id, points, el.tags);
                count++;
            } else if (el.tags.barrier) {
                spawnFence(el.id, points, el.tags);
                count++;
            } else if (el.tags.natural === 'tree_row') {
                spawnTreeRow(el.id, points);
                count++;
            } else if (el.tags.landuse === 'grass' || el.tags.leisure === 'garden' || el.tags.leisure === 'park') {
                spawnGrassPatch(el.id, points);
                count++;
            } else if (el.tags.railway === 'platform') {
                spawnPlatform(el.id, points);
                count++;
            }
        }
    });

    return count;
}

function resolveWayPoints(nodeIds, nodeMap, refLat, refLng) {
    return nodeIds
        .map(id => {
            const node = nodeMap[id];
            if (!node) return null;
            return latLonToMeters(node.lat, node.lon, refLat, refLng);
        })
        .filter(p => p !== null);
}

function latLonToMeters(lat, lon, refLat, refLng) {
    const latRad = refLat * Math.PI / 180;
    const METERS_PER_DEGREE_LAT = 111320;
    const METERS_PER_DEGREE_LON = 40075000 * Math.cos(latRad) / 360;
    return {
        x: (lon - refLng) * METERS_PER_DEGREE_LON,
        z: -(lat - refLat) * METERS_PER_DEGREE_LAT
    };
}

function findGroundHeight(x, z) {
    if (!_scene) return 0;
    _raycaster.set(new THREE.Vector3(x, 1000, z), _down);
    const hits = _raycaster.intersectObjects(_scene.children, true);
    for (const hit of hits) {
        if (hit.object.name !== 'environment' &&
            !hit.object.parent?.name?.includes('env_') &&
            !hit.object.name.includes('node')) {
            return hit.point.y;
        }
    }
    return 0;
}

function addItem(id, group, type) {
    _envGroup.add(group);
    _items.set(id, { group, type });

    // Pop-in bounce animation
    group.scale.set(0, 0, 0);
    bounceIn(group);
}

// ═══════════════════════════════════════════════════════════════
// FEATURE BUILDERS
// ═══════════════════════════════════════════════════════════════

// ── Roads & Paths ─────────────────────────────────────────────

function spawnRoad(id, points, tags) {
    const group = new THREE.Group();
    group.name = `env_road_${id}`;

    const highwayType = tags.highway;
    let width, color, yOffset;

    switch (highwayType) {
        case 'motorway':
        case 'trunk':
        case 'primary':
            width = 7; color = COLORS.road; yOffset = 0.05; break;
        case 'secondary':
        case 'tertiary':
            width = 5; color = COLORS.road; yOffset = 0.04; break;
        case 'residential':
        case 'unclassified':
        case 'service':
            width = 3.5; color = COLORS.road; yOffset = 0.03; break;
        case 'footway':
        case 'path':
        case 'pedestrian':
            width = 1.5; color = COLORS.footpath; yOffset = 0.02; break;
        case 'cycleway':
            width = 2; color = COLORS.cycleway; yOffset = 0.025; break;
        case 'steps':
            width = 2; color = COLORS.footpath; yOffset = 0.03; break;
        default:
            width = 3; color = COLORS.road; yOffset = 0.03;
    }

    // Build road as a flat ribbon
    const roadShape = buildRibbonGeometry(points, width);
    if (roadShape) {
        const mat = new THREE.MeshStandardMaterial({
            color,
            roughness: 0.95,
            metalness: 0,
            side: THREE.DoubleSide
        });
        const mesh = new THREE.Mesh(roadShape, mat);
        mesh.rotation.x = -Math.PI / 2;
        mesh.position.y = yOffset;
        mesh.receiveShadow = true;
        group.add(mesh);
    }

    addItem(id, group, 'road');
}

function buildRibbonGeometry(points, width) {
    if (points.length < 2) return null;

    const halfW = width / 2;
    const vertices = [];
    const indices = [];

    for (let i = 0; i < points.length; i++) {
        let dx, dz;

        if (i === 0) {
            dx = points[1].x - points[0].x;
            dz = points[1].z - points[0].z;
        } else if (i === points.length - 1) {
            dx = points[i].x - points[i - 1].x;
            dz = points[i].z - points[i - 1].z;
        } else {
            dx = points[i + 1].x - points[i - 1].x;
            dz = points[i + 1].z - points[i - 1].z;
        }

        const len = Math.sqrt(dx * dx + dz * dz) || 1;
        // Perpendicular
        const nx = -dz / len;
        const nz = dx / len;

        // Two vertices per point: left and right of centerline
        vertices.push(
            points[i].x + nx * halfW, points[i].z + nz * halfW, 0,
            points[i].x - nx * halfW, points[i].z - nz * halfW, 0
        );
    }

    for (let i = 0; i < points.length - 1; i++) {
        const a = i * 2;
        const b = i * 2 + 1;
        const c = (i + 1) * 2;
        const d = (i + 1) * 2 + 1;
        indices.push(a, c, b, b, c, d);
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    return geo;
}

// ── Fences & Walls ────────────────────────────────────────────

function spawnFence(id, points, tags) {
    const group = new THREE.Group();
    group.name = `env_fence_${id}`;

    const isWall = tags.barrier === 'wall' || tags.barrier === 'retaining_wall';
    const height = isWall ? 1.5 : 0.9;
    const color = isWall ? COLORS.wall : COLORS.fence;

    for (let i = 0; i < points.length - 1; i++) {
        const a = points[i];
        const b = points[i + 1];
        const dx = b.x - a.x;
        const dz = b.z - a.z;
        const len = Math.sqrt(dx * dx + dz * dz);
        if (len < 0.2) continue;

        const cx = (a.x + b.x) / 2;
        const cz = (a.z + b.z) / 2;
        const angle = Math.atan2(dx, dz);

        if (isWall) {
            // Solid wall block
            const wallGeo = new THREE.BoxGeometry(len, height, 0.3);
            const wallMat = new THREE.MeshStandardMaterial({ color, roughness: 0.9 });
            const wall = new THREE.Mesh(wallGeo, wallMat);
            wall.position.set(cx, height / 2, cz);
            wall.rotation.y = angle;
            wall.castShadow = true;
            wall.receiveShadow = true;
            group.add(wall);
        } else {
            // Fence posts + rail
            const postCount = Math.max(2, Math.floor(len / 2));
            const postMat = new THREE.MeshStandardMaterial({ color, roughness: 0.85 });

            for (let p = 0; p < postCount; p++) {
                const t = p / (postCount - 1);
                const px = a.x + dx * t;
                const pz = a.z + dz * t;

                const postGeo = new THREE.CylinderGeometry(0.04, 0.04, height, 6);
                const post = new THREE.Mesh(postGeo, postMat);
                post.position.set(px, height / 2, pz);
                post.castShadow = true;
                group.add(post);
            }

            // Horizontal rail
            const railGeo = new THREE.BoxGeometry(len, 0.06, 0.06);
            const rail = new THREE.Mesh(railGeo, postMat);
            rail.position.set(cx, height * 0.7, cz);
            rail.rotation.y = angle;
            group.add(rail);
        }
    }

    addItem(id, group, 'fence');
}

// ── Trees ─────────────────────────────────────────────────────

function spawnTree(id, local) {
    const group = new THREE.Group();
    group.name = `env_tree_${id}`;

    const groundY = findGroundHeight(local.x, local.z);
    group.position.set(local.x, groundY, local.z);

    const scale = 0.8 + Math.random() * 0.6;
    const trunkHeight = 1.2 * scale;
    const canopyRadius = 1.0 * scale;

    // Trunk
    const trunkGeo = new THREE.CylinderGeometry(0.12 * scale, 0.18 * scale, trunkHeight, 8);
    const trunkMat = new THREE.MeshStandardMaterial({ color: COLORS.treeTrunk, roughness: 0.9 });
    const trunk = new THREE.Mesh(trunkGeo, trunkMat);
    trunk.position.y = trunkHeight / 2;
    trunk.castShadow = true;
    group.add(trunk);

    // Canopy (layered spheres for AC style)
    const leafColors = [COLORS.treeLeaf1, COLORS.treeLeaf2, COLORS.treeLeaf3];
    const leafColor = leafColors[Math.floor(Math.random() * leafColors.length)];
    const leafMat = new THREE.MeshStandardMaterial({ color: leafColor, roughness: 0.85 });

    // Main canopy ball
    const canopyGeo = new THREE.SphereGeometry(canopyRadius, 10, 10);
    const canopy = new THREE.Mesh(canopyGeo, leafMat);
    canopy.position.y = trunkHeight + canopyRadius * 0.6;
    canopy.castShadow = true;
    group.add(canopy);

    // Side blobs for fullness
    for (let i = 0; i < 3; i++) {
        const blobAngle = (i / 3) * Math.PI * 2 + Math.random() * 0.5;
        const blobGeo = new THREE.SphereGeometry(canopyRadius * 0.55, 8, 8);
        const blob = new THREE.Mesh(blobGeo, leafMat);
        blob.position.set(
            Math.cos(blobAngle) * canopyRadius * 0.5,
            trunkHeight + canopyRadius * 0.4,
            Math.sin(blobAngle) * canopyRadius * 0.5
        );
        group.add(blob);
    }

    addItem(id, group, 'tree');
}

function spawnTreeRow(id, points) {
    const group = new THREE.Group();
    group.name = `env_treerow_${id}`;

    // Place trees along the way at intervals
    const spacing = 5; // Every 5 meters
    let dist = 0;

    for (let i = 0; i < points.length - 1; i++) {
        const a = points[i];
        const b = points[i + 1];
        const segLen = Math.sqrt((b.x - a.x) ** 2 + (b.z - a.z) ** 2);
        const dx = (b.x - a.x) / segLen;
        const dz = (b.z - a.z) / segLen;

        while (dist < segLen) {
            const px = a.x + dx * dist;
            const pz = a.z + dz * dist;
            // Create a standalone tree at this position
            const treeId = `${id}_t${_items.size}`;
            spawnTree(treeId, { x: px, z: pz });
            dist += spacing;
        }
        dist -= segLen;
    }

    // Tree row group is empty (trees added individually), but keep for tracking
    if (group.children.length > 0) addItem(id, group, 'tree_row');
}

// ── Grass & Flowers ───────────────────────────────────────────

function spawnGrassPatch(id, points) {
    if (points.length < 3) return;

    const group = new THREE.Group();
    group.name = `env_grass_${id}`;

    // Create a filled shape for the grass area
    const shape = new THREE.Shape();
    shape.moveTo(points[0].x, points[0].z);
    for (let i = 1; i < points.length; i++) {
        shape.lineTo(points[i].x, points[i].z);
    }

    const geo = new THREE.ShapeGeometry(shape);
    geo.rotateX(-Math.PI / 2);
    const mat = new THREE.MeshStandardMaterial({
        color: COLORS.grass,
        roughness: 1.0,
        metalness: 0,
        side: THREE.DoubleSide
    });
    const grassMesh = new THREE.Mesh(geo, mat);
    grassMesh.position.y = 0.02;
    grassMesh.receiveShadow = true;
    group.add(grassMesh);

    // Scatter flowers
    const bounds = getBounds(points);
    const flowerColors = [COLORS.flower1, COLORS.flower2, COLORS.flower3, COLORS.flower4];
    const flowerCount = Math.min(15, Math.floor(bounds.area / 20));

    for (let i = 0; i < flowerCount; i++) {
        const fx = bounds.minX + Math.random() * (bounds.maxX - bounds.minX);
        const fz = bounds.minZ + Math.random() * (bounds.maxZ - bounds.minZ);

        // Simple flower: small sphere cluster
        const flowerGroup = new THREE.Group();
        const petalColor = flowerColors[Math.floor(Math.random() * flowerColors.length)];
        const petalMat = new THREE.MeshStandardMaterial({ color: petalColor, roughness: 0.7 });

        // Center
        const centerGeo = new THREE.SphereGeometry(0.06, 6, 6);
        const center = new THREE.Mesh(centerGeo, new THREE.MeshStandardMaterial({ color: 0xFFE066 }));
        center.position.y = 0.2;
        flowerGroup.add(center);

        // Petals
        for (let p = 0; p < 5; p++) {
            const a = (p / 5) * Math.PI * 2;
            const petalGeo = new THREE.SphereGeometry(0.05, 6, 6);
            petalGeo.scale(1, 0.5, 1);
            const petal = new THREE.Mesh(petalGeo, petalMat);
            petal.position.set(Math.cos(a) * 0.08, 0.2, Math.sin(a) * 0.08);
            flowerGroup.add(petal);
        }

        // Stem
        const stemGeo = new THREE.CylinderGeometry(0.01, 0.01, 0.2, 4);
        const stemMat = new THREE.MeshStandardMaterial({ color: 0x3A7D44 });
        const stem = new THREE.Mesh(stemGeo, stemMat);
        stem.position.y = 0.1;
        flowerGroup.add(stem);

        flowerGroup.position.set(fx, 0.02, fz);
        flowerGroup.scale.setScalar(0.6 + Math.random() * 0.5);
        group.add(flowerGroup);
    }

    // Scatter bushes
    const bushCount = Math.min(5, Math.floor(bounds.area / 50));
    for (let i = 0; i < bushCount; i++) {
        const bx = bounds.minX + Math.random() * (bounds.maxX - bounds.minX);
        const bz = bounds.minZ + Math.random() * (bounds.maxZ - bounds.minZ);
        const bushGroup = createBush();
        bushGroup.position.set(bx, 0.02, bz);
        group.add(bushGroup);
    }

    addItem(id, group, 'grass');
}

function createBush() {
    const group = new THREE.Group();
    const bushMat = new THREE.MeshStandardMaterial({ color: COLORS.bush, roughness: 0.85 });

    // 2-3 overlapping spheres
    const count = 2 + Math.floor(Math.random() * 2);
    for (let i = 0; i < count; i++) {
        const r = 0.25 + Math.random() * 0.15;
        const geo = new THREE.SphereGeometry(r, 8, 8);
        const mesh = new THREE.Mesh(geo, bushMat);
        mesh.position.set(
            (Math.random() - 0.5) * 0.3,
            r * 0.7,
            (Math.random() - 0.5) * 0.3
        );
        mesh.castShadow = true;
        group.add(mesh);
    }
    return group;
}

function getBounds(points) {
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const p of points) {
        if (p.x < minX) minX = p.x;
        if (p.x > maxX) maxX = p.x;
        if (p.z < minZ) minZ = p.z;
        if (p.z > maxZ) maxZ = p.z;
    }
    return { minX, maxX, minZ, maxZ, area: (maxX - minX) * (maxZ - minZ) };
}

// ── Benches ───────────────────────────────────────────────────

function spawnBench(id, local) {
    const group = new THREE.Group();
    group.name = `env_bench_${id}`;

    const groundY = findGroundHeight(local.x, local.z);
    group.position.set(local.x, groundY, local.z);
    group.rotation.y = Math.random() * Math.PI * 2;

    const woodMat = new THREE.MeshStandardMaterial({ color: COLORS.bench_wood, roughness: 0.9 });
    const metalMat = new THREE.MeshStandardMaterial({ color: COLORS.bench_metal, metalness: 0.8, roughness: 0.2 });

    // Seat
    const seatGeo = new THREE.BoxGeometry(1.2, 0.1, 0.5);
    const seat = new THREE.Mesh(seatGeo, woodMat);
    seat.position.y = 0.4;
    seat.castShadow = true;
    group.add(seat);

    // Backrest
    const backGeo = new THREE.BoxGeometry(1.2, 0.4, 0.1);
    const back = new THREE.Mesh(backGeo, woodMat);
    back.position.set(0, 0.65, -0.2);
    back.rotation.x = -0.2;
    back.castShadow = true;
    group.add(back);

    // Legs
    const legGeo = new THREE.BoxGeometry(0.1, 0.4, 0.4);
    const legL = new THREE.Mesh(legGeo, metalMat);
    legL.position.set(-0.5, 0.2, 0);
    group.add(legL);

    const legR = legL.clone();
    legR.position.x = 0.5;
    group.add(legR);

    addItem(id, group, 'bench');
}

// ── Bus Stops ─────────────────────────────────────────────────

function spawnBusStop(id, local) {
    const group = new THREE.Group();
    group.name = `env_busstop_${id}`;

    const groundY = findGroundHeight(local.x, local.z);
    group.position.set(local.x, groundY, local.z);

    const metalMat = new THREE.MeshStandardMaterial({ color: COLORS.busstop_metal, metalness: 0.8 });

    // Posts
    const frameGeo = new THREE.BoxGeometry(0.1, 2.5, 0.1);
    const post1 = new THREE.Mesh(frameGeo, metalMat);
    post1.position.set(-1, 1.25, -0.5);
    post1.castShadow = true;
    group.add(post1);

    const post2 = post1.clone();
    post2.position.x = 1;
    group.add(post2);

    // Roof
    const roofGeo = new THREE.BoxGeometry(2.4, 0.1, 1.2);
    const glassMat = new THREE.MeshStandardMaterial({
        color: COLORS.busstop_glass,
        transparent: true,
        opacity: 0.5,
        roughness: 0.1
    });
    const roof = new THREE.Mesh(roofGeo, glassMat);
    roof.position.set(0, 2.5, 0);
    roof.rotation.x = 0.2;
    group.add(roof);

    // Glowing sign
    const signGeo = new THREE.CylinderGeometry(0.3, 0.3, 0.05, 16);
    const glowMat = new THREE.MeshBasicMaterial({ color: COLORS.busstop_glow });
    const sign = new THREE.Mesh(signGeo, glowMat);
    sign.position.set(post2.position.x + 0.3, 2.2, post2.position.z);
    sign.rotation.z = Math.PI / 2;
    group.add(sign);

    addItem(id, group, 'bus_stop');
}

// ── Bins ──────────────────────────────────────────────────────

function spawnBin(id, local) {
    const group = new THREE.Group();
    group.name = `env_bin_${id}`;

    const groundY = findGroundHeight(local.x, local.z);
    group.position.set(local.x, groundY, local.z);

    const bodyGeo = new THREE.CylinderGeometry(0.3, 0.25, 0.7, 12);
    const bodyMat = new THREE.MeshStandardMaterial({ color: COLORS.bin_body });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.y = 0.35;
    body.castShadow = true;
    group.add(body);

    const lidGeo = new THREE.CylinderGeometry(0.32, 0.32, 0.1, 12);
    const lidMat = new THREE.MeshStandardMaterial({ color: COLORS.bin_lid });
    const lid = new THREE.Mesh(lidGeo, lidMat);
    lid.position.y = 0.7;
    group.add(lid);

    addItem(id, group, 'bin');
}

// ── Train Stations ────────────────────────────────────────────

function spawnStation(id, local) {
    const group = new THREE.Group();
    group.name = `env_station_${id}`;

    const groundY = findGroundHeight(local.x, local.z);
    group.position.set(local.x, groundY, local.z);

    const platMat = new THREE.MeshStandardMaterial({ color: COLORS.station_platform, roughness: 0.7 });
    const roofMat = new THREE.MeshStandardMaterial({ color: COLORS.station_roof, roughness: 0.6 });

    // Platform
    const platGeo = new THREE.BoxGeometry(8, 0.5, 3);
    const plat = new THREE.Mesh(platGeo, platMat);
    plat.position.y = 0.25;
    plat.receiveShadow = true;
    group.add(plat);

    // Roof pillars
    const pillarGeo = new THREE.CylinderGeometry(0.15, 0.15, 3, 8);
    const positions = [[-3, 0, -1.2], [-3, 0, 1.2], [3, 0, -1.2], [3, 0, 1.2]];
    positions.forEach(([px, py, pz]) => {
        const pillar = new THREE.Mesh(pillarGeo, platMat);
        pillar.position.set(px, 2, pz);
        pillar.castShadow = true;
        group.add(pillar);
    });

    // Roof
    const roofGeo = new THREE.BoxGeometry(8.5, 0.15, 3.5);
    const roof = new THREE.Mesh(roofGeo, roofMat);
    roof.position.y = 3.5;
    roof.castShadow = true;
    group.add(roof);

    // Sign
    const signGeo = new THREE.BoxGeometry(2, 0.4, 0.05);
    const signMat = new THREE.MeshBasicMaterial({ color: COLORS.busstop_glow });
    const sign = new THREE.Mesh(signGeo, signMat);
    sign.position.set(0, 3.0, 1.5);
    group.add(sign);

    addItem(id, group, 'station');
}

// ── Railway Platforms ─────────────────────────────────────────

function spawnPlatform(id, points) {
    if (points.length < 3) return;

    const group = new THREE.Group();
    group.name = `env_platform_${id}`;

    const shape = new THREE.Shape();
    shape.moveTo(points[0].x, points[0].z);
    for (let i = 1; i < points.length; i++) {
        shape.lineTo(points[i].x, points[i].z);
    }

    const extSettings = { depth: 0.5, bevelEnabled: false };
    const geo = new THREE.ExtrudeGeometry(shape, extSettings);
    geo.rotateX(-Math.PI / 2);

    const mat = new THREE.MeshStandardMaterial({ color: COLORS.station_platform, roughness: 0.7 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.receiveShadow = true;
    group.add(mesh);

    addItem(id, group, 'platform');
}

// ═══════════════════════════════════════════════════════════════
// ANIMATIONS
// ═══════════════════════════════════════════════════════════════

function bounceIn(group) {
    const startTime = performance.now();
    const duration = 800;

    function tick() {
        const t = Math.min((performance.now() - startTime) / duration, 1);
        const s = elasticOut(t);
        group.scale.setScalar(s);
        if (t < 1) requestAnimationFrame(tick);
    }
    tick();
}

function elasticOut(t) {
    return Math.sin(-13.0 * (t + 1.0) * Math.PI / 2) * Math.pow(2.0, -10.0 * t) + 1.0;
}
