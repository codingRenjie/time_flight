import type { SoundType } from '@/types';
import { logDebug } from './debugBeacon';

/**
 * 背景音管理器（单例）。
 *
 * 双通道架构：
 * - 背景白噪音：WebAudio AudioBufferSourceNode.loop（采样级无缝）。
 *   HTML <audio loop> 在 iOS / Chrome 每次回到开头都会空出一截，约每 30 秒一次。
 * - 短音效（推杆咔哒）：Web Audio 实时合成，只在交互瞬间发声。
 * - 登机「噔」：独立 HTML <audio> 单次播放（页面04 推杆到底）。
 *
 * iOS 17+：设置 navigator.audioSession.type = 'playback' 后，
 * 即使机身静音开关打开也能播放（白噪音是内容本体，不应被静音开关拦截）。
 *
 * 自动播放策略：首次 play() 必须发生在用户手势内（页面04 推杆手势即解锁点）；
 * 一旦元素被手势激活，后续 play() 调用不再要求手势（同元素复用）。
 */

const SOUND_META: Record<SoundType, { title: string; file: string }> = {
  engine: { title: '引擎轰鸣', file: '/assets/audio/engine.wav' },
  rain: { title: '雨声', file: '/assets/audio/rain.wav' },
  snow: { title: '风雪', file: '/assets/audio/snow.wav' },
  waterfall: { title: '瀑布', file: '/assets/audio/waterfall.wav' },
  campfire: { title: '篝火', file: '/assets/audio/campfire.wav' },
  music: { title: '专注音乐', file: '/assets/audio/music.wav' },
};

function makeNoiseBuffer(ctx: AudioContext, kind: 'white' | 'brown'): AudioBuffer {
  const length = ctx.sampleRate * 3;
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  let brown = 0;
  for (let i = 0; i < length; i++) {
    const w = Math.random() * 2 - 1;
    if (kind === 'white') {
      data[i] = w * 0.5;
    } else {
      brown = (brown + 0.02 * w) / 1.02;
      data[i] = brown * 3.5 * 0.5;
    }
  }
  return buffer;
}

class AudioManager {
  /** 背景音：WebAudio 缓冲循环（HTML <audio loop> 在 iOS/Chrome 每次循环有空隙） */
  private loopSource: AudioBufferSourceNode | null = null;
  private loopGain: GainNode | null = null;
  private loopBuffers = new Map<SoundType, AudioBuffer>();
  private loopToken = 0;
  /** 诊断日志限流：每次页面加载最多记录 15 条 tick 事件 */
  private tickLogCount = 0;

  private logTick(msg: string): void {
    if (this.tickLogCount++ < 15) logDebug('audio', `tick ${msg}`);
  }
  /** 短音效（WebAudio） */
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private buffers: Partial<Record<'white' | 'brown', AudioBuffer>> = {};
  private currentType: SoundType | null = null;
  private unlocked = false;
  private volume = 0.6;
  private retryBound = false;
  /** 区分「我们主动暂停」与「系统打断（音频焦点丢失等）」，后者自动恢复 */
  private intentionalPause = false;
  /** 锁屏媒体卡片上展示的任务与剩余时间 */
  private taskInfo: { title: string; timeLabel: string | null } | null = null;
  /** 背景音总开关（设置项 soundEnabled 驱动；推杆短音效不受其影响） */
  private backgroundEnabled = true;

  constructor() {
    // 页面加载即预载咔哒声池与登机音（加载无需手势），消除首次发声的加载延迟
    this.ensureClickPool();
    this.ensureBoardingEl();
    this.tryMutedAutoplay();
  }

  /**
   * 页面加载时让咔哒池以 muted+loop 空转：自动播放策略允许静音媒体无手势
   * 播放，借此在用户触摸之前就把 iOS 音频管线烧热（实测冷启动 300ms~2s，
   * 是「第一格咔哒滞后」的瓶颈）。若平台拒绝静音自动播放则静默回退 ——
   * 首次手势时 unlock() 的预热仍会兜底。空转最多持续 8 秒（届时用户要么
   * 已触摸、要么短期不会碰转盘），避免常驻系统「正在播放」占用音频会话。
   */
  private autoplayLogDone = false;
  private tryMutedAutoplay(): void {
    const stopAll = () => {
      for (const a of this.clickPool) {
        if (a.muted && a.loop && !a.paused) {
          a.pause();
          a.loop = false;
          a.currentTime = 0;
        }
      }
      const board = this.boardingEl;
      if (board && board.muted && board.loop && !board.paused) {
        board.pause();
        board.loop = false;
        board.currentTime = 0;
      }
    };
    for (const a of this.clickPool) {
      a.muted = true;
      a.loop = true;
      void a
        .play()
        .then(() => {
          if (!this.autoplayLogDone) {
            this.autoplayLogDone = true;
            logDebug('audio', 'autoplay loop ok');
          }
        })
        .catch(() => {
          if (!this.autoplayLogDone) {
            this.autoplayLogDone = true;
            logDebug('audio', 'autoplay loop blocked');
          }
        });
    }
    window.setTimeout(stopAll, 8000);
  }

  /** 必须在用户手势回调里调用（页面04 推油门是天然解锁点） */
  unlock(): void {
    this.unlocked = true;
    const nav = navigator as Navigator & { audioSession?: { type: string } };
    logDebug(
      'audio',
      `unlock begin hasCtx=${!!this.ctx} state=${this.ctx?.state ?? '-'} audioSession=${'audioSession' in navigator ? (nav.audioSession?.type ?? '?') : 'unsupported'}`,
    );
    // iOS 17+：申请 playback 音频会话（静音开关下仍可播放）。
    // 必须在创建 AudioContext 之前设置，否则 WebAudio 可能按 ambient 会话路由（受静音开关影响）
    try {
      if (nav.audioSession && nav.audioSession.type !== 'playback') {
        nav.audioSession.type = 'playback';
        logDebug('audio', `audioSession set playback → ${nav.audioSession.type}`);
      }
    } catch (e) {
      logDebug('audio', `audioSession set fail ${String(e)}`);
    }
    if (!this.ctx) {
      this.ctx = new AudioContext();
      logDebug('audio', `ctx created state=${this.ctx.state} sampleRate=${this.ctx.sampleRate}`);
      const ctxRef = this.ctx;
      ctxRef.addEventListener('statechange', () => {
        logDebug('audio', `ctx statechange → ${ctxRef.state}`);
      });
      this.master = this.ctx.createGain();
      this.master.gain.value = this.volume;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') {
      const ctxRef = this.ctx;
      void ctxRef
        .resume()
        .then(() => {
          logDebug('audio', `resume ok state=${ctxRef.state}`);
          this.startKeepAlive();
        })
        .catch((e) => logDebug('audio', `resume fail ${String(e)}`));
    } else {
      this.startKeepAlive();
    }
    // 咔哒声池预热（解决「刷新后第一格无声/滞后」）：iOS 要求文档获得媒体激活后，
    // 滚动事件里的 play() 才被允许；而激活要等手势内的播放真正开始才落地，
    // 手指常抢在此前拨过第一格 → 首次 play() 被拒或延迟播出。
    // 这里在手势内以 muted 重启每个池元素（iOS 忽略 volume 但尊重 muted，故真正
    // 无声；pause→play 的完整重启确保激活稳固落地）。若页面加载时的静音空转
    // （见 tryMutedAutoplay）成功，管线已是热的，这次重启几乎瞬时完成。
    // 若第一格抢在激活前到来，click() 会取消静音并归零，这次手势授权的预热播放
    // 一旦开始，播出的正是这一声咔哒（规范保证连续 play() 不会互相拒绝）。
    if (!this.clickPoolWarmed) {
      this.clickPoolWarmed = true;
      const t0 = Date.now();
      for (const a of this.ensureClickPool()) {
        a.muted = true;
        if (!a.paused) a.pause();
        a.currentTime = 0;
        void a
          .play()
          .then(() => {
            logDebug('audio', `warm ok +${Date.now() - t0}ms`);
            // 激活已落地。若元素未被真实点击认领（仍 muted），停止静音循环，
            // 避免常驻系统「正在播放」、占用音频会话
            if (a.muted) {
              a.pause();
              a.loop = false;
              a.currentTime = 0;
            }
          })
          .catch(() => {});
      }
    }
    // 手势内补播待播的背景音（intentionalPause 期间不补：进港/间隙页保持安静）
    if (this.currentType && !this.loopSource && this.backgroundEnabled && !this.intentionalPause) {
      void this.startLoop(this.currentType);
    }
    this.bindRetryOnGesture();
  }

  /** 背景音总开关：关闭即静默背景音（推杆短音效保留），打开时恢复当前音效 */
  setBackgroundEnabled(on: boolean): void {
    this.backgroundEnabled = on;
    const gain = this.loopGain;
    if (!on) {
      if (gain && this.ctx) gain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.05);
    } else if (this.currentType && !this.intentionalPause) {
      if (gain && this.ctx) gain.gain.setTargetAtTime(1, this.ctx.currentTime, 0.05);
      if (!this.loopSource) void this.startLoop(this.currentType);
    }
  }

  get isUnlocked(): boolean {
    return this.unlocked;
  }

  setVolume(v: number): void {
    this.volume = Math.min(1, Math.max(0, v));
    // 人耳对响度的感知是对数式的：线性映射会让滑杆前半段几乎听不出变化，
    // 用平方曲线把滑杆行程映射到感知响度
    const gain = this.volume * this.volume;
    if (this.ctx && this.master) {
      this.master.gain.setTargetAtTime(gain, this.ctx.currentTime, 0.05);
    }
  }

  /**
   * 刷新页面恢复航程后，元素虽被激活过但可能因自动播放策略静默失败：
   * 任意一次触摸/点击即补播当前音效。
   * 注意必须尊重 intentionalPause：进港后（页面06/10）用户点击界面时
   * 背景音不得恢复，只有进入页面05执飞才会重新 play()。
   */
  private bindRetryOnGesture(): void {
    if (this.retryBound) return;
    this.retryBound = true;
    document.addEventListener('pointerdown', () => {
      if (this.ctx?.state === 'suspended') {
        void this.ctx.resume().then(() => this.startKeepAlive());
      }
      if (
        this.currentType &&
        !this.loopSource &&
        this.backgroundEnabled &&
        !this.intentionalPause
      ) {
        void this.startLoop(this.currentType);
      }
    });
  }

  /** 锁屏「正在播放」卡片只放标题（剩余时间）和副标题（任务名）。 */
  private refreshMetadata(): void {
    if (!('mediaSession' in navigator)) return;
    const info = this.taskInfo;
    const timeLabel = info?.timeLabel ?? '';
    const taskTitle = info?.title ?? '执飞中';
    try {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: timeLabel || taskTitle,
        artist: timeLabel ? taskTitle : 'Time Pilot 时光机长',
        album: '剩余时间',
        artwork: [{ src: '/assets/logo-lock.png?v=2', sizes: '512x512', type: 'image/png' }],
      });
      navigator.mediaSession.playbackState = this.intentionalPause ? 'paused' : 'playing';
    } catch {
      /* 旧浏览器静默降级 */
    }
  }

  /**
   * 更新锁屏卡片。timeLabel 用 MM:SS（如 41:32）。
   * 页面在前台时每秒刷新；锁屏后系统会节流脚本，卡片会按系统允许的频率跳动。
   */
  setTaskInfo(title: string | null, timeLabel: string | null = null): void {
    this.taskInfo = title ? { title, timeLabel } : null;
    this.refreshMetadata();
  }

  /** 页面04 进入时预解码背景音，推杆按下时才能在同一次手势里 start()。 */
  prepareBackground(type: SoundType): void {
    this.preparedType = type;
    void this.loadLoopBuffer(type);
    void this.loadBoardingBuffer();
  }

  /**
   * 必须在推杆 pointerdown 里同步调用。以音量 0 启动循环，
   * 上下文保持 running；页面05 的 play() 只把音量打开。
   */
  armBackground(): void {
    const type = this.preparedType;
    const ctx = this.ctx;
    const buffer = type ? this.loopBuffers.get(type) : undefined;
    if (!type || !ctx || !this.master || !buffer) return;
    if (ctx.state === 'suspended') void ctx.resume().then(() => this.startKeepAlive());
    this.currentType = type;
    this.intentionalPause = false;
    if (this.loopSource) return;
    const gain = this.ensureLoopGain();
    if (!gain) return;
    gain.gain.setValueAtTime(0, ctx.currentTime);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;
    src.connect(gain);
    try {
      src.start();
    } catch {
      return;
    }
    this.loopSource = src;
    this.startKeepAlive();
  }

  private preparedType: SoundType | null = null;
  private boardingBuffer: AudioBuffer | null = null;

  private async loadLoopBuffer(type: SoundType): Promise<AudioBuffer | null> {
    const cached = this.loopBuffers.get(type);
    if (cached) return cached;
    try {
      const res = await fetch(SOUND_META[type].file);
      const raw = await res.arrayBuffer();
      const offline = new OfflineAudioContext(1, 1, 44100);
      const buffer = await offline.decodeAudioData(raw);
      this.loopBuffers.set(type, buffer);
      return buffer;
    } catch {
      return null;
    }
  }

  private async loadBoardingBuffer(): Promise<AudioBuffer | null> {
    if (this.boardingBuffer) return this.boardingBuffer;
    try {
      const res = await fetch('/assets/audio/boarding.m4a');
      const raw = await res.arrayBuffer();
      const offline = new OfflineAudioContext(1, 1, 44100);
      this.boardingBuffer = await offline.decodeAudioData(raw);
      return this.boardingBuffer;
    } catch {
      return null;
    }
  }
  play(type: SoundType): void {
    if (!this.unlocked || !this.ctx) return;
    const changed = this.currentType !== type;
    this.currentType = type;
    this.intentionalPause = false;
    if (changed) {
      this.refreshMetadata();
      this.stopLoop();
    }
    if (!this.backgroundEnabled) return;
    const gain = this.ensureLoopGain();
    if (gain) gain.gain.setTargetAtTime(1, this.ctx.currentTime, 0.05);
    if (this.ctx.state !== 'running') {
      void this.ctx.resume().then(() => this.startKeepAlive());
    }
    if (!this.loopSource) void this.startLoop(type);
    this.markSessionPlaying();
  }

  /** 页面05 → 06 进港时停掉循环。不 suspend 上下文：iOS 上离开手势后再 resume() 会被拒绝。 */
  pause(): void {
    this.intentionalPause = true;
    this.stopLoop();
    this.markSessionPaused();
  }

  /** 仅暂停背景音（关闭背景音开关用，不影响推杆短音效） */
  pauseBackground(): void {
    this.setBackgroundEnabled(false);
  }

  /** 再次起飞 / 回到前台时恢复（没有待恢复音效则静默） */
  resume(): void {
    if (!this.currentType || !this.backgroundEnabled) {
      if (this.ctx?.state === 'suspended') void this.ctx.resume().then(() => this.startKeepAlive());
      return;
    }
    this.intentionalPause = false;
    if (this.ctx?.state === 'suspended') {
      void this.ctx.resume().then(() => {
        this.startKeepAlive();
        if (!this.loopSource && this.currentType) void this.startLoop(this.currentType);
      });
      return;
    }
    if (!this.loopSource) void this.startLoop(this.currentType);
  }

  /** 航程结束/取消时彻底停止 */
  stop(): void {
    this.intentionalPause = true;
    this.stopLoop();
    this.currentType = null;
    this.taskInfo = null;
    this.markSessionPaused();
  }

  private sessionActionsBound = false;

  /** 让系统把本页当成「正在播放」，锁屏才会拿出媒体卡片而不是纯黑屏。 */
  private markSessionPlaying(): void {
    if (!('mediaSession' in navigator)) return;
    try {
      navigator.mediaSession.playbackState = 'playing';
      if (!this.sessionActionsBound) {
        this.sessionActionsBound = true;
        navigator.mediaSession.setActionHandler('play', () => {
          this.resume();
        });
        navigator.mediaSession.setActionHandler('pause', () => {
          /* 专注中不响应锁屏暂停，避免误触把白噪音停掉 */
          this.markSessionPlaying();
        });
      }
    } catch {
      /* 部分浏览器不允许覆盖默认暂停 */
    }
    this.refreshMetadata();
  }

  private markSessionPaused(): void {
    if (!('mediaSession' in navigator)) return;
    try {
      navigator.mediaSession.playbackState = 'paused';
    } catch {
      /* 忽略 */
    }
  }

  private ensureLoopGain(): GainNode | null {
    if (!this.ctx || !this.master) return null;
    if (!this.loopGain) {
      this.loopGain = this.ctx.createGain();
      this.loopGain.gain.value = this.backgroundEnabled ? 1 : 0;
      this.loopGain.connect(this.master);
    }
    return this.loopGain;
  }

  private stopLoop(): void {
    const src = this.loopSource;
    this.loopSource = null;
    if (!src) return;
    try {
      src.stop();
    } catch {
      /* 尚未 start */
    }
    src.disconnect();
  }

  /** 解码并循环播放。token 丢弃过期请求（快速切换音效 / 中途暂停）。 */
  private async startLoop(type: SoundType): Promise<void> {
    const ctx = this.ctx;
    const gain = this.ensureLoopGain();
    if (!ctx || !gain) return;
    if (this.intentionalPause || !this.backgroundEnabled) return;
    const token = ++this.loopToken;
    let buffer = this.loopBuffers.get(type);
    if (!buffer) {
      try {
        const res = await fetch(SOUND_META[type].file);
        const raw = await res.arrayBuffer();
        buffer = await ctx.decodeAudioData(raw);
        this.loopBuffers.set(type, buffer);
      } catch {
        return;
      }
    }
    if (token !== this.loopToken) return;
    if (this.intentionalPause || !this.backgroundEnabled || this.currentType !== type) return;
    this.stopLoop();
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;
    src.connect(gain);
    src.start();
    this.loopSource = src;
  }

  /* ---------- 短音效（WebAudio，推杆反馈） ---------- */

  private noise(kind: 'white' | 'brown'): AudioBuffer {
    if (!this.buffers[kind]) {
      this.buffers[kind] = makeNoiseBuffer(this.ctx!, kind);
    }
    return this.buffers[kind]!;
  }

  /**
   * 推杆段落感：短促的机械「咔哒」声。
   * iOS Safari 无震动 API，用它做推杆档位的替代触觉反馈；
   * 音调随推杆位置升高，营造「越推越紧」的机械感。
   */
  /**
   * 静音振荡器：在用户手势里把 AudioContext 保活。
   * Chrome 拖动时 ctx 常保持 suspended，导致 tick() 整段静音；
   * 保活后推杆走回最初的轻量 WebAudio 咔哒，不再用 HTML 音频（那会滞后、卡顿）。
   */
  private keepAlive: OscillatorNode | null = null;
  private startKeepAlive(): void {
    if (!this.ctx || !this.master || this.keepAlive) return;
    if (this.ctx.state !== 'running') return;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    g.gain.value = 0;
    osc.connect(g).connect(this.master);
    osc.start();
    this.keepAlive = osc;
  }

  tick(intensity = 0.5): void {
    if (!this.ctx || !this.master) {
      this.logTick('skip:no-ctx');
      return;
    }
    if (this.ctx.state !== 'running') {
      this.logTick(`skip:${this.ctx.state}`);
      void this.ctx.resume().then(() => this.startKeepAlive());
      return;
    }
    this.logTick(`fire:${intensity}`);
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noise('white');
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 1600 + intensity * 2600;
    bp.Q.value = 5;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.3, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
    src.connect(bp).connect(g).connect(this.master);
    src.start(t, Math.random() * 2.5, 0.08);
  }

  private boardingEl: HTMLAudioElement | null = null;

  private ensureBoardingEl(): HTMLAudioElement {
    if (!this.boardingEl) {
      const a = new Audio('/assets/audio/boarding.m4a');
      a.preload = 'auto';
      a.load();
      this.boardingEl = a;
    }
    return this.boardingEl;
  }

  /**
   * 页面04 推杆到底：播出登机「噔」，Promise 在播完后兑现。
   * 走 WebAudio，避免 HTML 媒体把上下文打成 interrupted（那样进页面05 就无法自动开背景音）。
   */
  playBoarding(): Promise<void> {
    const ctx = this.ctx;
    const buffer = this.boardingBuffer;
    if (ctx && this.master && buffer && ctx.state === 'running') {
      return new Promise((resolve) => {
        const src = ctx.createBufferSource();
        src.buffer = buffer;
        const g = ctx.createGain();
        g.gain.value = Math.min(1, 0.45 + 0.55 * this.volume);
        src.connect(g).connect(this.master!);
        let settled = false;
        const done = () => {
          if (settled) return;
          settled = true;
          window.clearTimeout(watchdog);
          resolve();
        };
        const watchdog = window.setTimeout(done, Math.ceil(buffer.duration * 1000) + 400);
        src.onended = done;
        try {
          src.start();
        } catch {
          done();
        }
      });
    }
    return this.playBoardingHtml();
  }

  /** HTML 兜底：上下文还没跑起来时仍用媒体元素播登机音 */
  private playBoardingHtml(): Promise<void> {
    const a = this.ensureBoardingEl();
    a.loop = false;
    a.volume = Math.min(1, 0.45 + 0.55 * this.volume);
    try {
      a.currentTime = 0;
    } catch {
      /* 尚未 loaded 时 currentTime 可能抛错 */
    }
    a.muted = false;
    return new Promise((resolve) => {
      let settled = false;
      const done = () => {
        if (settled) return;
        settled = true;
        window.clearTimeout(watchdog);
        a.removeEventListener('ended', done);
        a.removeEventListener('error', done);
        a.pause();
        a.currentTime = 0;
        resolve();
      };
      const watchdog = window.setTimeout(done, 5000);
      a.addEventListener('ended', done);
      a.addEventListener('error', done);
      if (a.paused) {
        void a.play().catch((e: unknown) => {
          const err = e as { name?: string; message?: string };
          logDebug('audio', `boarding play fail ${err?.name ?? '?'} ${err?.message ?? ''}`);
          window.setTimeout(done, 400);
        });
      }
    });
  }

  /* ---------- 转盘咔哒声（HTML 音频通道） ---------- */

  private clickPool: HTMLAudioElement[] = [];
  private clickPoolIdx = 0;
  private clickPoolWarmed = false;
  private clickLogCount = 0;

  /**
   * 咔哒声元素池。模块加载即创建并强制预载（iOS 忽略 preload='auto'，
   * 必须显式 load()）——加载不需要手势，把网络+解码延迟从首次发声路径上移除。
   */
  private ensureClickPool(): HTMLAudioElement[] {
    if (this.clickPool.length === 0) {
      for (let i = 0; i < 4; i++) {
        const a = new Audio('/assets/audio/wheel.wav');
        a.preload = 'auto';
        a.load();
        this.clickPool.push(a);
      }
    }
    return this.clickPool;
  }

  /**
   * 转盘档位咔哒声。故意不用 WebAudio：iOS（WebKit）上滚动手势不构成
   * WebAudio 的激活手势，ctx.resume() 会被挂起到下一次点按 —— 转盘的首次
   * 交互恰恰是滚动，导致永远静音（日志实测证实）。HTML <audio> 的 play()
   * 在滚动手势内被允许，且媒体通道不受静音开关影响。
   */
  click(): void {
    if (!this.unlocked) return; // 首次手势前保持静默
    const pool = this.ensureClickPool();
    const a = pool[this.clickPoolIdx++ % pool.length];
    a.loop = false; // 真实点击只响一遍（预热/空转期间 loop=true）
    a.muted = false; // 预热以 muted 播放；真实点击前恢复发声
    if (!a.paused) a.pause(); // 极端快速连击：先停再放，避免重叠
    a.currentTime = 0;
    // 固定为素材原音量的 60%，并且已经写进 wheel.wav。
    // iOS 会忽略 HTMLAudioElement.volume，只改这个属性在手机上不会变轻。
    a.volume = 1;
    void a.play().catch((e: unknown) => {
      const err = e as { name?: string; message?: string };
      if (this.clickLogCount < 15)
        logDebug('audio', `click play fail ${err?.name ?? '?'} ${err?.message ?? ''}`);
    });
    if (this.clickLogCount++ < 15) logDebug('audio', 'click fire');
  }
}

export const audioManager = new AudioManager();
