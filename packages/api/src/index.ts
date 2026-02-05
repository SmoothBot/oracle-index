import Fastify from "fastify";
import cors from "@fastify/cors";
import { getConfig } from "@oracle-index/shared";
import { overviewRoutes } from "./routes/overview.js";
import { latencyRoutes } from "./routes/latency.js";
import { gapsRoutes } from "./routes/gaps.js";
import { updatesRoutes } from "./routes/updates.js";
import { issuesRoutes } from "./routes/issues.js";
import { assetsRoutes } from "./routes/assets.js";
import { exportRoutes } from "./routes/export.js";

const config = getConfig();

const app = Fastify({
  logger: true,
});

await app.register(cors, { origin: true });

// Register routes
await app.register(overviewRoutes);
await app.register(latencyRoutes);
await app.register(gapsRoutes);
await app.register(updatesRoutes);
await app.register(issuesRoutes);
await app.register(assetsRoutes);
await app.register(exportRoutes);

try {
  await app.listen({ port: config.API_PORT, host: config.API_HOST });
  app.log.info(`API server listening on ${config.API_HOST}:${config.API_PORT}`);
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
