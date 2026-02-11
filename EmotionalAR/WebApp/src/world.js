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
let _isUserPanning = false;  // Track if user is manually panning
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

      // Interactions: Allow Pan, Zoom, Rotate, Pitch
      interactive: true,
      dragPan: true,         // Panning enabled
      scrollZoom: true,      // Zoom allowed
      boxZoom: true,         // Zoom allowed
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

    // Track user panning — pause auto-follow while panning
    _map.on('dragstart', () => { _isUserPanning = true; });
    _map.on('moveend', () => { /* keep panning flag until relocate */ });

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

/** Smoothly move the map to follow the user's GPS. Skipped if user is panning. */
export function smoothTo(lat, lng) {
  if (!_map || _isUserPanning) return;
  _map.easeTo({ center: [lng, lat], duration: 500 });
}

/** Fly back to the character's GPS position and resume auto-follow. */
export function flyToCharacter(lat, lng) {
  if (!_map) return;
  _isUserPanning = false;
  _map.flyTo({
    center: [lng, lat],
    duration: 1000,
    zoom: _map.getZoom(),
    bearing: 0,    // Reset to north-facing
    pitch: 60,     // Top-down angled view to see character
  });
}

/** Check if user is currently panning away from character. */
export function isUserPanning() {
  return _isUserPanning;
}

/** No-op — Mapbox handles its own render loop. */
export function updateWorld() { }

export function getScene() { return _scene; }
export function getCamera() { return _camera; }
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

/** Get ground elevation (meters) at a specific lat/lng.
 *  Uses pixel color sampling to detect buildings visually.
 *  Returns { elevation, onBuilding } for smooth character transitions. */
export function getElevation(lat, lng) {
  if (!_map) return { elevation: 0, onBuilding: false };

  // Base terrain height
  let elevation = _map.queryTerrainElevation([lng, lat]) || 0;
  let onBuilding = false;

  // Project lat/lng to screen pixel
  const point = _map.project([lng, lat]);
  const px = Math.round(point.x);
  const py = Math.round(point.y);

  // Sample the pixel color at this screen position
  const color = samplePixelColor(px, py);

  if (color && isBuildingColor(color.r, color.g, color.b)) {
    // Pixel matches building color — query for height data
    onBuilding = true;
    const buildingHeight = getBuildingHeightAtPoint(point);
    elevation += buildingHeight;
  }

  return { elevation, onBuilding };
}

/** Get elevation at a screen point (for proactive ahead-detection).
 *  @param {number} screenX - screen X coordinate
 *  @param {number} screenY - screen Y coordinate
 *  @returns {{ elevation: number, onBuilding: boolean }} */
export function getElevationAtScreenPoint(screenX, screenY) {
  if (!_map) return { elevation: 0, onBuilding: false };

  const color = samplePixelColor(Math.round(screenX), Math.round(screenY));
  if (!color) return { elevation: 0, onBuilding: false };

  // Unproject screen point back to lat/lng for terrain height
  const lngLat = _map.unproject([screenX, screenY]);
  let elevation = _map.queryTerrainElevation([lngLat.lng, lngLat.lat]) || 0;
  let onBuilding = false;

  if (isBuildingColor(color.r, color.g, color.b)) {
    onBuilding = true;
    const point = { x: screenX, y: screenY };
    const buildingHeight = getBuildingHeightAtPoint(point);
    elevation += buildingHeight;
  }

  return { elevation, onBuilding };
}

// ── Pixel Color Sampling Helpers ──────────────────────────────

const BUILDING_COLOR = { r: 245, g: 240, b: 229 }; // #f5f0e5
const COLOR_TOLERANCE = 20; // Allow ±20 per channel for lighting/shading

/** Sample the pixel color at a screen position from the Mapbox WebGL canvas. */
function samplePixelColor(screenX, screenY) {
  if (!_map) return null;
  const canvas = _map.getCanvas();
  if (!canvas) return null;

  const gl = canvas.getContext('webgl') || canvas.getContext('webgl2');
  if (!gl) return null;

  // WebGL has Y=0 at bottom, screen has Y=0 at top
  const glY = canvas.height - screenY * (canvas.height / canvas.clientHeight);
  const glX = screenX * (canvas.width / canvas.clientWidth);

  // Clamp to canvas bounds
  if (glX < 0 || glX >= canvas.width || glY < 0 || glY >= canvas.height) return null;

  const pixel = new Uint8Array(4);
  gl.readPixels(Math.round(glX), Math.round(glY), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);

  return { r: pixel[0], g: pixel[1], b: pixel[2], a: pixel[3] };
}

/** Check if a color matches the Mapbox building color (#f5f0e5) within tolerance. */
function isBuildingColor(r, g, b) {
  return Math.abs(r - BUILDING_COLOR.r) <= COLOR_TOLERANCE &&
    Math.abs(g - BUILDING_COLOR.g) <= COLOR_TOLERANCE &&
    Math.abs(b - BUILDING_COLOR.b) <= COLOR_TOLERANCE;
}

/** Get building height at a screen point using queryRenderedFeatures. */
function getBuildingHeightAtPoint(point) {
  const features = _map.queryRenderedFeatures(point);
  let maxHeight = 0;

  for (const f of features) {
    const layerType = f.layer.type;
    const layerId = f.layer.id;

    const isBuilding = layerType === 'fill-extrusion' || layerType === 'model' ||
      layerId.includes('building') || layerId.includes('3d') || layerId.includes('extrusion');

    if (!isBuilding) continue;

    let h = 0;

    // 1. Paint property (most accurate)
    if (f.layer.paint && f.layer.paint['fill-extrusion-height'] != null) {
      const paintH = f.layer.paint['fill-extrusion-height'];
      if (typeof paintH === 'number') h = paintH;
    }

    // 2. Feature properties
    if (!h) h = f.properties.height || f.properties.render_height || f.properties.max_height || 0;

    // 3. Fallback
    if (!h && layerType === 'fill-extrusion') h = 15;

    if (h > maxHeight) maxHeight = h;
  }

  return maxHeight;
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
