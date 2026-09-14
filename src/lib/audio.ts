import type { SoundType } from '@/types';

/**
 * 背景音管理器（WebAudio 单例）。
 *
 * v1 占位实现：所有音效由程序实时合成（噪声 + 滤波），无需音频文件。
 * 后续替换为真实素材时，只需把 play() 内部换成
 *   fetch(url) → decodeAudioData → AudioBufferSourceNode.loop
 * 对外接口（unlock/play/pause/resume/stop/setVolume）保持不变。
 *
 * iOS 限制：AudioContext 必须在用户手势中创建/恢复，
 * 页面04 的推油门手势是天然解锁点（调用 unlock()）。
 */

const FADE_SECONDS = 0.6;

function makeNoiseBuffer(ctx: AudioContext, kind: 'white' | 'pink' | 'brown'): AudioBuffer {
  const length = ctx.sampleRate * 3;
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  let b0 = 0, b1 = 0, b2 = 0, brown = 0;
  for (let i = 0; i < length; i++) {
    const white = Math.random() * 2 - 1;
    if (kind === 'white') {
      data[i] = white * 0.5;
    } else if (kind === 'pink') {
      b0 = 0.99765 * b0 + white * 0.099046;
      b1 = 0.963 * b1 + white * 0.2965164;
      b2 = 0.57 * b2 + white * 1.0526913;
      data[i] = (b0 + b1 + b2 + white * 0.1848) * 0.08;
    } else {
      brown = (brown + 0.02 * white) / 1.02;
      data[i] = brown * 3.5 * 0.5;
    }
  }
  return buffer;
}

interface ActiveSound {
  gain: GainNode;
  stop: () => void;
}

class AudioManager {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private active: ActiveSound | null = null;
  private buffers: Partial<Record<'white' | 'pink' | 'brown', AudioBuffer>> = {};
  private crackleTimer: number | null = null;
  private currentType: SoundType | null = null;
  private volume = 0.6;

  /** 必须在用户手势回调里调用（页面04 推油门） */
  unlock(): void {
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.volume;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }
  }

  get isUnlocked(): boolean {
    return this.ctx !== null;
  }

  setVolume(v: number): void {
    this.volume = Math.min(1, Math.max(0, v));
    if (this.ctx && this.master) {
      this.master.gain.setTargetAtTime(this.volume, this.ctx.currentTime, 0.05);
    }
  }

  private noise(kind: 'white' | 'pink' | 'brown'): AudioBuffer {
    if (!this.buffers[kind]) {
      this.buffers[kind] = makeNoiseBuffer(this.ctx!, kind);
    }
    return this.buffers[kind]!;
  }

  private startNoise(
    kind: 'white' | 'pink' | 'brown',
    filterType: BiquadFilterType,
    frequency: number,
    gainLevel: number,
  ): ActiveSound {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise(kind);
    src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = filterType;
    filter.frequency.value = frequency;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    gain.gain.setTargetAtTime(gainLevel, ctx.currentTime, FADE_SECONDS);
    src.connect(filter).connect(gain).connect(this.master!);
    src.start();
    return { gain, stop: () => src.stop() };
  }

  /** 篝火：低噪声底 + 随机爆裂声 */
  private startCampfire(): ActiveSound {
    const base = this.startNoise('brown', 'lowpass', 240, 0.35);
    const ctx = this.ctx!;
    const crackleGain = ctx.createGain();
    crackleGain.gain.value = 0.5;
    crackleGain.connect(this.master!);

    const scheduleCrackle = () => {
      if (!this.ctx) return;
      const t = ctx.currentTime + Math.random() * 0.4;
      const src = ctx.createBufferSource();
      src.buffer = this.noise('white');
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 1200 + Math.random() * 2400;
      bp.Q.value = 8;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.25 + Math.random() * 0.3, t + 0.005);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.05 + Math.random() * 0.08);
      src.connect(bp).connect(g).connect(crackleGain);
      src.start(t, Math.random() * 2, 0.15);
    };
    this.crackleTimer = window.setInterval(scheduleCrackle, 120);

    return {
      gain: base.gain,
      stop: () => {
        base.stop();
        if (this.crackleTimer !== null) {
          clearInterval(this.crackleTimer);
          this.crackleTimer = null;
        }
        crackleGain.disconnect();
      },
    };
  }

  /** 暴风雪：风声 = 白噪声 + 缓慢扫频的低通 */
  private startSnowstorm(): ActiveSound {
    const base = this.startNoise('white', 'lowpass', 500, 0.4);
    const ctx = this.ctx!;
    // 找到 base 链路上的滤波器不易，这里单独加一层 LFO 增益模拟阵风
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.13;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 0.18;
    lfo.connect(lfoGain).connect(base.gain.gain);
    lfo.start();
    const baseStop = base.stop;
    return {
      gain: base.gain,
      stop: () => {
        lfo.stop();
        baseStop();
      },
    };
  }

  /** 专注音乐占位：柔和的环境和声垫（Cadd9），后续可替换为真实音乐文件 */
  private startMusicPad(): ActiveSound {
    const ctx = this.ctx!;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    gain.gain.setTargetAtTime(0.16, ctx.currentTime, FADE_SECONDS * 2);
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 900;
    gain.connect(filter).connect(this.master!);

    const freqs = [130.81, 196.0, 329.63, 293.66]; // C3 G3 E4 D4
    const oscs = freqs.map((f, i) => {
      const osc = ctx.createOscillator();
      osc.type = i < 2 ? 'sine' : 'triangle';
      osc.frequency.value = f;
      osc.detune.value = (i - 1.5) * 4;
      const g = ctx.createGain();
      g.gain.value = i < 2 ? 0.5 : 0.22;
      osc.connect(g).connect(gain);
      osc.start();
      return osc;
    });
    // 缓慢的呼吸感
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.08;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 0.05;
    lfo.connect(lfoGain).connect(gain.gain);
    lfo.start();

    return {
      gain,
      stop: () => {
        oscs.forEach((o) => o.stop());
        lfo.stop();
      },
    };
  }

  play(type: SoundType): void {
    if (!this.ctx || !this.master) return;
    if (this.currentType === type && this.active) return;
    this.stopActive();
    this.currentType = type;
    switch (type) {
      case 'engine':
        this.active = this.startNoise('brown', 'lowpass', 320, 0.55);
        break;
      case 'rain':
        this.active = this.startNoise('pink', 'bandpass', 1800, 0.5);
        break;
      case 'snow':
        this.active = this.startSnowstorm();
        break;
      case 'waterfall':
        this.active = this.startNoise('pink', 'lowpass', 750, 0.5);
        break;
      case 'campfire':
        this.active = this.startCampfire();
        break;
      case 'music':
        this.active = this.startMusicPad();
        break;
    }
  }

  private stopActive(): void {
    if (!this.active || !this.ctx) return;
    const { gain, stop } = this.active;
    gain.gain.setTargetAtTime(0, this.ctx.currentTime, FADE_SECONDS / 3);
    window.setTimeout(() => {
      try {
        stop();
        gain.disconnect();
      } catch {
        /* 已停止 */
      }
    }, FADE_SECONDS * 1000);
    this.active = null;
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

  /** 页面05 → 06 进港时暂停（保留现场，再次起飞时恢复） */
  pause(): void {
    if (this.ctx?.state === 'running') void this.ctx.suspend();
  }

  resume(): void {
    if (this.ctx?.state === 'suspended') void this.ctx.resume();
  }

  /** 航程结束/取消时彻底停止 */
  stop(): void {
    this.stopActive();
    this.currentType = null;
  }
}

export const audioManager = new AudioManager();
