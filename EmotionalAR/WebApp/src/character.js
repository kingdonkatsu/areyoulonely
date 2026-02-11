// ═══════════════════════════════════════════════════════════════
// Character — 3D Model Loader (GLB)
// Handles loading, animation mixing, and GPS-linked positioning
// ═══════════════════════════════════════════════════════════════

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { getElevation, getMap } from './world.js';

let _scene = null;
let _group = null;         // Root group (positions the character)
let _model = null;         // The actual loaded mesh
let _mixer = null;         // Animation mixer
let _actions = {};         // Map of animation definitions
let _activeAction = null;  // Currently playing action

let _isWalking = false;
let _facingAngle = 0;      // Radians, 0 = +Z direction
let _targetAngle = 0;

// ── State ─────────────────────────────────────────────────────
let _currentPos = { x: 0, y: 0, z: 0 };
let _targetPos = { x: 0, y: 0, z: 0 };
let _walkSpeed = 1.0;
const LERP_SPEED_XZ = 3.0;
const LERP_SPEED_Y = 2.0;

let _charLat = 0, _charLng = 0;
let _elevPollTimer = 0;
const ELEV_POLL_INTERVAL = 0.1;
const LOOK_AHEAD_METERS = 2.0;

// ── Map Marker ────────────────────────────────────────────────
let _mapMarker = null;
const MARKER_HEIGHT_OFFSET = 2.5; // Height above character
const BASE_MARKER_SCALE = 1.2; // Larger base size
const MIN_ZOOM = 18.5;
const MAX_ZOOM = 22;

// ── Initialization ────────────────────────────────────────────

export function initCharacter(scene) {
    _scene = scene;

    // ── LIGHTING (Vital for GLB models) ──
    const ambientLight = new THREE.HemisphereLight(0xffffff, 0x444444, 2.0);
    ambientLight.position.set(0, 20, 0);
    _scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 1.5);
    dirLight.position.set(3, 10, 5);
    dirLight.castShadow = true;
    _scene.add(dirLight);

    // Create a container group
    _group = new THREE.Group();
    _group.name = 'player_character';
    _scene.add(_group);

    // Simple shadow blob (always looks good under a character)
    buildShadow(_group);

    // Add map marker above character
    buildMapMarker(_group);

    // Load the GLB model
    const loader = new GLTFLoader();
    loader.load('/Character_Male_1.gltf', (gltf) => {
        _model = gltf.scene;

        // ── Adjust Model Scale/Rotation here ──
        _model.scale.set(0.8, 0.8, 0.8);
        _model.position.y = 0;

        // Enable shadows & Fix materials
        _model.traverse((child) => {
            if (child.isMesh) {
                // Ensure proper material rendering
                if (child.material) {
                    const mats = Array.isArray(child.material) ? child.material : [child.material];
                    mats.forEach(m => {
                        m.side = THREE.DoubleSide; // Safety: render backfaces
                        m.envMapIntensity = 1.0;   // Safety: ensure lighting response
                        m.needsUpdate = true;
                    });
                }

                child.castShadow = true;
                child.receiveShadow = true;
            }
        });

        _group.add(_model);
        console.log('[Character] Model loaded. Animations:', gltf.animations.map(a => a.name));

        // ── Setup Animations ──
        if (gltf.animations && gltf.animations.length > 0) {
            _mixer = new THREE.AnimationMixer(_model);

            // Log animations to help debug
            gltf.animations.forEach((clip) => {
                console.log('Detected animation:', clip.name);
                _actions[clip.name] = _mixer.clipAction(clip);
            });

            // Try to auto-detect 'Walk' and 'Idle', or default to first Clip
            // Adjust these names based on your actual GLB file!
            const idleClip = gltf.animations.find(c => /idle/i.test(c.name)) || gltf.animations[0];
            const walkClip = gltf.animations.find(c => /walk|run/i.test(c.name)) || gltf.animations[1] || idleClip;

            _actions['Idle'] = _mixer.clipAction(idleClip);
            _actions['Walk'] = _mixer.clipAction(walkClip);

            // Start playing Idle
            fadeToAction('Idle', 0.5);
        }

    }, undefined, (error) => {
        console.error('[Character] Error loading GLB:', error);
    });

    return _group;
}

function buildShadow(parent) {
    const shadowGeo = new THREE.CircleGeometry(0.45, 20);
    const shadowMat = new THREE.MeshBasicMaterial({
        color: 0x000000,
        transparent: true,
        opacity: 0.3,
        depthWrite: false,
        side: THREE.DoubleSide
    });
    const shadow = new THREE.Mesh(shadowGeo, shadowMat);
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.02;
    parent.add(shadow);
}

function buildMapMarker(parent) {
    // Create a canvas to draw a red map pin icon
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 160;
    const ctx = canvas.getContext('2d');

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const centerX = 64;
    const centerY = 45;
    const radius = 35;
    const pointY = 135;

    // Draw the map pin shape (proper teardrop path)
    ctx.fillStyle = '#EA4335'; // Google Maps red
    ctx.beginPath();

    // Start from bottom point
    ctx.moveTo(centerX, pointY);

    // Left curve from point to circle
    ctx.quadraticCurveTo(centerX - radius - 8, centerY + 30, centerX - radius, centerY);

    // Top arc (left semicircle)
    ctx.arc(centerX, centerY, radius, Math.PI, 0, false);

    // Right curve from circle to point
    ctx.quadraticCurveTo(centerX + radius + 8, centerY + 30, centerX, pointY);

    ctx.closePath();
    ctx.fill();

    // Add white border for visibility
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 5;
    ctx.stroke();

    // Cut out the inner circle (white hole)
    ctx.globalCompositeOperation = 'destination-out';
    ctx.beginPath();
    ctx.arc(centerX, centerY, 16, 0, Math.PI * 2);
    ctx.fill();

    // Add thin border to inner circle
    ctx.globalCompositeOperation = 'source-over';
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(centerX, centerY, 16, 0, Math.PI * 2);
    ctx.stroke();

    // Create sprite from canvas
    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;

    const spriteMaterial = new THREE.SpriteMaterial({
        map: texture,
        transparent: true,
        depthTest: true,
        depthWrite: false,
        sizeAttenuation: false, // Keep size constant in screen space
    });

    _mapMarker = new THREE.Sprite(spriteMaterial);
    _mapMarker.scale.set(BASE_MARKER_SCALE, BASE_MARKER_SCALE * 1.25, 1); // Slightly taller
    _mapMarker.position.y = MARKER_HEIGHT_OFFSET;
    _mapMarker.renderOrder = 999; // Render on top

    parent.add(_mapMarker);
}

// ── Animation Control ─────────────────────────────────────────

function fadeToAction(name, duration = 0.2) {
    if (!_mixer || !_actions[name]) return;

    const previousAction = _activeAction;
    const activeAction = _actions[name];

    if (previousAction !== activeAction) {
        previousAction?.fadeOut(duration);
        activeAction
            .reset()
            .setEffectiveTimeScale(1)
            .setEffectiveWeight(1)
            .fadeIn(duration)
            .play();
        _activeAction = activeAction;
    }
}

// ── Public API (Same as before) ───────────────────────────────

export function setTargetPosition(x, z, elevationData) {
    _targetPos.x = x;
    _targetPos.z = z;
    if (elevationData && typeof elevationData.elevation === 'number') {
        _targetPos.y = elevationData.elevation;
    } else if (typeof elevationData === 'number') {
        _targetPos.y = elevationData;
    }
}

export function setCharacterLatLng(lat, lng) {
    _charLat = lat;
    _charLng = lng;
}

export function updateCharacterPosition(lat, lng, x, z) {
    setTargetPosition(x, z, getElevation(lat, lng) || 0);
}

export function setCharacterDirection(angle) {
    _targetAngle = angle;
}

export function setWalking(walking) {
    if (_isWalking === walking) return;
    _isWalking = walking;

    // Switch animation state
    if (_mixer) {
        fadeToAction(walking ? 'Walk' : 'Idle', 0.2);
    }
}

export function setWalkSpeed(speed) {
    _walkSpeed = speed;
}

export function getCharacterGroup() {
    return _group;
}

export function getCharacterPosition() {
    return _group ? _group.position : { x: 0, y: 0, z: 0 };
}

// ── Render Loop ───────────────────────────────────────────────

export function animateCharacter(deltaTime) {
    if (!_group) return;

    // 1. Update Position (Lerp)
    const lerpFactorXZ = 1 - Math.exp(-LERP_SPEED_XZ * deltaTime);
    const lerpFactorY = 1 - Math.exp(-LERP_SPEED_Y * deltaTime);

    _currentPos.x += (_targetPos.x - _currentPos.x) * lerpFactorXZ;
    _currentPos.z += (_targetPos.z - _currentPos.z) * lerpFactorXZ;
    _currentPos.y += (_targetPos.y - _currentPos.y) * lerpFactorY;

    _group.position.set(_currentPos.x, _currentPos.y, _currentPos.z);

    // 2. Update Elevation Polling
    _elevPollTimer += deltaTime;
    if (_elevPollTimer >= ELEV_POLL_INTERVAL && _charLat !== 0) {
        _elevPollTimer = 0;
        const elevNow = getElevation(_charLat, _charLng);
        if (elevNow) _targetPos.y = elevNow.elevation;
    }

    // 3. Update Rotation
    if (_model) {
        let angleDiff = _targetAngle - _facingAngle;
        while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
        while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
        _facingAngle += angleDiff * 0.12;
        _model.rotation.y = _facingAngle;
    }

    // 4. Update Animation Mixer
    if (_mixer) {
        _mixer.update(deltaTime);
    }

    // 5. Update Map Marker Scale and Position based on Zoom Level
    if (_mapMarker) {
        const map = getMap();
        if (map) {
            const currentZoom = map.getZoom();
            // Inverse scaling: as zoom decreases (zoom out), marker gets bigger (gentle growth)
            // At max zoom (22): scale = 1.2x (zoomed in)
            // At min zoom (18.5): scale = 5.4x (zoomed out, 4.5x growth)
            const zoomRange = MAX_ZOOM - MIN_ZOOM;
            const zoomFactor = (MAX_ZOOM - currentZoom) / zoomRange;
            const scale = BASE_MARKER_SCALE * (1.0 + zoomFactor * 3.5);
            _mapMarker.scale.set(scale, scale, 1);

            // Shift marker up as zoom out to prevent overlap with model
            // At max zoom (22): height = 2.5m
            // At min zoom (18.5): height = 5.0m
            const heightOffset = MARKER_HEIGHT_OFFSET + (zoomFactor * 2.5);
            _mapMarker.position.y = heightOffset;
        }
    }
}
