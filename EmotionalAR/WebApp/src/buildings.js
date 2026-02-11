// ═══════════════════════════════════════════════════════════════
// Buildings — MapTiler vector tile → 3D extruded footprints
// ═══════════════════════════════════════════════════════════════

import * as THREE from 'three';
import Pbf from 'pbf';
import { VectorTile } from '@mapbox/vector-tile';
import { TILE_ZOOM, latLonToTile, fetchMapTilerTile } from './config.js';

let _scene = null;
let _buildingsGroup = null;

// ── Warm AC building colors ──────────────────────────────────
const BUILDING_COLORS = [
    0xF5E6D3, // Warm cream
    0xE8D5C4, // Sandy beige
    0xF0DFC8, // Soft peach
    0xD4C4B0, // Warm taupe
    0xE6D8CC, // Light mocha
    0xF2E0D0, // Pale apricot
    0xDCD0C0, // Oatmeal
];

/** Initialize the buildings system. */
export function initBuildings(scene) {
    _scene = scene;
    _buildingsGroup = new THREE.Group();
    _buildingsGroup.name = 'buildings';
    _scene.add(_buildingsGroup);
}

const RENDER_RADIUS = 200; // metres

/** Fetch building data from MapTiler and extrude. Returns building count. */
export async function updateBuildings(lat, lng) {
    console.log(`[Buildings] Fetching from MapTiler near ${lat.toFixed(5)}, ${lng.toFixed(5)}...`);

    const centerTile = latLonToTile(lat, lng, TILE_ZOOM);

    clearBuildings();

    const buffer = await fetchMapTilerTile('v3', TILE_ZOOM, centerTile.x, centerTile.y);
    if (!buffer) {
        console.log('[Buildings] No tile data.');
        return 0;
    }

    const tile = new VectorTile(new Pbf(buffer));
    const buildingLayer = tile.layers['building'];
    if (!buildingLayer) {
        console.log('[Buildings] No building layer in tile.');
        return 0;
    }

    let totalBuildings = 0;
    for (let i = 0; i < buildingLayer.length; i++) {
        const feature = buildingLayer.feature(i);
        const geojson = feature.toGeoJSON(centerTile.x, centerTile.y, TILE_ZOOM);

        if (geojson.geometry.type === 'Polygon' || geojson.geometry.type === 'MultiPolygon') {
            const built = extrudeBuilding(geojson, lat, lng);
            if (built) totalBuildings++;
        }
    }

    console.log(`[Buildings] Rendered ${totalBuildings} buildings within ${RENDER_RADIUS}m.`);
    return totalBuildings;
}

/** Get count of rendered buildings. */
export function getBuildingCount() {
    return _buildingsGroup ? _buildingsGroup.children.length : 0;
}

// ═══════════════════════════════════════════════════════════════
// INTERNALS
// ═══════════════════════════════════════════════════════════════

function clearBuildings() {
    if (!_buildingsGroup) return;
    while (_buildingsGroup.children.length > 0) {
        const child = _buildingsGroup.children[0];
        _buildingsGroup.remove(child);
        child.traverse(c => {
            if (c.geometry) c.geometry.dispose();
            if (c.material) {
                if (Array.isArray(c.material)) c.material.forEach(m => m.dispose());
                else c.material.dispose();
            }
        });
    }
}

function extrudeBuilding(geojson, refLat, refLng) {
    try {
        const coords = geojson.geometry.type === 'MultiPolygon'
            ? geojson.geometry.coordinates[0][0]
            : geojson.geometry.coordinates[0];

        if (!coords || coords.length < 3) return false;

        // Convert GeoJSON [lon, lat] to local meters
        const points = coords.map(([lon, lat]) => latLonToMeters(lat, lon, refLat, refLng));

        // Skip if centroid is beyond render radius
        const cx = points.reduce((s, p) => s + p.x, 0) / points.length;
        const cz = points.reduce((s, p) => s + p.z, 0) / points.length;
        if (Math.sqrt(cx * cx + cz * cz) > RENDER_RADIUS) return false;

        // Create shape
        const shape = new THREE.Shape();
        shape.moveTo(points[0].x, points[0].z);
        for (let i = 1; i < points.length; i++) {
            shape.lineTo(points[i].x, points[i].z);
        }

        // Height from properties, or generate procedurally
        const props = geojson.properties || {};
        let height = props.render_height || props.height;
        if (!height || height <= 0) {
            // Procedural height: 3–12m (AC style low buildings)
            height = 3 + Math.random() * 9;
        }

        const extrudeSettings = { depth: height, bevelEnabled: false };
        const geometry = new THREE.ExtrudeGeometry(shape, extrudeSettings);
        geometry.rotateX(-Math.PI / 2);

        const color = BUILDING_COLORS[Math.floor(Math.random() * BUILDING_COLORS.length)];
        const material = new THREE.MeshStandardMaterial({
            color,
            roughness: 0.85,
            metalness: 0.05
        });

        const mesh = new THREE.Mesh(geometry, material);
        mesh.castShadow = true;
        mesh.receiveShadow = true;

        _buildingsGroup.add(mesh);

        // Pop-in animation
        mesh.scale.set(1, 0, 1);
        animatePopIn(mesh);

        return true;
    } catch (err) {
        // Silently skip malformed buildings
        return false;
    }
}

function latLonToMeters(lat, lon, refLat, refLng) {
    const x = (lon - refLng) * 111320 * Math.cos(refLat * Math.PI / 180);
    const z = (lat - refLat) * 110574;
    return { x, z };
}

function animatePopIn(mesh) {
    const startTime = performance.now();
    const duration = 600;

    function tick() {
        const t = Math.min((performance.now() - startTime) / duration, 1);
        const s = elasticOut(t);
        mesh.scale.y = s;
        if (t < 1) requestAnimationFrame(tick);
    }
    tick();
}

function elasticOut(t) {
    return Math.sin(-13.0 * (t + 1.0) * Math.PI / 2) * Math.pow(2.0, -10.0 * t) + 1.0;
}
