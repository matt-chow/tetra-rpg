import { createSeededRandom } from "../game/pieces.js";
import { planMove } from "./search.js";

function now() {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

// Runs a planning job; shared by the in-thread planner and the worker.
export function runJob({ snapshot, profile, seed }) {
  const start = now();
  const plan = planMove(snapshot, profile, { random: createSeededRandom(seed) });
  return { plan, ms: now() - start };
}

// Answers on the calling thread immediately. Used by tests, the benchmark and
// as the fallback when workers are unavailable.
export function createSyncPlanner() {
  return {
    request(job, callback) {
      const { plan, ms } = runJob(job);
      callback(plan, ms);
    },
    dispose() {},
  };
}

// Plans in a Web Worker so search never blocks rendering.
export function createWorkerPlanner() {
  let worker;
  try {
    worker = new Worker(new URL("./worker.js", import.meta.url), { type: "module" });
  } catch {
    return createSyncPlanner();
  }
  let nextId = 0;
  const pending = new Map();
  let broken = false;
  const sync = createSyncPlanner();

  worker.onmessage = ({ data }) => {
    const callback = pending.get(data.id);
    pending.delete(data.id);
    callback?.(data.plan, data.ms);
  };
  worker.onerror = () => {
    broken = true;
    pending.clear(); // bots fall back on their own after the grace period
  };

  return {
    request(job, callback) {
      if (broken) return sync.request(job, callback);
      const id = nextId++;
      pending.set(id, callback);
      worker.postMessage({ id, job });
    },
    dispose() {
      worker.terminate();
      pending.clear();
    },
  };
}
