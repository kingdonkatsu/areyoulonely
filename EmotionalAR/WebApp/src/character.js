// ═══════════════════════════════════════════════════════════════
// Character — Animal Crossing–style Player Avatar
// Procedural geometry, walk animation, GPS-linked positioning
// ═══════════════════════════════════════════════════════════════

import * as THREE from 'three';
import { getElevation, getElevationAtScreenPoint, getMap } from './world.js';

let _scene = null;
let _group = null;         // Root group for the entire character
let _isWalking = false;
let _walkPhase = 0;
let _facingAngle = 0;      // Radians, 0 = +Z direction
let _targetAngle = 0;

// Body part refs for animation
let _leftArm, _rightArm, _leftLeg, _rightLeg;
let _body; // Inner body group that rotates to face direction

// ── Color palette (cohesive warm pastel aesthetic) ──────────
const SKIN = 0xFFE5D4;       // Soft peachy skin
const HAIR = 0xA67C52;       // Light warm brown
const OUTFIT = 0xFFB6C1;     // Light pink (unified)
const ACCENT = 0xFFF8DC;     // Cream (details)
const SHOE = 0x8B7355;       // Tan brown
const EYE = 0x2C2C3E;        // Soft dark
const EYE_HIGHLIGHT = 0xFFFFFF;
const MOUTH = 0xFFB6C1;      // Match outfit

/** Initialize the player character and add to scene. */
export function initCharacter(scene) {
    _scene = scene;
    _group = new THREE.Group();
    _group.name = 'player_character';

    _body = new THREE.Group();
    _body.name = 'character_body';

    // ── Build the character ─────────────────────────────────
    buildHead(_body);
    buildTorso(_body);
    buildArms(_body);
    buildLegs(_body);
    buildShadow(_group);

    _group.add(_body);
    _group.position.set(0, 0, 0);

    _scene.add(_group);
    console.log('[Character] Animal Crossing–style player created.');

    return _group;
}

// ═══════════════════════════════════════════════════════════════
// BODY CONSTRUCTION
// ═══════════════════════════════════════════════════════════════

function buildHead(parent) {
    const headGroup = new THREE.Group();
    headGroup.position.y = 1.55;

    // Head sphere (larger for chibi proportions)
    const headGeo = new THREE.SphereGeometry(0.38, 20, 20);
    const headMat = new THREE.MeshStandardMaterial({
        color: SKIN,
        roughness: 0.9,
        metalness: 0,
        flatShading: false // Smooth shading
    });
    const head = new THREE.Mesh(headGeo, headMat);
    head.castShadow = true;
    headGroup.add(head);

    // ── Eyes (big oval, AC style) ───────────────────────────
    const eyeGeo = new THREE.SphereGeometry(0.075, 12, 12);
    eyeGeo.scale(1, 1.3, 0.6); // Oval shape
    const eyeMat = new THREE.MeshBasicMaterial({
        color: EYE,
        emissive: EYE,
        emissiveIntensity: 0.1 // Subtle glow
    });

    const leftEye = new THREE.Mesh(eyeGeo, eyeMat);
    leftEye.position.set(-0.12, 0.05, 0.32);
    headGroup.add(leftEye);

    const rightEye = new THREE.Mesh(eyeGeo, eyeMat);
    rightEye.position.set(0.12, 0.05, 0.32);
    headGroup.add(rightEye);

    // Eye highlights (small white dot — sparkle)
    const highlightGeo = new THREE.SphereGeometry(0.025, 8, 8);
    const highlightMat = new THREE.MeshBasicMaterial({ color: EYE_HIGHLIGHT });

    const leftHighlight = new THREE.Mesh(highlightGeo, highlightMat);
    leftHighlight.position.set(-0.095, 0.08, 0.35);
    headGroup.add(leftHighlight);

    const rightHighlight = new THREE.Mesh(highlightGeo, highlightMat);
    rightHighlight.position.set(0.145, 0.08, 0.35);
    headGroup.add(rightHighlight);

    // Cheek blush removed for cleaner look

    // ── Mouth (simple smile) ─────────────────────────────────
    const smileCurve = new THREE.QuadraticBezierCurve3(
        new THREE.Vector3(-0.07, -0.10, 0.34),
        new THREE.Vector3(0.0, -0.14, 0.36),
        new THREE.Vector3(0.07, -0.10, 0.34)
    );
    const smileGeo = new THREE.TubeGeometry(smileCurve, 12, 0.015, 6, false);
    const smileMat = new THREE.MeshBasicMaterial({ color: MOUTH });
    headGroup.add(new THREE.Mesh(smileGeo, smileMat));

    // ── Nose (tiny bump) ────────────────────────────────────
    const noseGeo = new THREE.SphereGeometry(0.028, 8, 8);
    const noseMat = new THREE.MeshStandardMaterial({ color: 0xFFD4BA, roughness: 0.9 });
    const nose = new THREE.Mesh(noseGeo, noseMat);
    nose.position.set(0, -0.03, 0.34);
    nose.scale.set(1, 0.7, 0.7);
    headGroup.add(nose);

    // ── Hair (simple rounded cap) ────────────────────────────
    const hairMat = new THREE.MeshStandardMaterial({
        color: HAIR,
        roughness: 0.9,
        flatShading: false
    });

    // Single smooth hair cap
    const capGeo = new THREE.SphereGeometry(0.40, 20, 20, 0, Math.PI * 2, 0, Math.PI * 0.65);
    const cap = new THREE.Mesh(capGeo, hairMat);
    cap.position.y = 0.05;
    cap.castShadow = true;
    headGroup.add(cap);

    parent.add(headGroup);
}

function buildTorso(parent) {
    const torsoGroup = new THREE.Group();
    torsoGroup.position.y = 0.95; // Shorter for chibi proportions

    // Unified outfit (dress/romper)
    const outfitGeo = new THREE.CapsuleGeometry(0.2, 0.4, 10, 14);
    const outfitMat = new THREE.MeshStandardMaterial({
        color: OUTFIT,
        roughness: 0.9,
        flatShading: false
    });
    const outfit = new THREE.Mesh(outfitGeo, outfitMat);
    outfit.castShadow = true;
    torsoGroup.add(outfit);

    // Collar detail (cream accent)
    const collarGeo = new THREE.TorusGeometry(0.13, 0.025, 8, 16);
    const collarMat = new THREE.MeshStandardMaterial({ color: ACCENT, roughness: 0.9 });
    const collar = new THREE.Mesh(collarGeo, collarMat);
    collar.position.y = 0.22;
    collar.rotation.x = Math.PI / 2;
    torsoGroup.add(collar);

    parent.add(torsoGroup);
}

function buildArms(parent) {
    // Left arm pivot
    const leftArmPivot = new THREE.Group();
    leftArmPivot.position.set(-0.28, 1.15, 0);
    leftArmPivot.name = 'leftArmPivot';

    const armGeo = new THREE.CapsuleGeometry(0.05, 0.26, 6, 8); // Slightly thinner
    const skinMat = new THREE.MeshStandardMaterial({ color: SKIN, roughness: 0.9, flatShading: false });
    const outfitMat = new THREE.MeshStandardMaterial({ color: OUTFIT, roughness: 0.9, flatShading: false });

    // Sleeve portion
    const sleeveGeo = new THREE.CapsuleGeometry(0.06, 0.08, 6, 8);
    const leftSleeve = new THREE.Mesh(sleeveGeo, outfitMat);
    leftSleeve.position.y = -0.02;
    leftArmPivot.add(leftSleeve);

    // Arm (skin)
    const leftArm = new THREE.Mesh(armGeo, skinMat);
    leftArm.position.y = -0.18;
    leftArm.castShadow = true;
    leftArmPivot.add(leftArm);

    // Hand (sphere)
    const handGeo = new THREE.SphereGeometry(0.05, 8, 8);
    const leftHand = new THREE.Mesh(handGeo, skinMat);
    leftHand.position.y = -0.35;
    leftArmPivot.add(leftHand);

    parent.add(leftArmPivot);
    _leftArm = leftArmPivot;

    // Right arm pivot (mirror)
    const rightArmPivot = leftArmPivot.clone();
    rightArmPivot.position.x = 0.28;
    rightArmPivot.name = 'rightArmPivot';
    parent.add(rightArmPivot);
    _rightArm = rightArmPivot;
}

function buildLegs(parent) {
    // Left leg pivot
    const leftLegPivot = new THREE.Group();
    leftLegPivot.position.set(-0.1, 0.65, 0);
    leftLegPivot.name = 'leftLegPivot';

    const legGeo = new THREE.CapsuleGeometry(0.06, 0.25, 6, 8);
    const skinMat = new THREE.MeshStandardMaterial({ color: SKIN, roughness: 0.8 });

    const leftLeg = new THREE.Mesh(legGeo, skinMat);
    leftLeg.position.y = -0.15;
    leftLeg.castShadow = true;
    leftLegPivot.add(leftLeg);

    // Shoe
    const shoeGeo = new THREE.SphereGeometry(0.065, 8, 8);
    shoeGeo.scale(1.2, 0.7, 1.5);
    const shoeMat = new THREE.MeshStandardMaterial({ color: SHOE, roughness: 0.7 });
    const leftShoe = new THREE.Mesh(shoeGeo, shoeMat);
    leftShoe.position.set(0, -0.32, 0.02);
    leftShoe.castShadow = true;
    leftLegPivot.add(leftShoe);

    parent.add(leftLegPivot);
    _leftLeg = leftLegPivot;

    // Right leg pivot (mirror)
    const rightLegPivot = leftLegPivot.clone();
    rightLegPivot.position.x = 0.1;
    rightLegPivot.name = 'rightLegPivot';
    parent.add(rightLegPivot);
    _rightLeg = rightLegPivot;
}

function buildShadow(parent) {
    const shadowGeo = new THREE.CircleGeometry(0.45, 20);
    const shadowMat = new THREE.MeshBasicMaterial({
        color: 0x000000,
        transparent: true,
        opacity: 0.22,
        depthWrite: false,
        side: THREE.DoubleSide
    });
    const shadow = new THREE.Mesh(shadowGeo, shadowMat);
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.01; // Just above ground
    shadow.name = 'character_shadow';
    parent.add(shadow);
}

// ═══════════════════════════════════════════════════════════════
// PUBLIC API
// ═══════════════════════════════════════════════════════════════

// Lerp state for smooth movement
let _currentPos = { x: 0, y: 0, z: 0 };
let _targetPos = { x: 0, y: 0, z: 0 };
let _walkSpeed = 1.0; // m/s (for animation speed scaling)
const LERP_SPEED_XZ = 3.0;   // How fast XZ catches up (higher = faster)
const LERP_SPEED_Y = 2.0;    // How fast Y catches up (slower = floating walk effect)

// Character lat/lng for continuous elevation polling
let _charLat = 0, _charLng = 0;
let _elevPollTimer = 0;
const ELEV_POLL_INTERVAL = 0.1; // Poll elevation every 100ms (10fps)
const LOOK_AHEAD_METERS = 2.0;  // Check 2m ahead for proactive detection

/** Set the target position. Character will lerp toward it smoothly.
 *  Elevation is now handled by continuous polling, not set here. */
export function setTargetPosition(x, z, elevationData) {
    _targetPos.x = x;
    _targetPos.z = z;
    // Y is set by continuous polling in animateCharacter, but accept initial hint
    if (elevationData && typeof elevationData.elevation === 'number') {
        _targetPos.y = elevationData.elevation;
    } else if (typeof elevationData === 'number') {
        _targetPos.y = elevationData;
    }
}

/** Store character's lat/lng for continuous elevation polling. */
export function setCharacterLatLng(lat, lng) {
    _charLat = lat;
    _charLng = lng;
}

/** Move character to a local XZ position, adjusting Y based on terrain elevation.
 *  @deprecated Use setTargetPosition for smooth lerp instead. */
export function updateCharacterPosition(lat, lng, x, z) {
    if (!_group) return;
    // Legacy: snap directly (kept for backward compatibility)
    _group.position.x = x;
    _group.position.z = z;
    const elev = getElevation(lat, lng);
    _group.position.y = typeof elev === 'object' ? elev.elevation : elev;
    _currentPos.x = x;
    _currentPos.y = _group.position.y;
    _currentPos.z = z;
    _targetPos.x = x;
    _targetPos.y = _group.position.y;
    _targetPos.z = z;
}

/** Set the direction the character faces (radians, 0 = +Z). */
export function setCharacterDirection(angle) {
    _targetAngle = angle;
}

/** Toggle walking state. */
export function setWalking(walking) {
    _isWalking = walking;
}

/** Set walk speed (m/s) — scales animation speed. */
export function setWalkSpeed(speed) {
    _walkSpeed = Math.max(0.3, Math.min(speed, 5.0)); // Clamp 0.3-5 m/s
}

/** Called every frame from the main render loop. */
export function animateCharacter(deltaTime) {
    if (!_group || !_body) return;

    // ── Smooth position lerp (walk from A to B) ─────────────
    const lerpFactorXZ = 1 - Math.exp(-LERP_SPEED_XZ * deltaTime);
    const lerpFactorY = 1 - Math.exp(-LERP_SPEED_Y * deltaTime);

    _currentPos.x += (_targetPos.x - _currentPos.x) * lerpFactorXZ;
    _currentPos.z += (_targetPos.z - _currentPos.z) * lerpFactorXZ;
    _currentPos.y += (_targetPos.y - _currentPos.y) * lerpFactorY;

    _group.position.x = _currentPos.x;
    _group.position.z = _currentPos.z;
    _group.position.y = _currentPos.y;

    // ── Continuous elevation polling (color-based) ────────────
    _elevPollTimer += deltaTime;
    if (_elevPollTimer >= ELEV_POLL_INTERVAL && _charLat !== 0) {
        _elevPollTimer = 0;

        // 1. Check current position
        const elevNow = getElevation(_charLat, _charLng);
        if (elevNow) {
            _targetPos.y = elevNow.elevation;
        }

        // 2. Proactive: check ahead in walking direction
        if (_isWalking) {
            const map = getMap();
            if (map) {
                // Calculate a point ~2m ahead
                const aheadLat = _charLat + Math.cos(_facingAngle) * (LOOK_AHEAD_METERS / 110574);
                const aheadLng = _charLng + Math.sin(_facingAngle) * (LOOK_AHEAD_METERS / (111320 * Math.cos(_charLat * Math.PI / 180)));
                const aheadElev = getElevation(aheadLat, aheadLng);

                // If ahead has a building and we're lower, start ascending early
                if (aheadElev && aheadElev.onBuilding && aheadElev.elevation > _targetPos.y) {
                    _targetPos.y = aheadElev.elevation;
                }
            }
        }
    }

    // ── Smooth rotation towards target angle ────────────────
    let angleDiff = _targetAngle - _facingAngle;
    // Normalize to [-PI, PI]
    while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
    while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
    _facingAngle += angleDiff * 0.12; // Smooth turn
    _body.rotation.y = _facingAngle;

    // ── Walk animation (speed-scaled) ────────────────────────
    if (_isWalking) {
        // Scale animation speed with real movement speed
        const animSpeed = Math.max(4, _walkSpeed * 4); // Minimum 4, scales up
        _walkPhase += deltaTime * animSpeed;

        const armSwing = Math.sin(_walkPhase) * 0.6;
        const legSwing = Math.sin(_walkPhase) * 0.5;
        const bounce = Math.abs(Math.sin(_walkPhase)) * 0.03;

        // Arms swing opposite to legs
        if (_leftArm) _leftArm.rotation.x = armSwing;
        if (_rightArm) _rightArm.rotation.x = -armSwing;

        // Legs
        if (_leftLeg) _leftLeg.rotation.x = -legSwing;
        if (_rightLeg) _rightLeg.rotation.x = legSwing;

        // Slight body bounce
        _body.position.y = bounce;
    } else {
        // Idle: gentle sway
        _walkPhase *= 0.9; // Slow down

        const idle = Math.sin(performance.now() * 0.002) * 0.02;
        _body.position.y = idle;

        // Return limbs to rest
        if (_leftArm) _leftArm.rotation.x *= 0.9;
        if (_rightArm) _rightArm.rotation.x *= 0.9;
        if (_leftLeg) _leftLeg.rotation.x *= 0.9;
        if (_rightLeg) _rightLeg.rotation.x *= 0.9;
    }
}

/** Get the character root group (for camera targeting). */
export function getCharacterGroup() {
    return _group;
}

/** Get current character world position. */
export function getCharacterPosition() {
    if (!_group) return { x: 0, y: 0, z: 0 };
    return { x: _group.position.x, y: _group.position.y, z: _group.position.z };
}

