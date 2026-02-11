// ═══════════════════════════════════════════════════════════════
// Character — Animal Crossing–style Player Avatar
// Procedural geometry, walk animation, GPS-linked positioning
// ═══════════════════════════════════════════════════════════════

import * as THREE from 'three';
import { getElevation } from './world.js';

let _scene = null;
let _group = null;         // Root group for the entire character
let _isWalking = false;
let _walkPhase = 0;
let _facingAngle = 0;      // Radians, 0 = +Z direction
let _targetAngle = 0;

// Body part refs for animation
let _leftArm, _rightArm, _leftLeg, _rightLeg;
let _body; // Inner body group that rotates to face direction

// ── Color palette (warm Animal Crossing aesthetic) ──────────
const SKIN = 0xFFDFC4;       // Warm peachy skin
const HAIR = 0x8B5E3C;       // Warm brown
const SHIRT = 0x7ECEC1;      // Mint green
const SHORTS = 0xFF8A80;     // Coral/salmon
const SHOE = 0x5D4037;       // Dark brown
const EYE_BLACK = 0x1A1A2E;  // Deep navy-black
const EYE_WHITE = 0xFFFFFF;
const EYE_HIGHLIGHT = 0xFFFFFF;
const MOUTH = 0xD4756B;      // Soft rosy
const HAT = 0x66BB6A;        // Leaf green
const CHEEK = 0xFFB3B3;      // Blush pink

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

    // Head sphere (large, round — AC proportions)
    const headGeo = new THREE.SphereGeometry(0.32, 16, 16);
    const headMat = new THREE.MeshStandardMaterial({ color: SKIN, roughness: 0.8, metalness: 0 });
    const head = new THREE.Mesh(headGeo, headMat);
    head.castShadow = true;
    headGroup.add(head);

    // ── Eyes (big oval, AC style) ───────────────────────────
    const eyeGeo = new THREE.SphereGeometry(0.065, 12, 12);
    eyeGeo.scale(1, 1.3, 0.6); // Oval shape
    const eyeMat = new THREE.MeshBasicMaterial({ color: EYE_BLACK });

    const leftEye = new THREE.Mesh(eyeGeo, eyeMat);
    leftEye.position.set(-0.1, 0.04, 0.27);
    headGroup.add(leftEye);

    const rightEye = new THREE.Mesh(eyeGeo, eyeMat);
    rightEye.position.set(0.1, 0.04, 0.27);
    headGroup.add(rightEye);

    // Eye highlights (small white dot — sparkle)
    const highlightGeo = new THREE.SphereGeometry(0.025, 8, 8);
    const highlightMat = new THREE.MeshBasicMaterial({ color: EYE_HIGHLIGHT });

    const leftHighlight = new THREE.Mesh(highlightGeo, highlightMat);
    leftHighlight.position.set(-0.075, 0.07, 0.30);
    headGroup.add(leftHighlight);

    const rightHighlight = new THREE.Mesh(highlightGeo, highlightMat);
    rightHighlight.position.set(0.125, 0.07, 0.30);
    headGroup.add(rightHighlight);

    // ── Cheek blush (two small pink circles) ────────────────
    const cheekGeo = new THREE.CircleGeometry(0.045, 12);
    const cheekMat = new THREE.MeshBasicMaterial({
        color: CHEEK,
        transparent: true,
        opacity: 0.5,
        side: THREE.DoubleSide,
        depthWrite: false
    });

    const leftCheek = new THREE.Mesh(cheekGeo, cheekMat);
    leftCheek.position.set(-0.18, -0.04, 0.28);
    leftCheek.lookAt(-0.18, -0.04, 1);
    headGroup.add(leftCheek);

    const rightCheek = new THREE.Mesh(cheekGeo, cheekMat);
    rightCheek.position.set(0.18, -0.04, 0.28);
    rightCheek.lookAt(0.18, -0.04, 1);
    headGroup.add(rightCheek);

    // ── Mouth (small smile curve) ───────────────────────────
    const smileCurve = new THREE.QuadraticBezierCurve3(
        new THREE.Vector3(-0.06, -0.08, 0.30),
        new THREE.Vector3(0.0, -0.12, 0.32),
        new THREE.Vector3(0.06, -0.08, 0.30)
    );
    const smileGeo = new THREE.TubeGeometry(smileCurve, 12, 0.012, 6, false);
    const smileMat = new THREE.MeshBasicMaterial({ color: MOUTH });
    headGroup.add(new THREE.Mesh(smileGeo, smileMat));

    // ── Nose (tiny bump) ────────────────────────────────────
    const noseGeo = new THREE.SphereGeometry(0.025, 8, 8);
    const noseMat = new THREE.MeshStandardMaterial({ color: 0xF0C8A0, roughness: 0.9 });
    const nose = new THREE.Mesh(noseGeo, noseMat);
    nose.position.set(0, -0.02, 0.30);
    nose.scale.set(1, 0.7, 0.7);
    headGroup.add(nose);

    // ── Hair (rounded bob, AC style) ────────────────────────
    const hairGroup = new THREE.Group();
    const hairMat = new THREE.MeshStandardMaterial({ color: HAIR, roughness: 0.9 });

    // Main hair cap
    const capGeo = new THREE.SphereGeometry(0.34, 16, 16, 0, Math.PI * 2, 0, Math.PI * 0.6);
    const cap = new THREE.Mesh(capGeo, hairMat);
    cap.position.y = 0.04;
    cap.castShadow = true;
    hairGroup.add(cap);

    // Side bangs
    const bangGeo = new THREE.SphereGeometry(0.12, 10, 10);
    const leftBang = new THREE.Mesh(bangGeo, hairMat);
    leftBang.position.set(-0.26, -0.02, 0.12);
    leftBang.scale.set(0.8, 1.2, 0.9);
    hairGroup.add(leftBang);

    const rightBang = new THREE.Mesh(bangGeo, hairMat);
    rightBang.position.set(0.26, -0.02, 0.12);
    rightBang.scale.set(0.8, 1.2, 0.9);
    hairGroup.add(rightBang);

    // Front fringe
    const fringeGeo = new THREE.SphereGeometry(0.20, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.35);
    const fringe = new THREE.Mesh(fringeGeo, hairMat);
    fringe.position.set(0, 0.14, 0.18);
    fringe.rotation.x = 0.3;
    hairGroup.add(fringe);

    headGroup.add(hairGroup);

    // ── Hat (small leaf/beret) ──────────────────────────────
    const hatGeo = new THREE.SphereGeometry(0.18, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.45);
    const hatMat = new THREE.MeshStandardMaterial({ color: HAT, roughness: 0.7 });
    const hat = new THREE.Mesh(hatGeo, hatMat);
    hat.position.set(0.08, 0.28, 0.05);
    hat.rotation.z = -0.3;
    hat.castShadow = true;
    headGroup.add(hat);

    // Hat stem
    const stemGeo = new THREE.CylinderGeometry(0.01, 0.01, 0.06, 6);
    const stemMat = new THREE.MeshStandardMaterial({ color: 0x4E8B4E });
    const stem = new THREE.Mesh(stemGeo, stemMat);
    stem.position.set(0.08, 0.36, 0.05);
    headGroup.add(stem);

    parent.add(headGroup);
}

function buildTorso(parent) {
    const torsoGroup = new THREE.Group();
    torsoGroup.position.y = 1.05;

    // Shirt (upper torso)
    const shirtGeo = new THREE.CapsuleGeometry(0.2, 0.3, 8, 12);
    const shirtMat = new THREE.MeshStandardMaterial({ color: SHIRT, roughness: 0.8 });
    const shirt = new THREE.Mesh(shirtGeo, shirtMat);
    shirt.castShadow = true;
    torsoGroup.add(shirt);

    // Shorts (lower torso)
    const shortsGeo = new THREE.CapsuleGeometry(0.19, 0.12, 8, 12);
    const shortsMat = new THREE.MeshStandardMaterial({ color: SHORTS, roughness: 0.8 });
    const shorts = new THREE.Mesh(shortsGeo, shortsMat);
    shorts.position.y = -0.22;
    shorts.castShadow = true;
    torsoGroup.add(shorts);

    // Collar detail (small ring at neckline)
    const collarGeo = new THREE.TorusGeometry(0.12, 0.02, 8, 16);
    const collarMat = new THREE.MeshStandardMaterial({ color: 0xFFFFFF, roughness: 0.8 });
    const collar = new THREE.Mesh(collarGeo, collarMat);
    collar.position.y = 0.18;
    collar.rotation.x = Math.PI / 2;
    torsoGroup.add(collar);

    parent.add(torsoGroup);
}

function buildArms(parent) {
    // Left arm pivot
    const leftArmPivot = new THREE.Group();
    leftArmPivot.position.set(-0.28, 1.15, 0);
    leftArmPivot.name = 'leftArmPivot';

    const armGeo = new THREE.CapsuleGeometry(0.055, 0.28, 6, 8);
    const skinMat = new THREE.MeshStandardMaterial({ color: SKIN, roughness: 0.8 });
    const shirtMat = new THREE.MeshStandardMaterial({ color: SHIRT, roughness: 0.8 });

    // Sleeve portion
    const sleeveGeo = new THREE.CapsuleGeometry(0.065, 0.08, 6, 8);
    const leftSleeve = new THREE.Mesh(sleeveGeo, shirtMat);
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
    const shadowGeo = new THREE.CircleGeometry(0.35, 16);
    const shadowMat = new THREE.MeshBasicMaterial({
        color: 0x000000,
        transparent: true,
        opacity: 0.18,
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

/** Move character to a local XZ position, adjusting Y based on terrain elevation. */
export function updateCharacterPosition(lat, lng, x, z) {
    if (!_group) return;
    _group.position.x = x;
    _group.position.z = z;
    _group.position.y = getElevation(lat, lng);
}

/** Set the direction the character faces (radians, 0 = +Z). */
export function setCharacterDirection(angle) {
    _targetAngle = angle;
}

/** Toggle walking state. */
export function setWalking(walking) {
    _isWalking = walking;
}

/** Called every frame from the main render loop. */
export function animateCharacter(deltaTime) {
    if (!_group || !_body) return;

    // ── Smooth rotation towards target angle ────────────────
    let angleDiff = _targetAngle - _facingAngle;
    // Normalize to [-PI, PI]
    while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
    while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
    _facingAngle += angleDiff * 0.12; // Smooth turn
    _body.rotation.y = _facingAngle;

    // ── Walk animation ──────────────────────────────────────
    if (_isWalking) {
        _walkPhase += deltaTime * 8; // Walk speed

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
