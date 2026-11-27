import type { Page } from '@playwright/test';

/**
 * Strict autoplay-policy stand-in plus Web Audio log (design: testability, "音频观察").
 * Every AudioContext reports `suspended` until `resume()` is called while an
 * HTML user-activation event is being dispatched (keydown, mousedown, mouse
 * pointerdown, non-mouse pointerup, touchend, click). Oscillator starts while
 * running count as audible; starts while suspended become audible only if a
 * later activated resume happens (a suspended context's clock does not run,
 * so the scheduled note plays after resuming). Test-side instrumentation only.
 */
export async function installStrictAudio(page: Page): Promise<void> {
  await page.addInitScript(() => {
    interface AudioLog {
      contexts: number;
      blockedResumes: number;
      activatedResumes: number;
      audible: number;
      pendingStarts: number;
      silentStarts: number;
      active: Set<unknown>;
      stoppedWhileActive: number;
    }
    const log: AudioLog = {
      contexts: 0,
      blockedResumes: 0,
      activatedResumes: 0,
      audible: 0,
      pendingStarts: 0,
      silentStarts: 0,
      active: new Set(),
      stoppedWhileActive: 0,
    };
    (window as unknown as { audioLog: AudioLog }).audioLog = log;
    const isActivation = (e: Event | undefined): boolean => {
      if (!e) return false;
      const pt = (e as PointerEvent).pointerType;
      switch (e.type) {
        case 'keydown':
        case 'mousedown':
        case 'touchend':
        case 'click':
          return true;
        case 'pointerdown':
          return pt === 'mouse';
        case 'pointerup':
          return pt !== 'mouse';
        default:
          return false;
      }
    };
    const state = new WeakMap<BaseAudioContext, AudioContextState>();
    const pending = new WeakMap<BaseAudioContext, number>();
    const Orig = window.AudioContext;
    class StrictAudioContext extends Orig {
      constructor(options?: AudioContextOptions) {
        super(options);
        log.contexts++;
        state.set(this, 'suspended');
        pending.set(this, 0);
      }
      override resume(): Promise<void> {
        if (!isActivation(window.event)) {
          log.blockedResumes++;
          return Promise.resolve();
        }
        log.activatedResumes++;
        if (state.get(this) !== 'running') {
          state.set(this, 'running');
          log.audible += pending.get(this) ?? 0;
          log.pendingStarts -= pending.get(this) ?? 0;
          pending.set(this, 0);
        }
        return super.resume();
      }
    }
    Object.defineProperty(StrictAudioContext.prototype, 'state', {
      get(this: BaseAudioContext) {
        return state.get(this) ?? 'suspended';
      },
    });
    Object.defineProperty(window, 'AudioContext', { value: StrictAudioContext, configurable: true, writable: true });
    Object.defineProperty(window, 'webkitAudioContext', { value: StrictAudioContext, configurable: true, writable: true });

    const proto = AudioScheduledSourceNode.prototype;
    const start = proto.start;
    const stop = proto.stop;
    proto.start = function (this: AudioScheduledSourceNode, ...args: [number?]) {
      if (this instanceof AudioBufferSourceNode) log.silentStarts++;
      else {
        const ctx = this.context;
        if (state.get(ctx) === 'running') log.audible++;
        else {
          log.pendingStarts++;
          pending.set(ctx, (pending.get(ctx) ?? 0) + 1);
        }
        log.active.add(this);
        this.addEventListener('ended', () => log.active.delete(this));
      }
      return start.apply(this, args);
    };
    proto.stop = function (this: AudioScheduledSourceNode, ...args: [number?]) {
      if (args[0] === undefined && log.active.delete(this)) log.stoppedWhileActive++;
      return stop.apply(this, args);
    };
  });
}

export interface AudioSnapshot {
  contexts: number;
  blockedResumes: number;
  activatedResumes: number;
  audible: number;
  pendingStarts: number;
  silentStarts: number;
  active: number;
  stopped: number;
  running: boolean;
}

export const audioLog = (page: Page): Promise<AudioSnapshot> =>
  page.evaluate(() => {
    const l = (window as unknown as {
      audioLog: Omit<AudioSnapshot, 'active' | 'stopped' | 'running'> & { active: Set<unknown>; stoppedWhileActive: number };
    }).audioLog;
    return {
      contexts: l.contexts,
      blockedResumes: l.blockedResumes,
      activatedResumes: l.activatedResumes,
      audible: l.audible,
      pendingStarts: l.pendingStarts,
      silentStarts: l.silentStarts,
      active: l.active.size,
      stopped: l.stoppedWhileActive,
      running: l.activatedResumes > 0,
    };
  });
