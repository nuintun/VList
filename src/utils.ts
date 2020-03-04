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
      get: () => (supportsPassive = true)
    });

    window.addEventListener('test', () => true, options);
  } catch {
    // Not supports passive
  }

  return supportsPassive;
})();
