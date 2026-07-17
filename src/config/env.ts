import dotenv from "dotenv";

dotenv.config();

function required(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (value === undefined) {
    // Don't hard-crash the scaffold during local dev with placeholders.
    // Routes that need a missing value will fail loudly at call time.
    console.warn(`[env] Missing environment variable: ${name}`);
    return "";
  }
  return value;
}

export const env = {
  nodeEnv: process.env.NODE_ENV ?? "development",
  port: Number(process.env.PORT ?? 4000),
  corsOrigins: (process.env.CORS_ORIGIN ?? "http://localhost:3000")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean),

  databaseUrl: required("DATABASE_URL"),
  directUrl: required("DIRECT_URL"),

  supabaseUrl: required("SUPABASE_URL"),
  supabaseAnonKey: required("SUPABASE_ANON_KEY"),
  supabaseServiceRoleKey: required("SUPABASE_SERVICE_ROLE_KEY"),

  openaiApiKey: required("OPENAI_API_KEY"),
  openaiModel: process.env.OPENAI_MODEL ?? "gpt-4o-mini",

  goalReminderDays: Number(process.env.GOAL_REMINDER_DAYS ?? 14),
  documentationLowDensityPerMonth: Number(process.env.DOCUMENTATION_LOW_DENSITY_PER_MONTH ?? 0.5),
  documentationHighDensityPerMonth: Number(process.env.DOCUMENTATION_HIGH_DENSITY_PER_MONTH ?? 1.5),
  lateClusterPercent: Number(process.env.LATE_CLUSTER_PERCENT ?? 50),
  lateClusterDays: Number(process.env.LATE_CLUSTER_DAYS ?? 14),
  lowArtifactDensityPercent: Number(process.env.LOW_ARTIFACT_DENSITY_PERCENT ?? 70),
} as const;

export const isProd = env.nodeEnv === "production";
