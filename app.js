import * as THREE from 'three';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import * as Mp4Muxer from 'mp4-muxer';

const FPS = 30;
const DURATION_SEC = 30;
const TOTAL_FRAMES = FPS * DURATION_SEC;

const canvas = document.getElementById('viewport');
const dropzone = document.getElementById('dropzone');
const fileInput = document.getElementById('fileInput');
const clipSelect = document.getElementById('clipSelect');
const lightPresetSelect = document.getElementById('lightPreset');
const expSlider = document.getElementById('expSlider');
const keyAngleSlider = document.getElementById('keyAngleSlider');
const lockLightsToggle = document.getElementById('lockLightsToggle');
const shadowToggle = document.getElementById('shadowToggle');
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

// 1. Renderer with AgX Tone Mapping & Soft Shadows
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
renderer.setSize(1280, 720, false);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.AgXToneMapping;
renderer.toneMappingExposure = Number(expSlider.value);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.background = new THREE.Color(bgColorInput.value);

// 2. Procedural Studio Softbox IBL Environment (for realistic PBR & metallic reflections)
function createStudioEnvironment() {
  const envScene = new THREE.Scene();
  envScene.background = new THREE.Color(0x14171f);

  const addPanel = (color, intensity, pos, rot, size) => {
    const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(intensity), side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(size[0], size[1]), mat);
    mesh.position.set(...pos);
    mesh.rotation.set(...rot);
    envScene.add(mesh);
  };

  // Overhead softbox, warm right strip, cool left strip, subtle floor bounce
  addPanel(0xffffff, 4.5, [0, 6, 0], [Math.PI / 2, 0, 0], [6, 6]);
  addPanel(0xfff4e6, 3.0, [5, 2, 3], [0, -Math.PI / 3, 0], [3, 5]);
  addPanel(0xdbeafe, 2.5, [-5, 2, -2], [0, Math.PI / 2.5, 0], [3, 5]);
  addPanel(0x333945, 1.0, [0, -5, 0], [-Math.PI / 2, 0, 0], [10, 10]);

  const pmrem = new THREE.PMREMGenerator(renderer);
  const envRT = pmrem.fromScene(envScene, 0.04);
  pmrem.dispose();
  return envRT.texture;
}
scene.environment = createStudioEnvironment();
scene.environmentIntensity = 0.65;

// 3. Three-Point Studio Light Rig (Key + Fill + Rim + Bounce)
const lightRig = new THREE.Group();
scene.add(lightRig);

const hemiLight = new THREE.HemisphereLight(0xf8fafc, 0x262b36, 0.45);
scene.add(hemiLight);

// Key Light (casts tight, high-res shadows on the 1-unit radius normalized model)
const keyLight = new THREE.DirectionalLight(0xfffaf0, 2.4);
keyLight.position.set(0, 3.5, 3.2);
keyLight.castShadow = true;
keyLight.shadow.mapSize.set(2048, 2048);
keyLight.shadow.camera.near = 0.5;
keyLight.shadow.camera.far = 12;
const shadowBounds = 1.65;
keyLight.shadow.camera.left = -shadowBounds;
keyLight.shadow.camera.right = shadowBounds;
keyLight.shadow.camera.top = shadowBounds;
keyLight.shadow.camera.bottom = -shadowBounds;
keyLight.shadow.bias = -0.0004;
keyLight.shadow.normalBias = 0.025;
lightRig.add(keyLight);

// Fill Light (softens dark shadows on the opposite side)
const fillLight = new THREE.DirectionalLight(0xdbeafe, 0.95);
fillLight.position.set(-3.2, 1.4, 2.2);
lightRig.add(fillLight);

// Rim / Back Light (separates silhouette from background)
const rimLight = new THREE.DirectionalLight(0xe0f2fe, 2.1);
rimLight.position.set(-1.2, 2.6, -3.5);
lightRig.add(rimLight);

const LIGHT_PRESETS = {
  studio: {
    keyColor: 0xfffaf0, keyInt: 2.4,
    fillColor: 0xdbeafe, fillInt: 0.95,
    rimColor: 0xe0f2fe, rimInt: 2.1,
    hemiInt: 0.45, envInt: 0.65
  },
  dramatic: {
    keyColor: 0xffffff, keyInt: 3.1,
    fillColor: 0x93c5fd, fillInt: 0.35,
    rimColor: 0x60a5fa, rimInt: 3.0,
    hemiInt: 0.2, envInt: 0.4
  },
  warm: {
    keyColor: 0xffedd5, keyInt: 2.8,
    fillColor: 0xbae6fd, fillInt: 0.85,
    rimColor: 0xfde68a, rimInt: 2.3,
    hemiInt: 0.5, envInt: 0.6
  }
};

function applyLightPreset(name) {
  const p = LIGHT_PRESETS[name] || LIGHT_PRESETS.studio;
  keyLight.color.setHex(p.keyColor);
  keyLight.intensity = p.keyInt;
  fillLight.color.setHex(p.fillColor);
  fillLight.intensity = p.fillInt;
  rimLight.color.setHex(p.rimColor);
  rimLight.intensity = p.rimInt;
  hemiLight.intensity = p.hemiInt;
  scene.environmentIntensity = p.envInt;
}
applyLightPreset('studio');

// 4. Camera, Controls, Grid & Ground Shadow Catcher
const camera = new THREE.PerspectiveCamera(45, 1280 / 720, 0.05, 100);
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;

const grid = new THREE.GridHelper(4, 16, 0x3b4252, 0x262b36);
scene.add(grid);

const shadowCatcher = new THREE.Mesh(
  new THREE.PlaneGeometry(8, 8),
  new THREE.ShadowMaterial({ opacity: 0.38 })
);
shadowCatcher.rotation.x = -Math.PI / 2;
shadowCatcher.receiveShadow = true;
scene.add(shadowCatcher);

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

if (typeof VideoEncoder === 'undefined') {
  statusEl.style.color = '#f87171';
  statusEl.textContent = 'WebCodecs API not supported in this browser. Use Chrome, Edge, or Safari 16.4+.';
}

function updateLightRigOrientation() {
  const keyOffset = THREE.MathUtils.degToRad(Number(keyAngleSlider.value));
  if (lockLightsToggle.checked) {
    const camAzimuth = Math.atan2(camera.position.x, camera.position.z);
    lightRig.rotation.y = camAzimuth + keyOffset;
  } else {
    lightRig.rotation.y = keyOffset;
  }
}

// Compute union bounding box across the animation clip
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

  modelPivot.scale.setScalar(1);
  currentFbx.position.set(0, 0, 0);

  const box = computeAnimatedBounds(currentFbx, mixer, clip);
  if (box.isEmpty()) return;

  const center = box.getCenter(new THREE.Vector3());
  const sphere = box.getBoundingSphere(new THREE.Sphere());

  currentFbx.position.sub(center);
  const scale = sphere.radius > 0 ? 1.0 / sphere.radius : 1.0;
  modelPivot.scale.setScalar(scale);

  // Place floor grid & shadow catcher directly beneath the model's lowest point
  const scaledMinY = (box.min.y - center.y) * scale;
  grid.position.y = scaledMinY;
  shadowCatcher.position.y = scaledMinY + 0.001;

  baseRadius = 1.0;
  setCameraAngle(0);
}

function setCameraAngle(progress) {
  const orbits = Number(orbitSlider.value);
  const elevation = THREE.MathUtils.degToRad(Number(elevSlider.value));
  const padding = Number(padSlider.value);
  const fovRad = THREE.MathUtils.degToRad(camera.fov);

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
  updateLightRigOrientation();
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

function prepareMaterialsAndShadows(fbx) {
  fbx.traverse((child) => {
    if (child.isMesh) {
      child.castShadow = true;
      child.receiveShadow = true;

      const materials = Array.isArray(child.material) ? child.material : [child.material];
      materials.forEach((mat) => {
        if (!mat) return;
        if (mat.map) mat.map.colorSpace = THREE.SRGBColorSpace;
        // Soften overly harsh default Phong specular highlights from FBX imports
        if (mat.isMeshPhongMaterial) {
          mat.shininess = Math.min(mat.shininess || 30, 40);
          if (mat.specular) mat.specular.multiplyScalar(0.35);
        }
        mat.needsUpdate = true;
      });
    }
  });
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
      prepareMaterialsAndShadows(fbx);

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
      statusEl.textContent = `Loaded "${file.name}". Adjust lighting or click Export 30s MP4.`;
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

lightPresetSelect.addEventListener('change', (e) => applyLightPreset(e.target.value));
expSlider.addEventListener('input', () => {
  const val = Number(expSlider.value);
  document.getElementById('expVal').textContent = val.toFixed(2);
  renderer.toneMappingExposure = val;
});
keyAngleSlider.addEventListener('input', () => {
  document.getElementById('keyAngleVal').textContent = `${keyAngleSlider.value}°`;
  updateLightRigOrientation();
});
lockLightsToggle.addEventListener('change', updateLightRigOrientation);
shadowToggle.addEventListener('change', () => {
  shadowCatcher.visible = shadowToggle.checked;
  keyLight.castShadow = shadowToggle.checked;
});

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
    codec: 'avc1.4d002a',
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
  clock.getDelta();
});

// Interactive Preview Loop
function animate() {
  requestAnimationFrame(animate);
  if (isRendering) return;

  const delta = clock.getDelta();
  if (mixer && activeAction) mixer.update(delta);
  controls.update();
  updateLightRigOrientation();
  renderer.render(scene, camera);
}
animate();
