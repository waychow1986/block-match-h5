/**
 * Synthesised sound effects via Web Audio (TD-013). All sources go through one
 * master gain. Muting zeroes the gain, stops every active source and prevents
 * new ones from being created; unmuting only restores the gain.
 */
export interface Sound {
  readonly muted: boolean;
  /**
   * Creates/resumes the AudioContext and plays a one-frame silent buffer; call
   * synchronously from a user-activation event (TD-010). Cheap when running.
   */
  unlock(): void;
  /** Tries to resume a suspended context (e.g. when the page becomes visible again). */
  resume(): void;
  /** Removal sound of cascade round `round` (0-based); pitch rises per round, at most two octaves. */
  playRemove(round: number): void;
  playLevelCleared(): void;
  playGameOver(): void;
  setMuted(muted: boolean): void;
}

type Ctor = new () => AudioContext;
interface Tone {
  freq: number;
  at: number;
  dur: number;
}

const VOLUME = 0.25;
const NOTE_S = 0.14;
/** Semitones the removal sound rises per cascade round. */
const ROUND_STEP = 3;

export function createSound(win: Window | null): Sound {
  const w = win as unknown as { AudioContext?: Ctor; webkitAudioContext?: Ctor } | null;
  const Ctx = w?.AudioContext ?? w?.webkitAudioContext;
  let ctx: AudioContext | null = null;
  let master: GainNode | null = null;
  let muted = false;
  const active = new Set<OscillatorNode>();

  /**
   * Creating a context outside a gesture is allowed (it starts suspended); notes
   * scheduled meanwhile play once a later activation event resumes it, because
   * currentTime does not advance while suspended.
   */
  const ensure = (): AudioContext | null => {
    if (ctx || !Ctx) return ctx;
    try {
      ctx = new Ctx();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : VOLUME;
      master.connect(ctx.destination);
    } catch {
      ctx = null;
      master = null;
    }
    return ctx;
  };

  const play = (tones: Tone[]): void => {
    if (muted || !ensure() || !ctx || !master) return;
    const now = ctx.currentTime;
    for (const t of tones) {
      const osc = ctx.createOscillator();
      const env = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(t.freq, now + t.at);
      env.gain.setValueAtTime(0.0001, now + t.at);
      env.gain.exponentialRampToValueAtTime(1, now + t.at + 0.01);
      env.gain.exponentialRampToValueAtTime(0.0001, now + t.at + t.dur);
      osc.connect(env).connect(master);
      osc.onended = () => {
        active.delete(osc);
        env.disconnect();
      };
      active.add(osc);
      osc.start(now + t.at);
      osc.stop(now + t.at + t.dur);
    }
  };
  const seq = (freqs: number[]): Tone[] => freqs.map((freq, i) => ({ freq, at: i * NOTE_S, dur: NOTE_S * 1.4 }));

  return {
    get muted() {
      return muted;
    },
    unlock() {
      const c = ensure();
      if (!c || c.state === 'running') return;
      try {
        void c.resume().catch(() => undefined);
      } catch {
        // Older engines may throw synchronously; the next gesture retries.
      }
      try {
        const src = c.createBufferSource();
        src.buffer = c.createBuffer(1, 1, 22050);
        src.connect(c.destination);
        src.start(0);
      } catch {
        // The silent buffer only helps older iOS engines.
      }
    },
    resume() {
      if (!ctx || ctx.state === 'running') return;
      try {
        void ctx.resume().catch(() => undefined);
      } catch {
        // Retried on the next gesture.
      }
    },
    playRemove(round) {
      play([{ freq: 440 * 2 ** (Math.min(Math.max(round, 0) * ROUND_STEP, 24) / 12), at: 0, dur: 0.15 }]);
    },
    playLevelCleared() {
      play(seq([523.25, 659.25, 783.99]));
    },
    playGameOver() {
      play(seq([392, 311.13, 261.63]));
    },
    setMuted(m) {
      muted = m;
      if (master && ctx) {
        master.gain.cancelScheduledValues(ctx.currentTime);
        master.gain.value = m ? 0 : VOLUME;
      }
      if (!m) return;
      for (const osc of active) {
        try {
          osc.stop();
        } catch {
          // Already stopped.
        }
      }
      active.clear();
    },
  };
}
