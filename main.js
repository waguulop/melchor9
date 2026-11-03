import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const TARGET_LP = 1000;
const TWITCH_CHANNEL = 'melchor9';
const SKINS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 20, 29, 39];
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const random = (min, max) => min + Math.random() * (max - min);
const byId = (id) => document.getElementById(id);

/* ---------- LP ---------- */

const formatPercent = (value) =>
  value.toLocaleString('es-ES', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

function renderRank({ tier, lp }) {
  const left = Math.max(0, TARGET_LP - lp);
  byId('lp').textContent = `${lp} LP`;
  byId('tier').textContent = tier;
  byId('left-lp').textContent = `${left} LP`;
  byId('left-pct').textContent = `${formatPercent((left / TARGET_LP) * 100)} %`;
  byId('fill').style.width = `${Math.min(100, (lp / TARGET_LP) * 100)}%`;
  byId('track').setAttribute('aria-valuenow', String(Math.min(TARGET_LP, lp)));
  if (left === 0) {
    document.querySelector('.missing').textContent = '¡Ha llegado a los 1000 LP!';
  }
}

async function loadRank() {
  try {
    const response = await fetch('/api/lp');
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    renderRank(await response.json());
  } catch {
    // Sin datos de OP.GG se queda el último valor conocido que ya trae el HTML.
  }
}

/* ---------- Directo de Twitch ---------- */

function createStream() {
  const player = document.createElement('iframe');
  // Twitch exige que "parent" coincida con el dominio que incrusta el reproductor.
  const params = new URLSearchParams({ channel: TWITCH_CHANNEL, parent: location.hostname, muted: 'true' });
  player.src = `https://player.twitch.tv/?${params}`;
  player.title = `Directo de ${TWITCH_CHANNEL} en Twitch`;
  player.allowFullscreen = true;
  byId('stream').append(player);
}

/* ---------- Imágenes borrosas orbitando ---------- */

function createFloaters() {
  const layer = byId('floaters');
  const narrow = innerWidth < 700;
  const pool = [...SKINS].sort(() => Math.random() - 0.5);
  const count = narrow ? 9 : 15;

  return Array.from({ length: count }, (_, i) => {
    const img = new Image();
    img.src = `assets/skins/${pool[i % pool.length]}.jpg`;
    img.alt = '';
    img.width = narrow ? random(70, 130) : random(110, 230);
    img.style.filter = `blur(${random(3, 8).toFixed(1)}px)`;
    img.style.opacity = random(0.6, 0.95).toFixed(2);
    layer.append(img);
    return {
      img,
      angle: random(0, Math.PI * 2),
      orbit: random(0.08, 0.2) * (Math.random() < 0.5 ? -1 : 1),
      radiusX: random(0.2, 0.62),
      radiusY: random(0.2, 0.62),
      tilt: random(0, 360),
      spin: random(14, 60) * (Math.random() < 0.5 ? -1 : 1),
    };
  });
}

function updateFloaters(floaters, delta) {
  const { innerWidth: width, innerHeight: height } = window;
  for (const f of floaters) {
    f.angle += f.orbit * delta;
    f.tilt += f.spin * delta;
    const x = width / 2 + Math.cos(f.angle) * f.radiusX * width - f.img.width / 2;
    const y = height / 2 + Math.sin(f.angle) * f.radiusY * height - f.img.height / 2;
    f.img.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) rotate(${f.tilt.toFixed(1)}deg)`;
  }
}

/* ---------- Gragas 3D ---------- */

function showGragasFallback() {
  const img = new Image();
  img.src = 'assets/skins/0.jpg';
  img.alt = 'Gragas';
  img.className = 'fallback';
  byId('gragas').replaceWith(img);
}

function createGragas() {
  const canvas = byId('gragas');
  const stage = byId('stage');
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 50);

  scene.add(new THREE.HemisphereLight(0xfff3d6, 0x7a3d08, 2.4));
  const key = new THREE.DirectionalLight(0xffffff, 2.2);
  key.position.set(2, 3, 4);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0xffc15a, 1.6);
  rim.position.set(-3, 2, -3);
  scene.add(rim);

  const spinner = new THREE.Group();
  scene.add(spinner);

  let extraSpin = 0;
  let fitRadius = 1;
  let fitHeight = 1;

  function fit() {
    const { clientWidth: width, clientHeight: height } = stage;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    const halfFov = THREE.MathUtils.degToRad(camera.fov / 2);
    const forHeight = (fitHeight / 2) / Math.tan(halfFov);
    const forWidth = fitRadius / (Math.tan(halfFov) * camera.aspect);
    // Margen de profundidad: al girar, el cuerpo se acerca a la cámara y crece en pantalla.
    camera.position.set(0, 0, Math.max(forHeight + fitRadius * 0.35, forWidth));
    camera.updateProjectionMatrix();
  }
  new ResizeObserver(fit).observe(stage);

  new GLTFLoader().load('assets/gragas.glb', (gltf) => {
    const model = gltf.scene;
    const mesh = model.getObjectByProperty('isMesh', true);
    const positions = mesh.geometry.attributes.position;

    // El eje de giro pasa por el centro de masa, no por la caja: el barril descentra la caja.
    const center = new THREE.Vector3();
    const point = new THREE.Vector3();
    for (let i = 0; i < positions.count; i++) center.add(point.fromBufferAttribute(positions, i));
    center.divideScalar(positions.count);

    const box = new THREE.Box3().setFromBufferAttribute(positions);
    let radius = 0;
    for (let i = 0; i < positions.count; i++) {
      point.fromBufferAttribute(positions, i);
      radius = Math.max(radius, Math.hypot(point.x - center.x, point.z - center.z));
    }

    const height = box.max.y - box.min.y;
    const scale = 2 / height;
    model.scale.setScalar(scale);
    model.position.set(-center.x * scale, -(box.min.y + height / 2) * scale, -center.z * scale);
    spinner.add(model);

    fitHeight = 2.15;
    fitRadius = radius * scale;
    fit();
  }, undefined, showGragasFallback);

  canvas.addEventListener('click', () => { extraSpin = Math.min(extraSpin + 9, 30); });

  return (delta) => {
    extraSpin *= Math.exp(-delta * 1.4);
    spinner.rotation.y += ((reduceMotion ? 0.3 : 1.1) + extraSpin) * delta;
    renderer.render(scene, camera);
  };
}

/* ---------- Arranque ---------- */

loadRank();
createStream();

let drawGragas = null;
try {
  drawGragas = createGragas();
} catch {
  showGragasFallback();
}

const floaters = createFloaters();
let last = performance.now();

updateFloaters(floaters, 0);

requestAnimationFrame(function tick(now) {
  const delta = Math.min((now - last) / 1000, 0.1);
  last = now;
  if (!reduceMotion) updateFloaters(floaters, delta);
  drawGragas?.(delta);
  requestAnimationFrame(tick);
});
