// Edge-aware alpha refinement. RGB stays unchanged; the photo is never regenerated.
function boxMean(source, width, height, radius) {
  const horizontal = new Float32Array(source.length), output = new Float32Array(source.length);
  for (let y = 0; y < height; y++) {
    const row = y * width; let sum = 0;
    for (let x = 0; x <= Math.min(radius, width - 1); x++) sum += source[row + x];
    for (let x = 0; x < width; x++) {
      horizontal[row + x] = sum / (Math.min(width - 1, x + radius) - Math.max(0, x - radius) + 1);
      if (x - radius >= 0) sum -= source[row + x - radius];
      if (x + radius + 1 < width) sum += source[row + x + radius + 1];
    }
  }
  for (let x = 0; x < width; x++) {
    let sum = 0;
    for (let y = 0; y <= Math.min(radius, height - 1); y++) sum += horizontal[y * width + x];
    for (let y = 0; y < height; y++) {
      output[y * width + x] = sum / (Math.min(height - 1, y + radius) - Math.max(0, y - radius) + 1);
      if (y - radius >= 0) sum -= horizontal[(y - radius) * width + x];
      if (y + radius + 1 < height) sum += horizontal[(y + radius + 1) * width + x];
    }
  }
  return output;
}

export function refineAlpha(rgb, alpha, width, height) {
  const count = width * height;
  const guide = new Float32Array(count), mask = new Float32Array(count), square = new Float32Array(count), product = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const g = (.299 * rgb[i * 3] + .587 * rgb[i * 3 + 1] + .114 * rgb[i * 3 + 2]) / 255;
    guide[i] = g; mask[i] = alpha[i] / 255; square[i] = g * g; product[i] = g * mask[i];
  }
  const radius = 2, meanGuide = boxMean(guide, width, height, radius), meanMask = boxMean(mask, width, height, radius);
  const meanSquare = boxMean(square, width, height, radius), meanProduct = boxMean(product, width, height, radius);
  for (let i = 0; i < count; i++) {
    square[i] = (meanProduct[i] - meanGuide[i] * meanMask[i]) / (Math.max(0, meanSquare[i] - meanGuide[i] ** 2) + .001);
    product[i] = meanMask[i] - square[i] * meanGuide[i];
  }
  const a = boxMean(square, width, height, radius), b = boxMean(product, width, height, radius), output = Buffer.alloc(count);
  for (let i = 0; i < count; i++) {
    const value = Math.max(0, Math.min(1, .65 * mask[i] + .35 * (a[i] * guide[i] + b[i])));
    output[i] = value < .004 ? 0 : value > .996 ? 255 : Math.round(value * 255);
  }
  return output;
}
