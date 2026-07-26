import { getSupabaseAdmin } from "../src/lib/supabase";

const BUCKET = "evaluations";
const MAX_ARTIFACT_BYTES = 20 * 1024 * 1024;
const ALLOWED_MIME_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
];

async function main() {
  const storage = getSupabaseAdmin().storage;
  const { data: buckets, error: listError } = await storage.listBuckets();
  if (listError) throw listError;

  const existing = buckets.find((bucket) => bucket.name === BUCKET);
  if (existing) {
    const { error } = await storage.updateBucket(BUCKET, {
      public: true,
      fileSizeLimit: MAX_ARTIFACT_BYTES,
      allowedMimeTypes: ALLOWED_MIME_TYPES,
    });
    if (error) throw error;
    console.log(`Updated Supabase Storage bucket: ${BUCKET}`);
    return;
  }

  const { error } = await storage.createBucket(BUCKET, {
    public: true,
    fileSizeLimit: MAX_ARTIFACT_BYTES,
    allowedMimeTypes: ALLOWED_MIME_TYPES,
  });
  if (error) throw error;
  console.log(`Created Supabase Storage bucket: ${BUCKET}`);
}

main().catch((error) => {
  console.error("Unable to configure Supabase Storage:", error);
  process.exit(1);
});
