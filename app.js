import * as THREE from 'three';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import * as Mp4Muxer from 'mp4-muxer';

const FPS = 30;
const DURATION_SEC = 30;
const TOTAL_FRAMES = FPS * DURATION_SEC;
const STORY_TEXT = '4th graders in DESIGN created characters on tinkerCAD by putting together basic shapes like spheres, cones and cubes. Then they gave their character motion-capture Salsa Dance movements.';

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
const previewCharacterName = document.getElementById('previewCharacterName');

function getVideoDimensions() {
  const [totalWidth, height] = resolutionSelect.value.split('x').map(Number);
  const leftWidth = Math.round(totalWidth / 3);
  const rightWidth = totalWidth - leftWidth;
  return { totalWidth, height, leftWidth, rightWidth };
}

const initDims = getVideoDimensions();

// 1. Opaque WebGL Renderer with AgX Tone Mapping & Soft Shadows
const renderer = new THREE.WebGLRenderer({
  canvas,
  alpha: false,
  antialias: true,
  preserveDrawingBuffer: true
});
renderer.setSize(initDims.rightWidth, initDims.height, false);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.AgXToneMapping;
renderer.toneMappingExposure = Number(expSlider.value);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.background = new THREE.Color(bgColorInput.value);

// 2. Procedural Studio Softbox IBL Environment
function createStudioEnvironment() {
  const envScene = new THREE.Scene();
  envScene.background = new THREE.Color(0x14171f);

  const addPanel = (color, intensity, pos, rot, size) => {
    const mat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(color).multiplyScalar(intensity),
      side: THREE.DoubleSide
    });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(size[0], size[1]), mat);
    mesh.position.set(...pos);
    mesh.rotation.set(...rot);
    envScene.add(mesh);
  };

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

const fillLight = new THREE.DirectionalLight(0xdbeafe, 0.95);
fillLight.position.set(-3.2, 1.4, 2.2);
lightRig.add(fillLight);

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
const camera = new THREE.PerspectiveCamera(45, initDims.rightWidth / initDims.height, 0.05, 100);
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
let fileNameBase = 'Model';
let isRendering = false;
let abortRender = false;
const clock = new THREE.Clock();

if (typeof VideoEncoder === 'undefined') {
  statusEl.style.color = '#f87171';
  statusEl.textContent = 'WebCodecs API not supported in this browser. Use Chrome, Edge, or Safari 16.4+.';
}

function formatCapitalizedName(filename) {
  const base = filename.replace(/\.fbx$/i, '').trim();
  if (!base) return 'Model';
  return base.charAt(0).toUpperCase() + base.slice(1);
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

function sanitizeMaterials(fbx) {
  fbx.traverse((child) => {
    if (!child.isMesh) return;

    child.castShadow = true;
    child.receiveShadow = true;

    if (!child.geometry.attributes.normal) {
      child.geometry.computeVertexNormals();
    }

    const colorAttr = child.geometry.attributes.color;
    let hasValidVertexColors = false;
    if (colorAttr) {
      let maxVal = 0;
      const step = Math.max(1, Math.floor(colorAttr.count / 100));
      for (let i = 0; i < colorAttr.count; i += step) {
        maxVal = Math.max(maxVal, colorAttr.getX(i), colorAttr.getY(i), colorAttr.getZ(i));
      }
      if (maxVal < 0.05) {
        child.geometry.deleteAttribute('color');
      } else {
        hasValidVertexColors = true;
      }
    }

    const oldMats = Array.isArray(child.material) ? child.material : [child.material];
    const newMats = oldMats.map((mat) => {
      if (!mat) return new THREE.MeshStandardMaterial({ color: 0xd1d5db, roughness: 0.55 });

      const origMap = mat.userData.origMap !== undefined ? mat.userData.origMap : mat.map;
      const origNormal = mat.userData.origNormal !== undefined ? mat.userData.origNormal : mat.normalMap;

      const hasValidMap = Boolean(origMap && origMap.image && origMap.image.width > 0);
      const validMap = hasValidMap ? origMap : null;
      if (validMap) validMap.colorSpace = THREE.SRGBColorSpace;

      const validNormal = (origNormal && origNormal.image && origNormal.image.width > 0) ? origNormal : null;

      const origColor = mat.userData.origColor || (mat.color ? mat.color.clone() : new THREE.Color(0xd1d5db));
      const baseColor = origColor.clone();
      const isBlack = (baseColor.r + baseColor.g + baseColor.b) < 0.05;
      if (isBlack) {
        baseColor.setHex(validMap ? 0xffffff : 0xd1d5db);
      }

      const stdMat = new THREE.MeshStandardMaterial({
        name: mat.name,
        color: baseColor,
        map: validMap,
        normalMap: validNormal,
        vertexColors: hasValidVertexColors,
        roughness: 0.55,
        metalness: 0.1,
        side: mat.side ?? THREE.FrontSide,
        transparent: mat.transparent ?? false,
        opacity: mat.opacity ?? 1.0,
        alphaTest: mat.alphaTest ?? 0
      });

      stdMat.userData.origMap = origMap;
      stdMat.userData.origNormal = origNormal;
      stdMat.userData.origColor = origColor;
      return stdMat;
    });

    child.material = Array.isArray(child.material) ? newMats : newMats[0];
  });
}

function loadFBXFile(file) {
  if (!file || !file.name.toLowerCase().endsWith('.fbx')) {
    statusEl.style.color = '#f87171';
    statusEl.textContent = 'Please select a valid .fbx file.';
    return;
  }

  fileNameBase = formatCapitalizedName(file.name);
  previewCharacterName.textContent = fileNameBase;

  statusEl.style.color = '#4ade80';
  statusEl.textContent = `Loading "${file.name}"...`;

  const manager = new THREE.LoadingManager();
  let loadedFbx = null;

  manager.onLoad = () => {
    if (loadedFbx) sanitizeMaterials(loadedFbx);
  };

  const url = URL.createObjectURL(file);
  new FBXLoader(manager).load(
    url,
    (fbx) => {
      URL.revokeObjectURL(url);
      loadedFbx = fbx;
      sanitizeMaterials(fbx);

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
      statusEl.textContent = `Loaded "${file.name}". Ready to export ${fileNameBase}.mp4.`;
    },
    undefined,
    (err) => {
      URL.revokeObjectURL(url);
      statusEl.style.color = '#f87171';
      statusEl.textContent = `Failed to parse FBX: ${err.message || err}`;
    }
  );
}

// Helper to draw word-wrapped text onto the 2D export canvas
function wrapTextLines(ctx, text, maxWidth) {
  const words = text.split(/\s+/);
  const lines = [];
  let currentLine = '';

  for (const word of words) {
    const testLine = currentLine ? `${currentLine} ${word}` : word;
    if (ctx.measureText(testLine).width > maxWidth && currentLine) {
      lines.push(currentLine);
      currentLine = word;
    } else {
      currentLine = testLine;
    }
  }
  if (currentLine) lines.push(currentLine);
  return lines;
}

// Pre-renders the left 1/3 static text panel onto an offscreen canvas
function createLeftPanelCanvas(panelWidth, height, characterTitle) {
  const panelCanvas = document.createElement('canvas');
  panelCanvas.width = panelWidth;
  panelCanvas.height = height;
  const ctx = panelCanvas.getContext('2d');

  // Background gradient
  const grad = ctx.createLinearGradient(0, 0, panelWidth, height);
  grad.addColorStop(0, '#1b2232');
  grad.addColorStop(1, '#11151e');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, panelWidth, height);

  // Subtle right divider border
  ctx.fillStyle = '#2b3548';
  ctx.fillRect(panelWidth - 3, 0, 3, height);

  const paddingX = Math.round(panelWidth * 0.11);
  const maxTextWidth = panelWidth - paddingX * 2;

  // Top paragraph typography
  const bodyFontSize = Math.round(height * 0.036);
  const bodyLineHeight = Math.round(bodyFontSize * 1.48);
  ctx.font = `500 ${bodyFontSize}px system-ui, -apple-system, sans-serif`;
  const bodyLines = wrapTextLines(ctx, STORY_TEXT, maxTextWidth);

  // Character name typography (larger & different color)
  let titleFontSize = Math.round(height * 0.068);
  ctx.font = `800 ${titleFontSize}px system-ui, -apple-system, sans-serif`;
  while (ctx.measureText(characterTitle).width > maxTextWidth && titleFontSize > 18) {
    titleFontSize -= 2;
    ctx.font = `800 ${titleFontSize}px system-ui, -apple-system, sans-serif`;
  }

  const gap = Math.round(height * 0.055);
  const totalBlockHeight = bodyLines.length * bodyLineHeight + gap + titleFontSize;
  let cursorY = Math.round((height - totalBlockHeight) / 2) + bodyFontSize;

  // Draw top paragraph
  ctx.fillStyle = '#e2e8f0';
  ctx.font = `500 ${bodyFontSize}px system-ui, -apple-system, sans-serif`;
  ctx.textBaseline = 'alphabetic';
  for (const line of bodyLines) {
    ctx.fillText(line, paddingX, cursorY);
    cursorY += bodyLineHeight;
  }

  // Draw larger colored character name below
  cursorY += gap - (bodyLineHeight - bodyFontSize);
  ctx.fillStyle = '#fbbf24';
  ctx.font = `800 ${titleFontSize}px system-ui, -apple-system, sans-serif`;
  ctx.fillText(characterTitle, paddingX, cursorY);

  return panelCanvas;
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
  const { rightWidth, height } = getVideoDimensions();
  renderer.setSize(rightWidth, height, false);
  camera.aspect = rightWidth / height;
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

// Pick the most compatible H.264 profile supported by the user's browser/GPU
async function findSupportedH264Config(width, height, bitrate, framerate) {
  const codecs = [
    'avc1.42E028', // Constrained Baseline Level 4.0
    'avc1.4d0028', // Main Profile Level 4.0
    'avc1.640028', // High Profile Level 4.0
    'avc1.42001f'  // Baseline Level 3.1 fallback
  ];

  for (const codec of codecs) {
    const candidate = {
      codec,
      width,
      height,
      bitrate,
      framerate,
      avc: { format: 'avc' }
    };
    try {
      const result = await VideoEncoder.isConfigSupported(candidate);
      if (result.supported) return result.config;
    } catch {
      // Try next profile
    }
  }
  return null;
}

// Deterministic 30s MP4 Export
exportBtn.addEventListener('click', async () => {
  if (!currentFbx || isRendering) return;

  isRendering = true;
  abortRender = false;
  exportBtn.disabled = true;
  cancelBtn.hidden = false;
  progressBar.hidden = false;
  progressBar.value = 0;

  const { totalWidth, height, leftWidth, rightWidth } = getVideoDimensions();
  const bitrate = totalWidth * height >= 1920 * 1080 ? 8_000_000 : 5_000_000;

  const encoderConfig = await findSupportedH264Config(totalWidth, height, bitrate, FPS);
  if (!encoderConfig) {
    statusEl.style.color = '#f87171';
    statusEl.textContent = 'No supported H.264 encoder found in this browser.';
    isRendering = false;
    exportBtn.disabled = false;
    cancelBtn.hidden = true;
    progressBar.hidden = true;
    return;
  }

  // Ensure WebGL viewport matches the right-hand 2/3 region
  renderer.setSize(rightWidth, height, false);
  camera.aspect = rightWidth / height;
  camera.updateProjectionMatrix();

  // Pre-render the static left 1/3 text panel
  const leftPanelCanvas = createLeftPanelCanvas(leftWidth, height, fileNameBase);

  // Full wide-format 2D composite canvas
  const exportCanvas = document.createElement('canvas');
  exportCanvas.width = totalWidth;
  exportCanvas.height = height;
  const exportCtx = exportCanvas.getContext('2d', { alpha: false });

  let encoderError = null;
  const muxer = new Mp4Muxer.Muxer({
    target: new Mp4Muxer.ArrayBufferTarget(),
    video: { codec: 'avc', width: totalWidth, height },
    firstTimestampBehavior: 'offset',
    fastStart: 'in-memory'
  });

  const encoder = new VideoEncoder({
    output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
    error: (err) => {
      encoderError = err;
      statusEl.style.color = '#f87171';
      statusEl.textContent = `Encoder error: ${err.message}`;
    }
  });

  encoder.configure(encoderConfig);

  if (mixer && activeAction) {
    activeAction.reset();
    mixer.setTime(0);
  }

  const dt = 1 / FPS;
  const frameDurationUs = Math.round(1_000_000 / FPS);

  for (let frameIdx = 0; frameIdx < TOTAL_FRAMES; frameIdx++) {
    if (abortRender || encoderError) break;

    if (mixer && activeAction) mixer.update(dt);
    setCameraAngle(frameIdx / TOTAL_FRAMES);
    renderer.render(scene, camera);

    // Composite left text panel (1/3 width) + right 3D animation (2/3 width)
    exportCtx.drawImage(leftPanelCanvas, 0, 0, leftWidth, height);
    exportCtx.drawImage(canvas, leftWidth, 0, rightWidth, height);

    const frame = new VideoFrame(exportCanvas, {
      timestamp: frameIdx * frameDurationUs,
      duration: frameDurationUs
    });
    encoder.encode(frame, { keyFrame: frameIdx % 60 === 0 });
    frame.close();

    // Backpressure: wait if the hardware/software encoder queue is full
    if (encoder.encodeQueueSize > 5) {
      await new Promise((resolve) => {
        encoder.addEventListener('dequeue', resolve, { once: true });
      });
    }

    if (frameIdx % 10 === 0) {
      progressBar.value = frameIdx;
      statusEl.style.color = '#4ade80';
      statusEl.textContent = `Rendering frame ${frameIdx + 1} / ${TOTAL_FRAMES}...`;
      await new Promise((r) => setTimeout(r, 0));
    }
  }

  if (abortRender || encoderError) {
    if (encoder.state !== 'closed') encoder.close();
    if (abortRender) {
      statusEl.style.color = '#fbbf24';
      statusEl.textContent = 'Render cancelled.';
    }
  } else {
    statusEl.textContent = 'Finalizing MP4...';
    await encoder.flush();
    encoder.close();
    muxer.finalize();

    const buffer = muxer.target.buffer;
    const sizeMB = (buffer.byteLength / (1024 * 1024)).toFixed(2);
    const blob = new Blob([buffer], { type: 'video/mp4' });
    const downloadUrl = URL.createObjectURL(blob);

    const outputFileName = `${fileNameBase}.mp4`;
    const a = document.createElement('a');
    a.href = downloadUrl;
    a.download = outputFileName;
    document.body.appendChild(a);
    a.click();
    a.remove();

    setTimeout(() => URL.revokeObjectURL(downloadUrl), 60_000);

    statusEl.textContent = `Done! Downloaded ${outputFileName} (${sizeMB} MB)`;
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
