import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { AppSettings, Block, EveningSession, Mood, MorningQueueItem, PlanBlockDraft } from '@/types';
import { loadFullState, persistState, saveSettings, clearTodaySession } from '@/lib/db';
import { keepFixedModuleSettings } from '@/lib/defaults';
import { getBlockOvertimeMinutes } from '@/lib/time';
import {
  advanceToNextBlock,
  processOvertimeDrain,
  buildCheckpoint,
  checkWindowEnd,
  createSessionFromPlan,
  extendVoyage,
  finishDay,
  cancelVoyage as markVoyageCancelled,
  landBlock,
  markSecondIncompleteAfterPriority,
  needsPrioritySelection,
  reorderBlocksByPriority,
} from '@/lib/sessionLogic';

interface AppContextValue {
  loading: boolean;
  settings: AppSettings;
  session: EveningSession | null;
  blocks: Block[];
  morningQueue: MorningQueueItem[];
  refresh: () => Promise<void>;
  updateSettings: (settings: AppSettings) => Promise<void>;
  confirmRoute: (drafts: PlanBlockDraft[]) => Promise<void>;
  landCurrentBlock: (queueNote?: string) => Promise<{ needsPriority: Block[] }>;
  toggleCurrentIncomplete: () => Promise<void>;
  applyPriorityOrder: (orderedIds: string[], firstId: string) => Promise<void>;
  extendVoyage: () => Promise<boolean>;
  setMood: (mood: Mood) => Promise<void>;
  resetToday: () => Promise<void>;
  planEpoch: number;
  tickFlying: () => Promise<void>;
  finishFreeFly: () => Promise<void>;
  dismissCheckpoint: () => Promise<void>;
  cancelVoyage: () => Promise<void>;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [session, setSession] = useState<EveningSession | null>(null);
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [morningQueue, setMorningQueue] = useState<MorningQueueItem[]>([]);
  const [planEpoch, setPlanEpoch] = useState(0);

  const refresh = useCallback(async () => {
    const state = await loadFullState();
    setSettings(state.settings);
    setSession(state.session);
    setBlocks(state.blocks);
    setMorningQueue(state.morningQueue);
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const saveAll = useCallback(
    async (
      nextSession: EveningSession | null,
      nextBlocks: Block[],
      nextQueue: MorningQueueItem[],
    ) => {
      setSession(nextSession);
      setBlocks(nextBlocks);
      setMorningQueue(nextQueue);
      await persistState(nextSession, nextBlocks, nextQueue);
    },
    [],
  );

  const updateSettings = useCallback(async (next: AppSettings) => {
    setSettings(next);
    await saveSettings(next);
  }, []);

  const confirmRoute = useCallback(
    async (drafts: PlanBlockDraft[]) => {
      if (!settings) return;
      const { session: s, blocks: b } = createSessionFromPlan(settings, drafts);
      await saveAll(s, b, morningQueue);
    },
    [settings, morningQueue, saveAll],
  );

  const landCurrentBlock = useCallback(
    async (queueNote?: string) => {
      if (!session) return { needsPriority: [] as Block[] };
      const current = blocks.find((b) => b.id === session.currentBlockId);
      if (!current) return { needsPriority: [] as Block[] };

      let nextSession = { ...session };
      let nextBlocks = blocks.map((b) => ({ ...b }));
      let nextQueue = [...morningQueue];
      const currentCopy = nextBlocks.find((b) => b.id === current.id)!;

      const result = landBlock(currentCopy, nextSession, nextBlocks, nextQueue, queueNote);
      nextSession = result.session;
      nextBlocks = result.blocks;
      nextQueue = result.morningQueue;

      const priority = needsPrioritySelection(nextBlocks, nextSession);
      if (priority.length >= 2) {
        nextSession.currentBlockId = null;
        await saveAll(nextSession, nextBlocks, nextQueue);
        return { needsPriority: priority };
      }

      nextSession.checkpoint = buildCheckpoint(
        currentCopy,
        nextBlocks,
        nextSession,
        result.earlyBonus,
      );
      nextSession.currentBlockId = null;
      await saveAll(nextSession, nextBlocks, nextQueue);
      return { needsPriority: [] as Block[] };
    },
    [session, blocks, morningQueue, saveAll],
  );

  const toggleCurrentIncomplete = useCallback(async () => {
    if (!session) return;
    const current = blocks.find((b) => b.id === session.currentBlockId);
    if (!current || current.status !== 'flying') return;
    const nextBlocks = blocks.map((b) =>
      b.id === current.id ? { ...b, markedIncomplete: !b.markedIncomplete } : b,
    );
    await saveAll(session, nextBlocks, morningQueue);
  }, [session, blocks, morningQueue, saveAll]);

  const applyPriorityOrder = useCallback(
    async (orderedIds: string[], firstId: string) => {
      if (!session) return;
      let nextBlocks = reorderBlocksByPriority([...blocks], orderedIds);
      let nextQueue = markSecondIncompleteAfterPriority(nextBlocks, firstId, session, morningQueue);
      let nextSession = { ...session };
      const lastLanded = [...nextBlocks]
        .filter((b) => b.status === 'landed')
        .sort((a, b) => (b.landedAt ?? '').localeCompare(a.landedAt ?? ''))[0];
      nextSession.checkpoint = buildCheckpoint(
        lastLanded ?? nextBlocks.find((b) => b.id === firstId)!,
        nextBlocks,
        nextSession,
        0,
      );
      nextSession.currentBlockId = null;
      await saveAll(nextSession, nextBlocks, nextQueue);
    },
    [session, blocks, morningQueue, saveAll],
  );

  const dismissCheckpoint = useCallback(async () => {
    if (!session) return;
    let nextSession: EveningSession = { ...session, checkpoint: null };
    const nextBlocks = blocks.map((b) => ({ ...b }));
    const next = advanceToNextBlock(nextBlocks, nextSession);
    if (!next && checkWindowEnd(nextSession)) {
      nextSession = finishDay(nextSession);
    } else if (!next) {
      const free = nextBlocks.find((b) => b.type === 'free' && b.remainingBudgetMinutes <= 0);
      if (free) nextSession = finishDay(nextSession);
    }
    await saveAll(nextSession, nextBlocks, morningQueue);
  }, [session, blocks, morningQueue, saveAll]);

  const extendVoyageOnce = useCallback(async () => {
    if (!session || !settings || !session.currentBlockId) return false;
    const current = blocks.find((b) => b.id === session.currentBlockId);
    if (!current || current.status !== 'flying' || current.type === 'break' || current.type === 'free') {
      return false;
    }
    let nextSession = { ...session };
    const nextBlocks = blocks.map((b) => ({ ...b }));
    const ok = extendVoyage(
      nextSession,
      nextBlocks,
      session.currentBlockId,
      settings.voyageExtendMinutes,
    );
    if (!ok) return false;
    await saveAll(nextSession, nextBlocks, morningQueue);
    return true;
  }, [session, settings, blocks, morningQueue, saveAll]);

  const setMood = useCallback(
    async (mood: Mood) => {
      if (!session) return;
      await saveAll({ ...session, mood }, blocks, morningQueue);
    },
    [session, blocks, morningQueue, saveAll],
  );

  const resetToday = useCallback(async () => {
    const state = await loadFullState();
    await saveSettings(keepFixedModuleSettings(state.settings));
    await clearTodaySession();
    await refresh();
    setPlanEpoch((n) => n + 1);
  }, [refresh]);

  const cancelVoyage = useCallback(async () => {
    if (!session || session.status === 'dayEnd' || session.status === 'cancelled') return;
    await saveAll(markVoyageCancelled(session), blocks, morningQueue);
  }, [session, blocks, morningQueue, saveAll]);

  const finishFreeFly = useCallback(async () => {
    if (!session) return;
    const free = blocks.find((b) => b.type === 'free');
    if (free && free.status === 'flying') {
      let nextSession = { ...session };
      let nextBlocks = blocks.map((b) => ({ ...b }));
      let nextQueue = [...morningQueue];
      const freeCopy = nextBlocks.find((b) => b.id === free.id)!;
      const result = landBlock(freeCopy, nextSession, nextBlocks, nextQueue);
      nextSession = finishDay(result.session);
      await saveAll(nextSession, result.blocks, result.morningQueue);
    } else {
      await saveAll(finishDay(session), blocks, morningQueue);
    }
  }, [session, blocks, morningQueue, saveAll]);

  const tickFlying = useCallback(async () => {
    if (!session || session.status === 'dayEnd' || session.status === 'cancelled' || session.checkpoint) return;
    if (checkWindowEnd(session)) {
      await saveAll(finishDay(session), blocks, morningQueue);
      return;
    }

    const current = blocks.find((b) => b.id === session.currentBlockId);
    if (!current || current.status !== 'flying' || current.type === 'free') return;

    let nextSession = { ...session };
    let nextBlocks = blocks.map((b) => ({ ...b }));
    let nextQueue = [...morningQueue];
    const currentCopy = nextBlocks.find((b) => b.id === current.id)!;

    const overtimeMinutes = getBlockOvertimeMinutes(currentCopy);
    if (overtimeMinutes <= 0) return;

    if (!nextSession.planReminderShown) {
      nextSession.planReminderShown = true;
      await saveAll(nextSession, nextBlocks, nextQueue);
      return;
    }

    nextQueue = processOvertimeDrain(
      nextBlocks,
      currentCopy,
      nextSession,
      nextQueue,
      overtimeMinutes,
    );
    if (nextSession.overtimeDrainCycleIndex === session.overtimeDrainCycleIndex) return;

    await saveAll(nextSession, nextBlocks, nextQueue);
  }, [session, blocks, morningQueue, saveAll]);

  const value = useMemo<AppContextValue>(
    () => ({
      loading,
      settings: settings!,
      session,
      blocks,
      morningQueue,
      refresh,
      updateSettings,
      confirmRoute,
      landCurrentBlock,
      toggleCurrentIncomplete,
      applyPriorityOrder,
      extendVoyage: extendVoyageOnce,
      setMood,
      resetToday,
      planEpoch,
      tickFlying,
      finishFreeFly,
      dismissCheckpoint,
      cancelVoyage,
    }),
    [
      loading,
      settings,
      session,
      blocks,
      morningQueue,
      refresh,
      updateSettings,
      confirmRoute,
      landCurrentBlock,
      toggleCurrentIncomplete,
      applyPriorityOrder,
      extendVoyageOnce,
      setMood,
      resetToday,
      planEpoch,
      tickFlying,
      finishFreeFly,
      dismissCheckpoint,
      cancelVoyage,
    ],
  );

  if (loading || !settings) {
    return <div className="loading-screen">Time Flight 正在准备航程…</div>;
  }

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}
