import { HEROES, getMode } from './game.js';
import { normalizeStudy } from './study.js';
import { normalizePlatformRun } from './platform-engine.js';
const DATABASE_NAME = 'make-ten-adventure';
const STORE_NAME = 'saves';
const BACKUP_KEY = 'make-ten-adventure:save:v1';
let connection;
let queue = Promise.resolve();

export function emptySave() {
  return { version: 1, diamonds: 0, selectedHero: 'bunny', selectedMode: 'within20', sound: true, volume: 1.5, study: normalizeStudy(), activeRound: null, history: [], platformRun: null, platformHistory: [], lastView: 'lobby' };
}

export function normalizeSave(value) {
  if (!value || value.version !== 1) return emptySave();
  return {
    ...emptySave(), ...value,
    diamonds: Number.isSafeInteger(value.diamonds) && value.diamonds >= 0 ? value.diamonds : 0,
    selectedHero: HEROES.some(hero => hero.id === value.selectedHero) ? value.selectedHero : 'bunny',
    selectedMode: getMode(value.selectedMode).id,
    volume: Number.isFinite(value.volume) ? Math.max(0, Math.min(2, value.volume)) : 1.5,
    history: Array.isArray(value.history) ? value.history : [],
    study: normalizeStudy(value.study),
    platformRun: HEROES.some(hero => hero.id === value.platformRun?.heroId) ? normalizePlatformRun(value.platformRun) : null,
    platformHistory: Array.isArray(value.platformHistory) ? value.platformHistory : [],
  };
}

function openDatabase() {
  if (!connection) {
    connection = new Promise((resolve, reject) => {
      if (!globalThis.indexedDB) return reject(new Error('本地数据库不可用'));
      const request = indexedDB.open(DATABASE_NAME, 1);
      request.onupgradeneeded = () => request.result.createObjectStore(STORE_NAME);
      request.onerror = () => reject(request.error);
      request.onblocked = () => reject(new Error('请关闭其他游戏页面后再试'));
      request.onsuccess = () => {
        const database = request.result;
        database.onversionchange = () => { database.close(); connection = undefined; };
        resolve(database);
      };
    });
  }
  return connection;
}

export async function loadSave() {
  let backup;
  try { backup = JSON.parse(localStorage.getItem(BACKUP_KEY)); } catch { /* No backup. */ }
  try {
    const database = await openDatabase();
    const value = await new Promise((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, 'readonly');
      const request = transaction.objectStore(STORE_NAME).get('player');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    if (value || backup) return normalizeSave((backup?.updatedAt || 0) > (value?.updatedAt || 0) ? backup : value || backup);
  } catch { /* 使用浏览器本地备用存档。 */ }
  return normalizeSave(backup);
}

export function saveProgress(value) {
  const snapshot = structuredClone(value);
  snapshot.updatedAt = Date.now();
  const operation = queue.catch(() => {}).then(async () => {
    let backupSaved = false;
    try { localStorage.setItem(BACKUP_KEY, JSON.stringify(snapshot)); backupSaved = true; } catch { /* IndexedDB is primary. */ }
    try {
      const database = await openDatabase();
      await new Promise((resolve, reject) => {
        // 余额与答题记录在同一事务内提交，刷新不能重复领取同一题奖励。
        const transaction = database.transaction(STORE_NAME, 'readwrite');
        transaction.objectStore(STORE_NAME).put(snapshot, 'player');
        transaction.oncomplete = resolve;
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error);
      });
    } catch (error) { if (!backupSaved) throw error; }
  });
  queue = operation;
  return operation;
}
