import dotenv from "dotenv";

dotenv.config();

const nodeEnv = process.env.NODE_ENV ?? "development";

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
  nodeEnv,
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

  personnelProvider: process.env.PERSONNEL_PROVIDER ?? (nodeEnv === "production" ? "NOT_CONFIGURED" : "IPPS_A_STUB"),
  profilePhotoProvider: process.env.PROFILE_PHOTO_PROVIDER ?? (nodeEnv === "production" ? "NOT_CONFIGURED" : "MICROSOFT_365_STUB"),
  showDemoSourceLabels: (process.env.SHOW_DEMO_SOURCE_LABELS ?? (nodeEnv === "production" ? "false" : "true")) === "true",
  supportFormParserMode: process.env.SUPPORT_FORM_PARSER_MODE ?? "REAL",
  demoSupportFormSha256: process.env.DEMO_SUPPORT_FORM_SHA256 ?? "a10a1a969569de704a728027f9f992b88cf78b604eb090c874bc497693d49b1b",
} as const;

export const isProd = env.nodeEnv === "production";

const supportedPersonnelProviders = new Set(["NOT_CONFIGURED", "IPPS_A_STUB"]);
const supportedPhotoProviders = new Set(["NOT_CONFIGURED", "MICROSOFT_365_STUB"]);
const supportedParserModes = new Set(["REAL", "DEMO_FIXTURE"]);

if (!supportedPersonnelProviders.has(env.personnelProvider)) {
  throw new Error(`PERSONNEL_PROVIDER=${env.personnelProvider} is not implemented.`);
}

if (!supportedPhotoProviders.has(env.profilePhotoProvider)) {
  throw new Error(`PROFILE_PHOTO_PROVIDER=${env.profilePhotoProvider} is not implemented.`);
}

if (!supportedParserModes.has(env.supportFormParserMode)) {
  throw new Error(`SUPPORT_FORM_PARSER_MODE=${env.supportFormParserMode} is not implemented.`);
}

if (isProd && (env.personnelProvider.endsWith("_STUB") || env.profilePhotoProvider.endsWith("_STUB") || env.supportFormParserMode === "DEMO_FIXTURE")) {
  throw new Error("Demo stub providers and fixture parsing are disabled in production.");
}
