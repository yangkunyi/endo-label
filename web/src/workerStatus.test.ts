import { expect, test } from "vitest";
import {
  WORKER_LOADING_LABEL,
  formatElapsed,
  isWorkerLoadingMessage,
  workerLoadingToast,
  workerStatusIsLoading,
} from "./workerStatus";

test("formatElapsed renders minutes:seconds", () => {
  expect(formatElapsed(0)).toBe("0:00");
  expect(formatElapsed(7)).toBe("0:07");
  expect(formatElapsed(72)).toBe("1:12");
  expect(formatElapsed(3661)).toBe("61:01");
});

test("formatElapsed clamps negative ticks to 0:00", () => {
  expect(formatElapsed(-3)).toBe("0:00");
});

test("health worker.status drives the Loading SAM state", () => {
  expect(workerStatusIsLoading({ status: "loading" })).toBe(true);
  expect(workerStatusIsLoading({ status: "ready" })).toBe(false);
  expect(workerStatusIsLoading({ status: "error" })).toBe(false);
  expect(workerStatusIsLoading({})).toBe(false);
  expect(workerStatusIsLoading(null)).toBe(false);
  expect(workerStatusIsLoading(undefined)).toBe(false);
});

test("an error whose message says the worker is loading maps to loading", () => {
  expect(isWorkerLoadingMessage("Loading SAM 3.1 multiplex checkpoint")).toBe(true);
  expect(isWorkerLoadingMessage("SAM 3.1 load failed: CUDA out of memory")).toBe(false);
  expect(isWorkerLoadingMessage("SAM 3.1 worker is not ready")).toBe(false);
  expect(isWorkerLoadingMessage("HTTP 503")).toBe(false);
  expect(isWorkerLoadingMessage(null)).toBe(false);
});

test("workerLoadingToast keeps real errors and relabels the loading state", () => {
  expect(
    workerLoadingToast(new Error("Loading SAM 3.1 multiplex checkpoint"), "Predict failed"),
  ).toEqual({ text: WORKER_LOADING_LABEL, error: true });
  expect(workerLoadingToast(new Error("SAM 3.1 load failed: OOM"), "Predict failed")).toEqual({
    text: "SAM 3.1 load failed: OOM",
    error: true,
  });
  expect(workerLoadingToast(new Error("Something else"), "Predict failed")).toEqual({
    text: "Something else",
    error: true,
  });
  expect(workerLoadingToast("not an Error", "Propagate failed")).toEqual({
    text: "Propagate failed",
    error: true,
  });
});
