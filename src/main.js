import { detect } from './iris.js';
import { drawIridologyMap, createInteractiveMap, drawRadialZoneLegend, unwrapIris, drawUnwrappedIridologyMap } from './iridologyMap.js';

// Make onOpenCvReady global so it can be called from the OpenCV script onload
window.onOpenCvReady = function () {
  cvReady = true;
  console.log('OpenCV.js loaded');
};

// DOM elements cache
const DOM = {
  leftFile: document.getElementById('leftFile'),
  rightFile: document.getElementById('rightFile'),
  leftCanvas: document.getElementById('leftCanvas'),
  rightCanvas: document.getElementById('rightCanvas'),
  leftMsg: document.getElementById('leftMsg'),
  rightMsg: document.getElementById('rightMsg'),
  leftCamBtn: document.getElementById('leftCamBtn'),
  rightCamBtn: document.getElementById('rightCamBtn'),
  leftClearBtn: document.getElementById('leftClearBtn'),
  rightClearBtn: document.getElementById('rightClearBtn'),
  leftUnwrapCanvas: document.getElementById('leftUnwrapCanvas'),
  rightUnwrapCanvas: document.getElementById('rightUnwrapCanvas'),
  leftUnwrapContainer: document.getElementById('leftUnwrapContainer'),
  rightUnwrapContainer: document.getElementById('rightUnwrapContainer')
};

// Helper function to get eye-specific DOM elements
const getEyeDOM = (eye) => ({
  file: DOM[`${eye}File`],
  canvas: DOM[`${eye}Canvas`],
  msg: DOM[`${eye}Msg`],
  camBtn: DOM[`${eye}CamBtn`],
  clearBtn: DOM[`${eye}ClearBtn`],
  unwrapCanvas: DOM[`${eye}UnwrapCanvas`],
  unwrapContainer: DOM[`${eye}UnwrapContainer`]
});

// Minimal app structure
let cvReady = false;
let activeStream = null;
let leftCleanup = null;
let rightCleanup = null;
let leftImage = null;
let rightImage = null;

// Detection results cache
const detectionState = {
  left: { result: null, drawInfo: null, image: null, cleanup: null },
  right: { result: null, drawInfo: null, image: null, cleanup: null }
};

function stopStream() {
  if (activeStream) {
    activeStream.getTracks().forEach(t => t.stop());
    activeStream = null;
  }
}

function dataURLToImage(dataURL) {
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = rej;
    img.src = dataURL;
  });
}

function drawImageToCanvas(img, canvas, imageScale = 1.0) {
  const ctx = canvas.getContext('2d');
  // fit image while preserving aspect
  const maxW = canvas.width,
    maxH = canvas.height;
  let sw = img.width,
    sh = img.height;
  let scale = Math.min(maxW / sw, maxH / sh) * imageScale;
  let w = sw * scale,
    h = sh * scale;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, (maxW - w) / 2, (maxH - h) / 2, w, h);
  return {
    dx: (maxW - w) / 2,
    dy: (maxH - h) / 2,
    dw: w,
    dh: h,
    imageScale: imageScale
  };
}

// File change handlers
const createFileChangeHandler = (eye) => async (e) => {
  const f = e.target.files[0];
  if (!f) return;

  const eyeDOM = getEyeDOM(eye);
  eyeDOM.msg.textContent = '';

  const dataURL = await readFileAsDataURL(f);
  const img = await dataURLToImage(dataURL);

  const drawInfo = drawImageToCanvas(img, eyeDOM.canvas, 1.0);
  runDetectOnCanvas(eyeDOM.canvas, eyeDOM.msg, drawInfo, eye);

  detectionState[eye].image = img;
};

DOM.leftFile.addEventListener('change', createFileChangeHandler('left'));
DOM.rightFile.addEventListener('change', createFileChangeHandler('right'));

// Clear button handlers
const createClearHandler = (eye) => () => {
  const eyeDOM = getEyeDOM(eye);
  clearCanvas(eyeDOM.canvas);
  eyeDOM.msg.textContent = '';
  eyeDOM.unwrapContainer.style.display = 'none';

  if (detectionState[eye].cleanup) {
    detectionState[eye].cleanup();
    detectionState[eye].cleanup = null;
  }
  detectionState[eye].image = null;
};

DOM.leftClearBtn.addEventListener('click', createClearHandler('left'));
DOM.rightClearBtn.addEventListener('click', createClearHandler('right'));

// Camera button handlers
DOM.leftCamBtn.addEventListener('click', () => startCameraCapture('left'));
DOM.rightCamBtn.addEventListener('click', () => startCameraCapture('right'));

async function startCameraCapture(eye) {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    getEyeDOM(eye).msg.textContent = 'Camera not supported in this browser.';
    return;
  }

  stopStream();

  try {
    const eyeDOM = getEyeDOM(eye);
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment' }
    });
    activeStream = stream;

    const video = document.createElement('video');
    video.autoplay = true;
    video.playsInline = true;
    video.srcObject = stream;
    await video.play();

    // Create modal
    const modal = document.createElement('div');
    Object.assign(modal.style, {
      position: 'fixed',
      inset: '0',
      background: 'rgba(0,0,0,0.6)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 9999
    });

    const box = document.createElement('div');
    Object.assign(box.style, {
      background: '#fff',
      padding: '10px',
      borderRadius: '8px'
    });

    const vcanvas = document.createElement('canvas');
    vcanvas.width = 640;
    vcanvas.height = 480;
    const vctx = vcanvas.getContext('2d');

    const capBtn = document.createElement('button');
    capBtn.textContent = 'Capture';
    const cancelBtn = document.createElement('button');
    cancelBtn.textContent = 'Cancel';
    cancelBtn.style.marginLeft = '8px';

    box.appendChild(vcanvas);
    box.appendChild(capBtn);
    box.appendChild(cancelBtn);
    modal.appendChild(box);
    document.body.appendChild(modal);

    const raf = () => {
      vctx.drawImage(video, 0, 0, vcanvas.width, vcanvas.height);
      if (modal.parentNode) requestAnimationFrame(raf);
    };
    raf();

    capBtn.onclick = async () => {
      const data = vcanvas.toDataURL('image/jpeg');
      const img = await dataURLToImage(data);
      detectionState[eye].image = img;
      drawImageToCanvas(img, eyeDOM.canvas, 1.0);
      runDetectOnCanvas(eyeDOM.canvas, eyeDOM.msg, undefined, eye);
      document.body.removeChild(modal);
      stopStream();
    };

    cancelBtn.onclick = () => {
      document.body.removeChild(modal);
      stopStream();
    };
  } catch (err) {
    console.error(err);
    getEyeDOM(eye).msg.textContent = 'Could not access camera: ' + err.message;
  }
}

function clearCanvas(canvas) {
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
}

function readFileAsDataURL(file) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result);
    r.onerror = rej;
    r.readAsDataURL(file);
  });
}

// --- Detection pipeline using OpenCV.js ---

async function runDetectOnCanvas(canvas, msgEl, drawInfo, eye = 'left') {
  if (!cvReady) {
    msgEl.textContent = 'OpenCV not loaded yet. Please wait a moment and try again.';
    return;
  }
  msgEl.textContent = '';
  try {
    const src = cv.imread(canvas);
    const result = detect(src);

    if (!result) {
      src.delete();
      msgEl.textContent = 'Could not detect pupil or iris.';
      return;
    }

    // Store detection result
    detectionState[eye].result = result;
    detectionState[eye].drawInfo = drawInfo;

    // Overlay circles on main canvas
    overlayCircles(canvas, result.pupil, result.iris, result.middleCircle, eye);

    // Create and display unwrapped iris with map
    const unwrapped = unwrapIris(src, result.iris, result.pupil);
    src.delete();

    const eyeDOM = getEyeDOM(eye);
    cv.imshow(eyeDOM.unwrapCanvas, unwrapped);

    // Draw iridology map on unwrapped image
    const ctx = eyeDOM.unwrapCanvas.getContext('2d');
    await drawUnwrappedIridologyMap(ctx, eyeDOM.unwrapCanvas.width, eye, {
      showRadialZones: true,
      showSectors: true,
      showLabels: true,
      showGrid: true,
      showClockNumbers: true,
      opacity: 1.0
    });

    unwrapped.delete();

    // Show the unwrap container
    eyeDOM.unwrapContainer.style.display = 'block';

    msgEl.className = 'ok';
    msgEl.textContent = 'Detected: pupil and iris.';
  } catch (err) {
    console.error(err);
    msgEl.className = 'err';
    msgEl.textContent = 'Error during detection: ' + err.message;
  }
}

// overlay circles on canvas
function overlayCircles(canvas, pupil, iris, middleCircle, eye = 'left') {
  const ctx = canvas.getContext('2d');

  ctx.lineWidth = 3;
  // draw pupil
  ctx.strokeStyle = 'rgba(220,20,60,0.9)';
  ctx.beginPath();
  ctx.arc(pupil.x, pupil.y, pupil.r, 0, Math.PI * 2);
  ctx.stroke();
  // draw iris
  ctx.strokeStyle = 'rgba(6,95,70,0.9)';
  ctx.beginPath();
  ctx.arc(iris.x, iris.y, iris.r, 0, Math.PI * 2);
  ctx.stroke();

  // draw middle circle
  ctx.strokeStyle = 'rgba(30,144,255,0.9)';
  ctx.beginPath();
  ctx.arc(middleCircle.x, middleCircle.y, middleCircle.r, 0, Math.PI * 2);
  ctx.stroke();
}

// graceful message if OpenCV doesn't load in a few seconds
setTimeout(() => {
  if (!cvReady) {
    console.warn('OpenCV.js still not ready after timeout — if you are offline, include a local opencv.js build.');
  }
}, 5000);
