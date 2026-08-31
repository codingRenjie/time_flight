import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type {
  AppSettings,
  AppState,
  Block,
  EveningSession,
  MorningQueueItem,
} from '@/types';
import { DEFAULT_SETTINGS } from '@/lib/defaults';

interface TimeFlightDB extends DBSchema {
  settings: { key: string; value: AppSettings };
  sessions: { key: string; value: EveningSession };
  blocks: { key: string; value: Block; indexes: { 'by-session': string } };
  morningQueue: { key: string; value: MorningQueueItem };
}

let dbPromise: Promise<IDBPDatabase<TimeFlightDB>> | null = null;

function getDb() {
  if (!dbPromise) {
    dbPromise = openDB<TimeFlightDB>('time-flight', 1, {
      upgrade(db) {
        db.createObjectStore('settings');
        db.createObjectStore('sessions', { keyPath: 'id' });
        const blocks = db.createObjectStore('blocks', { keyPath: 'id' });
        blocks.createIndex('by-session', 'sessionId');
        db.createObjectStore('morningQueue', { keyPath: 'id' });
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
  return {
    ...DEFAULT_SETTINGS,
    ...stored,
    templates: stored.templates?.length ? stored.templates : DEFAULT_SETTINGS.templates,
  };
}

function normalizeSession(session: EveningSession): EveningSession {
  return {
    ...session,
    checkpoint: session.checkpoint ?? null,
    overtimeDrainCycleIndex: session.overtimeDrainCycleIndex ?? null,
    overtimeDrainNextTargetId: session.overtimeDrainNextTargetId ?? null,
    voyageExtended: session.voyageExtended ?? false,
  };
}

function normalizeBlock(block: Block): Block {
  return {
    ...block,
    activeBudgetMinutes: block.activeBudgetMinutes ?? null,
    remainingBudgetMinutes: block.remainingBudgetMinutes ?? block.plannedDurationMinutes,
  };
}

export async function saveSettings(settings: AppSettings): Promise<void> {
  const db = await getDb();
  await db.put('settings', settings, 'app');
}

export async function loadActiveSession(): Promise<{
  session: EveningSession | null;
  blocks: Block[];
  morningQueue: MorningQueueItem[];
}> {
  const db = await getDb();
  const today = new Date().toISOString().slice(0, 10);
  const sessions = await db.getAll('sessions');
  const session =
    sessions.find((s) => s.date === today && s.status !== 'dayEnd') ??
    sessions.find((s) => s.status !== 'dayEnd') ??
    null;

  if (!session) {
    return { session: null, blocks: [], morningQueue: await db.getAll('morningQueue') };
  }

  const blocks = (await db.getAllFromIndex('blocks', 'by-session', session.id))
    .map(normalizeBlock)
    .sort((a, b) => a.order - b.order);
  const morningQueue = await db.getAll('morningQueue');
  return { session: normalizeSession(session), blocks, morningQueue };
}

export async function persistState(
  session: EveningSession | null,
  blocks: Block[],
  morningQueue: MorningQueueItem[],
): Promise<void> {
  const db = await getDb();
  if (session) {
    await db.put('sessions', session);
    const existing = await db.getAllFromIndex('blocks', 'by-session', session.id);
    for (const b of existing) await db.delete('blocks', b.id);
    for (const b of blocks) await db.put('blocks', b);
  }
  const allQueue = await db.getAll('morningQueue');
  for (const q of allQueue) await db.delete('morningQueue', q.id);
  for (const q of morningQueue) await db.put('morningQueue', q);
}

export async function loadFullState(): Promise<AppState> {
  const settings = await loadSettings();
  const { session, blocks, morningQueue } = await loadActiveSession();
  return { settings, session, blocks, morningQueue };
}

export async function clearTodaySession(): Promise<void> {
  const db = await getDb();
  const { session } = await loadActiveSession();
  if (session) {
    await db.delete('sessions', session.id);
    const blocks = await db.getAllFromIndex('blocks', 'by-session', session.id);
    for (const b of blocks) await db.delete('blocks', b.id);
  }
}
