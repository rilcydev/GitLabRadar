import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';

// Problem this solves: `userEvent.type(el, text, { advanceTimers:
// vi.advanceTimersByTime })` under plain `vi.useFakeTimers()` HANGS and
// times out the test -- reproduced with nothing more than a bare <input>,
// unrelated to any specific component. userEvent's own internal
// per-keystroke `wait()` calls resolve fine via the provided
// `advanceTimers`, but the final `act()`/React-scheduler flush after the
// last dispatched event needs one more event-loop turn than userEvent's own
// calls provide, and that turn never arrives under plain fake timers.
//
// `vi.useFakeTimers({ shouldAdvanceTime: true })` looks like the fix (it
// does stop the hang), but it also lets real wall-clock time leak into the
// virtual clock between statements -- measured at 7 failures out of 8 runs
// on a tight 299ms/300ms debounce-boundary assertion (Task 9's fix round
// 1). It is not occasionally flaky, it is broken by default for any test
// that asserts a precise elapsed-time boundary. Do not reach for it here.
//
// This helper races the typed promise against a loop of zero-duration
// pumps (`vi.advanceTimersByTimeAsync(0)`), which flushes the same stuck
// turn WITHOUT moving the virtual clock, so debounce/interval/polling
// timing assertions made right after stay exact.
//
// Any test that combines `vi.useFakeTimers()` with `userEvent.type` will
// hit this same hang -- reach for this helper instead of
// `shouldAdvanceTime` or a bespoke pump loop.
export async function typeWithFakeTimers(element: HTMLElement, text: string) {
  let done = false;
  const pending = userEvent.type(element, text, { advanceTimers: vi.advanceTimersByTime }).then(() => {
    done = true;
  });
  for (let i = 0; i < 50 && !done; i++) {
    await vi.advanceTimersByTimeAsync(0);
  }
  await pending;
}
