export function createDraftSaver<T, R>(options: {
  snapshot: () => T | null;
  write: (snapshot: T) => Promise<R>;
  acknowledge: (snapshot: T, result: R) => void;
  onSaving?: (saving: boolean) => void;
}): { flush: () => Promise<void> };
