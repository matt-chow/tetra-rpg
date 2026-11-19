import { runJob } from "./planner.js";

self.onmessage = ({ data }) => {
  const { plan, ms } = runJob(data.job);
  self.postMessage({ id: data.id, plan, ms });
};
