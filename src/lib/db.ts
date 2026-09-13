import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { AppSettings, AppState, Block, FlightSession } from '@/types';
import { DEFAULT_SETTINGS } from '@/lib/defaults';

interface TimeFlightDB extends DBSchema {
  settings: { key: string; value: AppSettings };
  sessions: { key: string; value: FlightSession };
  blocks: { key: string; value: Block; indexes: { 'by-session': string } };
}

let dbPromise: Promise<IDBPDatabase<TimeFlightDB>> | null = null;

function getDb() {
  if (!dbPromise) {
    dbPromise = openDB<TimeFlightDB>('time-flight', 2, {
      upgrade(db, oldVersion) {
        if (oldVersion < 2) {
          // 新版数据模型不兼容旧版，直接清空重建
          for (const name of Array.from(db.objectStoreNames)) {
            db.deleteObjectStore(name);
          }
        }
        db.createObjectStore('settings');
        db.createObjectStore('sessions', { keyPath: 'id' });
        const blocks = db.createObjectStore('blocks', { keyPath: 'id' });
        blocks.createIndex('by-session', 'sessionId');
      },
    });
  }
  return dbPromise;
}

export async function loadSettings(): Promise<AppSettings> {
  const db = await getDb();
  const stored = await db.get('settings', 'app');
  if (!stored) {
    await db.put('settings', DEFAULT_SETTINGS, 'app');
    return structuredClone(DEFAULT_SETTINGS);
  }
  // 合并默认值，兼容后续新增字段
  return {
    ...DEFAULT_SETTINGS,
    ...stored,
    stats: { ...DEFAULT_SETTINGS.stats, ...stored.stats },
  };
}

export async function saveSettings(settings: AppSettings): Promise<void> {
  const db = await getDb();
  await db.put('settings', settings, 'app');
}

export async function loadActiveSession(): Promise<{
  session: FlightSession | null;
  blocks: Block[];
}> {
  const db = await getDb();
  const sessions = await db.getAll('sessions');
  const session =
    sessions.find((s) => s.status !== 'dayEnd' && s.status !== 'cancelled') ?? null;

  if (!session) return { session: null, blocks: [] };

  const blocks = (await db.getAllFromIndex('blocks', 'by-session', session.id)).sort(
    (a, b) => a.order - b.order,
  );
  return { session, blocks };
}

export async function persistState(
  session: FlightSession | null,
  blocks: Block[],
): Promise<void> {
  const db = await getDb();
  if (session) {
    await db.put('sessions', session);
    const existing = await db.getAllFromIndex('blocks', 'by-session', session.id);
    for (const b of existing) await db.delete('blocks', b.id);
    for (const b of blocks) await db.put('blocks', b);
  }
}

export async function loadFullState(): Promise<AppState> {
  const settings = await loadSettings();
  const { session, blocks } = await loadActiveSession();
  return { settings, session, blocks };
}

export async function clearSession(): Promise<void> {
  const db = await getDb();
  const { session } = await loadActiveSession();
  if (session) {
    await db.delete('sessions', session.id);
    const blocks = await db.getAllFromIndex('blocks', 'by-session', session.id);
    for (const b of blocks) await db.delete('blocks', b.id);
  }
}

/** 开启新航程时全量替换（同时清掉上一趟航程的残留数据） */
export async function replaceSession(session: FlightSession, blocks: Block[]): Promise<void> {
  const db = await getDb();
  await db.clear('sessions');
  await db.clear('blocks');
  await db.put('sessions', session);
  for (const block of blocks) {
    await db.put('blocks', block);
  }
}
