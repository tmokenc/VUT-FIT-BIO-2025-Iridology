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

// Modal functions
function showResultModal(eye) {
  const resultModal = document.getElementById('resultModal');
  const resultCanvas = document.getElementById('resultCanvas');
  const modalTitle = document.getElementById('modalTitle');

  if (!resultModal || !resultCanvas) return;

  // Get the correct unwrap canvas based on which eye was processed
  const sourceCanvas = eye === 'left' ? DOM.leftUnwrapCanvas : DOM.rightUnwrapCanvas;

  if (sourceCanvas && sourceCanvas.offsetParent !== null) {
    // Draw the source canvas content to result canvas (with map)
    const ctx = resultCanvas.getContext('2d');
    ctx.drawImage(sourceCanvas, 0, 0, resultCanvas.width, resultCanvas.height);

    // Store the version with map
    resultCanvas.dataset.eye = eye;
    resultCanvas.dataset.sourceCanvasWidth = sourceCanvas.width;
    resultCanvas.dataset.canvasWithMap = resultCanvas.toDataURL('image/png');

    // Create version without the map
    // We need to redraw the unwrapped iris without the SVG overlay
    const detectionResult = detectionState[eye].result;
    const detectionImage = detectionState[eye].image;

    if (detectionResult && detectionImage) {
      // Create a temporary canvas for the unwrapped iris (without map)
      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = resultCanvas.width;
      tempCanvas.height = resultCanvas.height;

      // Load the detection image and unwrap it
      const src = cv.imread(DOM[`${eye}Canvas`]);
      const unwrappedMat = unwrapIris(src, detectionResult.iris, detectionResult.pupil);
      cv.imshow(tempCanvas, unwrappedMat);
      src.delete();
      unwrappedMat.delete();

      // Save the version without map
      resultCanvas.dataset.canvasWithoutMap = tempCanvas.toDataURL('image/png');
    }

    // Update title
    if (modalTitle) {
      modalTitle.textContent = `Analysis Result - ${eye === 'left' ? 'Left' : 'Right'} Eye`;
    }
  }

  resultModal.style.display = 'flex';

  // Setup hover for result canvas after a brief delay to ensure canvas is rendered
  setTimeout(() => {
    setupSVGHover(resultCanvas, eye);
  }, 100);
} function closeResultModal() {
  const resultModal = document.getElementById('resultModal');
  if (resultModal) resultModal.style.display = 'none';
}

// Modal event listeners
document.addEventListener('DOMContentLoaded', () => {
  const closeModal = document.getElementById('closeModal');
  const closeModalBtn = document.getElementById('closeModalBtn');
  const downloadBtn = document.getElementById('downloadBtn');
  const leftViewFullBtn = document.getElementById('leftViewFullBtn');
  const rightViewFullBtn = document.getElementById('rightViewFullBtn');
  const toggleMapVisibility = document.getElementById('toggleMapVisibility');
  const resultCanvas = document.getElementById('resultCanvas');

  if (closeModal) closeModal.addEventListener('click', closeResultModal);
  if (closeModalBtn) closeModalBtn.addEventListener('click', closeResultModal);

  if (downloadBtn) {
    downloadBtn.addEventListener('click', () => {
      const resultCanvas = document.getElementById('resultCanvas');
      const eye = resultCanvas.dataset.eye || 'left';
      if (resultCanvas) {
        const link = document.createElement('a');
        link.href = resultCanvas.toDataURL('image/png');
        link.download = `iris-analysis-${eye}.png`;
        link.click();
      }
    });
  }

  // Full screen view buttons
  if (leftViewFullBtn) {
    leftViewFullBtn.addEventListener('click', () => showResultModal('left'));
  }
  if (rightViewFullBtn) {
    rightViewFullBtn.addEventListener('click', () => showResultModal('right'));
  }

  // Toggle map visibility
  if (toggleMapVisibility) {
    toggleMapVisibility.addEventListener('change', (e) => {
      if (resultCanvas) {
        const img = new Image();
        if (e.target.checked) {
          // Show with map
          img.src = resultCanvas.dataset.canvasWithMap;
        } else {
          // Show without map
          img.src = resultCanvas.dataset.canvasWithoutMap;
        }
        img.onload = () => {
          const ctx = resultCanvas.getContext('2d');
          ctx.clearRect(0, 0, resultCanvas.width, resultCanvas.height);
          // Draw the image scaled to fill the canvas while maintaining aspect ratio
          const imgAspect = img.width / img.height;
          const canvasAspect = resultCanvas.width / resultCanvas.height;

          let drawWidth = resultCanvas.width;
          let drawHeight = resultCanvas.height;
          let offsetX = 0;
          let offsetY = 0;

          if (imgAspect > canvasAspect) {
            drawHeight = drawWidth / imgAspect;
            offsetY = (resultCanvas.height - drawHeight) / 2;
          } else {
            drawWidth = drawHeight * imgAspect;
            offsetX = (resultCanvas.width - drawWidth) / 2;
          }

          ctx.drawImage(img, offsetX, offsetY, drawWidth, drawHeight);
        };
      }
    });
  }

  // Close modal when clicking outside
  const resultModal = document.getElementById('resultModal');
  if (resultModal) {
    resultModal.addEventListener('click', (e) => {
      if (e.target === resultModal) closeResultModal();
    });
  }
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

// Shared test canvas for all hover checks
const testCanvas = document.createElement('canvas');
testCanvas.width = 2000;  // large enough for SVG coordinates
testCanvas.height = 2000;
const testCtx = testCanvas.getContext('2d');

async function setupSVGHover(canvas, eye) {
  // Tooltip setup
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

  // Load SVG
  const svgFile = eye === 'left' ? '/src/svg/left.svg' : '/src/svg/right.svg';
  try {
    const response = await fetch(svgFile);
    const svgText = await response.text();
    const parser = new DOMParser();
    const svgDoc = parser.parseFromString(svgText, 'image/svg+xml');

    if (svgDoc.querySelector('parsererror')) throw new Error('Invalid SVG');

    // SVG viewBox
    const svgElement = svgDoc.documentElement;
    const viewBoxStr = svgElement.getAttribute('viewBox');
    let viewBoxX = 0, viewBoxY = 0, viewBoxWidth = 640, viewBoxHeight = 640;
    if (viewBoxStr) {
      const parts = viewBoxStr.split(/[\s,]+/);
      viewBoxX = parseFloat(parts[0]) || 0;
      viewBoxY = parseFloat(parts[1]) || 0;
      viewBoxWidth = parseFloat(parts[2]) || 640;
      viewBoxHeight = parseFloat(parts[3]) || 640;
    }

    // Extract regions
    const regions = [];
    const regionGroup = svgDoc.getElementById('region');
    if (!regionGroup) {
      console.warn('No region group found in SVG');
      return;
    }

    const paths = Array.from(regionGroup.querySelectorAll('path'));
    paths.forEach(pathEl => {
      const label = pathEl.getAttribute('inkscape:label');
      const pathData = pathEl.getAttribute('d');
      if (label && pathData) {
        regions.push({
          label: label.trim(),
          path: new Path2D(pathData) // precompute
        });
      }
    });

    console.log(`Found ${regions.length} regions for ${eye} eye:`, regions.map(r => r.label));

    // Remove old listeners
    const oldHandler = canvas._svgHoverHandler;
    if (oldHandler) {
      canvas.removeEventListener('mousemove', oldHandler);
      canvas.removeEventListener('mouseleave', oldHandler.leave);
    }

    // Mouse move handler
    const handleMouseMove = (e) => {
      const rect = canvas.getBoundingClientRect();

      // Get displayed size of canvas (accounting for CSS scaling)
      const displayWidth = rect.width;
      const displayHeight = rect.height;

      // Mouse position in canvas coordinates (actual pixel position in the 2000x2000 canvas)
      const canvasX = (e.clientX - rect.left) * (canvas.width / displayWidth);
      const canvasY = (e.clientY - rect.top) * (canvas.height / displayHeight);

      // The unwrapped iris fills the entire unwrapCanvas
      // So SVG coordinates map directly to unwrapCanvas coordinates
      // We just need to scale from resultCanvas (2000x2000) to unwrapCanvas (e.g., 682x682)

      const sourceCanvasWidth = parseInt(canvas.dataset.sourceCanvasWidth) || 600;
      const scaleFromResultToSource = sourceCanvasWidth / canvas.width;

      // Scale the canvas coordinates to source canvas coordinates
      const sourceCanvasX = canvasX * scaleFromResultToSource;
      const sourceCanvasY = canvasY * scaleFromResultToSource;

      // The iris in unwrapCanvas is centered and has radius = sourceCanvasWidth / 2.8
      // But the entire unwrapCanvas IS the unwrapped iris
      // So we map from 0..sourceCanvasWidth to SVG viewBox coordinates

      const canvasCenter = sourceCanvasWidth / 2;
      const irisRadiusSource = sourceCanvasWidth / 2.8;
      const dx = sourceCanvasX - canvasCenter;
      const dy = sourceCanvasY - canvasCenter;

      // Map to SVG coordinates
      const svgIrisRadius = Math.min(viewBoxWidth, viewBoxHeight) / 2;
      const scale = svgIrisRadius / irisRadiusSource;
      const svgCenterX = viewBoxX + viewBoxWidth / 2;
      const svgCenterY = viewBoxY + viewBoxHeight / 2;
      const svgX = svgCenterX + dx * scale;
      const svgY = svgCenterY + dy * scale;

      // Debug logging - uncomment to see details
      /*
      if (e.clientX === e.clientX) {
        const debugInfo = {
          sourceCanvasWidth: sourceCanvasWidth,
          displaySize: `${displayWidth.toFixed(0)}x${displayHeight.toFixed(0)}`,
          canvasSize: `${canvas.width}x${canvas.height}`,
          mousePos: `${e.clientX.toFixed(0)}, ${e.clientY.toFixed(0)}`,
          canvasPos: `${canvasX.toFixed(0)}, ${canvasY.toFixed(0)}`,
          sourcePos: `${sourceCanvasX.toFixed(0)}, ${sourceCanvasY.toFixed(0)}`,
          irisRadiusSource: irisRadiusSource.toFixed(0),
          scale: scale.toFixed(3),
          svgCoords: `${svgX.toFixed(0)}, ${svgY.toFixed(0)}`
        };
        console.log('Hover Debug:', debugInfo);
      }
      */      // Check regions using precomputed Path2D
      let foundRegion = null;
      for (const region of regions) {
        try {
          if (testCtx.isPointInPath(region.path, svgX, svgY)) {
            foundRegion = region.label;
            break;
          }
        } catch (err) {
          console.error('Error checking region:', region.label, err);
        }
      }

      if (foundRegion) {
        tooltip.textContent = foundRegion;
        tooltip.style.display = 'block';
        // Position tooltip at mouse location but make sure it stays on screen
        let tooltipX = e.clientX + 15;
        let tooltipY = e.clientY + 15;

        // Keep tooltip within viewport
        const tooltipRect = tooltip.getBoundingClientRect();
        if (tooltipX + 100 > window.innerWidth) {
          tooltipX = e.clientX - 115; // Position to the left
        }
        if (tooltipY + 30 > window.innerHeight) {
          tooltipY = e.clientY - 35; // Position above
        }

        tooltip.style.left = tooltipX + 'px';
        tooltip.style.top = tooltipY + 'px';
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


// // Setup hover functionality based on SVG regions
// async function setupSVGHover(canvas, eye) {
//   // Create tooltip element
//   let tooltip = document.getElementById('iris-tooltip');
//   if (!tooltip) {
//     tooltip = document.createElement('div');
//     tooltip.id = 'iris-tooltip';
//     tooltip.style.cssText = `
//       position: fixed;
//       background: rgba(15, 23, 42, 0.95);
//       color: #e2e8f0;
//       padding: 8px 12px;
//       border-radius: 6px;
//       font-size: 14px;
//       font-weight: 500;
//       pointer-events: none;
//       z-index: 10000;
//       display: none;
//       border: 1px solid rgba(59, 130, 246, 0.5);
//       box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
//     `;
//     document.body.appendChild(tooltip);
//   }
// 
//   // Load SVG and parse regions
//   const svgFile = eye === 'left' ? '/src/svg/left.svg' : '/src/svg/right.svg';
// 
//   try {
//     const response = await fetch(svgFile);
//     const svgText = await response.text();
//     const parser = new DOMParser();
//     const svgDoc = parser.parseFromString(svgText, 'image/svg+xml');
// 
//     if (svgDoc.querySelector('parsererror')) {
//       throw new Error('Invalid SVG');
//     }
// 
//     // Get SVG viewBox dimensions
//     const svgElement = svgDoc.documentElement;
//     const viewBoxStr = svgElement.getAttribute('viewBox');
//     let viewBoxX = 0, viewBoxY = 0, viewBoxWidth = 640, viewBoxHeight = 640;
// 
//     if (viewBoxStr) {
//       const parts = viewBoxStr.split(/[\s,]+/);
//       viewBoxX = parseFloat(parts[0]) || 0;
//       viewBoxY = parseFloat(parts[1]) || 0;
//       viewBoxWidth = parseFloat(parts[2]) || 640;
//       viewBoxHeight = parseFloat(parts[3]) || 640;
//     }
// 
//     console.log(`SVG viewBox: ${viewBoxX}, ${viewBoxY}, ${viewBoxWidth}x${viewBoxHeight} for ${eye} eye`);
// 
//     // Extract regions from the 'region' group
//     const regions = [];
//     const regionGroup = svgDoc.getElementById('region');
// 
//     if (regionGroup) {
//       // Find all path elements with inkscape:label within the region group
//       const paths = Array.from(regionGroup.querySelectorAll('path'));
// 
//       paths.forEach(pathEl => {
//         const label = pathEl.getAttribute('inkscape:label');
//         const pathData = pathEl.getAttribute('d');
// 
//         if (label && pathData) {
//           regions.push({
//             label: label.trim(),
//             pathData: pathData,
//             element: pathEl
//           });
//         }
//       });
// 
//       console.log(`Found ${regions.length} regions for ${eye} eye:`, regions.map(r => r.label));
//     } else {
//       console.warn('No region group found in SVG');
//       return;
//     }
// 
//     // Remove old listeners
//     const oldHandler = canvas._svgHoverHandler;
//     if (oldHandler) {
//       canvas.removeEventListener('mousemove', oldHandler);
//       canvas.removeEventListener('mouseleave', oldHandler.leave);
//     }
// 
//     const handleMouseMove = (e) => {
//       const rect = canvas.getBoundingClientRect();
// 
//       // Canvas mouse coordinates (scaled from display to actual canvas resolution)
//       const canvasX = (e.clientX - rect.left) * (canvas.width / rect.width);
//       const canvasY = (e.clientY - rect.top) * (canvas.height / rect.height);
// 
//       // Canvas center and iris radius
//       const canvasCenter = canvas.width / 2;
//       const irisRadiusCanvas = canvas.width / 2.8;
// 
//       // Transform canvas coordinates to SVG viewBox coordinates
//       // The canvas represents the iris with irisRadiusCanvas radius from center
//       // The SVG viewBox represents the same iris
// 
//       const dx = canvasX - canvasCenter;
//       const dy = canvasY - canvasCenter;
// 
//       // Scale factor from canvas to SVG
//       const svgIrisRadius = Math.min(viewBoxWidth, viewBoxHeight) / 2;
//       const scale = svgIrisRadius / irisRadiusCanvas;
// 
//       // SVG center
//       const svgCenterX = viewBoxX + viewBoxWidth / 2;
//       const svgCenterY = viewBoxY + viewBoxHeight / 2;
// 
//       // Transform to SVG coordinates
//       const svgX = svgCenterX + dx * scale;
//       const svgY = svgCenterY + dy * scale;
// 
//       // Check each region
//       let foundRegion = null;
// 
//       for (const region of regions) {
//         if (isPointInSVGPath(svgX, svgY, region.pathData)) {
//           foundRegion = region.label;
//           break;
//         }
//       }
// 
//       if (foundRegion) {
//         tooltip.textContent = foundRegion;
//         tooltip.style.display = 'block';
//         tooltip.style.left = (e.clientX + 15) + 'px';
//         tooltip.style.top = (e.clientY + 15) + 'px';
//         canvas.style.cursor = 'pointer';
//       } else {
//         tooltip.style.display = 'none';
//         canvas.style.cursor = 'default';
//       }
//     };
// 
//     const handleMouseLeave = () => {
//       tooltip.style.display = 'none';
//       canvas.style.cursor = 'default';
//     };
// 
//     canvas.addEventListener('mousemove', handleMouseMove);
//     canvas.addEventListener('mouseleave', handleMouseLeave);
// 
//     canvas._svgHoverHandler = handleMouseMove;
//     canvas._svgHoverHandler.leave = handleMouseLeave;
// 
//   } catch (err) {
//     console.error('Failed to setup SVG hover:', err);
//   }
// }

// Helper function to check if point is in SVG path using canvas context
function isPointInSVGPath(x, y, pathData) {
  try {
    // Create a canvas with appropriate size for the SVG coordinate space
    const testCanvas = document.createElement('canvas');
    testCanvas.width = 2000;
    testCanvas.height = 2000;
    const ctx = testCanvas.getContext('2d');

    // Create path and test point
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
