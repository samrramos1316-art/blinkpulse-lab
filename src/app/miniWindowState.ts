/**
 * Whether the mini window (Document Picture-in-Picture) is open (SPEC_AMENDMENT_04
 * F1). While it is, the main page counts as visible for analysis even if the
 * browser hides it: Chrome keeps delivering video frames and timers to a page with an
 * open mini window (browser test in SPEC_AMENDMENT_04).
 */

let open = false;
const listeners = new Set<() => void>();

export const miniWindowState = {
  isOpen: (): boolean => open,
  set(value: boolean): void {
    if (value === open) return;
    open = value;
    for (const f of listeners) f();
  },
  subscribe(f: () => void): () => void {
    listeners.add(f);
    return () => {
      listeners.delete(f);
    };
  },
};
