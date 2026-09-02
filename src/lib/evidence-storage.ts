import { getSupabaseAdmin } from "@/lib/supabase";

export const EVIDENCE_BUCKET = "evaluations";
const STORAGE_REFERENCE_PREFIX = `storage://${EVIDENCE_BUCKET}/`;
const PUBLIC_OBJECT_MARKER = `/storage/v1/object/public/${EVIDENCE_BUCKET}/`;
const SIGNED_OBJECT_MARKER = `/storage/v1/object/sign/${EVIDENCE_BUCKET}/`;

export function evidenceStorageReference(storagePath: string): string {
  return `${STORAGE_REFERENCE_PREFIX}${storagePath}`;
}

export function evidenceStoragePath(fileUrl: string): string | null {
  if (fileUrl.startsWith(STORAGE_REFERENCE_PREFIX)) {
    return fileUrl.slice(STORAGE_REFERENCE_PREFIX.length);
  }

  try {
    const pathname = new URL(fileUrl).pathname;
    for (const marker of [PUBLIC_OBJECT_MARKER, SIGNED_OBJECT_MARKER]) {
      const markerIndex = pathname.indexOf(marker);
      if (markerIndex >= 0) return decodeURIComponent(pathname.slice(markerIndex + marker.length));
    }
  } catch {
    // Local demo assets and file:// development uploads are not Supabase objects.
  }

  return null;
}

export async function createEvidenceAccessUrl(fileUrl: string, expiresInSeconds = 300): Promise<string> {
  const storagePath = evidenceStoragePath(fileUrl);
  if (!storagePath) return fileUrl;

  const { data, error } = await getSupabaseAdmin().storage
    .from(EVIDENCE_BUCKET)
    .createSignedUrl(storagePath, expiresInSeconds);
  if (error || !data?.signedUrl) {
    throw new Error(`Unable to authorize evidence access: ${error?.message ?? "signed URL unavailable"}`);
  }
  return data.signedUrl;
}

export async function withEvidenceAccessUrls<T extends { fileUrl: string }>(artifacts: T[]): Promise<T[]> {
  return Promise.all(artifacts.map(async (artifact) => ({
    ...artifact,
    fileUrl: await createEvidenceAccessUrl(artifact.fileUrl),
  })));
}

export async function loadEvidenceBuffer(fileUrl: string): Promise<Buffer> {
  const storagePath = evidenceStoragePath(fileUrl);
  if (storagePath) {
    const { data, error } = await getSupabaseAdmin().storage
      .from(EVIDENCE_BUCKET)
      .download(storagePath);
    if (error || !data) throw new Error(`Unable to retrieve evidence: ${error?.message ?? "object unavailable"}`);
    return Buffer.from(await data.arrayBuffer());
  }

  const response = await fetch(fileUrl);
  if (!response.ok) throw new Error(`Unable to retrieve evidence (${response.status}).`);
  return Buffer.from(await response.arrayBuffer());
}
