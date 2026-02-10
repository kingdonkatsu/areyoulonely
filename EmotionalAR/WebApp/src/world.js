// ═══════════════════════════════════════════════════════════════
// Three.js 3D World — Google Maps 3D Tiles + Warm Lighting
// ═══════════════════════════════════════════════════════════════

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GoogleTilesRenderer } from '3d-tiles-renderer';

let scene, camera, renderer, composer, controls;
let clock;
let tilesRenderer = null;
let _canvas;

// Default API Key — REPLACE WITH YOUR OWN or enter via UI
let GOOGLE_MAPS_API_KEY = '';

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
      uTopColor: { value: new THREE.Color('#6B4C7D') }, // Deep purple/blue zenith
      uHorizonColor: { value: new THREE.Color('#FFAB76') }, // Warm peach/orange horizon
      uBottomColor: { value: new THREE.Color('#FFD580') }, // Golden ground haze
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

  // Warm Fog for depth masking
  scene.fog = new THREE.FogExp2(0xFFAB76, 0.002);

  // ── Camera ────────────────────────────────────────────────
  camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 4000);
  camera.position.set(0, 100, 200);
  camera.lookAt(0, 0, 0);

  // ── Renderer ──────────────────────────────────────────────
  renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: false,
    powerPreference: 'high-performance',
    logarithmicDepthBuffer: true, // Crucial for large scale scenes
  });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

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

  // ── Controls ──────────────────────────────────────────────
  controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.minDistance = 10;
  controls.maxDistance = 800;
  controls.maxPolarAngle = Math.PI / 2.1;
  controls.enablePan = true;
  controls.screenSpacePanning = false;

  // ── Lighting (Golden Hour) ────────────────────────────────
  const ambient = new THREE.AmbientLight(0xFFD580, 0.4); // Warm ambient
  scene.add(ambient);

  const sunLight = new THREE.DirectionalLight(0xFFAB76, 1.5); // Sunset sun
  sunLight.position.set(-500, 300, -500);
  scene.add(sunLight);

  // Fill light from opposite side (cool blue shadows)
  const fillLight = new THREE.DirectionalLight(0x6B4C7D, 0.5);
  fillLight.position.set(500, 200, 500);
  scene.add(fillLight);

  // ── Particles ─────────────────────────────────────────────
  createParticles();

  // ── Resize ────────────────────────────────────────────────
  window.addEventListener('resize', onResize);

  return { scene, camera, renderer, clock };
}

// ── Google 3D Tiles ────────────────────────────────────────────

export function init3DTiles(apiKey, lat, lng) {
  if (!apiKey) {
    console.warn('[3D Tiles] No API Key provided. Geometry will not load.');
    return;
  }

  if (tilesRenderer) {
    // Dispose old renderer if re-init
    // (Actual disposal implementation omitted for brevity, usually not needed in this flow)
  }

  GOOGLE_MAPS_API_KEY = apiKey;

  // Setup renderer
  tilesRenderer = new GoogleTilesRenderer(renderer, GOOGLE_MAPS_API_KEY);
  tilesRenderer.setLatLonToYUp(lat * Math.PI / 180, lng * Math.PI / 180);

  // Attribution is required by Google
  tilesRenderer.setResolutionFromRenderer(camera, renderer);

  // Custom adjustments for look & feel
  // Increase tile cache for smoother loading
  tilesRenderer.lruCache.minSize = 1000;
  tilesRenderer.lruCache.maxSize = 2500;
  tilesRenderer.errorTarget = 12; // Lower = higher quality

  scene.add(tilesRenderer.group);
}

export function update3DTilesTarget(lat, lng) {
  if (!tilesRenderer) return;
  // Re-center world if user moves significantly?
  // For simplicity in this demo, we keep the world centered on start position
  // and move the camera/user. But if we wanted to re-center the origin:
  // tilesRenderer.setLatLonToYUp(lat * Math.PI / 180, lng * Math.PI / 180);
}

// ── Particles (Dust motes) ─────────────────────────────────────

function createParticles() {
  const count = 500;
  const geo = new THREE.BufferGeometry();
  const positions = new Float32Array(count * 3);
  const sizes = new Float32Array(count);

  for (let i = 0; i < count; i++) {
    positions[i * 3] = (Math.random() - 0.5) * 400;
    positions[i * 3 + 1] = Math.random() * 100;
    positions[i * 3 + 2] = (Math.random() - 0.5) * 400;
    sizes[i] = Math.random() * 2 + 0.5;
  }

  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));

  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uColor: { value: new THREE.Color('#FFD580') }, // Golden dust
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

  // Update particles
  scene.children.forEach(child => {
    if (child.isPoints && child.material.uniforms?.uTime) {
      child.material.uniforms.uTime.value = t;
    }
  });

  if (tilesRenderer) {
    tilesRenderer.update();
  }

  controls.update();
  composer.render();
}

export function getScene() { return scene; }
export function getCamera() { return camera; }
export function getRenderer() { return renderer; }
export function getClock() { return clock; }
export function getTilesRenderer() { return tilesRenderer; }

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
