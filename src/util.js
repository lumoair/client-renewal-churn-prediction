export function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export function randomFloat(min, max) {
  return Number((Math.random() * (max - min) + min).toFixed(2));
}

export function randomBool(probabilityTrue) {
  return Math.random() < probabilityTrue ? 1 : 0;
}
