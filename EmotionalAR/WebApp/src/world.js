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
    const ambient = new THREE.AmbientLight(0xF5F5F5, 0.7);
    _scene.add(ambient);
    const dir = new THREE.DirectionalLight(0xffffff, 0.8);
    dir.position.set(50, 80, 100);
    _scene.add(dir);

    // Full-screen Mapbox GL map
    _map = new mapboxgl.Map({
      container: 'map',
      style: 'mapbox://styles/mapbox/standard',
      center: [0, 0],
      zoom: 18,
      minZoom: 18.5, // Strict limit: roughly 150m view radius
      pitch: 60,       // Tilt for 3D view
      bearing: 0,
      antialias: true,
      interactive: true,
      dragRotate: true,
      pitchWithRotate: true,
      touchZoomRotate: true,
      config: {
        basemap: {
          lightPreset: 'dawn',
          // theme: 'custom', // To use custom theme, set theme: 'custom'
          // themeData: '<base64-lut-string>', // Provide base64 LUT here
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

  // Restrict map bounds to ~150m around start (±0.0015 degrees)
  const bounds = new mapboxgl.LngLatBounds(
    [lng - 0.0015, lat - 0.0015],
    [lng + 0.0015, lat + 0.0015]
  );
  _map.setMaxBounds(bounds);
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
  const x = ((clientX - rect.left) / rect.width) * 2 - 1;
  const y = -((clientY - rect.top) / rect.height) * 2 + 1;

  // Unproject from NDC (Clip Space) back to Local Space
  // projectionMatrix includes View * Model, so inverse takes us to Local
  const inv = new THREE.Matrix4().copy(_camera.projectionMatrix).invert();

  const origin = new THREE.Vector3(x, y, -1).applyMatrix4(inv);
  const target = new THREE.Vector3(x, y, 1).applyMatrix4(inv);
  const dir = target.sub(origin).normalize();

  _raycaster.set(origin, dir);
  return _raycaster.intersectObjects(targets, true);
}

/** Get ground elevation (meters) at a specific lat/lng using Mapbox terrain data. */
export function getElevation(lat, lng) {
  if (!_map) return 0;

  // Base terrain height
  let elevation = _map.queryTerrainElevation([lng, lat]) || 0;

  // Check for buildings to place character on roof
  const point = _map.project([lng, lat]);
  // Query all layers, filter for buildings
  const features = _map.queryRenderedFeatures(point).filter(f => {
    const type = f.layer.type;
    return type === 'fill-extrusion' || type === 'model' || f.layer.id.includes('building');
  });

  if (features.length > 0) {
    // Find the max height among features
    let maxHeight = 0;
    for (const f of features) {
      // Try to get explicit height
      let h = f.properties.height || f.properties.render_height;

      // Fallback: If it's a building but no height, assume ~15m (4-5 stories)
      if (!h && (f.layer.type === 'fill-extrusion' || f.layer.type === 'model')) {
        h = 15;
      }

      if (h && h > maxHeight) maxHeight = h;
    }
    // Add height if found. Note: height is usually structural height.
    // If it's a 3D model, we might not get precise roof height, but extrusion height works.
    if (maxHeight > 0) {
      elevation += maxHeight;
    }
  }

  return elevation;
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
