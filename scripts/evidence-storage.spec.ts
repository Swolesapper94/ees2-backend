import assert from "node:assert/strict";
import {
  evidenceStoragePath,
  evidenceStorageReference,
} from "../src/lib/evidence-storage";

const objectPath = "support-form-entries/entry-123/1735689600000.jpg";

assert.equal(evidenceStorageReference(objectPath), `storage://evaluations/${objectPath}`);
assert.equal(evidenceStoragePath(`storage://evaluations/${objectPath}`), objectPath);
assert.equal(
  evidenceStoragePath(`https://example.supabase.co/storage/v1/object/public/evaluations/${objectPath}`),
  objectPath,
);
assert.equal(
  evidenceStoragePath(`https://example.supabase.co/storage/v1/object/sign/evaluations/${objectPath}?token=redacted`),
  objectPath,
);
assert.equal(evidenceStoragePath("/demo-artifacts/example.svg"), null);

console.log("✓ private evidence references and legacy Supabase URLs resolve to the correct object path");
