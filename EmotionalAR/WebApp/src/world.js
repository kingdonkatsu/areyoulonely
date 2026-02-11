// ═══════════════════════════════════════════════════════════════
// World — Mapbox GL JS primary renderer + Three.js custom layer
// ═══════════════════════════════════════════════════════════════

import * as THREE from 'three';
import mapboxgl from 'mapbox-gl';
import { MAPBOX_ACCESS_TOKEN } from './config.js';
import mapStyle from './mapStyle.js';

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
      style: mapStyle, // Use custom JSON style
      center: [0, 0],
      zoom: 18.5,
      minZoom: 18.5, // strict outer limit (150m)
      maxZoom: 22,   // allow zooming in
      pitch: 60,
      minPitch: 0,
      maxPitch: 85,  // Maximize look-up angle (horizon)
      bearing: 0,
      antialias: true,

      // Interactions: Lock Pan, Allow Zoom/Rotate/Pitch
      interactive: true,
      dragPan: false,      // No moving
      scrollZoom: true,    // Zoom allowed
      boxZoom: true,       // Zoom allowed
      doubleClickZoom: true, // Zoom allowed
      keyboard: false,

      dragRotate: true,    // Rotate allowed
      touchZoomRotate: true, // Rotate/Zoom allowed
      pitchWithRotate: true, // Allow looking up/down
      touchPitch: true,      // Allow looking up/down
      // Config provided in mapStyle
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

/** Get ground elevation (meters) at a specific lat/lng using Mapbox terrain data. 
 *  Returns { elevation, onBuilding } for smooth character transitions. */
export function getElevation(lat, lng) {
  if (!_map) return { elevation: 0, onBuilding: false };

  // Base terrain height
  let elevation = _map.queryTerrainElevation([lng, lat]) || 0;
  let onBuilding = false;

  // Check for buildings to place character on roof
  const point = _map.project([lng, lat]);
  const features = _map.queryRenderedFeatures(point);

  let maxHeight = 0;
  for (const f of features) {
    const layerType = f.layer.type;
    const layerId = f.layer.id;

    // Detect building layers: fill-extrusion, model, or ID containing building/3d/extrusion
    const isBuilding = layerType === 'fill-extrusion' || layerType === 'model' ||
      layerId.includes('building') || layerId.includes('3d') || layerId.includes('extrusion');

    if (!isBuilding) continue;

    // Try multiple height sources (most reliable first)
    let h = 0;

    // 1. Paint property: fill-extrusion-height (most accurate for Standard style)
    if (f.layer.paint && f.layer.paint['fill-extrusion-height'] != null) {
      const paintH = f.layer.paint['fill-extrusion-height'];
      if (typeof paintH === 'number') h = paintH;
    }

    // 2. Feature properties (GeoJSON data)
    if (!h) h = f.properties.height || f.properties.render_height || f.properties.max_height || 0;

    // 3. Fallback: assume ~15m (4-5 stories) for detected extrusions with no height
    if (!h && layerType === 'fill-extrusion') h = 15;

    if (h > maxHeight) maxHeight = h;
  }

  if (maxHeight > 0) {
    elevation += maxHeight;
    onBuilding = true;
  }

  return { elevation, onBuilding };
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
