// Small DOM helpers shared by features.

/** Coalesces calls into one run per animation frame. */
export function frameScheduler(run: () => void): { schedule(): void; cancel(): void } {
  let frame: number | null = null;
  return {
    schedule() {
      if (frame !== null) return;
      frame = requestAnimationFrame(() => {
        frame = null;
        try {
          run();
        } catch {
          // Features fail silently; the page must keep working.
        }
      });
    },
    cancel() {
      if (frame !== null) cancelAnimationFrame(frame);
      frame = null;
    },
  };
}

/**
 * Calls `found` once `selector` matches, polling (no document-wide observer).
 * Returns a cancel function. Gives up silently after `timeoutMs`.
 */
export function whenAvailable<T extends Element>(
  selector: string,
  found: (element: T) => void,
  { intervalMs = 250, timeoutMs = 30_000 } = {},
): () => void {
  const startedAt = Date.now();
  let timer: number | null = null;
  const check = () => {
    const element = document.querySelector<T>(selector);
    if (element) {
      timer = null;
      found(element);
    } else if (Date.now() - startedAt < timeoutMs) {
      timer = window.setTimeout(check, intervalMs);
    } else {
      timer = null;
    }
  };
  check();
  return () => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
  };
}

/** Writes an attribute only when it changes, so observers are not re-triggered by no-op writes. */
export function setAttr(element: Element, name: string, value: string): void {
  if (element.getAttribute(name) !== value) element.setAttribute(name, value);
}

export function setText(element: Element, value: string): void {
  if (element.textContent !== value) element.textContent = value;
}
