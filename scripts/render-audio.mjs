/**
 * 背景白噪音占位素材渲染脚本。
 *
 * 将 audio.ts 中的程序化音效渲染成无缝循环的音频文件（HTML <audio> 通道，
 * 锁屏后可继续播放）。后续拿到真实素材后直接替换 public/assets/audio/*.m4a 即可。
 *
 * 用法：
 *   node scripts/render-audio.mjs            # 输出 WAV 到 .tmp/audio
 *   随后自动调用 afconvert 转成 m4a 到 public/assets/audio/
 *
 * 无缝循环策略：
 *   - 噪声类：结尾 1s 与开头做等功率交叉淡化（噪声无相位记忆，听不出接缝）
 *   - 音乐垫：所有振荡器频率对齐到「每循环整数个周期」网格，首尾严格过零，无需淡化
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const SR = 22050; // 单声道 22.05kHz，占位素材足够且体积小
const OUT_DIR = new URL('../public/assets/audio/', import.meta.url).pathname;
const TMP_DIR = new URL('../.tmp/audio/', import.meta.url).pathname;

/* ---------- 基础发生器（与 audio.ts 的算法一致） ---------- */

const white = () => Math.random() * 2 - 1;

function makePink() {
  let b0 = 0, b1 = 0, b2 = 0;
  return () => {
    const w = white();
    b0 = 0.99765 * b0 + w * 0.099046;
    b1 = 0.963 * b1 + w * 0.2965164;
    b2 = 0.57 * b2 + w * 1.0526913;
    return (b0 + b1 + b2 + w * 0.1848) * 0.08;
  };
}

function makeBrown() {
  let b = 0;
  return () => {
    b = (b + 0.02 * white()) / 1.02;
    return b * 3.5 * 0.5;
  };
}

/* ---------- RBJ 双二阶滤波器 ---------- */

function biquad(type, freq, Q = 0.7071) {
  const w0 = (2 * Math.PI * freq) / SR;
  const alpha = Math.sin(w0) / (2 * Q);
  const cosw0 = Math.cos(w0);
  let b0, b1, b2;
  if (type === 'lowpass') {
    b0 = (1 - cosw0) / 2; b1 = 1 - cosw0; b2 = (1 - cosw0) / 2;
  } else {
    b0 = alpha; b1 = 0; b2 = -alpha;
  }
  const a0 = 1 + alpha, a1 = -2 * cosw0, a2 = 1 - alpha;
  const c = { b0: b0 / a0, b1: b1 / a0, b2: b2 / a0, a1: a1 / a0, a2: a2 / a0 };
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  return (x) => {
    const y = c.b0 * x + c.b1 * x1 + c.b2 * x2 - c.a1 * y1 - c.a2 * y2;
    x2 = x1; x1 = x; y2 = y1; y1 = y;
    return y;
  };
}

/* ---------- 渲染工具 ---------- */

function render(seconds, fn) {
  const n = Math.round(seconds * SR);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = fn(i / SR);
  return out;
}

/** 结尾 fade 秒与开头等功率交叉淡化，使循环无缝（适用于噪声类） */
function crossfadeLoop(buf, fadeSeconds = 1) {
  const F = Math.round(fadeSeconds * SR);
  const n = buf.length;
  for (let i = 0; i < F; i++) {
    const t = i / F;
    const tail = buf[n - F + i];
    const head = buf[i];
    buf[n - F + i] = tail * Math.cos((t * Math.PI) / 2) + head * Math.sin((t * Math.PI) / 2);
  }
  return buf;
}

function normalize(buf, peak = 0.5) {
  let max = 0;
  for (const v of buf) max = Math.max(max, Math.abs(v));
  if (max === 0) return buf;
  const k = peak / max;
  for (let i = 0; i < buf.length; i++) buf[i] *= k;
  return buf;
}

function writeWav(path, buf) {
  const n = buf.length;
  const data = new Int16Array(n);
  for (let i = 0; i < n; i++) {
    const v = Math.max(-1, Math.min(1, buf[i]));
    data[i] = Math.round(v * 32767);
  }
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + n * 2, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(1, 22); // mono
  header.writeUInt32LE(SR, 24);
  header.writeUInt32LE(SR * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(n * 2, 40);
  writeFileSync(path, Buffer.concat([header, Buffer.from(data.buffer)]));
}

/* ---------- 6 种音效 ---------- */

const sounds = {
  engine: () => {
    const src = makeBrown();
    const lp = biquad('lowpass', 320);
    return crossfadeLoop(normalize(render(30, () => lp(src()) * 0.55)));
  },
  rain: () => {
    const src = makePink();
    const bp = biquad('bandpass', 1800, 1);
    return crossfadeLoop(normalize(render(30, () => bp(src()) * 0.5)));
  },
  snow: () => {
    const lp = biquad('lowpass', 500);
    const lfoHz = 4 / 30; // 30s 内 4 个完整阵风周期，循环无缝
    return crossfadeLoop(
      normalize(render(30, (t) => lp(white()) * (0.4 + 0.18 * Math.sin(2 * Math.PI * lfoHz * t)))),
    );
  },
  waterfall: () => {
    const src = makePink();
    const lp = biquad('lowpass', 750);
    return crossfadeLoop(normalize(render(30, () => lp(src()) * 0.5)));
  },
  campfire: () => {
    const base = makeBrown();
    const lp = biquad('lowpass', 240);
    const seconds = 30;
    const buf = render(seconds, () => lp(base()) * 0.35);
    // 随机爆裂声（平均约 8 次/秒，与 audio.ts 一致）
    let t = Math.random() * 0.4;
    while (t < seconds - 0.2) {
      const dur = 0.05 + Math.random() * 0.08;
      const bp = biquad('bandpass', 1200 + Math.random() * 2400, 8);
      const amp = 0.25 + Math.random() * 0.3;
      const start = Math.floor(t * SR);
      const len = Math.floor(dur * SR);
      const offset = Math.random(); // 噪声源随机相位起点无关紧要，用时间打散即可
      for (let i = 0; i < len && start + i < buf.length; i++) {
        const tt = i / SR;
        const env =
          tt < 0.005
            ? (tt / 0.005) * amp
            : amp * Math.exp(-(tt - 0.005) * 40);
        buf[start + i] += bp(white() + offset * 0) * env;
      }
      t += 0.05 + Math.random() * 0.4;
    }
    return crossfadeLoop(normalize(buf, 0.5));
  },
  music: () => {
    // Cadd9 垫：频率对齐到 25s 整数周期网格，首尾全部过零 → 天然无缝
    const L = 25;
    const snap = (f) => Math.round(f * L) / L;
    const parts = [
      { f: snap(130.81), type: 'sine', g: 0.5 }, // C3
      { f: snap(196.0), type: 'sine', g: 0.5 }, // G3
      { f: snap(329.63), type: 'tri', g: 0.22 }, // E4
      { f: snap(293.66), type: 'tri', g: 0.22 }, // D4
    ];
    const lp = biquad('lowpass', 900);
    const lfoHz = 2 / L; // 呼吸感：每循环恰好 2 个周期
    const tri = (phase) => (2 / Math.PI) * Math.asin(Math.sin(2 * Math.PI * phase));
    return normalize(
      render(L, (t) => {
        const breathe = 0.16 + 0.05 * Math.sin(2 * Math.PI * lfoHz * t);
        let sum = 0;
        for (const p of parts) {
          const ph = p.f * t;
          sum += (p.type === 'sine' ? Math.sin(2 * Math.PI * ph) : tri(ph)) * p.g;
        }
        return lp(sum * breathe);
      }),
      0.4,
    );
  },
};

/* ---------- 主流程 ---------- */

mkdirSync(OUT_DIR, { recursive: true });
mkdirSync(TMP_DIR, { recursive: true });

for (const [name, renderFn] of Object.entries(sounds)) {
  const wav = join(TMP_DIR, `${name}.wav`);
  const m4a = join(OUT_DIR, `${name}.m4a`);
  writeWav(wav, renderFn());
  execFileSync('afconvert', ['-f', 'm4af', '-d', 'aac', '-b', '64000', '-q', '127', wav, m4a]);
  console.log(`✓ ${name}.m4a`);
}
rmSync(TMP_DIR, { recursive: true, force: true });
console.log('完成：public/assets/audio/');
