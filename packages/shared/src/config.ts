import { z } from "zod";

const envSchema = z.object({
  RPC_HTTP_URL: z.string().url().default("https://testnet.riselabs.xyz"),
  RPC_WS_URL: z.string().default("wss://testnet.riselabs.xyz"),
  ORACLE_CONTRACT_ADDRESS: z
    .string()
    .regex(/^0x[a-fA-F0-9]{40}$/)
    .default("0xacC0a0cF13571d30B4b8637996F5D6D774d4fd62"),
  START_BLOCK: z.coerce.bigint().default(0n),
  DATABASE_URL: z
    .string()
    .default("postgresql://postgres:postgres@localhost:5432/oracle_index"),
  BATCH_SIZE: z.coerce.number().int().positive().default(1000),
  BACKFILL_CONCURRENCY: z.coerce.number().int().positive().default(3),
  API_PORT: z.coerce.number().int().positive().default(3001),
  API_HOST: z.string().default("0.0.0.0"),
});

export type EnvConfig = z.infer<typeof envSchema>;

let _config: EnvConfig | null = null;

export function getConfig(): EnvConfig {
  if (!_config) {
    _config = envSchema.parse(process.env);
  }
  return _config;
}
