import assert from "node:assert/strict";
import {
  evidenceStoragePath,
  evidenceStorageReference,
} from "../src/lib/evidence-storage";

const objectPath = "support-form-entries/entry-123/1735689600000.jpg";
const observationPath = "performance-observations/observation-123/1735689600000-document.pdf";

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
assert.equal(evidenceStorageReference(observationPath), `storage://evaluations/${observationPath}`);
assert.equal(evidenceStoragePath(`storage://evaluations/${observationPath}`), observationPath);

console.log("✓ entry and observation evidence references resolve to private storage paths");
