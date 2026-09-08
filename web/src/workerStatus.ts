// Display-only status helpers for the desk (ticket 09): the Propagate Job
// stays blocking, so the desk shows an indeterminate state, not progress.

// Desk text for the SAM 3.1 worker still loading its checkpoint.
export const WORKER_LOADING_LABEL = "Loading SAM model…";

export function formatElapsed(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, "0")}`;
}

export function workerStatusIsLoading(
  worker: { status?: string | null } | null | undefined,
): boolean {
  return worker?.status === "loading";
}

// Predict/Propagate failures while the checkpoint loads carry the worker
// health message, which starts with "Loading" (predictor.py); a failed load
// starts with "SAM 3.1 load failed". The failure arrives as 503
// (WorkerNotReady) or 500 (PredictorRuntimeError), so the message text is
// the reliable signal — the desk cannot see the status code.
export function isWorkerLoadingMessage(
  message: string | null | undefined,
): boolean {
  return /^\s*loading\b/i.test(message ?? "");
}

export function workerLoadingToast(
  err: unknown,
  fallback: string,
): { text: string; error: boolean } {
  const message = err instanceof Error ? err.message : fallback;
  return {
    text: isWorkerLoadingMessage(message) ? WORKER_LOADING_LABEL : message,
    error: true,
  };
}
