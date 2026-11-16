import * as THREE from 'three';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import * as Mp4Muxer from 'mp4-muxer';

const FPS = 30;
const DURATION_SEC = 30;
const TOTAL_FRAMES = FPS * DURATION_SEC;

const canvas = document.getElementById('viewport');
const dropzone = document.getElementById('dropzone');
const fileInput = document.getElementById('fileInput');
const clipSelect = document.getElementById('clipSelect');
const resolutionSelect = document.getElementById('resolutionSelect');
const elevSlider = document.getElementById('elevSlider');
const orbitSlider = document.getElementById('orbitSlider');
const padSlider = document.getElementById('padSlider');
const bgColorInput = document.getElementById('bgColor');
const gridToggle = document.getElementById('gridToggle');
const exportBtn = document.getElementById('exportBtn');
const cancelBtn = document.getElementById('cancelBtn');
const progressBar = document.getElementById('progressBar');
const statusEl = document.getElementById('status');

// Renderer & Scene Setup
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
renderer.setSize(1280, 720, false);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;

const scene = new THREE.Scene();
scene.background = new THREE.Color(bgColorInput.value);

const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

const dirLight = new THREE.DirectionalLight(0xffffff, 1.2);
dirLight.position.set(4, 8, 5);
scene.add(dirLight);

const camera = new THREE.PerspectiveCamera(45, 1280 / 720, 0.05, 100);
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;

const grid = new THREE.GridHelper(4, 16, 0x3b4252, 0x262b36);
scene.add(grid);

let modelPivot = new THREE.Group();
scene.add(modelPivot);

let currentFbx = null;
let mixer = null;
let activeAction = null;
let baseRadius = 1.0;
let fileNameBase = 'model';
let isRendering = false;
let abortRender = false;
const clock = new THREE.Clock();

// Check WebCodecs support
if (typeof VideoEncoder === 'undefined') {
  statusEl.style.color = '#f87171';
  statusEl.textContent = 'WebCodecs API not supported in this browser. Use Chrome, Edge, or Safari 16.4+.';
}

// Compute union bounding box across the entire animation clip
function computeAnimatedBounds(fbx, animMixer, clip) {
  const unionBox = new THREE.Box3();
  const sampleBox = new THREE.Box3();
  const samples = clip && clip.duration > 0 ? 12 : 1;

  for (let i = 0; i < samples; i++) {
    if (animMixer && clip) {
      animMixer.setTime((i / samples) * clip.duration);
    }
    fbx.updateMatrixWorld(true);
    sampleBox.setFromObject(fbx);
    unionBox.union(sampleBox);
  }

  if (animMixer && clip) animMixer.setTime(0);
  fbx.updateMatrixWorld(true);
  return unionBox;
}

function frameModel(clip = null) {
  if (!currentFbx) return;

  // Reset transforms before measuring
  modelPivot.scale.setScalar(1);
  currentFbx.position.set(0, 0, 0);

  const box = computeAnimatedBounds(currentFbx, mixer, clip);
  if (box.isEmpty()) return;

  const center = box.getCenter(new THREE.Vector3());
  const sphere = box.getBoundingSphere(new THREE.Sphere());

  currentFbx.position.sub(center);
  const scale = sphere.radius > 0 ? 1.0 / sphere.radius : 1.0;
  modelPivot.scale.setScalar(scale);

  // Place floor grid directly underneath the lowest point of the normalized model
  const scaledMinY = (box.min.y - center.y) * scale;
  grid.position.y = scaledMinY;

  baseRadius = 1.0;
  setCameraAngle(0);
}

function setCameraAngle(progress) {
  const orbits = Number(orbitSlider.value);
  const elevation = THREE.MathUtils.degToRad(Number(elevSlider.value));
  const padding = Number(padSlider.value);
  const fovRad = THREE.MathUtils.degToRad(camera.fov);

  // Account for horizontal aspect ratio if portrait/square
  const minFov = camera.aspect < 1
    ? 2 * Math.atan(Math.tan(fovRad / 2) * camera.aspect)
    : fovRad;

  const dist = (baseRadius / Math.sin(minFov / 2)) * padding;
  const azimuth = progress * Math.PI * 2 * orbits;

  camera.position.set(
    dist * Math.cos(elevation) * Math.sin(azimuth),
    dist * Math.sin(elevation),
    dist * Math.cos(elevation) * Math.cos(azimuth)
  );
  camera.lookAt(0, 0, 0);
  controls.target.set(0, 0, 0);
  controls.update();
}

function playClip(index) {
  if (!currentFbx || !mixer) return;
  if (activeAction) activeAction.stop();

  const clip = currentFbx.animations[index];
  if (clip) {
    activeAction = mixer.clipAction(clip);
    activeAction.reset();
    activeAction.setLoop(THREE.LoopRepeat);
    activeAction.play();
    frameModel(clip);
  } else {
    frameModel(null);
  }
}

function loadFBXFile(file) {
  if (!file || !file.name.toLowerCase().endsWith('.fbx')) {
    statusEl.style.color = '#f87171';
    statusEl.textContent = 'Please select a valid .fbx file.';
    return;
  }

  fileNameBase = file.name.replace(/\.fbx$/i, '');
  statusEl.style.color = '#4ade80';
  statusEl.textContent = `Loading "${file.name}"...`;

  const url = URL.createObjectURL(file);
  new FBXLoader().load(
    url,
    (fbx) => {
      URL.revokeObjectURL(url);
      scene.remove(modelPivot);
      modelPivot = new THREE.Group();
      scene.add(modelPivot);
      modelPivot.add(fbx);

      currentFbx = fbx;
      mixer = new THREE.AnimationMixer(fbx);
      activeAction = null;

      clipSelect.innerHTML = '';
      if (fbx.animations.length > 0) {
        fbx.animations.forEach((clip, idx) => {
          const opt = document.createElement('option');
          opt.value = idx;
          opt.textContent = `${clip.name || `Clip ${idx + 1}`} (${clip.duration.toFixed(1)}s)`;
          clipSelect.appendChild(opt);
        });
        clipSelect.disabled = false;
        playClip(0);
      } else {
        const opt = document.createElement('option');
        opt.textContent = 'Static mesh (no animations)';
        clipSelect.appendChild(opt);
        clipSelect.disabled = true;
        frameModel(null);
      }

      exportBtn.disabled = typeof VideoEncoder === 'undefined';
      statusEl.textContent = `Loaded "${file.name}". Drag viewport to inspect or click Export 30s MP4.`;
    },
    undefined,
    (err) => {
      URL.revokeObjectURL(url);
      statusEl.style.color = '#f87171';
      statusEl.textContent = `Failed to parse FBX: ${err.message || err}`;
    }
  );
}

// UI Event Listeners
dropzone.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', (e) => loadFBXFile(e.target.files[0]));
dropzone.addEventListener('dragover', (e) => { e.preventDefault(); dropzone.classList.add('dragover'); });
dropzone.addEventListener('dragleave', () => dropzone.classList.remove('dragover'));
dropzone.addEventListener('drop', (e) => {
  e.preventDefault();
  dropzone.classList.remove('dragover');
  loadFBXFile(e.dataTransfer.files[0]);
});

clipSelect.addEventListener('change', (e) => playClip(Number(e.target.value)));

resolutionSelect.addEventListener('change', () => {
  const [w, h] = resolutionSelect.value.split('x').map(Number);
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  setCameraAngle(0);
});

elevSlider.addEventListener('input', () => {
  document.getElementById('elevVal').textContent = `${elevSlider.value}°`;
  setCameraAngle(0);
});
orbitSlider.addEventListener('input', () => {
  document.getElementById('orbitVal').textContent = `${orbitSlider.value}×`;
});
padSlider.addEventListener('input', () => {
  document.getElementById('padVal').textContent = `${Number(padSlider.value).toFixed(2)}×`;
  setCameraAngle(0);
});
bgColorInput.addEventListener('input', () => {
  scene.background = new THREE.Color(bgColorInput.value);
});
gridToggle.addEventListener('change', () => {
  grid.visible = gridToggle.checked;
});

cancelBtn.addEventListener('click', () => {
  abortRender = true;
});

// Deterministic 30s MP4 Export
exportBtn.addEventListener('click', async () => {
  if (!currentFbx || isRendering) return;

  isRendering = true;
  abortRender = false;
  exportBtn.disabled = true;
  cancelBtn.hidden = false;
  progressBar.hidden = false;
  progressBar.value = 0;

  const [width, height] = resolutionSelect.value.split('x').map(Number);
  const bitrate = width * height >= 1920 * 1080 ? 8_000_000 : 5_000_000;

  const muxer = new Mp4Muxer.Muxer({
    target: new Mp4Muxer.ArrayBufferTarget(),
    video: { codec: 'avc', width, height },
    fastStart: 'in-memory'
  });

  const encoder = new VideoEncoder({
    output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
    error: (err) => {
      statusEl.style.color = '#f87171';
      statusEl.textContent = `Encoder error: ${err.message}`;
    }
  });

  encoder.configure({
    codec: 'avc1.4d002a', // H.264 Main Profile Level 4.2 (supports up to 1080p30)
    width,
    height,
    bitrate,
    framerate: FPS
  });

  if (mixer && activeAction) {
    activeAction.reset();
    mixer.setTime(0);
  }

  const dt = 1 / FPS;
  for (let frameIdx = 0; frameIdx < TOTAL_FRAMES; frameIdx++) {
    if (abortRender) break;

    if (mixer && activeAction) mixer.update(dt);
    setCameraAngle(frameIdx / TOTAL_FRAMES);
    renderer.render(scene, camera);

    const frame = new VideoFrame(canvas, { timestamp: frameIdx * (1_000_000 / FPS) });
    encoder.encode(frame, { keyFrame: frameIdx % 60 === 0 });
    frame.close();

    if (frameIdx % 10 === 0) {
      progressBar.value = frameIdx;
      statusEl.style.color = '#4ade80';
      statusEl.textContent = `Rendering frame ${frameIdx + 1} / ${TOTAL_FRAMES}...`;
      await new Promise((r) => setTimeout(r, 0));
    }
  }

  if (abortRender) {
    encoder.close();
    statusEl.style.color = '#fbbf24';
    statusEl.textContent = 'Render cancelled.';
  } else {
    statusEl.textContent = 'Finalizing MP4...';
    await encoder.flush();
    muxer.finalize();

    const blob = new Blob([muxer.target.buffer], { type: 'video/mp4' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${fileNameBase}_orbit_30s.mp4`;
    a.click();
    URL.revokeObjectURL(a.href);

    statusEl.textContent = `Done! Downloaded ${fileNameBase}_orbit_30s.mp4`;
  }

  isRendering = false;
  exportBtn.disabled = false;
  cancelBtn.hidden = true;
  progressBar.hidden = true;
  clock.getDelta(); // Reset clock delta so preview doesn't jump
});

// Interactive Preview Loop
function animate() {
  requestAnimationFrame(animate);
  if (isRendering) return;

  const delta = clock.getDelta();
  if (mixer && activeAction) mixer.update(delta);
  controls.update();
  renderer.render(scene, camera);
}
animate();
