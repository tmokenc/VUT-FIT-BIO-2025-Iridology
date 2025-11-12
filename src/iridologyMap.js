/**
 * Iridology Map Module
 * Creates an iridological chart overlay on detected iris
 */

// Radial zones for reference (used in drawIridologyMap)
const RADIAL_ZONES = [
    { name: 'Stomach', innerRatio: 0, outerRatio: 0.35 },
    { name: 'Intestines', innerRatio: 0.35, outerRatio: 0.65 },
    { name: 'Organs/Glands', innerRatio: 0.65, outerRatio: 0.85 },
    { name: 'Circulation/Lymph', innerRatio: 0.85, outerRatio: 0.95 },
    { name: 'Skin/Elimination', innerRatio: 0.95, outerRatio: 1.0 }
];

// Sector definitions for both eyes
const EYE_SECTORS = {
    left: [
        { name: 'Throat', startAngle: 0, endAngle: 3 },
        { name: 'Bronchi', startAngle: 3, endAngle: 7 },
        { name: 'Thyroid', startAngle: 7, endAngle: 10 },
        { name: 'Shoulder (L)', startAngle: 10, endAngle: 13 },
        { name: 'Arm (L)', startAngle: 13, endAngle: 17 },
        { name: 'Spleen', startAngle: 17, endAngle: 21 },
        { name: 'Stomach', startAngle: 21, endAngle: 25 },
        { name: 'Kidney (L)', startAngle: 25, endAngle: 29 },
        { name: 'Pancreas', startAngle: 29, endAngle: 31 },
        { name: 'Adrenal (L)', startAngle: 31, endAngle: 33 },
        { name: 'Descending Colon', startAngle: 33, endAngle: 38 },
        { name: 'Transverse Colon', startAngle: 38, endAngle: 40 },
        { name: 'Hip/Leg (L)', startAngle: 40, endAngle: 45 },
        { name: 'Lower Back', startAngle: 45, endAngle: 48 },
        { name: 'Sacral/Coccyx', startAngle: 48, endAngle: 50 },
        { name: 'Prostate/Uterus', startAngle: 50, endAngle: 53 },
        { name: 'Bladder', startAngle: 53, endAngle: 55 },
        { name: 'Lung (L)', startAngle: 55, endAngle: 60 }
    ],
    right: [
        { name: 'Throat', startAngle: 0, endAngle: 3 },
        { name: 'Bronchi', startAngle: 3, endAngle: 7 },
        { name: 'Thyroid', startAngle: 7, endAngle: 10 },
        { name: 'Shoulder (R)', startAngle: 10, endAngle: 13 },
        { name: 'Arm (R)', startAngle: 13, endAngle: 17 },
        { name: 'Gallbladder', startAngle: 17, endAngle: 19 },
        { name: 'Liver', startAngle: 19, endAngle: 25 },
        { name: 'Kidney (R)', startAngle: 25, endAngle: 29 },
        { name: 'Appendix', startAngle: 29, endAngle: 31 },
        { name: 'Ileocecal Valve', startAngle: 31, endAngle: 33 },
        { name: 'Ascending Colon', startAngle: 33, endAngle: 38 },
        { name: 'Transverse Colon', startAngle: 38, endAngle: 40 },
        { name: 'Hip/Leg (R)', startAngle: 40, endAngle: 45 },
        { name: 'Lower Back', startAngle: 45, endAngle: 48 },
        { name: 'Sacral/Coccyx', startAngle: 48, endAngle: 50 },
        { name: 'Prostate/Uterus', startAngle: 50, endAngle: 53 },
        { name: 'Bladder', startAngle: 53, endAngle: 55 },
        { name: 'Lung (R)', startAngle: 55, endAngle: 60 }
    ]
};


/**
 * Extract iris as circular image with padding for labels
 * @param {cv.Mat} srcMat - Source image matrix
 * @param {object} iris - Iris circle {x, y, r}
 * @param {object} pupil - Pupil circle {x, y, r}
 * @returns {cv.Mat} - Extracted iris as square image with padding
 */
export function unwrapIris(srcMat, iris, pupil) {
    const centerX = iris.x;
    const centerY = iris.y;
    const irisRadius = iris.r;

    // Create square canvas with padding for labels
    const padding = Math.round(irisRadius * 0.4);
    const size = Math.round(irisRadius * 2 + padding * 2);
    const extracted = new cv.Mat(size, size, srcMat.type());

    // Fill with white background
    extracted.setTo(new cv.Scalar(255, 255, 255, 255));

    // Pre-calculate half size for centering
    const halfSize = size / 2;
    const radiusSq = irisRadius * irisRadius;
    const channels = srcMat.channels();
    const srcCols = srcMat.cols;
    const srcRows = srcMat.rows;
    const srcData = srcMat.data;
    const dstData = extracted.data;

    // Optimized pixel copying with boundary checking
    let srcIdx, dstIdx;
    for (let y = 0; y < size; y++) {
        const relY = y - halfSize;
        const dstRowStart = y * size;

        for (let x = 0; x < size; x++) {
            const relX = x - halfSize;

            // Check if within iris radius (using squared distance to avoid sqrt)
            if (relX * relX + relY * relY <= radiusSq + 4) {
                const srcX = Math.round(centerX + relX);
                const srcY = Math.round(centerY + relY);

                // Copy pixel if within source bounds
                if (srcX >= 0 && srcX < srcCols && srcY >= 0 && srcY < srcRows) {
                    srcIdx = (srcY * srcCols + srcX) * channels;
                    dstIdx = (dstRowStart + x) * channels;

                    // Copy all channels
                    for (let c = 0; c < channels; c++) {
                        dstData[dstIdx + c] = srcData[srcIdx + c];
                    }
                }
            }
        }
    }

    return extracted;
}

// Cache for SVG images
const svgCache = {};

/**
 * Load SVG as image (async)
 * @param {string} path - Path to SVG file
 * @returns {Promise} - Promise that resolves with the image
 */
function loadSVGImage(path) {
    return new Promise((resolve, reject) => {
        if (svgCache[path]) {
            resolve(svgCache[path]);
            return;
        }

        const img = new Image();
        img.onload = () => {
            svgCache[path] = img;
            resolve(img);
        };
        img.onerror = () => reject(new Error(`Failed to load ${path}`));
        img.src = path;
    });
}

/**
 * Draw detailed iridology map on extracted iris image
 * @param {CanvasRenderingContext2D} ctx - Canvas context
 * @param {number} size - Canvas size (square)
 * @param {string} eye - 'left' or 'right'
 * @param {object} options - Display options
 */
export async function drawUnwrappedIridologyMap(ctx, size, eye = 'right', options = {}) {
    ctx.save();

    const center = size / 2;

    // The iris was extracted with 40% padding, so calculate actual iris radius
    // size = irisRadius * 2 + padding * 2, where padding = irisRadius * 0.4
    // size = irisRadius * 2 + irisRadius * 0.8 = irisRadius * 2.8
    // irisRadius = size / 2.8
    const irisRadius = size / 2.8;

    // Choose SVG file based on eye
    const svgFile = eye === 'left' ? '/left.svg' : '/right.svg';

    try {
        const img = await loadSVGImage(svgFile);

        // Scale SVG to match iris diameter (not canvas size)
        // The SVG should fit within the iris circle
        const svgDiameter = Math.max(img.width, img.height);
        const irisDiameter = irisRadius * 2;
        const scale = irisDiameter / svgDiameter;

        // Scale the SVG image
        const scaledWidth = img.width * scale;
        const scaledHeight = img.height * scale;

        // Center the scaled SVG on the canvas center
        const x = center - scaledWidth / 2;
        const y = center - scaledHeight / 2;

        // Draw the SVG map at proper iris size
        ctx.drawImage(img, x, y, scaledWidth, scaledHeight);
    } catch (error) {
        console.error('Error loading SVG map:', error);

        // Fallback: draw simple grid if SVG fails to load
        drawSimpleGrid(ctx, size);
    }

    ctx.restore();
}

/**
 * Draw simple grid as fallback
 */
function drawSimpleGrid(ctx, size) {
    const center = size / 2;
    const irisRadius = size / 2 - 2;

    // Fine circles
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.25)';
    ctx.lineWidth = 0.8;

    for (let r = 0.05; r < 1.0; r += 0.05) {
        ctx.beginPath();
        ctx.arc(center, center, irisRadius * r, 0, Math.PI * 2);
        ctx.stroke();
    }

    // Main zone boundaries
    const zoneRatios = [0.20, 0.35, 0.50, 0.65, 0.80, 0.90];

    ctx.strokeStyle = 'rgba(0, 0, 0, 0.65)';
    ctx.lineWidth = 1.2;

    zoneRatios.forEach(ratio => {
        ctx.beginPath();
        ctx.arc(center, center, irisRadius * ratio, 0, Math.PI * 2);
        ctx.stroke();
    });

    // Outer boundary
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.8)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(center, center, irisRadius, 0, Math.PI * 2);
    ctx.stroke();

    // Radial lines
    for (let i = 0; i < 60; i++) {
        const angle = (i / 60) * Math.PI * 2 - Math.PI / 2;

        if (i % 5 === 0) {
            ctx.strokeStyle = 'rgba(0, 0, 0, 0.75)';
            ctx.lineWidth = 1.0;
        } else {
            ctx.strokeStyle = 'rgba(0, 0, 0, 0.25)';
            ctx.lineWidth = 0.5;
        }

        ctx.beginPath();
        ctx.moveTo(center, center);
        ctx.lineTo(center + irisRadius * Math.cos(angle), center + irisRadius * Math.sin(angle));
        ctx.stroke();
    }
}/**
 * Draw iridology map on canvas
 * @param {CanvasRenderingContext2D} ctx - Canvas context
 * @param {object} iris - Iris circle {x, y, r}
 * @param {object} pupil - Pupil circle {x, y, r}
 * @param {string} eye - 'left' or 'right'
 * @param {object} options - Display options
 */
export function drawIridologyMap(ctx, iris, pupil, eye = 'right', options = {}) {
    const {
        showRadialZones = true,
        showSectors = true,
        showLabels = true,
        showGrid = true,
        showClockNumbers = true,
        opacity = 1.0
    } = options;

    const centerX = iris.x;
    const centerY = iris.y;
    const irisRadius = iris.r;
    const pupilRadius = pupil.r;
    const effectiveRadius = irisRadius - pupilRadius;

    ctx.save();

    // Draw radial zones (concentric circles)
    if (showRadialZones && showGrid) {
        ctx.strokeStyle = 'rgba(0, 0, 0, 1)';
        ctx.lineWidth = 1;

        RADIAL_ZONES.forEach(zone => {
            const outerR = pupilRadius + zone.outerRatio * effectiveRadius;
            ctx.beginPath();
            ctx.arc(centerX, centerY, outerR, 0, Math.PI * 2);
            ctx.stroke();
        });
    }

    // Draw sectoral divisions
    if (showSectors && showGrid) {
        const sectors = EYE_SECTORS[eye];
        ctx.strokeStyle = 'rgba(0, 0, 0, 1)';
        ctx.lineWidth = 1;

        sectors.forEach(sector => {
            const startAngleRad = (sector.startAngle / 60) * Math.PI * 2 - Math.PI / 2;
            ctx.beginPath();
            ctx.moveTo(centerX, centerY);
            ctx.lineTo(
                centerX + irisRadius * Math.cos(startAngleRad),
                centerY + irisRadius * Math.sin(startAngleRad)
            );
            ctx.stroke();
        });
    }

    if (showClockNumbers) {
        drawClockNumbers(ctx, iris, pupil, opacity);
    }

    if (showLabels) {
        drawZoneLabels(ctx, iris, pupil, eye, opacity);
    }

    ctx.restore();
}

/**
 * Draw clock numbers around the iris (0, 5, 10, 15, ... 55)
 */
function drawClockNumbers(ctx, iris, pupil, opacity = 1.0) {
    const centerX = iris.x;
    const centerY = iris.y;
    const irisRadius = iris.r;
    const numberRadius = irisRadius + 15; // Position numbers outside iris

    ctx.fillStyle = `rgba(0, 0, 0, ${opacity})`;
    ctx.font = 'bold 10px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // Draw numbers at 5-minute intervals (0, 5, 10, ... 55)
    for (let i = 0; i < 60; i += 5) {
        const angleRad = (i / 60) * Math.PI * 2 - Math.PI / 2;
        const x = centerX + numberRadius * Math.cos(angleRad);
        const y = centerY + numberRadius * Math.sin(angleRad);

        ctx.fillText(i.toString(), x, y);
    }
}

/**
 * Draw labels for each sector
 */
function drawZoneLabels(ctx, iris, pupil, eye, opacity = 1.0) {
    const centerX = iris.x;
    const centerY = iris.y;
    const irisRadius = iris.r;
    const labelRadius = irisRadius + 35;

    const sectors = EYE_SECTORS[eye];

    ctx.fillStyle = `rgba(51, 51, 51, ${opacity})`;
    ctx.font = 'bold 10px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    sectors.forEach(sector => {
        const midPosition = (sector.startAngle + sector.endAngle) / 2;
        const angleRad = (midPosition / 60) * Math.PI * 2 - Math.PI / 2;

        const x = centerX + labelRadius * Math.cos(angleRad);
        const y = centerY + labelRadius * Math.sin(angleRad);

        // Draw label background
        const metrics = ctx.measureText(sector.name);
        const padding = 3;
        ctx.fillStyle = `rgba(255, 255, 255, ${0.9 * opacity})`;
        ctx.fillRect(
            x - metrics.width / 2 - padding,
            y - 6,
            metrics.width + padding * 2,
            12
        );

        // Draw label text
        ctx.fillStyle = `rgba(51, 51, 51, ${opacity})`;
        ctx.fillText(sector.name, x, y);
    });
}

/**
 * Draw a legend explaining the radial zones
 */
export function drawRadialZoneLegend(ctx, x, y) {
    ctx.save();
    ctx.font = '12px Arial';
    ctx.textAlign = 'left';

    let offsetY = 0;
    ctx.fillStyle = '#000';
    ctx.font = 'bold 14px Arial';
    ctx.fillText('Radial Zones:', x, y + offsetY);
    offsetY += 20;

    ctx.font = '12px Arial';
    RADIAL_ZONES.forEach(zone => {
        // Draw label
        ctx.fillStyle = '#333';
        ctx.fillText(zone.name, x, y + offsetY);
        offsetY += 20;
    });

    ctx.restore();
}

/**
 * Create interactive iridology map with hover tooltips
 */
export function createInteractiveMap(canvas, iris, pupil, eye = 'right') {
    const sectors = EYE_SECTORS[eye];

    const handleMouseMove = (event) => {
        const rect = canvas.getBoundingClientRect();
        const dx = event.clientX - rect.left - iris.x;
        const dy = event.clientY - rect.top - iris.y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        // Check if mouse is within iris (outside pupil)
        if (distance >= pupil.r && distance <= iris.r) {
            // Calculate clock position (0-60)
            let angle = Math.atan2(dy, dx) * 180 / Math.PI + 90;
            if (angle < 0) angle += 360;
            let clockPosition = (angle / 360) * 60;

            // Find which sector
            const sector = sectors.find(s =>
                clockPosition >= s.startAngle && clockPosition < s.endAngle
            );

            // Find which radial zone
            const radiusFromPupil = distance - pupil.r;
            const effectiveRadius = iris.r - pupil.r;
            const ratio = radiusFromPupil / effectiveRadius;
            const radialZone = RADIAL_ZONES.find(z => ratio >= z.innerRatio && ratio < z.outerRatio);

            if (sector || radialZone) {
                canvas.title = `${sector ? sector.name : ''} ${radialZone ? '(' + radialZone.name + ')' : ''}`;
                canvas.style.cursor = 'pointer';
                return;
            }
        }

        canvas.title = '';
        canvas.style.cursor = 'default';
    };

    canvas.addEventListener('mousemove', handleMouseMove);
    return () => canvas.removeEventListener('mousemove', handleMouseMove);
}
