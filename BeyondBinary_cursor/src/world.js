import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';

let scene, camera, renderer, composer, controls;
let clock;
let _targetPos = new THREE.Vector3(0, 0, 0);
let _currentPos = new THREE.Vector3(0, 0, 0);

export function initWorld(canvas) {
  clock = new THREE.Clock();

  scene = new THREE.Scene();

  // Warm golden-hour sky
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

  scene.fog = new THREE.FogExp2(0xC5D8E8, 0.0008);

  camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 4000);
  camera.position.set(0, 50, 50);
  camera.lookAt(0, 0, 0);

  renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: false,
    powerPreference: 'high-performance',
  });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));

  const bloom = new UnrealBloomPass(
    new THREE.Vector2(window.innerWidth, window.innerHeight),
    0.6,
    0.5,
    0.85
  );
  composer.addPass(bloom);

  controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.minDistance = 10;
  controls.maxDistance = 800;
  controls.maxPolarAngle = Math.PI / 2.1;

  // Ground disc
  const groundGeo = new THREE.CircleGeometry(150, 64);
  const groundMat = new THREE.MeshStandardMaterial({
    color: '#E5E7EB',
    roughness: 1.0,
    metalness: 0,
  });
  const ground = new THREE.Mesh(groundGeo, groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  ground.name = 'ground';
  scene.add(ground);

  // Lighting
  const ambient = new THREE.AmbientLight(0xF5F5F5, 0.7);
  scene.add(ambient);

  // Warm breathing particles in air
  createParticles();

  window.addEventListener('resize', onResize);

  return { scene, clock };
}

function createParticles() {
  const count = 500;
  const geo = new THREE.BufferGeometry();
  const positions = new Float32Array(count * 3);
  const sizes = new Float32Array(count);

  for (let i = 0; i < count; i++) {
    positions[i * 3] = (Math.random() - 0.5) * 300;
    positions[i * 3 + 1] = Math.random() * 80 + 5;
    positions[i * 3 + 2] = (Math.random() - 0.5) * 300;
    sizes[i] = Math.random() * 2 + 1;
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
        pos.y += sin(uTime * 0.2 + position.x * 0.08) * 1.5;
        pos.x += cos(uTime * 0.1 + position.z * 0.08) * 1.0;
        vec4 mvPos = modelViewMatrix * vec4(pos, 1.0);
        gl_PointSize = aSize * (400.0 / -mvPos.z);
        gl_Position = projectionMatrix * mvPos;
        vAlpha = 0.4 + sin(uTime * 0.7 + position.z * 0.2) * 0.25;
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

  const points = new THREE.Points(geo, mat);
  scene.add(points);
}

export function smoothTo(x, z) {
  _targetPos.set(x, 0, z);
}

export function updateWorld() {
  const t = clock.getElapsedTime();

  _currentPos.lerp(_targetPos, 0.05);
  controls.target.copy(_currentPos);

  scene.children.forEach((child) => {
    if (child.isPoints && child.material.uniforms?.uTime) {
      child.material.uniforms.uTime.value = t;
    }
  });

  controls.update();
  composer.render();
}

const _raycaster = new THREE.Raycaster();
const _mouse = new THREE.Vector2();

export function raycastFromScreen(x, y, objects) {
  _mouse.x = (x / window.innerWidth) * 2 - 1;
  _mouse.y = -(y / window.innerHeight) * 2 + 1;
  _raycaster.setFromCamera(_mouse, camera);
  return _raycaster.intersectObjects(objects, true);
}

export function getScene() {
  return scene;
}

export function getClock() {
  return clock;
}

function onResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  composer.setSize(window.innerWidth, window.innerHeight);
}

