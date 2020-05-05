/**
 * @module utils
 */

export const supportsPassive: boolean = ((): boolean => {
  // Test via a getter in the options object to see
  // if the passive property is accessed
  let supportsPassive: boolean = false;

  // Start test
  try {
    const options: AddEventListenerOptions = Object.defineProperty({}, 'passive', {
      get: (): boolean => (supportsPassive = true)
    });

    window.addEventListener('test', (): boolean => true, options);
  } catch {
    // Not supports passive
  }

  return supportsPassive;
})();

export type TimeoutID = { id: number };

const hasPerformance: boolean = performance && typeof performance.now === 'function';

const now: () => number = hasPerformance ? (): number => performance.now() : (): number => Date.now();

function cancelTimeout(timeoutID: TimeoutID): void {
  timeoutID && cancelAnimationFrame(timeoutID.id);
}

function requestTimeout(callback: () => void, delay: number): TimeoutID {
  const start: number = now();

  const tick: () => void = (): void => {
    if (now() - start >= delay) return callback();

    timeoutID.id = requestAnimationFrame(tick);
  };

  const timeoutID: TimeoutID = {
    id: requestAnimationFrame(tick)
  };

  return timeoutID;
}

export function debounce(callback: () => void, delay: number): () => TimeoutID {
  let timer: TimeoutID;

  return (): TimeoutID => {
    cancelTimeout(timer);

    return (timer = requestTimeout(callback, delay));
  };
}
