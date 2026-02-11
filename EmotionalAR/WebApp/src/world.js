// ═══════════════════════════════════════════════════════════════
// World — Mapbox GL JS primary renderer + Three.js custom layer
// ═══════════════════════════════════════════════════════════════

import * as THREE from 'three';
import mapboxgl from 'mapbox-gl';
import { MAPBOX_ACCESS_TOKEN } from './config.js';

let _map = null;
let _scene = null;
let _camera = null;
let _renderer = null;
let _clock = null;
let _originMercator = null;
const _raycaster = new THREE.Raycaster();

// ── Public API ────────────────────────────────────────────────

/**
 * Initialize the Mapbox GL map with Standard style and a Three.js
 * custom layer for rendering character + emotion nodes.
 * Returns { scene, clock } once the map style is loaded.
 */
export function initWorld() {
  return new Promise((resolve) => {
    mapboxgl.accessToken = MAPBOX_ACCESS_TOKEN;
    _clock = new THREE.Clock();

    // Create the Three.js scene early so initNodes/initCharacter
    // can add objects to it before the map finishes loading.
    _scene = new THREE.Scene();

    // Lighting
    const ambient = new THREE.AmbientLight(0xffffff, 1.0);
    _scene.add(ambient);
    const dir = new THREE.DirectionalLight(0xffffff, 0.8);
    dir.position.set(50, 80, 100);
    _scene.add(dir);

    // Full-screen Mapbox GL map
    _map = new mapboxgl.Map({
      container: 'map',
      style: 'mapbox://styles/mapbox/standard',
      center: [103.68717, 1.35400],
      zoom: 18.44,
      pitch: 0.00,
      bearing: 0.00,
      antialias: true,
      config: {
        basemap: {
          showPointOfInterestLabels: false,
          showPlaceLabels: false,
          showRoadLabels: false,
          showTransitLabels: false,
          showLandmarkIconLabels: false
        }
      }
    });

    _map.on('style.load', () => {
      _map.addLayer(createThreeJSLayer());
      console.log('[World] Mapbox GL Standard + Three.js layer ready.');
      resolve({ scene: _scene, clock: _clock });
    });

    // Safety timeout
    setTimeout(() => {
      if (!_renderer) {
        console.warn('[World] Mapbox load timed out. Resolving anyway.');
        resolve({ scene: _scene, clock: _clock });
      }
    }, 15000);
  });
}

/**
 * Set the GPS origin for the Three.js coordinate system.
 * All Three.js objects are positioned in meters relative to this point.
 */
export function setOrigin(lat, lng) {
  _originMercator = mapboxgl.MercatorCoordinate.fromLngLat([lng, lat], 0);
  _map.setCenter([lng, lat]);
  console.log(`[World] Origin set: ${lat.toFixed(5)}, ${lng.toFixed(5)}`);
}

/** Smoothly move the map to follow the user's GPS. */
export function smoothTo(lat, lng) {
  if (!_map) return;
  _map.easeTo({ center: [lng, lat], duration: 500 });
}

/** No-op — Mapbox handles its own render loop. */
export function updateWorld() { }

export function getScene() { return _scene; }
export function getClock() { return _clock; }
export function getMap() { return _map; }

/** Raycast from screen coordinates into the Three.js scene. */
export function raycastFromScreen(clientX, clientY, targets) {
  if (!_camera || !targets || targets.length === 0) return [];

  const canvas = _map.getCanvas();
  const rect = canvas.getBoundingClientRect();
  const mouse = new THREE.Vector2(
    ((clientX - rect.left) / rect.width) * 2 - 1,
    -((clientY - rect.top) / rect.height) * 2 + 1
  );

  _raycaster.setFromCamera(mouse, _camera);
  return _raycaster.intersectObjects(targets, true);
}

// ── Three.js Custom Layer (Mapbox CustomLayerInterface) ───────

function createThreeJSLayer() {
  return {
    id: 'threejs-overlay',
    type: 'custom',
    renderingMode: '3d',

    onAdd(map, gl) {
      _camera = new THREE.Camera();

      // Share the Mapbox WebGL context with Three.js
      _renderer = new THREE.WebGLRenderer({
        canvas: map.getCanvas(),
        context: gl,
        antialias: true,
      });
      _renderer.autoClear = false;
    },

    render(gl, matrix) {
      if (!_originMercator || !_renderer) return;

      const s = _originMercator.meterInMercatorCoordinateUnits();

      // Model transform: origin → mercator → scale to meters → rotate Y-up
      const modelTransform = new THREE.Matrix4()
        .makeTranslation(_originMercator.x, _originMercator.y, _originMercator.z)
        .scale(new THREE.Vector3(s, -s, s))
        .multiply(
          new THREE.Matrix4().makeRotationAxis(
            new THREE.Vector3(1, 0, 0),
            Math.PI / 2
          )
        );

      // Combine Mapbox projection with our model transform
      _camera.projectionMatrix = new THREE.Matrix4()
        .fromArray(matrix)
        .multiply(modelTransform);

      _renderer.resetState();
      _renderer.render(_scene, _camera);
      _map.triggerRepaint(); // Continuous repaint for animations
    }
  };
}
