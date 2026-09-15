import type { SoundType } from '@/types';

/**
 * 背景音管理器（单例）。
 *
 * 双通道架构：
 * - 背景白噪音：HTML <audio> 元素循环播放（媒体播放通道）。
 *   这是锁屏/切后台后系统仍继续播放的唯一可靠方式（iOS Safari / Android Chrome 同）。
 *   占位素材为 scripts/render-audio.mjs 生成的无缝循环 m4a，
 *   拿到真实素材后替换 public/assets/audio/*.m4a 即可。
 * - 短音效（推杆咔哒/起飞哐声）：Web Audio 实时合成，只在交互瞬间发声，
 *   屏幕必然亮着，不需要锁屏续播能力。
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
  /** 背景音（媒体通道，锁屏续播） */
  private el: HTMLAudioElement | null = null;
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
  /** 锁屏媒体卡片上展示的任务信息 */
  private taskInfo: { title: string; remainingMinutes: number | null } | null = null;
  /** 背景音总开关（设置项 soundEnabled 驱动；推杆短音效不受其影响） */
  private backgroundEnabled = true;

  /** 必须在用户手势回调里调用（页面04 推油门是天然解锁点） */
  unlock(): void {
    this.unlocked = true;
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.volume;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }
    const el = this.ensureElement();
    // iOS 17+：申请 playback 音频会话（静音开关下仍可播放）
    try {
      const nav = navigator as Navigator & { audioSession?: { type: string } };
      if (nav.audioSession && nav.audioSession.type !== 'playback') {
        nav.audioSession.type = 'playback';
      }
    } catch {
      /* 不支持时静默降级 */
    }
    // 手势内补播待播的背景音（intentionalPause 期间不补：进港/间隙页保持安静）
    if (this.currentType && el.paused && this.backgroundEnabled && !this.intentionalPause) {
      void el.play().catch(() => {});
    }
    this.bindRetryOnGesture();
  }

  /** 背景音总开关：关闭即静默背景音（推杆短音效保留），打开时恢复当前音效 */
  setBackgroundEnabled(on: boolean): void {
    this.backgroundEnabled = on;
    if (!on) {
      this.intentionalPause = true;
      this.el?.pause();
    } else if (this.el && this.currentType && this.el.paused) {
      this.intentionalPause = false;
      void this.el.play().catch(() => {});
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
    if (this.el) {
      this.el.muted = false;
      this.el.volume = gain;
    }
    if (this.ctx && this.master) {
      this.master.gain.setTargetAtTime(gain, this.ctx.currentTime, 0.05);
    }
  }

  private ensureElement(): HTMLAudioElement {
    if (!this.el) {
      const el = new Audio();
      el.loop = true;
      el.preload = 'auto';
      el.volume = this.volume * this.volume; // 感知响度曲线，与 setVolume 一致
      // 系统打断（音频焦点被抢等）导致的暂停：自动尝试恢复
      el.addEventListener('pause', () => {
        if (!this.intentionalPause && this.currentType) {
          void el.play().catch(() => {
            /* 恢复失败则等下次手势/回前台再试 */
          });
        }
      });
      this.el = el;
    }
    return this.el;
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
      if (this.ctx?.state === 'suspended') void this.ctx.resume();
      if (
        this.el &&
        this.currentType &&
        this.el.paused &&
        this.backgroundEnabled &&
        !this.intentionalPause
      ) {
        void this.el.play().catch(() => {});
      }
    });
  }

  /** 锁屏媒体卡片：标题显示任务与剩余时间，副标题显示音效名 */
  private refreshMetadata(): void {
    if (!('mediaSession' in navigator)) return;
    const soundTitle = this.currentType ? SOUND_META[this.currentType].title : '';
    const taskLine = this.taskInfo
      ? this.taskInfo.remainingMinutes !== null
        ? `${this.taskInfo.title} · 剩余 ${this.taskInfo.remainingMinutes} 分钟`
        : this.taskInfo.title
      : '执飞中';
    try {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: taskLine,
        artist: soundTitle ? `${soundTitle} · Time Pilot 时光机长` : 'Time Pilot 时光机长',
        artwork: [{ src: '/assets/bg-cockpit.png', sizes: '512x512', type: 'image/png' }],
      });
    } catch {
      /* 旧浏览器静默降级 */
    }
  }

  /** 更新锁屏卡片上的任务信息（执飞页每分钟刷新一次） */
  setTaskInfo(title: string | null, remainingMinutes: number | null = null): void {
    this.taskInfo = title ? { title, remainingMinutes } : null;
    this.refreshMetadata();
  }

  /** 播放/切换背景音（未解锁时为安全静默） */
  play(type: SoundType): void {
    if (!this.unlocked) return;
    const el = this.ensureElement();
    const meta = SOUND_META[type];
    if (this.currentType !== type) {
      this.currentType = type;
      el.src = meta.file;
      this.refreshMetadata();
    }
    this.intentionalPause = false;
    if (el.paused && this.backgroundEnabled) {
      void el.play().catch(() => {
        /* 自动播放策略拦截：等待下次手势由 bindRetryOnGesture 补播 */
      });
    }
  }

  /** 页面05 → 06 进港时暂停（媒体通道 + 短音效通道一起挂起） */
  pause(): void {
    this.intentionalPause = true;
    this.el?.pause();
    if (this.ctx?.state === 'running') void this.ctx.suspend();
  }

  /** 仅暂停背景音（关闭背景音开关用，不影响推杆短音效） */
  pauseBackground(): void {
    this.intentionalPause = true;
    this.el?.pause();
  }

  /** 再次起飞 / 回到前台时恢复（没有待恢复音效则静默） */
  resume(): void {
    if (this.el && this.currentType && this.el.paused && this.backgroundEnabled) {
      this.intentionalPause = false;
      void this.el.play().catch(() => {});
    }
    if (this.ctx?.state === 'suspended') void this.ctx.resume();
  }

  /** 航程结束/取消时彻底停止 */
  stop(): void {
    this.intentionalPause = true;
    this.el?.pause();
    this.currentType = null;
    this.taskInfo = null;
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
  tick(intensity = 0.5): void {
    if (!this.ctx || !this.master || this.ctx.state !== 'running') return;
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

  /** 起飞锁定确认：低沉的「哐」声（iOS 替代震动的完成反馈） */
  thunk(): void {
    if (!this.ctx || !this.master || this.ctx.state !== 'running') return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noise('brown');
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 400;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.9, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
    src.connect(lp).connect(g).connect(this.master);
    src.start(t, Math.random() * 2.5, 0.3);
  }
}

export const audioManager = new AudioManager();
