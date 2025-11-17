/// Warps an SVG canvas by remapping radial distances.
/// This is to match different proportions of iris and pupil sizes.
export function warpSVGCanvas(
    sourceCanvas,
    dstInner,
    dstMiddle,
    srcInner = 0.19,
    srcMiddle = 0.45
) {
    const w = sourceCanvas.width;
    const h = sourceCanvas.height;

    const cx = w / 2;
    const cy = h / 2;
    const outer = Math.min(w, h) / 2;

    const srcInnerR = srcInner * outer;
    const srcMiddleR = srcMiddle * outer;
    const srcOuterR = outer;

    const dstInnerR = dstInner * outer;
    const dstMiddleR = dstMiddle * outer;
    const dstOuterR = outer;

    const out = document.createElement("canvas");
    out.width = w;
    out.height = h;
    const octx = out.getContext("2d");

    const srcCtx = sourceCanvas.getContext("2d");
    const srcData = srcCtx.getImageData(0, 0, w, h);
    const srcPixels = srcData.data;

    const dstData = octx.createImageData(w, h);
    const dstPixels = dstData.data;

    function mapR(r) {
        if (r <= dstInnerR) {
            return (r / dstInnerR) * srcInnerR;
        }
        if (r <= dstMiddleR) {
            return srcInnerR + (r - dstInnerR) *
                (srcMiddleR - srcInnerR) / (dstMiddleR - dstInnerR);
        }
        return srcMiddleR + (r - dstMiddleR) *
            (srcOuterR - srcMiddleR) / (dstOuterR - dstMiddleR);
    }

    function bilinearSample(x, y) {
        const x0 = Math.floor(x);
        const y0 = Math.floor(y);
        const x1 = Math.min(x0 + 1, w - 1);
        const y1 = Math.min(y0 + 1, h - 1);

        const dx = x - x0;
        const dy = y - y0;

        const i00 = (y0 * w + x0) * 4;
        const i10 = (y0 * w + x1) * 4;
        const i01 = (y1 * w + x0) * 4;
        const i11 = (y1 * w + x1) * 4;

        function lerp(a, b, t) { return a + (b - a) * t; }

        const rTop = lerp(srcPixels[i00], srcPixels[i10], dx);
        const rBot = lerp(srcPixels[i01], srcPixels[i11], dx);
        const gTop = lerp(srcPixels[i00 + 1], srcPixels[i10 + 1], dx);
        const gBot = lerp(srcPixels[i01 + 1], srcPixels[i11 + 1], dx);
        const bTop = lerp(srcPixels[i00 + 2], srcPixels[i10 + 2], dx);
        const bBot = lerp(srcPixels[i01 + 2], srcPixels[i11 + 2], dx);
        const aTop = lerp(srcPixels[i00 + 3], srcPixels[i10 + 3], dx);
        const aBot = lerp(srcPixels[i01 + 3], srcPixels[i11 + 3], dx);

        return [
            lerp(rTop, rBot, dy),
            lerp(gTop, gBot, dy),
            lerp(bTop, bBot, dy),
            lerp(aTop, aBot, dy)
        ];
    }

    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            const dx = x - cx;
            const dy = y - cy;
            const r = Math.sqrt(dx * dx + dy * dy);
            const theta = Math.atan2(dy, dx);

            const mappedR = mapR(r);

            const sx = cx + mappedR * Math.cos(theta);
            const sy = cy + mappedR * Math.sin(theta);

            const di = (y * w + x) * 4;

            if (sx >= 0 && sx < w - 1 && sy >= 0 && sy < h - 1) {
                const [R, G, B, A] = bilinearSample(sx, sy);
                dstPixels[di] = R;
                dstPixels[di + 1] = G;
                dstPixels[di + 2] = B;
                dstPixels[di + 3] = A;
            }
        }
    }

    octx.putImageData(dstData, 0, 0);
    return out;
}
