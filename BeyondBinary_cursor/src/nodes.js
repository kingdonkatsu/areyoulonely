import * as THREE from 'three';
import { nodeGlowVertex, nodeGlowFragment, createNodeUniforms } from './shaders/nodeGlow.js';
import { gpsToLocal, getPosition } from './gps.js';

const nodes = new Map();
let _scene = null;
const _raycaster = new THREE.Raycaster();
const _down = new THREE.Vector3(0, -1, 0);

const EMOTION_COLORS = {
  comfort: '#FF9F66',
  hope: '#FFD93D',
  sadness: '#6B9BD1',
  stress: '#A78BFA',
  loneliness: '#9CA3AF',
};

export function initNodes(scene) {
  _scene = scene;
}

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

  for (const [id] of nodes) {
    if (!currentIds.has(id)) {
      fadeOutNode(id);
    }
  }

  return nodes.size;
}

function getEmotionColor(emotion) {
  return new THREE.Color(EMOTION_COLORS[emotion] || EMOTION_COLORS.loneliness);
}

function spawnNode(msg) {
  const pos = getPosition();
  const local = gpsToLocal(msg.latitude, msg.longitude, pos.lat, pos.lng);

  const group = new THREE.Group();
  group.position.set(local.x, 50, local.z);

  const groundY = findGroundHeight(local.x, local.z) || 0;
  group.position.y = groundY + 1.5;
  group.name = `node_${msg.id}`;

  const color = msg.colorHex ? new THREE.Color(msg.colorHex) : getEmotionColor(msg.emotion);
  const intensity = msg.intensity ?? 0.5;

  const geo = new THREE.OctahedronGeometry(0.3, 0);
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
  const size = THREE.MathUtils.lerp(0.3, 0.45, intensity);
  mesh.scale.set(size, size * 1.4, size);
  group.add(mesh);

  const light = new THREE.PointLight(color, intensity, 4);
  light.position.set(0, 0, 0);
  group.add(light);

  const discs = [];
  const visibleResponses = Math.min(msg.responseCount || 0, 5);
  for (let i = 0; i < visibleResponses; i++) {
    const shard = createResponseShard(color, i);
    group.add(shard);
    discs.push(shard);
  }

  const dots = [];

  _scene.add(group);

  group.scale.set(0, 0, 0);
  const entry = {
    mesh,
    group,
    data: msg,
    uniforms,
    discs,
    dots,
    color,
    spawnTime: performance.now(),
    baseY: group.position.y,
  };
  nodes.set(msg.id, entry);
}

function findGroundHeight(x, z) {
  if (!_scene) return 0;

  _raycaster.set(new THREE.Vector3(x, 1000, z), _down);
  const hits = _raycaster.intersectObjects(_scene.children, true);

  for (const hit of hits) {
    if (!hit.object.name.includes('node')) {
      return hit.point.y;
    }
  }
  return 0;
}

function createResponseShard(color, index) {
  const geo = new THREE.OctahedronGeometry(0.2, 0);
  const mat = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity: 0.4,
    blending: THREE.AdditiveBlending,
  });
  const shard = new THREE.Mesh(geo, mat);
  shard.scale.set(1, 0.2, 1);
  shard.position.y = -(index + 1) * 0.15 - 0.2;
  return shard;
}

function updateNode(msg) {
  const entry = nodes.get(msg.id);
  if (!entry) return;

  const oldResponseCount = entry.data.responseCount || 0;
  entry.data = msg;

  if (msg.responseCount > oldResponseCount) {
    const newCount = Math.min(msg.responseCount, 5);
    for (let i = entry.discs.length; i < newCount; i++) {
      const shard = createResponseShard(entry.color, i);
      entry.group.add(shard);
      entry.discs.push(shard);
    }
  }
}

export function animateNodes(time) {
  for (const [id, entry] of nodes) {
    const { mesh, group, uniforms, spawnTime, dots, baseY } = entry;
    const age = (performance.now() - spawnTime) / 1000;

    if (group.scale.x < 1) {
      const t = Math.min(age / 0.8, 1);
      const ease = 1 - Math.pow(1 - t, 3);
      group.scale.setScalar(ease);
    }

    const breathe = 1 + Math.sin(time * 1.5 + id.charCodeAt(0)) * 0.05;
    mesh.scale.setScalar(breathe);

    group.position.y = baseY + Math.sin(time * 0.5 + id.charCodeAt(0)) * 0.2;

    group.rotation.y += 0.003;

    uniforms.uTime.value = time;

    dots.forEach((dot, i) => {
      const angle = time * (0.3 + i * 0.1) + i * (Math.PI * 2 / dots.length);
      dot.position.set(
        Math.cos(angle) * 0.7,
        dot.userData.yOff || 0,
        Math.sin(angle) * 0.7,
      );
      const breatheDot = 1 + Math.sin(time * 2 + i) * 0.1;
      dot.scale.setScalar(0.04 * breatheDot);
    });
  }
}

export function setPresenceDots(messageId, count) {
  const entry = nodes.get(messageId);
  if (!entry) return;

  const target = Math.min(count, 10);

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

  while (entry.dots.length > target) {
    const dot = entry.dots.pop();
    entry.group.remove(dot);
    dot.geometry.dispose();
    dot.material.dispose();
  }
}

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
      group.traverse((child) => {
        if (child.geometry) child.geometry.dispose();
        if (child.material) child.material.dispose();
      });
      nodes.delete(id);
    }
  }
  tick();
}

export function getNodeMeshes() {
  return Array.from(nodes.values()).map((n) => n.group);
}

export function getNodeByMesh(mesh) {
  for (const [, entry] of nodes) {
    if (entry.group === mesh || entry.mesh === mesh) return entry;
    let found = false;
    entry.group.traverse((child) => {
      if (child === mesh) found = true;
    });
    if (found) return entry;
  }
  return null;
}

export function getNodeCount() {
  return nodes.size;
}

