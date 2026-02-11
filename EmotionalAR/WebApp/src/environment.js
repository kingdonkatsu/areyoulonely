// ═══════════════════════════════════════════════════════════════
// Environment — MapTiler vector tile → street features, vegetation
// ═══════════════════════════════════════════════════════════════

import * as THREE from 'three';
import Pbf from 'pbf';
import { VectorTile } from '@mapbox/vector-tile';
import { TILE_ZOOM, latLonToTile, fetchMapTilerTile } from './config.js';

let _scene = null;
let _envGroup = null;
const _items = new Map(); // id → { group, type }
const _raycaster = new THREE.Raycaster();
const _down = new THREE.Vector3(0, -1, 0);

// ── Warm Animal Crossing Palette ───────────────────────────────
const COLORS = {
    road: 0x8A8A7A,
    footpath: 0xDEB887,
    cycleway: 0xB0C4DE,
    rail: 0x808080,
    fence: 0xA0522D,
    wall: 0xD2B48C,
    treeTrunk: 0x8B6914,
    treeLeaf1: 0x5DAA68,
    treeLeaf2: 0x7EC87E,
    treeLeaf3: 0x42A55F,
    bush: 0x4A8B5C,
    flower1: 0xFF6B8A,
    flower2: 0xFFD93D,
    flower3: 0xB19CD9,
    flower4: 0xFF9656,
    grass: 0x7FC97E,
    bench_wood: 0x8B4513,
    bench_metal: 0xCD7F32,
    station_platform: 0xC0C0C0,
    station_roof: 0x6B4C7D,
    busstop_metal: 0xCD7F32,
    busstop_glass: 0xADD8E6,
    busstop_glow: 0xFFAB76,
    bin_body: 0xCD7F32,
    bin_lid: 0xFFAB76,
    water: 0x7CB9E8,
};

/** Initialize the environment manager. */
export function initEnvironment(scene) {
    _scene = scene;
    _envGroup = new THREE.Group();
    _envGroup.name = 'environment';
    _scene.add(_envGroup);
}

const RENDER_RADIUS = 200; // metres

/** Fetch environment features from MapTiler and render. Returns feature count. */
export async function updateEnvironment(lat, lng) {
    console.log(`[Environment] Fetching MapTiler tile near ${lat.toFixed(5)}, ${lng.toFixed(5)}...`);

    const centerTile = latLonToTile(lat, lng, TILE_ZOOM);
    const refLat = lat;
    const refLng = lng;

    clearEnvironment();

    const buffer = await fetchMapTilerTile('v3', TILE_ZOOM, centerTile.x, centerTile.y);
    if (!buffer) {
        console.log('[Environment] No tile data.');
        return 0;
    }

    const tile = new VectorTile(new Pbf(buffer));
    const tx = centerTile.x, ty = centerTile.y;
    let totalCount = 0;

    totalCount += processTransportation(tile, tx, ty, refLat, refLng);
    totalCount += processPOI(tile, tx, ty, refLat, refLng);
    totalCount += processLanduse(tile, tx, ty, refLat, refLng);
    totalCount += processWater(tile, tx, ty, refLat, refLng);

    // Scatter decorative trees along roads (AC feel)
    scatterDecorativeTrees(refLat, refLng);

    console.log(`[Environment] Rendered ${totalCount} features within ${RENDER_RADIUS}m.`);
    return totalCount;
}

/** Get environment item count. */
export function getEnvironmentCount() {
    return _items.size;
}

// ═══════════════════════════════════════════════════════════════
// LAYER PROCESSORS
// ═══════════════════════════════════════════════════════════════

function processTransportation(tile, tx, ty, refLat, refLng) {
    const layer = tile.layers['transportation'];
    if (!layer) return 0;

    let count = 0;
    for (let i = 0; i < layer.length; i++) {
        const feature = layer.feature(i);
        const geojson = feature.toGeoJSON(tx, ty, TILE_ZOOM);
        const props = geojson.properties || {};
        const cls = props.class;

        if (geojson.geometry.type !== 'LineString' && geojson.geometry.type !== 'MultiLineString') continue;

        const coords = geojson.geometry.type === 'MultiLineString'
            ? geojson.geometry.coordinates[0]
            : geojson.geometry.coordinates;

        const points = coords.map(([lon, lat]) => latLonToMeters(lat, lon, refLat, refLng));
        if (points.length < 2) continue;

        // Skip if midpoint is beyond render radius
        const mid = points[Math.floor(points.length / 2)];
        if (Math.sqrt(mid.x * mid.x + mid.z * mid.z) > RENDER_RADIUS) continue;

        const id = `road_${tx}_${ty}_${i}`;

        if (cls === 'motorway' || cls === 'trunk' || cls === 'primary') {
            spawnRoad(id, points, 7, COLORS.road, 0.05);
        } else if (cls === 'secondary' || cls === 'tertiary') {
            spawnRoad(id, points, 5, COLORS.road, 0.04);
        } else if (cls === 'minor' || cls === 'service' || cls === 'street') {
            spawnRoad(id, points, 3.5, COLORS.road, 0.03);
        } else if (cls === 'path' || cls === 'track') {
            spawnRoad(id, points, 1.5, COLORS.footpath, 0.02);
        } else if (cls === 'rail' || cls === 'transit') {
            spawnRail(id, points);
        } else {
            // Default road
            spawnRoad(id, points, 3, COLORS.road, 0.03);
        }
        count++;
    }
    return count;
}

function processPOI(tile, tx, ty, refLat, refLng) {
    const layer = tile.layers['poi'];
    if (!layer) return 0;

    let count = 0;
    for (let i = 0; i < layer.length; i++) {
        const feature = layer.feature(i);
        const geojson = feature.toGeoJSON(tx, ty, TILE_ZOOM);
        const props = geojson.properties || {};
        const cls = props.class;
        const subclass = props.subclass;

        if (geojson.geometry.type !== 'Point') continue;

        const [lon, lat] = geojson.geometry.coordinates;
        const local = latLonToMeters(lat, lon, refLat, refLng);

        // Skip if beyond render radius
        if (Math.sqrt(local.x * local.x + local.z * local.z) > RENDER_RADIUS) continue;

        const id = `poi_${tx}_${ty}_${i}`;

        if (cls === 'bus' || subclass === 'bus_stop' || subclass === 'bus_station') {
            spawnBusStop(id, local);
            count++;
        } else if (cls === 'railway' || subclass === 'station' || subclass === 'halt') {
            spawnStation(id, local);
            count++;
        } else if (subclass === 'bench') {
            spawnBench(id, local);
            count++;
        } else if (subclass === 'waste_basket' || subclass === 'recycling') {
            spawnBin(id, local);
            count++;
        } else if (cls === 'park' || cls === 'garden' || subclass === 'playground') {
            // Spawn a tree cluster for park/garden POIs
            spawnTree(id, local);
            count++;
        }
    }
    return count;
}

function processLanduse(tile, tx, ty, refLat, refLng) {
    let count = 0;

    // Process both landuse and park layers
    for (const layerName of ['landuse', 'park', 'landcover']) {
        const layer = tile.layers[layerName];
        if (!layer) continue;

        for (let i = 0; i < layer.length; i++) {
            const feature = layer.feature(i);
            const geojson = feature.toGeoJSON(tx, ty, TILE_ZOOM);
            const props = geojson.properties || {};
            const cls = props.class;

            if (geojson.geometry.type !== 'Polygon' && geojson.geometry.type !== 'MultiPolygon') continue;

            const coords = geojson.geometry.type === 'MultiPolygon'
                ? geojson.geometry.coordinates[0][0]
                : geojson.geometry.coordinates[0];

            const points = coords.map(([lon, lat]) => latLonToMeters(lat, lon, refLat, refLng));
            if (points.length < 3) continue;

            // Skip if centroid is beyond render radius
            const cx = points.reduce((s, p) => s + p.x, 0) / points.length;
            const cz = points.reduce((s, p) => s + p.z, 0) / points.length;
            if (Math.sqrt(cx * cx + cz * cz) > RENDER_RADIUS) continue;

            const id = `land_${layerName}_${tx}_${ty}_${i}`;

            if (cls === 'grass' || cls === 'park' || cls === 'garden' ||
                cls === 'meadow' || cls === 'village_green' || cls === 'recreation_ground') {
                spawnGrassPatch(id, points);
                count++;
            } else if (cls === 'forest' || cls === 'wood') {
                spawnForestPatch(id, points);
                count++;
            }
        }
    }
    return count;
}

function processWater(tile, tx, ty, refLat, refLng) {
    const layer = tile.layers['water'];
    if (!layer) return 0;

    let count = 0;
    for (let i = 0; i < layer.length; i++) {
        const feature = layer.feature(i);
        const geojson = feature.toGeoJSON(tx, ty, TILE_ZOOM);

        if (geojson.geometry.type !== 'Polygon' && geojson.geometry.type !== 'MultiPolygon') continue;

        const coords = geojson.geometry.type === 'MultiPolygon'
            ? geojson.geometry.coordinates[0][0]
            : geojson.geometry.coordinates[0];

        const points = coords.map(([lon, lat]) => latLonToMeters(lat, lon, refLat, refLng));
        if (points.length < 3) continue;

        // Skip if centroid is beyond render radius
        const cx = points.reduce((s, p) => s + p.x, 0) / points.length;
        const cz = points.reduce((s, p) => s + p.z, 0) / points.length;
        if (Math.sqrt(cx * cx + cz * cz) > RENDER_RADIUS) continue;

        const id = `water_${tx}_${ty}_${i}`;
        spawnWater(id, points);
        count++;
    }
    return count;
}

// ═══════════════════════════════════════════════════════════════
// FEATURE BUILDERS
// ═══════════════════════════════════════════════════════════════

// ── Roads & Paths ─────────────────────────────────────────────

function spawnRoad(id, points, width, color, yOffset) {
    const group = new THREE.Group();
    group.name = `env_road_${id}`;

    const geo = buildRibbonGeometry(points, width);
    if (geo) {
        const mat = new THREE.MeshStandardMaterial({
            color,
            roughness: 0.95,
            metalness: 0,
            side: THREE.DoubleSide
        });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.rotation.x = -Math.PI / 2;
        mesh.position.y = yOffset;
        mesh.receiveShadow = true;
        group.add(mesh);
    }

    addItem(id, group, 'road');
}

function spawnRail(id, points) {
    const group = new THREE.Group();
    group.name = `env_rail_${id}`;

    // Two parallel rails
    const offset = 0.7;
    for (const side of [-1, 1]) {
        const railPoints = points.map(p => {
            const idx = points.indexOf(p);
            let nx = 0, nz = 0;
            if (idx < points.length - 1) {
                const dx = points[idx + 1].x - p.x;
                const dz = points[idx + 1].z - p.z;
                const len = Math.sqrt(dx * dx + dz * dz) || 1;
                nx = -dz / len;
                nz = dx / len;
            }
            return { x: p.x + nx * offset * side, z: p.z + nz * offset * side };
        });

        const geo = buildRibbonGeometry(railPoints, 0.15);
        if (geo) {
            const mat = new THREE.MeshStandardMaterial({ color: COLORS.rail, metalness: 0.6, roughness: 0.4 });
            const mesh = new THREE.Mesh(geo, mat);
            mesh.rotation.x = -Math.PI / 2;
            mesh.position.y = 0.06;
            group.add(mesh);
        }
    }

    // Sleepers (cross ties)
    const sleeperMat = new THREE.MeshStandardMaterial({ color: COLORS.fence, roughness: 0.9 });
    let dist = 0;
    for (let i = 0; i < points.length - 1; i++) {
        const a = points[i], b = points[i + 1];
        const segLen = Math.sqrt((b.x - a.x) ** 2 + (b.z - a.z) ** 2);
        const dx = (b.x - a.x) / segLen;
        const dz = (b.z - a.z) / segLen;
        const angle = Math.atan2(b.x - a.x, b.z - a.z);

        while (dist < segLen) {
            const sx = a.x + dx * dist;
            const sz = a.z + dz * dist;
            const sleeperGeo = new THREE.BoxGeometry(2, 0.08, 0.15);
            const sleeper = new THREE.Mesh(sleeperGeo, sleeperMat);
            sleeper.position.set(sx, 0.02, sz);
            sleeper.rotation.y = angle;
            group.add(sleeper);
            dist += 0.8;
        }
        dist -= segLen;
    }

    addItem(id, group, 'rail');
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
        const nx = -dz / len;
        const nz = dx / len;

        vertices.push(
            points[i].x + nx * halfW, points[i].z + nz * halfW, 0,
            points[i].x - nx * halfW, points[i].z - nz * halfW, 0
        );
    }

    for (let i = 0; i < points.length - 1; i++) {
        const a = i * 2, b = i * 2 + 1, c = (i + 1) * 2, d = (i + 1) * 2 + 1;
        indices.push(a, c, b, b, c, d);
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    return geo;
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

    const trunkGeo = new THREE.CylinderGeometry(0.12 * scale, 0.18 * scale, trunkHeight, 8);
    const trunkMat = new THREE.MeshStandardMaterial({ color: COLORS.treeTrunk, roughness: 0.9 });
    const trunk = new THREE.Mesh(trunkGeo, trunkMat);
    trunk.position.y = trunkHeight / 2;
    trunk.castShadow = true;
    group.add(trunk);

    const leafColors = [COLORS.treeLeaf1, COLORS.treeLeaf2, COLORS.treeLeaf3];
    const leafColor = leafColors[Math.floor(Math.random() * leafColors.length)];
    const leafMat = new THREE.MeshStandardMaterial({ color: leafColor, roughness: 0.85 });

    const canopyGeo = new THREE.SphereGeometry(canopyRadius, 10, 10);
    const canopy = new THREE.Mesh(canopyGeo, leafMat);
    canopy.position.y = trunkHeight + canopyRadius * 0.6;
    canopy.castShadow = true;
    group.add(canopy);

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

function scatterDecorativeTrees(refLat, refLng) {
    // Add trees at random offsets along roads for an AC neighbourhood feel
    const roadItems = [..._items.values()].filter(i => i.type === 'road');
    let treeCount = 0;
    const maxTrees = 40;

    for (const item of roadItems) {
        if (treeCount >= maxTrees) break;
        // 30% chance per road segment
        if (Math.random() > 0.3) continue;

        const pos = item.group.position;
        const offset = 4 + Math.random() * 3;
        const side = Math.random() > 0.5 ? 1 : -1;

        const treePos = {
            x: pos.x + (Math.random() - 0.5) * 10 + offset * side,
            z: pos.z + (Math.random() - 0.5) * 10
        };

        spawnTree(`deco_tree_${treeCount}`, treePos);
        treeCount++;
    }
}

// ── Grass & Flowers ───────────────────────────────────────────

function spawnGrassPatch(id, points) {
    if (points.length < 3) return;

    const group = new THREE.Group();
    group.name = `env_grass_${id}`;

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
    const flowerCount = Math.min(12, Math.floor(bounds.area / 25));

    for (let i = 0; i < flowerCount; i++) {
        const fx = bounds.minX + Math.random() * (bounds.maxX - bounds.minX);
        const fz = bounds.minZ + Math.random() * (bounds.maxZ - bounds.minZ);

        const flowerGroup = new THREE.Group();
        const petalColor = flowerColors[Math.floor(Math.random() * flowerColors.length)];
        const petalMat = new THREE.MeshStandardMaterial({ color: petalColor, roughness: 0.7 });

        const centerGeo = new THREE.SphereGeometry(0.06, 6, 6);
        const center = new THREE.Mesh(centerGeo, new THREE.MeshStandardMaterial({ color: 0xFFE066 }));
        center.position.y = 0.2;
        flowerGroup.add(center);

        for (let p = 0; p < 5; p++) {
            const a = (p / 5) * Math.PI * 2;
            const pGeo = new THREE.SphereGeometry(0.05, 6, 6);
            pGeo.scale(1, 0.5, 1);
            const petal = new THREE.Mesh(pGeo, petalMat);
            petal.position.set(Math.cos(a) * 0.08, 0.2, Math.sin(a) * 0.08);
            flowerGroup.add(petal);
        }

        const stemGeo = new THREE.CylinderGeometry(0.01, 0.01, 0.2, 4);
        const stemMat = new THREE.MeshStandardMaterial({ color: 0x3A7D44 });
        flowerGroup.add(new THREE.Mesh(stemGeo, stemMat));
        flowerGroup.children[flowerGroup.children.length - 1].position.y = 0.1;

        flowerGroup.position.set(fx, 0.02, fz);
        flowerGroup.scale.setScalar(0.6 + Math.random() * 0.5);
        group.add(flowerGroup);
    }

    // Scatter bushes
    const bushCount = Math.min(4, Math.floor(bounds.area / 60));
    for (let i = 0; i < bushCount; i++) {
        const bx = bounds.minX + Math.random() * (bounds.maxX - bounds.minX);
        const bz = bounds.minZ + Math.random() * (bounds.maxZ - bounds.minZ);
        const bush = createBush();
        bush.position.set(bx, 0.02, bz);
        group.add(bush);
    }

    addItem(id, group, 'grass');
}

function spawnForestPatch(id, points) {
    if (points.length < 3) return;

    const bounds = getBounds(points);
    const treeCount = Math.min(8, Math.floor(bounds.area / 30));

    for (let i = 0; i < treeCount; i++) {
        const tx = bounds.minX + Math.random() * (bounds.maxX - bounds.minX);
        const tz = bounds.minZ + Math.random() * (bounds.maxZ - bounds.minZ);
        spawnTree(`${id}_tree_${i}`, { x: tx, z: tz });
    }
}

function createBush() {
    const group = new THREE.Group();
    const bushMat = new THREE.MeshStandardMaterial({ color: COLORS.bush, roughness: 0.85 });

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

// ── Water ─────────────────────────────────────────────────────

function spawnWater(id, points) {
    if (points.length < 3) return;

    const group = new THREE.Group();
    group.name = `env_water_${id}`;

    const shape = new THREE.Shape();
    shape.moveTo(points[0].x, points[0].z);
    for (let i = 1; i < points.length; i++) {
        shape.lineTo(points[i].x, points[i].z);
    }

    const geo = new THREE.ShapeGeometry(shape);
    geo.rotateX(-Math.PI / 2);
    const mat = new THREE.MeshStandardMaterial({
        color: COLORS.water,
        roughness: 0.2,
        metalness: 0.3,
        transparent: true,
        opacity: 0.7,
        side: THREE.DoubleSide
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.y = 0.01;
    mesh.receiveShadow = true;
    group.add(mesh);

    addItem(id, group, 'water');
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

    const seatGeo = new THREE.BoxGeometry(1.2, 0.1, 0.5);
    const seat = new THREE.Mesh(seatGeo, woodMat);
    seat.position.y = 0.4;
    seat.castShadow = true;
    group.add(seat);

    const backGeo = new THREE.BoxGeometry(1.2, 0.4, 0.1);
    const back = new THREE.Mesh(backGeo, woodMat);
    back.position.set(0, 0.65, -0.2);
    back.rotation.x = -0.2;
    back.castShadow = true;
    group.add(back);

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

    const frameGeo = new THREE.BoxGeometry(0.1, 2.5, 0.1);
    const post1 = new THREE.Mesh(frameGeo, metalMat);
    post1.position.set(-1, 1.25, -0.5);
    post1.castShadow = true;
    group.add(post1);
    const post2 = post1.clone();
    post2.position.x = 1;
    group.add(post2);

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

    const signGeo = new THREE.CylinderGeometry(0.3, 0.3, 0.05, 16);
    const glowMat = new THREE.MeshBasicMaterial({ color: COLORS.busstop_glow });
    const sign = new THREE.Mesh(signGeo, glowMat);
    sign.position.set(1.3, 2.2, -0.5);
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

    const platGeo = new THREE.BoxGeometry(8, 0.5, 3);
    const plat = new THREE.Mesh(platGeo, platMat);
    plat.position.y = 0.25;
    plat.receiveShadow = true;
    group.add(plat);

    const pillarGeo = new THREE.CylinderGeometry(0.15, 0.15, 3, 8);
    [[-3, 0, -1.2], [-3, 0, 1.2], [3, 0, -1.2], [3, 0, 1.2]].forEach(([px, _, pz]) => {
        const pillar = new THREE.Mesh(pillarGeo, platMat);
        pillar.position.set(px, 2, pz);
        pillar.castShadow = true;
        group.add(pillar);
    });

    const roofGeo = new THREE.BoxGeometry(8.5, 0.15, 3.5);
    const roof = new THREE.Mesh(roofGeo, roofMat);
    roof.position.y = 3.5;
    roof.castShadow = true;
    group.add(roof);

    const signGeo = new THREE.BoxGeometry(2, 0.4, 0.05);
    const signMat = new THREE.MeshBasicMaterial({ color: COLORS.busstop_glow });
    const sign = new THREE.Mesh(signGeo, signMat);
    sign.position.set(0, 3.0, 1.5);
    group.add(sign);

    addItem(id, group, 'station');
}

// ═══════════════════════════════════════════════════════════════
// UTILITIES
// ═══════════════════════════════════════════════════════════════

function latLonToMeters(lat, lon, refLat, refLng) {
    const x = (lon - refLng) * 111320 * Math.cos(refLat * Math.PI / 180);
    const z = (lat - refLat) * 110574;
    return { x, z };
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

function getBounds(points) {
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const p of points) {
        if (p.x < minX) minX = p.x;
        if (p.x > maxX) maxX = p.x;
        if (p.z < minZ) minZ = p.z;
        if (p.z > maxZ) maxZ = p.z;
    }
    return { minX, maxX, minZ, maxZ, area: Math.abs((maxX - minX) * (maxZ - minZ)) };
}

function addItem(id, group, type) {
    _envGroup.add(group);
    _items.set(id, { group, type });

    // Pop-in animation
    group.scale.set(0, 0, 0);
    bounceIn(group);
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
