import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type {
  AppSettings,
  Block,
  FlightSession,
  PlanDraft,
  PlanTaskDraft,
} from '@/types';
import { clearSession, loadFullState, persistState, saveSettings } from '@/lib/db';
import { createDefaultPlanTasks } from '@/lib/defaults';
import { getBlockOvertimeMinutes } from '@/lib/time';
import {
  cancelVoyage as markCancelled,
  checkWindowEnd,
  createSessionFromPlan,
  extendVoyage as applyExtend,
  finishDay,
  landBlock,
  processOvertimeDrain,
  startFirstBlock as startFirst,
  startNextBlock as startNext,
} from '@/lib/sessionLogic';

interface AppContextValue {
  loading: boolean;
  settings: AppSettings;
  session: FlightSession | null;
  blocks: Block[];
  planDraft: PlanDraft | null;
  updateSettings: (settings: AppSettings) => Promise<void>;
  /* 规划流程（页面01→02→03） */
  beginPlan: (windowStart: string, windowEnd: string) => void;
  setPlanTasks: (tasks: PlanTaskDraft[]) => void;
  discardPlan: () => void;
  confirmPlan: () => Promise<void>;
  /* 执飞流程（页面04→05→06→10） */
  startFirstBlock: () => Promise<Block | null>;
  landCurrentBlock: () => Promise<{ earlyBonus: number }>;
  startNextBlock: () => Promise<Block | null>;
  finishVoyage: () => Promise<void>;
  cancelVoyage: () => Promise<void>;
  resetVoyage: () => Promise<void>;
  toggleCurrentIncomplete: () => Promise<void>;
  extendVoyage: () => Promise<boolean>;
  tickFlying: () => Promise<void>;
}

const AppContext = createContext<AppContextValue | null>(null);

/** 机型解锁规则：按累计完成航程数 */
const UNLOCK_RULES: { aircraftId: string; voyages: number }[] = [
  { aircraftId: 'ac-g650', voyages: 5 },
  { aircraftId: 'ac-bell407', voyages: 15 },
];

export function AppProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [session, setSession] = useState<FlightSession | null>(null);
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [planDraft, setPlanDraft] = useState<PlanDraft | null>(null);

  const refresh = useCallback(async () => {
    const state = await loadFullState();
    setSettings(state.settings);
    setSession(state.session);
    setBlocks(state.blocks);
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const saveAll = useCallback(
    async (nextSession: FlightSession | null, nextBlocks: Block[]) => {
      setSession(nextSession);
      setBlocks(nextBlocks);
      await persistState(nextSession, nextBlocks);
    },
    [],
  );

  const updateSettings = useCallback(async (next: AppSettings) => {
    setSettings(next);
    await saveSettings(next);
  }, []);

  /* ---------- 规划流程 ---------- */

  const beginPlan = useCallback(
    (windowStart: string, windowEnd: string) => {
      if (!settings) return;
      setPlanDraft({
        windowStart,
        windowEnd,
        tasks: createDefaultPlanTasks(settings),
      });
    },
    [settings],
  );

  const setPlanTasks = useCallback((tasks: PlanTaskDraft[]) => {
    setPlanDraft((d) => (d ? { ...d, tasks } : d));
  }, []);

  const discardPlan = useCallback(() => setPlanDraft(null), []);

  const confirmPlan = useCallback(async () => {
    if (!settings || !planDraft || planDraft.tasks.length === 0) return;
    const { session: s, blocks: b } = createSessionFromPlan(planDraft, settings.selectedAircraftId);
    await saveAll(s, b);
    setPlanDraft(null);
  }, [settings, planDraft, saveAll]);

  /* ---------- 执飞流程 ---------- */

  const startFirstBlockAction = useCallback(async (): Promise<Block | null> => {
    if (!session || session.status !== 'ready') return null;
    const nextSession = { ...session };
    const nextBlocks = blocks.map((b) => ({ ...b }));
    const started = startFirst(nextBlocks, nextSession);
    await saveAll(nextSession, nextBlocks);
    return started;
  }, [session, blocks, saveAll]);

  const landCurrentBlock = useCallback(async (): Promise<{ earlyBonus: number }> => {
    if (!session || !session.currentBlockId) return { earlyBonus: 0 };
    const current = blocks.find((b) => b.id === session.currentBlockId);
    if (!current) return { earlyBonus: 0 };
    const nextSession = { ...session };
    const nextBlocks = blocks.map((b) => ({ ...b }));
    const currentCopy = nextBlocks.find((b) => b.id === current.id)!;
    const { earlyBonus } = landBlock(currentCopy, nextSession, nextBlocks);
    await saveAll(nextSession, nextBlocks);
    return { earlyBonus };
  }, [session, blocks, saveAll]);

  const startNextBlockAction = useCallback(async (): Promise<Block | null> => {
    if (!session || session.status !== 'betweenFlights') return null;
    const nextSession = { ...session };
    const nextBlocks = blocks.map((b) => ({ ...b }));
    const started = startNext(nextBlocks, nextSession);
    await saveAll(nextSession, nextBlocks);
    return started;
  }, [session, blocks, saveAll]);

  const finishVoyage = useCallback(async () => {
    if (!session || !settings) return;
    const finished = finishDay(session);
    // 统计与机型解锁
    const flown = blocks.reduce((s, b) => s + (b.actualDurationMinutes ?? 0), 0);
    const stats = {
      completedVoyages: settings.stats.completedVoyages + 1,
      totalFlownMinutes: settings.stats.totalFlownMinutes + flown,
    };
    const aircrafts = settings.aircrafts.map((a) => {
      if (a.unlocked) return a;
      const rule = UNLOCK_RULES.find((r) => r.aircraftId === a.id);
      return rule && stats.completedVoyages >= rule.voyages ? { ...a, unlocked: true } : a;
    });
    const nextSettings = { ...settings, stats, aircrafts };
    setSettings(nextSettings);
    await saveSettings(nextSettings);
    await saveAll(finished, blocks);
  }, [session, settings, blocks, saveAll]);

  const cancelVoyage = useCallback(async () => {
    if (!session || session.status === 'dayEnd' || session.status === 'cancelled') return;
    await saveAll(markCancelled(session), blocks);
  }, [session, blocks, saveAll]);

  const resetVoyage = useCallback(async () => {
    await clearSession();
    setSession(null);
    setBlocks([]);
    setPlanDraft(null);
  }, []);

  const toggleCurrentIncomplete = useCallback(async () => {
    if (!session) return;
    const current = blocks.find((b) => b.id === session.currentBlockId);
    if (!current || current.status !== 'flying') return;
    const nextBlocks = blocks.map((b) =>
      b.id === current.id ? { ...b, markedIncomplete: !b.markedIncomplete } : b,
    );
    await saveAll(session, nextBlocks);
  }, [session, blocks, saveAll]);

  const extendVoyageAction = useCallback(async (): Promise<boolean> => {
    if (!session || !settings || !settings.voyageExtendEnabled) return false;
    if (session.status !== 'flying') return false;
    const nextSession = { ...session };
    const nextBlocks = blocks.map((b) => ({ ...b }));
    const ok = applyExtend(nextSession, nextBlocks, settings.voyageExtendMinutes);
    if (!ok) return false;
    await saveAll(nextSession, nextBlocks);
    return true;
  }, [session, settings, blocks, saveAll]);

  const tickFlying = useCallback(async () => {
    if (!session || session.status !== 'flying') return;
    if (checkWindowEnd(session)) {
      await saveAll(finishDay(session), blocks);
      return;
    }
    const current = blocks.find((b) => b.id === session.currentBlockId);
    if (!current || current.status !== 'flying') return;

    const overtimeMinutes = getBlockOvertimeMinutes(current);
    if (overtimeMinutes <= 0) return;

    const nextSession = { ...session };
    const nextBlocks = blocks.map((b) => ({ ...b }));
    const currentCopy = nextBlocks.find((b) => b.id === current.id)!;
    const prevSlack = nextSession.slackRemainingMinutes;
    const prevApplied = nextSession.overtimeDrainCycleIndex;
    processOvertimeDrain(nextBlocks, currentCopy, nextSession, overtimeMinutes);
    if (
      nextSession.overtimeDrainCycleIndex === prevApplied &&
      nextSession.slackRemainingMinutes === prevSlack
    ) {
      return;
    }
    await saveAll(nextSession, nextBlocks);
  }, [session, blocks, saveAll]);

  const value = useMemo<AppContextValue>(
    () => ({
      loading,
      settings: settings!,
      session,
      blocks,
      planDraft,
      updateSettings,
      beginPlan,
      setPlanTasks,
      discardPlan,
      confirmPlan,
      startFirstBlock: startFirstBlockAction,
      landCurrentBlock,
      startNextBlock: startNextBlockAction,
      finishVoyage,
      cancelVoyage,
      resetVoyage,
      toggleCurrentIncomplete,
      extendVoyage: extendVoyageAction,
      tickFlying,
    }),
    [
      loading,
      settings,
      session,
      blocks,
      planDraft,
      updateSettings,
      beginPlan,
      setPlanTasks,
      discardPlan,
      confirmPlan,
      startFirstBlockAction,
      landCurrentBlock,
      startNextBlockAction,
      finishVoyage,
      cancelVoyage,
      resetVoyage,
      toggleCurrentIncomplete,
      extendVoyageAction,
      tickFlying,
    ],
  );

  if (loading || !settings) {
    return <div className="loading-screen">Time Pilot 时光机长 正在准备航程…</div>;
  }

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}
