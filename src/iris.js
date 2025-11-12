function detect_middle_circle(srcMat, iris, pupil) {
  // Try to detect middle circle between pupil and iris
  // TODO

  // Estimate middle circle as weighted average between pupil and iris
  const r = Math.round(pupil.r + 0.3 * (iris.r - pupil.r));
  return {
    x: iris.x,
    y: iris.y,
    r: r
  };

}

/// Same as detectIrisAndPupil but also returns middleCircle
export function detect(srcMat) {
  const {iris, pupil} = detectIrisAndPupil(srcMat) || {};

  if (!iris || !pupil) {
    return null;
  }

  const middleCircle = detect_middle_circle(srcMat, iris, pupil);

  if (!middleCircle) {
    return null;
  }

  return {
    iris,
    pupil,
    middleCircle
  };
}

// Main heavy function. Returns {pupil:{x,y,r}, iris:{x,y,r}} or null
export function detectIrisAndPupil(srcMat) {
  // 1) Prepare grayscale image
  let mat = new cv.Mat();
  if (srcMat.type() === cv.CV_8UC4) cv.cvtColor(srcMat, mat, cv.COLOR_RGBA2GRAY);
  else cv.cvtColor(srcMat, mat, cv.COLOR_RGB2GRAY);

  // Keep a blurred copy for iris detection
  let blurred = new cv.Mat();
  cv.medianBlur(mat, blurred, 5);

  // PUPIL detection: user's pipeline -> invert, erode, threshold 220, find biggest contour
  let inv = new cv.Mat();
  cv.bitwise_not(mat, inv);
  let kernel = cv.getStructuringElement(cv.MORPH_ELLIPSE, new cv.Size(3, 3));
  let eroded = new cv.Mat();
  cv.erode(inv, eroded, kernel, new cv.Point(-1, -1), 2);
  let thresh = new cv.Mat();
  cv.threshold(eroded, thresh, 220, 255, cv.THRESH_BINARY);

  // find contours
  let contours = new cv.MatVector();
  let hierarchy = new cv.Mat();
  cv.findContours(thresh, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

  let pupil = null;
  try {
    // choose largest contour by area
    let maxArea = 0;
    let maxCnt = null;
    for (let i = 0; i < contours.size(); i++) {
      const cnt = contours.get(i);
      const area = cv.contourArea(cnt);
      if (area > maxArea) {
        maxArea = area;
        maxCnt = cnt;
      }
    }
    if (maxCnt && maxArea > 30) {
      // minEnclosingCircle
      const circle = cv.minEnclosingCircle(maxCnt);
      pupil = {
        x: Math.round(circle.center.x),
        y: Math.round(circle.center.y),
        r: Math.round(circle.radius)
      };
    }
  } catch (err) {
    console.warn('pupil contour method failed:', err);
  }

  // fallback for pupil: HoughCircles on inverted blurred image (pupil dark -> inverted bright)
  if (!pupil) {
    try {
      const invBlur = new cv.Mat();
      cv.bitwise_not(blurred, invBlur);
      let circles = new cv.Mat();
      cv.HoughCircles(invBlur, circles, cv.HOUGH_GRADIENT, 1.5, Math.round(Math.min(invBlur.cols, invBlur.rows) / 8), 100, 20, 3, Math.round(Math.min(invBlur.cols, invBlur.rows) / 4));
      if (circles.size() > 0) {
        // pick strongest
        const c0 = circles.data32F;
        pupil = {
          x: Math.round(c0[0]),
          y: Math.round(c0[1]),
          r: Math.round(c0[2])
        };
      }
      invBlur.delete();
      circles.delete();
    } catch (err) {
      console.warn('pupil hough fallback failed', err);
    }
  }

  // if still no pupil, abort
  if (!pupil) {
    // clean up
    mat.delete();
    blurred.delete();
    inv.delete();
    eroded.delete();
    thresh.delete();
    contours.delete();
    hierarchy.delete();
    kernel.delete();
    return null;
  }

  // IRIS detection: try HoughCircles first on Canny edges
  let iris = null;
  try {
    // detect edges from blurred image
    let edges = new cv.Mat();
    cv.Canny(blurred, edges, 50, 150);
    let circles = new cv.Mat();
    // We expect iris radius larger than pupil. Set minRadius > pupil.r*1.4
    const minR = Math.max(Math.round(pupil.r * 1.4), 10);
    const maxR = Math.round(Math.min(blurred.cols, blurred.rows) / 2);
    cv.HoughCircles(edges, circles, cv.HOUGH_GRADIENT, 1.5, pupil.r, 100, 30, minR, maxR);
    if (circles.size() > 0) {
      // pick circle that contains pupil center and whose radius is > pupil.r*1.2
      const data = circles.data32F;
      for (let i = 0; i < data.length; i += 3) {
        const cx = data[i],
          cy = data[i + 1],
          cr = data[i + 2];
        const d = Math.hypot(cx - pupil.x, cy - pupil.y);
        if (cr > pupil.r * 1.2 && d + pupil.r <= cr + 4) { // allow small margin
          iris = {
            x: Math.round(cx),
            y: Math.round(cy),
            r: Math.round(cr)
          };
          break;
        }
      }
      // if none matched, pick the circle whose center is closest to pupil center
      if (!iris && circles.size() > 0) {
        let bestIdx = 0;
        let bestDist = 1e9;
        for (let i = 0; i < data.length; i += 3) {
          const cx = data[i],
            cy = data[i + 1],
            cr = data[i + 2];
          const d = Math.hypot(cx - pupil.x, cy - pupil.y);
          if (d < bestDist) {
            bestDist = d;
            bestIdx = i;
          }
        }
        iris = {
          x: Math.round(data[bestIdx]),
          y: Math.round(data[bestIdx + 1]),
          r: Math.round(data[bestIdx + 2])
        };
        // ensure iris contains pupil
        if (Math.hypot(iris.x - pupil.x, iris.y - pupil.y) + pupil.r > iris.r) {
          iris.r = Math.round(Math.hypot(iris.x - pupil.x, iris.y - pupil.y) + pupil.r + 2);
        }
      }
    }
    edges.delete();
    circles.delete();
  } catch (err) {
    console.warn('iris hough failed', err);
  }

  // If Hough fails, fallback to Daugman-like radial derivative search (sample intensities on circles around pupil center)
  if (!iris) {
    try {
      const centerX = pupil.x,
        centerY = pupil.y;
      const rmin = Math.max(Math.round(pupil.r * 1.4), pupil.r + 6);
      const rmax = Math.round(Math.min(blurred.cols, blurred.rows) / 2);
      const samples = 360; // sample points around circle
      // function to compute mean intensity along circle with radius r
      const meanAlongCircle = (r) => {
        let sum = 0,
          cnt = 0;
        for (let t = 0; t < samples; t++) {
          const theta = (t / samples) * Math.PI * 2;
          const x = Math.round(centerX + r * Math.cos(theta));
          const y = Math.round(centerY + r * Math.sin(theta));
          if (x >= 0 && x < blurred.cols && y >= 0 && y < blurred.rows) {
            sum += blurred.ucharPtr(y)[x];
            cnt++;
          }
        }
        return cnt > 0 ? (sum / cnt) : 0;
      };
      // compute means for radii range and their derivative
      let prev = meanAlongCircle(rmin);
      let bestR = -1;
      let bestResp = 0;
      for (let r = rmin + 1; r <= Math.min(rmax, rmin + 150); r++) {
        const cur = meanAlongCircle(r);
        const resp = Math.abs(cur - prev);
        if (resp > bestResp) {
          bestResp = resp;
          bestR = r;
        }
        prev = cur;
      }
      if (bestR > 0) {
        iris = {
          x: centerX,
          y: centerY,
          r: bestR
        };
      }
    } catch (err) {
      console.warn('iris radial search failed', err);
    }
  }

  // final sanity checks
  if (iris) {
    // ensure iris contains pupil
    const d = Math.hypot(iris.x - pupil.x, iris.y - pupil.y);
    if (d + pupil.r > iris.r) iris.r = Math.round(d + pupil.r + 2);
    // clamp to image bounds
    iris.r = Math.min(iris.r, Math.round(Math.min(mat.cols, mat.rows) / 2));
  }

  // free mats
  mat.delete();
  blurred.delete();
  inv.delete();
  eroded.delete();
  thresh.delete();
  contours.delete();
  hierarchy.delete();
  kernel.delete();

  if (!iris) return {
    pupil: pupil,
    iris: {
      x: pupil.x,
      y: pupil.y,
      r: Math.round(pupil.r * 1.8)
    }
  }; // last resort - estimate
  return {
    pupil: pupil,
    iris: iris
  };
}
