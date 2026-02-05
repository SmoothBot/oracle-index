import { migrate } from "./migrate.js";
import { backfill } from "./backfill.js";
import { startLiveIndexing, stopLiveIndexing } from "./live.js";
import { startProcessingLoop, stopProcessingLoop } from "./processing.js";
import { logger } from "./logger.js";

async function main(): Promise<void> {
  logger.info("Oracle indexer starting");

  // Step 1: Run migrations
  await migrate();

  // Step 2: Backfill historical data
  const lastBlock = await backfill();

  // Step 3: Start live indexing
  startLiveIndexing(lastBlock);

  // Step 4: Start data processing loop (metrics, gaps, issues)
  startProcessingLoop();

  logger.info("Indexer fully operational");
}

// Graceful shutdown
function shutdown(): void {
  logger.info("Shutting down...");
  stopLiveIndexing();
  stopProcessingLoop();
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

main().catch((err) => {
  logger.fatal({ err }, "Indexer failed to start");
  process.exit(1);
});
