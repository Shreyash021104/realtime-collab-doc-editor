import "dotenv/config";

function required(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (value === undefined) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

export const env = {
  port: Number(process.env.PORT ?? 4000),
  databaseUrl: required(
    "DATABASE_URL",
    "postgres://localhost:5432/collab_docs"
  ),
  redisUrl: required("REDIS_URL", "redis://localhost:6379"),
  jwtSecret: required("JWT_SECRET", "dev-secret-change-me"),
  corsOrigin: process.env.CORS_ORIGIN ?? "http://localhost:5173",
  snapshotIntervalMs: Number(process.env.SNAPSHOT_INTERVAL_MS ?? 3000),
};
