/**
 * Flush immutable dirty snapshots in order, including edits made during a write.
 * The owner acknowledges only the snapshot that was actually written.
 * Failed writes remain dirty; a subsequent flush retries them.
 */
export function createDraftSaver({
  snapshot,
  write,
  acknowledge,
  onSaving = () => {},
}) {
  let flight = null;
  return {
    flush() {
      if (flight) return flight;
      if (snapshot() === null) return Promise.resolve();
      flight = Promise.resolve()
        .then(async () => {
          onSaving(true);
          try {
            let draft;
            while ((draft = snapshot()) !== null) {
              const result = await write(draft);
              acknowledge(draft, result);
            }
          } finally {
            onSaving(false);
          }
        })
        .finally(() => {
          flight = null;
        });
      return flight;
    },
  };
}
