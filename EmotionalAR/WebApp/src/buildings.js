import * as THREE from 'three';

let _scene;
let _buildingsGroup;
const BUILDING_COLOR_PALETTE = [
    '#FFAB76', // Peach
    '#FFD580', // Golden
    '#6B4C7D', // Purple/Mauve
    '#A2D2FF', // Soft Blue
    '#BDE0FE', // Light Blue
    '#FFC8DD', // Pink
    '#FFAFCC'  // Deeper Pink
];

const OVERPASS_MIRRORS = [
    'https://overpass-api.de/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter',
    'https://overpass.osm.ch/api/interpreter'
];
let currentMirrorIndex = 0;

/** Initialize building group */
export function initBuildings(scene) {
    _scene = scene;
    _buildingsGroup = new THREE.Group();
    _buildingsGroup.name = 'osm_buildings';
    _scene.add(_buildingsGroup);
}

/** Fetch building footprints and extrude them */
export async function updateBuildings(lat, lng, radius = 400) {
    console.log(`[Buildings] Fetching OSM near ${lat}, ${lng}...`);

    // OPTIMIZED QUERY: Removed bare node(around) lookup. 
    // Now only queries for ways with building tag + their geometry.
    const query = `[out:json][timeout:25];way(around:${radius},${lat},${lng})["building"];(._;>;);out;`;

    const data = await fetchWithMirrors(query);
    if (data) {
        clearBuildings();
        processOSMData(data, lat, lng);
    }
}

async function fetchWithMirrors(query, attempt = 0) {
    const mirror = OVERPASS_MIRRORS[currentMirrorIndex];
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 12000);

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
        currentMirrorIndex = (currentMirrorIndex + 1) % OVERPASS_MIRRORS.length;

        // If we've circled through all mirrors once, wait longer (Backoff)
        const isNewCycle = (attempt + 1) % OVERPASS_MIRRORS.length === 0;
        const delay = isNewCycle ? 15000 : 1000;

        console.warn(`[Buildings] Mirror fail: ${err.message}. Retrying mirror ${currentMirrorIndex} in ${delay / 1000}s...`);

        await new Promise(r => setTimeout(r, delay));
        return fetchWithMirrors(query, attempt + 1);
    }
}

function clearBuildings() {
    while (_buildingsGroup.children.length > 0) {
        const child = _buildingsGroup.children[0];
        if (child.geometry) child.geometry.dispose();
        if (child.material) {
            if (Array.isArray(child.material)) child.material.forEach(m => m.dispose());
            else child.material.dispose();
        }
        _buildingsGroup.remove(child);
    }
}

function processOSMData(data, refLat, refLng) {
    const nodes = {};
    data.elements.forEach(el => {
        if (el.type === 'node') nodes[el.id] = el;
    });

    data.elements.forEach(el => {
        if (el.type === 'way' && el.tags && el.tags.building) {
            const points = el.nodes.map(nodeId => {
                const node = nodes[nodeId];
                if (!node) return null;
                return latLonToMeters(node.lat, node.lon, refLat, refLng);
            }).filter(p => p !== null);

            if (points.length > 2) {
                createBuilding(points, el.tags);
            }
        }
    });
}

function createBuilding(points, tags) {
    // Create Shape
    const shape = new THREE.Shape();
    shape.moveTo(points[0].x, points[0].z);
    for (let i = 1; i < points.length; i++) {
        shape.lineTo(points[i].x, points[i].z);
    }

    const height = parseFloat(tags.height) || (parseFloat(tags['building:levels']) * 3) || (Math.random() * 10 + 10);

    const extrudeSettings = {
        depth: height,
        bevelEnabled: true,
        bevelThickness: 0.5,
        bevelSize: 0.5,
        bevelSegments: 2
    };

    const geo = new THREE.ExtrudeGeometry(shape, extrudeSettings);
    geo.rotateX(-Math.PI / 2); // Flip to up axis

    const color = BUILDING_COLOR_PALETTE[Math.floor(Math.random() * BUILDING_COLOR_PALETTE.length)];
    const mat = new THREE.MeshStandardMaterial({
        color: color,
        roughness: 0.7,
        metalness: 0.1
    });

    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;

    // Slight random offset to height to avoid Z-fighting on roofs
    mesh.position.y = Math.random() * 0.1;

    // Pop-in animation scale
    mesh.scale.set(1, 0.01, 1);

    _buildingsGroup.add(mesh);

    // Simple pop-in animation
    new Promise(resolve => {
        let sc = 0.01;
        const anim = () => {
            sc += (1.0 - sc) * 0.1;
            mesh.scale.set(1, sc, 1);
            if (sc < 0.99) requestAnimationFrame(anim);
            else {
                mesh.scale.set(1, 1, 1);
                resolve();
            }
        };
        anim();
    });
}

/** 🌐 Lat/Lon to Local Meters (simple equirectangular) */
function latLonToMeters(lat, lon, refLat, refLng) {
    const latRad = refLat * Math.PI / 180;
    const METERS_PER_DEGREE_LAT = 111320;
    const METERS_PER_DEGREE_LON = 40075000 * Math.cos(latRad) / 360;

    return {
        x: (lon - refLng) * METERS_PER_DEGREE_LON,
        z: -(lat - refLat) * METERS_PER_DEGREE_LAT // -Z is North in Three.js
    };
}
