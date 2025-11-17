import { detect } from './iris.js';
import { drawIridologyMap, createInteractiveMap, drawRadialZoneLegend, unwrapIris, drawUnwrappedIridologyMap, drawIridologyMapWithHealth, drawAdaptedIridologyMap, drawAdaptedSVGIridologyMap, loadSVGImage } from './iridologyMap.js';

// Make onOpenCvReady global so it can be called from the OpenCV script onload
window.onOpenCvReady = function () {
  cvReady = true;
  console.log('OpenCV.js loaded');
  // Hide OpenCV loader
  const cvLoader = document.getElementById('cvLoader');
  if (cvLoader) cvLoader.style.display = 'none';
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

    // Use adapted SVG map with professional format - loads the sector map and adapts it
    try {
      await drawAdaptedSVGIridologyMap(
        ctx,
        eyeDOM.unwrapCanvas.width,
        result.iris,
        result.pupil,
        result.middleCircle,
        eye
      );
    } catch (err) {
      console.warn('SVG map loading failed, using geometric map instead:', err);
      // Fallback to geometric map
      drawAdaptedIridologyMap(
        ctx,
        eyeDOM.unwrapCanvas.width,
        result.iris,
        result.pupil,
        result.middleCircle,
        eye
      );
    }
    unwrapped.delete();

    // Show the unwrap container
    eyeDOM.unwrapContainer.style.display = 'block';

    // Setup hover based on SVG regions
    setupSVGHover(eyeDOM.unwrapCanvas, eye);

    msgEl.className = 'ok';
    msgEl.textContent = 'Detected: pupil and iris.';
  } catch (err) {
    console.error(err);
    msgEl.className = 'err';
    msgEl.textContent = 'Error during detection: ' + err.message;
  }
}

// Setup hover functionality based on SVG regions
async function setupSVGHover(canvas, eye) {
  // Create tooltip element
  let tooltip = document.getElementById('iris-tooltip');
  if (!tooltip) {
    tooltip = document.createElement('div');
    tooltip.id = 'iris-tooltip';
    tooltip.style.cssText = `
      position: fixed;
      background: rgba(15, 23, 42, 0.95);
      color: #e2e8f0;
      padding: 8px 12px;
      border-radius: 6px;
      font-size: 14px;
      font-weight: 500;
      pointer-events: none;
      z-index: 10000;
      display: none;
      border: 1px solid rgba(59, 130, 246, 0.5);
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
    `;
    document.body.appendChild(tooltip);
  }

  // Load SVG and parse regions
  const svgFile = eye === 'left' ? '/src/svg/left.svg' : '/src/svg/right.svg';

  try {
    const response = await fetch(svgFile);
    const svgText = await response.text();
    const parser = new DOMParser();
    const svgDoc = parser.parseFromString(svgText, 'image/svg+xml');

    if (svgDoc.querySelector('parsererror')) {
      throw new Error('Invalid SVG');
    }

    // Get SVG dimensions from viewBox
    const svgElement = svgDoc.documentElement;
    const viewBox = svgElement.getAttribute('viewBox');
    let svgWidth = 639.5, svgHeight = 639.1;

    if (viewBox) {
      const parts = viewBox.split(/[\s,]+/);
      svgWidth = parseFloat(parts[2]) || 639.5;
      svgHeight = parseFloat(parts[3]) || 639.1;
    }

    // Get the g element with transform
    const gElement = svgDoc.getElementById('g47');
    const gTransform = gElement?.getAttribute('transform') || '';

    // Parse translate values from g element (translate(-7.3117924,-8.9741507))
    let translateX = 0, translateY = 0;
    const translateMatch = gTransform.match(/translate\(([-\d.]+),\s*([-\d.]+)\)/);
    if (translateMatch) {
      translateX = parseFloat(translateMatch[1]);
      translateY = parseFloat(translateMatch[2]);
    }

    // Extract regions from the 'region' group or anywhere in SVG
    const regions = [];
    const regionGroup = svgDoc.getElementById('region');

    // Try to find labeled elements - first in region group, then everywhere
    let labeledElements = [];
    if (regionGroup) {
      labeledElements = Array.from(regionGroup.querySelectorAll('[inkscape\\:label]'));
      console.log('Found in region group:', labeledElements.length);
    }

    // If not found in region group, search entire SVG
    if (labeledElements.length === 0) {
      // Try with different namespace notation
      labeledElements = Array.from(svgDoc.querySelectorAll('path[inkscape\\:label]'));
      console.log('Found with path selector:', labeledElements.length);
    }

    if (labeledElements.length === 0) {
      // Try without escaping (works with getAttributeNS)
      labeledElements = Array.from(svgDoc.querySelectorAll('path')).filter(el => {
        const label = el.getAttribute('inkscape:label');
        return label && el.getAttribute('d');
      });
      console.log('Found with filter:', labeledElements.length);
    }

    console.log('Found labeled elements:', labeledElements.length);

    labeledElements.forEach(el => {
      const label = el.getAttribute('inkscape:label');
      const pathData = el.getAttribute('d');

      if (label && pathData) {
        regions.push({
          label: label,
          path: pathData,
          transform: el.getAttribute('transform') || ''
        });
      }
    });

    console.log('Extracted regions:', regions.length, regions.map(r => r.label));
    console.log(`Found ${regions.length} regions for ${eye} eye`);

    // Remove old listeners
    const oldHandler = canvas._svgHoverHandler;
    if (oldHandler) {
      canvas.removeEventListener('mousemove', oldHandler);
      canvas.removeEventListener('mouseleave', oldHandler.leave);
    }

    const handleMouseMove = (e) => {
      const rect = canvas.getBoundingClientRect();
      const mouseX = (e.clientX - rect.left) * (canvas.width / rect.width);
      const mouseY = (e.clientY - rect.top) * (canvas.height / rect.height);

      // Transform mouse coordinates to SVG space
      // Canvas coordinates are centered at canvas.width/2, canvas.height/2
      // SVG coordinates need to account for the iris being scaled and centered

      const canvasCenter = canvas.width / 2;
      const irisRadiusCanvas = canvas.width / 2.8;

      // Calculate relative position from canvas center
      const dx = mouseX - canvasCenter;
      const dy = mouseY - canvasCenter;

      // Map to SVG coordinates
      // The SVG is scaled to fit the iris radius on canvas
      const svgRadius = Math.min(svgWidth, svgHeight) / 2;
      const scale = svgRadius / irisRadiusCanvas;

      // SVG center (accounting for g transform)
      const svgCenterX = svgWidth / 2 - translateX;
      const svgCenterY = svgHeight / 2 - translateY;

      const svgX = svgCenterX + dx * scale;
      const svgY = svgCenterY + dy * scale;

      // Check each region using path contains point algorithm
      let foundRegion = null;
      for (const region of regions) {
        if (isPointInPath(svgX, svgY, region.path)) {
          foundRegion = region.label;
          break;
        }
      }

      if (foundRegion) {
        tooltip.textContent = foundRegion;
        tooltip.style.display = 'block';
        tooltip.style.left = (e.clientX + 15) + 'px';
        tooltip.style.top = (e.clientY + 15) + 'px';
        canvas.style.cursor = 'pointer';
      } else {
        tooltip.style.display = 'none';
        canvas.style.cursor = 'default';
      }
    };

    const handleMouseLeave = () => {
      tooltip.style.display = 'none';
      canvas.style.cursor = 'default';
    };

    canvas.addEventListener('mousemove', handleMouseMove);
    canvas.addEventListener('mouseleave', handleMouseLeave);

    canvas._svgHoverHandler = handleMouseMove;
    canvas._svgHoverHandler.leave = handleMouseLeave;

  } catch (err) {
    console.error('Failed to setup SVG hover:', err);
  }
}

// Helper function to check if point is in SVG path using canvas
function isPointInPath(x, y, pathData) {
  try {
    const testCanvas = document.createElement('canvas');
    testCanvas.width = 1;
    testCanvas.height = 1;
    const ctx = testCanvas.getContext('2d');
    const path = new Path2D(pathData);
    return ctx.isPointInPath(path, x, y);
  } catch (err) {
    return false;
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
    console.warn('OpenCV.js still not ready after timeout – if you are offline, include a local opencv.js build.');
  }
}, 5000);