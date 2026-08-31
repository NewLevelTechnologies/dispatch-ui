import type { Environment } from 'vitest/environments';
import { builtinEnvironments } from 'vitest/environments';

// Capture Node's native AbortController/AbortSignal at module load — this runs
// in the worker process before jsdom's setup overrides them. React Router 7's
// data router builds a Request via undici, and undici's brand check rejects
// jsdom's AbortSignal instances ("Expected signal to be an instance of
// AbortSignal"). Reinstalling the native classes after jsdom setup keeps the
// rest of jsdom intact while letting Request accept the signal.
const NativeAbortController = globalThis.AbortController;
const NativeAbortSignal = globalThis.AbortSignal;

const jsdomEnv = builtinEnvironments.jsdom;

const env: Environment = {
  name: 'jsdom-fixed',
  transformMode: 'web',
  async setup(global, options) {
    const result = await jsdomEnv.setup(global, options);

    Object.defineProperty(global, 'AbortController', {
      value: NativeAbortController,
      writable: true,
      configurable: true,
    });
    Object.defineProperty(global, 'AbortSignal', {
      value: NativeAbortSignal,
      writable: true,
      configurable: true,
    });

    return result;
  },
};

export default env;
