import { ADDITIONAL_PROJECTILES } from './produce-projectiles.js';
import { INSECT_PROJECTILES } from './insect-projectiles.js';
const svg = body => `<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
export const PROJECTILES = [
  { id: 'star', name: '星星', flight: 'star', art: svg('<path d="m32 4 8 18 20 3-15 14 4 20-17-10-18 10 4-20L3 25l21-3Z" fill="#ffda63" stroke="#e9ae43" stroke-width="3"/>') },
  { id: 'heart', name: '桃心', flight: 'heart', art: svg('<path d="M32 55C-9 30 7-6 32 16 57-6 73 30 32 55Z" fill="#fa8cab" stroke="#da6585" stroke-width="3"/><path d="M15 22q2-7 9-4" fill="none" stroke="#ffe4ec" stroke-width="4"/>') },
  { id: 'flame', name: '火焰', flight: 'flame', art: svg('<path d="M38 3c8 21-6 20 7 28 1-5 6-9 6-9 21 35-34 49-43 20C3 25 22 20 24 9c9 9 6 16 9 19C40 19 32 13 38 3Z" fill="#ff9a48" stroke="#e77835" stroke-width="2"/><path d="M32 30c13 15 17 23 0 27-18-4-10-17 0-27Z" fill="#ffe16c"/>') },
  { id: 'lightning', name: '闪电', flight: 'lightning', art: svg('<path d="M35 2 10 36h19l-2 26L56 24H37l9-22Z" fill="#ffe36b" stroke="#e6b64a" stroke-width="3"/>') },
  { id: 'tornado', name: '龙卷风', flight: 'tornado', art: svg('<path d="M8 12q24-14 48 0M5 21q27-12 54 0M12 30q22-10 42 0M20 39q15-7 26 0M27 47q8-4 12 0M33 54l-4 6" fill="none" stroke="#8dc8d8" stroke-width="6"/><path d="m48 7 6 3M18 29l7-2" stroke="#d9f6fb" stroke-width="3"/>') },
  { id: 'ice', name: '冰块', flight: 'ice', art: svg('<path d="m8 16 31-9 17 14-3 32-32 5L7 44Z" fill="#a4def1" stroke="#69b4d5" stroke-width="3"/><path d="m8 16 15 13 33-8M23 29l-2 29M39 7l-3 17" fill="none" stroke="#e0f8ff" stroke-width="3"/><path d="m30 37 9-3-1 12M13 27v12" fill="none" stroke="#f5ffff" stroke-width="3"/>') },
  { id: 'carrot', name: '胡萝卜', flight: 'carrot', art: svg('<path d="M22 20C4 28 25 62 30 61c5-1 26-38 10-42Z" fill="#ffad58" stroke="#d98840" stroke-width="3"/><path d="m28 20-9-14m13 13 3-16m1 17L48 8" fill="none" stroke="#79ba6c" stroke-width="6"/><path d="m20 31 8 2m5 8 7-2m-15 8 5 1" stroke="#df8d40" stroke-width="3"/>') },
  { id: 'cabbage', name: '卷心菜', flight: 'cabbage', art: svg('<circle cx="32" cy="34" r="26" fill="#a7d68d" stroke="#74ae67" stroke-width="3"/><path d="M12 22q24-22 32 7 26 0 9 20M8 41q23-19 30 14M21 10q-11 26 20 30M51 18q-27-11-23 17" fill="none" stroke="#d8efbb" stroke-width="5"/><path d="M20 54q7-14 1-23m20 22q-3-16 9-23" fill="none" stroke="#79b36b" stroke-width="2"/>') },
  { id: 'watermelon', name: '西瓜', flight: 'watermelon', art: svg('<path d="M4 17h56c-1 51-54 51-56 0Z" fill="#85bc77" stroke="#579f62" stroke-width="3"/><path d="M9 18h46c-3 39-42 39-46 0Z" fill="#e5efb6"/><path d="M13 18h38c-3 31-34 31-38 0Z" fill="#f59195"/><path d="m23 25 1 4m14-4-1 4m-6 7v3m13-6-2 3m-23-3 2 3" stroke="#6e5042" stroke-width="3"/>') },
  { id: 'pumpkin', name: '南瓜', flight: 'pumpkin', art: svg('<path d="M30 16q-3-9 5-12" fill="none" stroke="#7eaa65" stroke-width="7"/><ellipse cx="32" cy="36" rx="28" ry="23" fill="#f5b260" stroke="#db944c" stroke-width="3"/><ellipse cx="32" cy="36" rx="17" ry="23" fill="#ffc779" stroke="#e6a452" stroke-width="2"/><path d="M32 14v45" stroke="#df9b49" stroke-width="2"/>') },
  { id: 'eggplant', name: '茄子', flight: 'eggplant', art: svg('<path d="M41 15c27 11 8 46-22 45-27-2-8-17 1-19 10-3 4-22 21-26Z" fill="#aa8ad0" stroke="#8463b0" stroke-width="3"/><path d="m30 17 7-8 9 1 8 10-12-2-8 7Z" fill="#8fb86f" stroke="#72a05b" stroke-width="2"/><path d="m42 10 3-7" stroke="#72a05b" stroke-width="5"/><path d="M38 28q-5 19-18 22" fill="none" stroke="#d9c5ee" stroke-width="4"/>') },
  { id: 'bee', name: '小蜜蜂', flight: 'bee', art: svg('<g class="bee-wings" fill="#d4f0f8" stroke="#a1cbd5" stroke-width="2"><ellipse cx="27" cy="17" rx="10" ry="13" transform="rotate(-30 27 17)"/><ellipse cx="42" cy="17" rx="10" ry="13" transform="rotate(30 42 17)"/></g><path d="m8 37-7 5 9 2" fill="#805d40"/><ellipse cx="30" cy="39" rx="24" ry="17" fill="#ffdb72" stroke="#b89554" stroke-width="2"/><path d="M20 24v30m12-31v33" stroke="#86633e" stroke-width="7"/><circle cx="48" cy="34" r="12" fill="#ffe4a0"/><circle cx="53" cy="32" r="2.5" fill="#684832"/><path d="m45 23-2-6m7 5 2-6" stroke="#886744" stroke-width="2"/>') },
];
PROJECTILES.push(...ADDITIONAL_PROJECTILES, ...INSECT_PROJECTILES);
export const SPEED_FACTOR = .8 * .7;
export const LAUNCH_DELAY = 100;
export const KNOCKBACK_DURATION = 450;
export const VOLLEY_STAGGER = 180;
export function getProjectileCount(elapsedMs) {
  // Half of the former volley, rounded up so every correct answer still attacks.
  for (const [deadline, count] of [[3000,5],[5000,4],[7000,4],[8000,3],[10000,3],[15000,2],[20000,2]]) {
    if (elapsedMs <= deadline) return count;
  }
  return 1;
}
export function createVolley(elapsedMs, random = Math.random) {
  return Array.from({ length: getProjectileCount(elapsedMs) }, () => pickProjectile(random).id);
}
export function getAttackTiming(distance = 1, referenceDistance = 1) {
  const flightDuration = Math.ceil(600 * Math.max(1, distance) / Math.max(1, referenceDistance) / SPEED_FACTOR);
  const impactDelay = LAUNCH_DELAY + flightDuration;
  return { flightDuration, impactDelay, attackDuration: impactDelay + KNOCKBACK_DURATION };
}
export const IMPACT_DELAY = getAttackTiming().impactDelay;
export function pickProjectile(random = Math.random) { return PROJECTILES[Math.floor(random() * PROJECTILES.length)]; }
export function getProjectile(id) { return PROJECTILES.find(item => item.id === id) || PROJECTILES[0]; }
