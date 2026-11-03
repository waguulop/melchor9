import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const TARGET_LP = 1000;
const TWITCH_CHANNEL = 'melchor9';
const MEME_COUNT = 50;
const MEME_FADE_MS = 1200;
const BARREL_MIN_X = 104; // En el modelo, todo lo que queda más allá de la mano de Gragas es el barril
const BARREL_FALL_SECONDS = 0.55;
const BLAST_RADIUS = innerWidth < 700 ? 260 : 460;
const HINTS = ['Dale click al Gragas para darle potensia', 'Dale click al fondo para tirar un barril'];
const DRUNK_PER_POTENSIA = 0.04;
const DRUNK_PER_BARREL = 0.06;
const DRUNK_DECAY_PER_SECOND = 0.012;
const WASTED_SECONDS = 7;
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const random = (min, max) => min + Math.random() * (max - min);
const byId = (id) => document.getElementById(id);

/* ---------- LP ---------- */

const formatPercent = (value) =>
  value.toLocaleString('es-ES', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

// Los textos de encima de la barra se apartan cuando Gragas baila justo debajo de ellos.
function placeDancer(progress) {
  byId('dancer').style.setProperty('--lp', `${progress}%`);
  const meter = document.querySelector('.meter');
  meter.classList.toggle('dancer-left', progress < 16);
  meter.classList.toggle('dancer-right', progress > 72);
}

function renderRank({ tier, lp }) {
  const left = Math.max(0, TARGET_LP - lp);
  byId('lp').textContent = `${lp} LP`;
  byId('tier').textContent = tier;
  byId('left-lp').textContent = `${left} LP`;
  byId('left-pct').textContent = `${formatPercent((left / TARGET_LP) * 100)} %`;
  const progress = Math.min(100, (lp / TARGET_LP) * 100);
  byId('fill').style.width = `${progress}%`;
  placeDancer(progress);
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

/* ---------- Memes orbitando ---------- */

// Baraja continua: no se repite ningún meme hasta haber pasado por los 50.
function createMemeQueue() {
  let queue = [];
  return () => {
    if (queue.length === 0) {
      queue = Array.from({ length: MEME_COUNT }, (_, i) => String(i + 1).padStart(2, '0'))
        .sort(() => Math.random() - 0.5);
    }
    return `assets/memes/${queue.pop()}.webp`;
  };
}

function createFloaters() {
  const layer = byId('floaters');
  const narrow = innerWidth < 700;
  const count = narrow ? 12 : 15;

  return Array.from({ length: count }, () => {
    const img = new Image();
    const opacity = random(0.7, 0.95).toFixed(2);
    img.alt = '';
    img.width = narrow ? random(110, 180) : random(170, 320);
    img.style.opacity = '0';
    layer.append(img);
    return {
      img,
      opacity,
      angle: random(0, Math.PI * 2),
      orbit: random(0.08, 0.2) * (Math.random() < 0.5 ? -1 : 1),
      radiusX: random(0.15, narrow ? 0.45 : 0.62),
      radiusY: random(0.15, narrow ? 0.45 : 0.62),
      tilt: random(0, 360),
      spin: random(14, 60) * (Math.random() < 0.5 ? -1 : 1),
      kickX: 0,
      kickY: 0,
      velocityX: 0,
      velocityY: 0,
      kickSpin: 0,
      centerX: 0,
      centerY: 0,
    };
  });
}

// Cada meme aparece, se queda un rato, se desvanece y deja su sitio al siguiente de la baraja.
function cycleMeme(floater, nextMeme) {
  const incoming = new Image();
  incoming.onload = () => {
    floater.img.src = incoming.src;
    floater.angle = random(0, Math.PI * 2);
    floater.img.style.opacity = floater.opacity;
    setTimeout(() => {
      floater.img.style.opacity = '0';
      setTimeout(() => cycleMeme(floater, nextMeme), MEME_FADE_MS);
    }, MEME_FADE_MS + random(3000, 8000));
  };
  incoming.onerror = () => setTimeout(() => cycleMeme(floater, nextMeme), MEME_FADE_MS);
  incoming.src = nextMeme();
}

function startMemes(floaters, nextMeme) {
  for (const floater of floaters) {
    if (reduceMotion) {
      floater.img.src = nextMeme();
      floater.img.style.opacity = floater.opacity;
    } else {
      setTimeout(() => cycleMeme(floater, nextMeme), random(0, 4000));
    }
  }
}

function updateFloaters(floaters, delta) {
  const { innerWidth: width, innerHeight: height } = window;
  for (const f of floaters) {
    f.angle += f.orbit * delta;
    f.tilt += (f.spin + f.kickSpin) * delta;

    // El empujón de una explosión: sale disparado, frena y vuelve poco a poco a su órbita.
    f.kickX += f.velocityX * delta;
    f.kickY += f.velocityY * delta;
    const friction = Math.exp(-delta * 2.6);
    const recovery = Math.exp(-delta * 0.9);
    f.velocityX *= friction;
    f.velocityY *= friction;
    f.kickSpin *= friction;
    f.kickX *= recovery;
    f.kickY *= recovery;

    f.centerX = width / 2 + Math.cos(f.angle) * f.radiusX * width + f.kickX;
    f.centerY = height / 2 + Math.sin(f.angle) * f.radiusY * height + f.kickY;
    const x = f.centerX - f.img.width / 2;
    const y = f.centerY - f.img.height / 2;
    f.img.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) rotate(${f.tilt.toFixed(1)}deg)`;
  }
}

/* ---------- Bomba de barril ---------- */

function particle(className, keyframes, duration, styles) {
  const element = document.createElement('div');
  element.className = className;
  Object.assign(element.style, styles);
  byId('fx').append(element);
  element.animate(keyframes, { duration, easing: 'cubic-bezier(0.16, 1, 0.3, 1)', fill: 'forwards' })
    .finished.then(() => element.remove());
}

function explode(x, y, floaters) {
  const at = { left: `${x}px`, top: `${y}px` };

  particle('blast', [
    { transform: 'translate(-50%, -50%) scale(0.1)', opacity: 1 },
    { transform: 'translate(-50%, -50%) scale(1)', opacity: 0 },
  ], 550, at);

  // El rótulo se mete hacia dentro para que no se corte si el barril cae pegado al borde.
  const labelMargin = innerWidth < 700 ? 110 : 170;
  const labelX = Math.min(Math.max(x, labelMargin), innerWidth - labelMargin);

  particle('bomba', [
    { transform: 'translate(-50%, -50%) scale(0.3) rotate(-14deg)', opacity: 1 },
    { transform: 'translate(-50%, -90%) scale(1.15) rotate(-6deg)', opacity: 1, offset: 0.35 },
    { transform: 'translate(-50%, -130%) scale(1.25) rotate(-6deg)', opacity: 0 },
  ], 1100, { left: `${labelX}px`, top: `${y}px` });

  for (let i = 0; i < 18; i++) {
    const angle = random(0, Math.PI * 2);
    const distance = random(90, BLAST_RADIUS * 0.8);
    const dx = Math.cos(angle) * distance;
    const dy = Math.sin(angle) * distance;
    const isWood = i % 3 !== 0; // Astillas de barril y salpicones de espuma
    particle(isWood ? 'splinter' : 'foam', [
      { transform: `translate(-50%, -50%) rotate(${random(0, 360)}deg)`, opacity: 1 },
      { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy + 70}px)) rotate(${random(360, 1080)}deg)`, opacity: 0 },
    ], random(600, 1100), at);
  }

  for (const f of floaters) {
    const dx = f.centerX - x;
    const dy = f.centerY - y;
    const distance = Math.hypot(dx, dy) || 1;
    if (distance > BLAST_RADIUS) continue;
    const force = (1 - distance / BLAST_RADIUS) * 2600;
    f.velocityX += (dx / distance) * force;
    f.velocityY += (dy / distance) * force;
    f.kickSpin += random(300, 900) * (Math.random() < 0.5 ? -1 : 1);
  }

  if (!reduceMotion) {
    const shake = [
      { transform: 'translate(0, 0)' },
      { transform: 'translate(-9px, 7px)' },
      { transform: 'translate(8px, -6px)' },
      { transform: 'translate(-5px, -4px)' },
      { transform: 'translate(3px, 3px)' },
      { transform: 'translate(0, 0)' },
    ];
    document.querySelector('.page').animate(shake, { duration: 320, composite: 'add' });
    byId('gragas')?.animate(shake, { duration: 320, composite: 'add' });
  }
}

/* ---------- Modo borracho ---------- */

function createDrunkMode() {
  const page = document.querySelector('.page');
  const title = document.querySelector('h1');
  const floatersLayer = byId('floaters');
  const gauge = byId('drunk-meter');
  const gaugeValue = byId('drunk-value');
  const wastedMessage = byId('wasted');

  let level = 0;
  let wastedLeft = 0;
  let spinAngle = 0;
  let time = 0;

  return {
    get level() { return level; },
    add(amount) {
      if (wastedLeft > 0) return;
      level = Math.min(1, level + amount);
      if (level === 1) {
        wastedLeft = WASTED_SECONDS;
        wastedMessage.classList.add('visible');
      }
    },
    update(delta) {
      time += delta;
      if (wastedLeft > 0) {
        wastedLeft -= delta;
        spinAngle += delta * 150;
        if (wastedLeft <= 0) {
          level = 0;
          spinAngle = ((spinAngle + 180) % 360) - 180; // Vuelve a derechas por el camino corto
          wastedMessage.classList.remove('visible');
        }
      } else {
        level = Math.max(0, level - delta * DRUNK_DECAY_PER_SECOND);
        spinAngle *= Math.exp(-delta * 4);
      }

      gauge.hidden = level < 0.01;
      gaugeValue.textContent = String(Math.round(level * 100));
      if (reduceMotion) return;

      const sober = level < 0.01 && Math.abs(spinAngle) < 0.05;
      if (sober) {
        page.style.transform = '';
        title.style.transform = '';
        title.style.textShadow = '';
        floatersLayer.style.transform = '';
        return;
      }

      const sway = Math.sin(time * 0.9) * level * 5;
      const driftX = Math.sin(time * 1.3) * level * 18;
      const driftY = Math.cos(time * 1.1) * level * 10;
      page.style.transform = `translate(${driftX.toFixed(1)}px, ${driftY.toFixed(1)}px) rotate(${(sway + spinAngle).toFixed(2)}deg)`;
      floatersLayer.style.transform = `rotate(${(spinAngle - sway * 1.5).toFixed(2)}deg)`;
      title.style.transform = `rotate(${(Math.sin(time * 1.7) * level * 8).toFixed(2)}deg) skewX(${(Math.sin(time * 1.1) * level * 14).toFixed(2)}deg)`;

      // Visión doble: una copia fantasma del título que se separa cuanto más va bebido.
      const ghost = (level * 0.22 * (1 + Math.sin(time * 2.1) * 0.4)).toFixed(3);
      title.style.textShadow = `${ghost}em ${ghost}em 0 rgb(42 18 4 / ${(level * 0.55).toFixed(2)}), -${ghost}em 0 0 rgb(255 246 223 / ${(level * 0.45).toFixed(2)})`;
    },
  };
}

function rotateHints() {
  const hint = document.querySelector('.hint');
  let current = 0;
  setInterval(() => {
    current = (current + 1) % HINTS.length;
    hint.textContent = HINTS[current];
  }, 4000);
}

/* ---------- Gragas 3D ---------- */

function showGragasFallback() {
  const img = new Image();
  img.src = 'assets/skins/0.jpg';
  img.alt = 'Gragas';
  img.className = 'fallback';
  byId('gragas').remove();
  byId('stage').append(img);
}

function createGragas({ onPotensia, onExplosion }) {
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
  let worldPerPixel = 1;
  let barrelGeometry = null;
  let barrelMaterial = null;
  let barrelScale = 1;
  const fallingBarrels = [];
  let fitRadius = 1;
  let fitHeight = 1;

  function fit() {
    const { clientWidth: width, clientHeight: height } = canvas;
    const box = stage.getBoundingClientRect();
    renderer.setSize(width, height, false);
    camera.aspect = width / height;

    // Gragas se encuadra en el hueco central, aunque el lienzo cubra toda la pantalla.
    worldPerPixel = Math.max(fitHeight / box.height, (fitRadius * 2) / box.width);
    const distance = (worldPerPixel * height) / 2 / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    camera.position.set(
      (width / 2 - (box.left + box.width / 2)) * worldPerPixel,
      (box.top + box.height / 2 - height / 2) * worldPerPixel,
      distance,
    );
    camera.updateProjectionMatrix();
  }
  const resizeObserver = new ResizeObserver(fit);
  resizeObserver.observe(stage);
  resizeObserver.observe(canvas);

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

    fitHeight = 2.5;
    fitRadius = radius * scale;
    fit();

    // El proyectil es el propio barril del modelo: se aíslan sus caras y se centra en su eje.
    const index = mesh.geometry.index;
    const barrelFaces = [];
    for (let i = 0; i < index.count; i += 3) {
      const corners = [index.getX(i), index.getX(i + 1), index.getX(i + 2)];
      if (corners.every((corner) => positions.getX(corner) > BARREL_MIN_X)) barrelFaces.push(...corners);
    }
    barrelGeometry = mesh.geometry.clone();
    barrelGeometry.setIndex(barrelFaces);
    barrelGeometry.computeBoundingBox();
    barrelGeometry.translate(...barrelGeometry.boundingBox.getCenter(new THREE.Vector3()).negate().toArray());
    barrelMaterial = mesh.material;
    barrelScale = scale;
  }, undefined, showGragasFallback);

  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();

  function isOverGragas(event) {
    const rect = canvas.getBoundingClientRect();
    pointer.set(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1,
    );
    raycaster.setFromCamera(pointer, camera);
    return raycaster.intersectObject(spinner, true).length > 0;
  }

  canvas.addEventListener('pointermove', (event) => {
    canvas.style.cursor = isOverGragas(event) ? 'pointer' : '';
  });
  function dropBarrel(screenX, screenY) {
    if (!barrelGeometry) {
      onExplosion(screenX, screenY);
      return;
    }
    const worldX = camera.position.x + (screenX - canvas.clientWidth / 2) * worldPerPixel;
    const worldY = (y) => camera.position.y - (y - canvas.clientHeight / 2) * worldPerPixel;
    const barrel = new THREE.Mesh(barrelGeometry, barrelMaterial);
    barrel.scale.setScalar(barrelScale);
    barrel.position.set(worldX, worldY(-150), 0);
    scene.add(barrel);
    fallingBarrels.push({
      barrel,
      elapsed: 0,
      startY: barrel.position.y,
      endY: worldY(screenY),
      screenX,
      screenY,
    });
  }

  function updateBarrels(delta) {
    for (let i = fallingBarrels.length - 1; i >= 0; i--) {
      const falling = fallingBarrels[i];
      falling.elapsed += delta;
      const progress = Math.min(1, falling.elapsed / BARREL_FALL_SECONDS);
      falling.barrel.position.y = THREE.MathUtils.lerp(falling.startY, falling.endY, progress * progress);
      falling.barrel.rotation.x += delta * 7;
      falling.barrel.rotation.z += delta * 5;
      if (progress === 1) {
        scene.remove(falling.barrel);
        fallingBarrels.splice(i, 1);
        extraSpin = Math.min(extraSpin + 3, 30);
        onExplosion(falling.screenX, falling.screenY);
      }
    }
  }

  canvas.addEventListener('click', (event) => {
    if (isOverGragas(event)) {
      extraSpin = Math.min(extraSpin + 9, 30);
      onPotensia();
    } else {
      dropBarrel(event.clientX, event.clientY);
    }
  });

  let wobbleTime = 0;

  return (delta, drunkLevel) => {
    extraSpin *= Math.exp(-delta * 1.4);
    wobbleTime += delta;
    spinner.rotation.y += ((reduceMotion ? 0.3 : 1.1) * (1 + drunkLevel * 1.5) + extraSpin) * delta;
    if (!reduceMotion) {
      spinner.rotation.z = Math.sin(wobbleTime * 1.4) * drunkLevel * 0.45;
      spinner.rotation.x = Math.cos(wobbleTime * 1.1) * drunkLevel * 0.25;
    }
    updateBarrels(delta);
    renderer.render(scene, camera);
  };
}

/* ---------- Gragas bailando en la barra ---------- */

function createDancer() {
  const canvas = byId('dancer');
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));

  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, -1000, 1000);
  let mixer = null;

  const resize = () => renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);
  new ResizeObserver(resize).observe(canvas);
  resize();

  new GLTFLoader().load('assets/gragas-dance.glb', (gltf) => {
    scene.add(gltf.scene);
    mixer = new THREE.AnimationMixer(gltf.scene);
    const clip = gltf.animations[0];
    mixer.clipAction(clip).play();

    // El encuadre abarca todo el baile, para que no se salga en ningún paso.
    const bounds = new THREE.Box3();
    for (let i = 0; i < 12; i++) {
      mixer.setTime((clip.duration * i) / 12);
      gltf.scene.updateMatrixWorld(true);
      bounds.expandByObject(gltf.scene, true);
    }
    mixer.setTime(0);

    const center = bounds.getCenter(new THREE.Vector3());
    const size = bounds.getSize(new THREE.Vector3());
    const half = Math.max(size.x, size.y, size.z) / 2;
    camera.left = center.x - half;
    camera.right = center.x + half;
    camera.bottom = bounds.min.y;
    camera.top = bounds.min.y + half * 2;
    camera.position.set(0, 0, 500);
    camera.updateProjectionMatrix();
  });

  return (delta, drunkLevel) => {
    mixer?.update(reduceMotion ? 0 : delta * (1 + drunkLevel * 1.5));
    renderer.render(scene, camera);
  };
}

/* ---------- Arranque ---------- */

loadRank();
createStream();

const nextMeme = createMemeQueue();
const floaters = createFloaters();
const drunkMode = createDrunkMode();
startMemes(floaters, nextMeme);
rotateHints();

let drawGragas = null;
try {
  drawGragas = createGragas({
    onPotensia: () => drunkMode.add(DRUNK_PER_POTENSIA),
    onExplosion: (x, y) => {
      drunkMode.add(DRUNK_PER_BARREL);
      explode(x, y, floaters);
    },
  });
} catch {
  showGragasFallback();
}

let drawDancer = null;
try {
  drawDancer = createDancer();
} catch {
  byId('dancer').remove();
}

let last = performance.now();

updateFloaters(floaters, 0);

requestAnimationFrame(function tick(now) {
  const delta = Math.min((now - last) / 1000, 0.1);
  last = now;
  if (!reduceMotion) updateFloaters(floaters, delta);
  drunkMode.update(delta);
  drawGragas?.(delta, drunkMode.level);
  drawDancer?.(delta, drunkMode.level);
  requestAnimationFrame(tick);
});
