export const clamp = (val, min, max) => Math.min(Math.max(val, min), max);
export const lerp = (a, b, t) => a + (b - a) * t;
export const average = (...nums) => nums.reduce((sum, n) => sum + n, 0) / nums.length;
