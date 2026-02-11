// ═══════════════════════════════════════════════════════════════
// Three.js 3D World — Camera, Lighting, Post-Processing
// ═══════════════════════════════════════════════════════════════

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { MAPTILER_API_KEY, TILE_ZOOM, latLonToTile } from './config.js';

let scene, camera, renderer, composer, controls;
let clock;
let _canvas;
let _groundMesh = null;
let _targetPos = new THREE.Vector3(0, 0, 0);
let _currentPos = new THREE.Vector3(0, 0, 0);

/** Initialize the 3D world. Returns { scene, camera, renderer, clock }. */
export function initWorld(canvas) {
  _canvas = canvas;
  clock = new THREE.Clock();

  // ── Scene ─────────────────────────────────────────────────
  scene = new THREE.Scene();

  // Warm Golden Hour Sky (Gradient)
  const skyGeo = new THREE.SphereGeometry(2000, 32, 32);
  const skyMat = new THREE.ShaderMaterial({
    uniforms: {
      uTopColor: { value: new THREE.Color('#6B4C7D') },
      uHorizonColor: { value: new THREE.Color('#FFAB76') },
      uBottomColor: { value: new THREE.Color('#FFD580') },
    },
    vertexShader: `
      varying vec3 vWorldPos;
      void main() {
        vWorldPos = (modelMatrix * vec4(position, 1.0)).xyz;
        gl_Position = projectionMatrix * viewMatrix * vec4(vWorldPos, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 uTopColor;
      uniform vec3 uHorizonColor;
      uniform vec3 uBottomColor;
      varying vec3 vWorldPos;
      void main() {
        float t = normalize(vWorldPos).y;
        vec3 color = mix(uBottomColor, uHorizonColor, smoothstep(-0.2, 0.1, t));
        color = mix(color, uTopColor, smoothstep(0.1, 0.8, t));
        gl_FragColor = vec4(color, 1.0);
      }
    `,
    side: THREE.BackSide,
    depthWrite: false,
  });
  scene.add(new THREE.Mesh(skyGeo, skyMat));

  // Warm Fog — slightly denser for cosier close-up feel
  scene.fog = new THREE.FogExp2(0xFFAB76, 0.004);

  // ── Camera (FOV 60, positioned behind & above character) ──
  camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 4000);
  // Start behind the character (character faces +Z), camera at +Z offset, 5m above
  camera.position.set(0, 5, 10);
  camera.lookAt(0, 0, 0);

  // ── Renderer ──────────────────────────────────────────────
  renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: false,
    powerPreference: 'high-performance',
  });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  // ── Post-processing: Bloom ────────────────────────────────
  composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));

  const bloom = new UnrealBloomPass(
    new THREE.Vector2(window.innerWidth, window.innerHeight),
    0.6,   // strength
    0.5,   // radius
    0.85   // threshold
  );
  composer.addPass(bloom);

  // ── Controls (tighter orbit for close-to-character feel) ──
  controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.minDistance = 3;
  controls.maxDistance = 80;
  controls.maxPolarAngle = Math.PI / 2.1;
  controls.enablePan = true;
  controls.screenSpacePanning = false;

  // ── Lighting (Golden Hour) ────────────────────────────────
  const ambient = new THREE.AmbientLight(0xFFD580, 0.4);
  scene.add(ambient);

  const sunLight = new THREE.DirectionalLight(0xFFAB76, 2.0);
  sunLight.position.set(-200, 300, -200);
  sunLight.castShadow = true;
  sunLight.shadow.mapSize.width = 2048;
  sunLight.shadow.mapSize.height = 2048;
  sunLight.shadow.camera.left = -500;
  sunLight.shadow.camera.right = 500;
  sunLight.shadow.camera.top = 500;
  sunLight.shadow.camera.bottom = -500;
  scene.add(sunLight);

  // Fill light from opposite side (cool blue shadows)
  const fillLight = new THREE.DirectionalLight(0x6B4C7D, 0.5);
  fillLight.position.set(500, 200, 500);
  scene.add(fillLight);

  // ── Particles ─────────────────────────────────────────────
  createParticles();

  // Stylized Ground
  initGround(scene);

  // ── Resize ────────────────────────────────────────────────
  window.addEventListener('resize', onResize);

  return { scene, camera, renderer, clock };
}

// ── Ground Plane (topo-v4 raster texture from MapTiler) ──

export function initGround(scene) {
  const groundGeo = new THREE.PlaneGeometry(1000, 1000, 1, 1);
  const groundMat = new THREE.MeshStandardMaterial({
    color: '#91C483',
    roughness: 1.0,
    metalness: 0,
    side: THREE.DoubleSide
  });
  _groundMesh = new THREE.Mesh(groundGeo, groundMat);
  _groundMesh.rotation.x = -Math.PI / 2;
  _groundMesh.receiveShadow = true;
  _groundMesh.name = 'ground';
  scene.add(_groundMesh);
}

/**
 * Load MapTiler topo-v4 raster tiles and apply as ground texture.
 * Stitches a 3×3 grid of tiles for wider coverage.
 */
export function updateGroundTexture(lat, lng) {
  const center = latLonToTile(lat, lng, TILE_ZOOM);
  const GRID = 3;
  const TILE_PX = 512;
  const totalPx = GRID * TILE_PX;

  const stitchCanvas = document.createElement('canvas');
  stitchCanvas.width = totalPx;
  stitchCanvas.height = totalPx;
  const ctx = stitchCanvas.getContext('2d');

  let loaded = 0;
  const total = GRID * GRID;

  console.log(`[Ground] Loading topo-v4 tiles for ${lat.toFixed(5)}, ${lng.toFixed(5)}...`);

  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const tx = center.x + dx;
      const ty = center.y + dy;
      const url = `https://api.maptiler.com/maps/topo-v4/${TILE_ZOOM}/${tx}/${ty}@2x.png?key=${MAPTILER_API_KEY}`;

      const img = new Image();
      img.crossOrigin = 'anonymous';

      const gx = dx + 1;
      const gy = dy + 1;

      img.onload = () => {
        ctx.drawImage(img, gx * TILE_PX, gy * TILE_PX, TILE_PX, TILE_PX);
        loaded++;
        if (loaded === total) applyGroundTexture(stitchCanvas);
      };
      img.onerror = () => {
        console.warn(`[Ground] Failed: topo-v4/${TILE_ZOOM}/${tx}/${ty}`);
        loaded++;
        if (loaded === total) applyGroundTexture(stitchCanvas);
      };
      img.src = url;
    }
  }
}

function applyGroundTexture(canvas) {
  if (!_groundMesh) return;

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.needsUpdate = true;

  if (_groundMesh.material.map) _groundMesh.material.map.dispose();
  _groundMesh.material.dispose();

  _groundMesh.material = new THREE.MeshStandardMaterial({
    map: texture,
    roughness: 0.95,
    metalness: 0,
    side: THREE.DoubleSide
  });

  console.log('[Ground] Topo-v4 texture applied.');
}

/** Glide the world/camera to a new local position smoothly. */
export function smoothTo(x, z) {
  _targetPos.set(x, 0, z);
}

export function updateWorldBounds(lat, lng) {
  // Placeholder for future use
}

// ── Particles (Dust motes) ─────────────────────────────────────

function createParticles() {
  const count = 500;
  const geo = new THREE.BufferGeometry();
  const positions = new Float32Array(count * 3);
  const sizes = new Float32Array(count);

  for (let i = 0; i < count; i++) {
    positions[i * 3] = (Math.random() - 0.5) * 300;
    positions[i * 3 + 1] = Math.random() * 60;
    positions[i * 3 + 2] = (Math.random() - 0.5) * 300;
    sizes[i] = Math.random() * 2 + 0.5;
  }

  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));

  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uColor: { value: new THREE.Color('#FFD580') },
    },
    vertexShader: `
      attribute float aSize;
      uniform float uTime;
      varying float vAlpha;
      void main() {
        vec3 pos = position;
        pos.y += sin(uTime * 0.2 + position.x * 0.1) * 2.0;
        pos.x += cos(uTime * 0.1 + position.z * 0.1) * 1.0;
        vec4 mvPos = modelViewMatrix * vec4(pos, 1.0);
        gl_PointSize = aSize * (500.0 / -mvPos.z);
        gl_Position = projectionMatrix * mvPos;
        vAlpha = 0.4 + sin(uTime + position.z) * 0.2;
      }
    `,
    fragmentShader: `
      uniform vec3 uColor;
      varying float vAlpha;
      void main() {
        float d = length(gl_PointCoord - 0.5);
        if (d > 0.5) discard;
        float alpha = smoothstep(0.5, 0.0, d) * vAlpha;
        gl_FragColor = vec4(uColor, alpha);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });

  scene.add(new THREE.Points(geo, mat));
}

// ── Update ─────────────────────────────────────────────────────

export function updateWorld() {
  const t = clock.getElapsedTime();

  // Smooth position interpolation (Pokémon Go style)
  const lerpFactor = 0.05;
  _currentPos.lerp(_targetPos, lerpFactor);

  // Follow the current position
  controls.target.copy(_currentPos);

  // Update particles
  scene.children.forEach(child => {
    if (child.isPoints && child.material.uniforms?.uTime) {
      child.material.uniforms.uTime.value = t;
    }
  });

  controls.update();
  composer.render();
}

export function getScene() { return scene; }
export function getCamera() { return camera; }
export function getRenderer() { return renderer; }
export function getClock() { return clock; }

// ── Raycasting ─────────────────────────────────────────────────

const _raycaster = new THREE.Raycaster();
const _mouse = new THREE.Vector2();

export function raycastFromScreen(x, y, objects) {
  _mouse.x = (x / window.innerWidth) * 2 - 1;
  _mouse.y = -(y / window.innerHeight) * 2 + 1;
  _raycaster.setFromCamera(_mouse, camera);
  return _raycaster.intersectObjects(objects, true);
}

// ── Resize ─────────────────────────────────────────────────────

function onResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  composer.setSize(window.innerWidth, window.innerHeight);
}
