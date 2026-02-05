import { createPublicClient, http, webSocket, type PublicClient } from "viem";
import { getConfig } from "@oracle-index/shared";

let httpClient: PublicClient | null = null;
let wsClient: PublicClient | null = null;

export function getHttpClient(): PublicClient {
  if (!httpClient) {
    const config = getConfig();
    httpClient = createPublicClient({
      transport: http(config.RPC_HTTP_URL, {
        retryCount: 3,
        retryDelay: 1000,
        batch: false,
        timeout: 60_000,
      }),
    });
  }
  return httpClient;
}

export function getWsClient(): PublicClient {
  if (!wsClient) {
    const config = getConfig();
    wsClient = createPublicClient({
      transport: webSocket(config.RPC_WS_URL, {
        retryCount: 5,
        retryDelay: 2000,
        keepAlive: { interval: 30_000 },
      }),
    });
  }
  return wsClient;
}
