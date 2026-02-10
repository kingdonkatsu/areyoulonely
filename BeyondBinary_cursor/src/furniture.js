import * as THREE from 'three';
import { gpsToLocal, getPosition } from './gps.js';

let _scene = null;
const furniture = new Map();
const _raycaster = new THREE.Raycaster();
const _down = new THREE.Vector3(0, -1, 0);

const COLORS = {
  wood: 0x8B4513,
  metal: 0xCD7F32,
  plastic: 0xFFD580,
  glass: 0xADD8E6,
  glow: 0xFFAB76,
};

const OVERPASS_MIRRORS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.osm.ch/api/interpreter',
];
let currentMirrorIndex = 0;

export function initFurniture(scene) {
  _scene = scene;
}

// Match furniture query radius to the platform size so props
// populate the disc but do not extend far beyond it.
const PLATFORM_RADIUS_METERS = 150;

export async function updateFurniture(lat, lng, radius = PLATFORM_RADIUS_METERS) {
  const query =
    `[out:json][timeout:25];` +
    `(node["amenity"="bench"](around:${radius},${lat},${lng});` +
    `node["highway"="bus_stop"](around:${radius},${lat},${lng});` +
    `node["amenity"="waste_basket"](around:${radius},${lat},${lng}););out body;`;

  const data = await fetchWithMirrors(query);
  if (data && data.elements) {
    syncFurniture(data.elements);
  }
}

async function fetchWithMirrors(query, attempt = 0) {
  const mirror = OVERPASS_MIRRORS[currentMirrorIndex];
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 12000);

  try {
    const res = await fetch(`${mirror}?data=${encodeURIComponent(query)}`, {
      signal: controller.signal,
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
    const isNewCycle = (attempt + 1) % OVERPASS_MIRRORS.length === 0;
    const delay = isNewCycle ? 15000 : 1000;
    console.warn(
      `[Furniture] Mirror fail: ${err.message}. Retrying mirror ${currentMirrorIndex} in ${delay / 1000}s...`,
    );
    await new Promise((r) => setTimeout(r, delay));
    return fetchWithMirrors(query, attempt + 1);
  }
}

function syncFurniture(elements) {
  const currentIds = new Set();
  const playerPos = getPosition();

  for (const el of elements) {
    currentIds.add(el.id);
    if (!furniture.has(el.id)) {
      spawnFurniture(el, playerPos);
    }
  }

  for (const [id, item] of furniture) {
    if (!currentIds.has(id)) {
      _scene.remove(item.group);
      furniture.delete(id);
    }
  }
}

function spawnFurniture(el, playerPos) {
  const local = gpsToLocal(el.lat, el.lon, playerPos.lat, playerPos.lng);
  const group = new THREE.Group();

  group.position.set(local.x, 1000, local.z);

  const groundY = findGroundHeight(local.x, local.z);
  group.position.y = groundY;

  let model;
  if (el.tags?.amenity === 'bench') {
    model = createBenchModel();
  } else if (el.tags?.highway === 'bus_stop') {
    model = createBusStopModel();
  } else {
    model = createBinModel();
  }

  group.add(model);
  _scene.add(group);

  group.scale.set(0, 0, 0);
  bounceIn(group);

  furniture.set(el.id, {
    group,
    type: el.tags?.amenity || el.tags?.highway,
    data: el,
    local,
  });
}

function findGroundHeight(x, z) {
  if (!_scene) return 0;

  _raycaster.set(new THREE.Vector3(x, 1000, z), _down);
  const hits = _raycaster.intersectObjects(_scene.children, true);

  for (const hit of hits) {
    if (!hit.object.name.includes('node') && !hit.object.parent?.name?.includes('node')) {
      return hit.point.y;
    }
  }
  return 0;
}

function createBenchModel() {
  const group = new THREE.Group();

  const seatGeo = new THREE.BoxGeometry(1.2, 0.1, 0.5);
  const woodMat = new THREE.MeshStandardMaterial({ color: COLORS.wood, roughness: 0.9 });
  const seat = new THREE.Mesh(seatGeo, woodMat);
  seat.position.y = 0.4;
  group.add(seat);

  const backGeo = new THREE.BoxGeometry(1.2, 0.4, 0.1);
  const back = new THREE.Mesh(backGeo, woodMat);
  back.position.set(0, 0.65, -0.2);
  back.rotation.x = -0.2;
  group.add(back);

  const legGeo = new THREE.BoxGeometry(0.1, 0.4, 0.4);
  const metalMat = new THREE.MeshStandardMaterial({
    color: COLORS.metal,
    metalness: 0.8,
    roughness: 0.2,
  });
  const legL = new THREE.Mesh(legGeo, metalMat);
  legL.position.set(-0.5, 0.2, 0);
  group.add(legL);

  const legR = legL.clone();
  legR.position.x = 0.5;
  group.add(legR);

  return group;
}

function createBusStopModel() {
  const group = new THREE.Group();

  const frameGeo = new THREE.BoxGeometry(0.1, 2.5, 0.1);
  const metalMat = new THREE.MeshStandardMaterial({ color: COLORS.metal, metalness: 0.8 });

  const post1 = new THREE.Mesh(frameGeo, metalMat);
  post1.position.set(-1, 1.25, -0.5);
  group.add(post1);

  const post2 = post1.clone();
  post2.position.x = 1;
  group.add(post2);

  const roofGeo = new THREE.BoxGeometry(2.4, 0.1, 1.2);
  const glassMat = new THREE.MeshStandardMaterial({
    color: COLORS.glass,
    transparent: true,
    opacity: 0.5,
    roughness: 0.1,
  });
  const roof = new THREE.Mesh(roofGeo, glassMat);
  roof.position.set(0, 2.5, 0);
  roof.rotation.x = 0.2;
  group.add(roof);

  const bench = createBenchModel();
  bench.scale.set(1.5, 1, 1);
  bench.position.set(0, 0, -0.2);
  group.add(bench);

  const signGeo = new THREE.CylinderGeometry(0.3, 0.3, 0.05, 16);
  const glowMat = new THREE.MeshBasicMaterial({ color: COLORS.glow });
  const sign = new THREE.Mesh(signGeo, glowMat);
  sign.position.set(post2.position.x + 0.3, 2.2, post2.position.z);
  sign.rotation.z = Math.PI / 2;
  group.add(sign);

  return group;
}

function createBinModel() {
  const group = new THREE.Group();

  const bodyGeo = new THREE.CylinderGeometry(0.3, 0.25, 0.7, 12);
  const mat = new THREE.MeshStandardMaterial({ color: COLORS.metal });
  const body = new THREE.Mesh(bodyGeo, mat);
  body.position.y = 0.35;
  group.add(body);

  const lidGeo = new THREE.CylinderGeometry(0.32, 0.32, 0.1, 12);
  const lidMat = new THREE.MeshStandardMaterial({ color: COLORS.glow });
  const lid = new THREE.Mesh(lidGeo, lidMat);
  lid.position.y = 0.7;
  group.add(lid);

  return group;
}

function bounceIn(group) {
  let startTime = performance.now();
  const duration = 1000;

  function tick() {
    const now = performance.now();
    let t = (now - startTime) / duration;
    if (t > 1) t = 1;

    const s = elasticOut(t);
    group.scale.setScalar(s);

    if (t < 1) requestAnimationFrame(tick);
  }
  tick();
}

function elasticOut(t) {
  return Math.sin(-13.0 * (t + 1.0) * Math.PI / 2) * Math.pow(2.0, -10.0 * t) + 1.0;
}

