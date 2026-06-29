// ─────────────────────────────────────────────────────────────────
// IPPS-A Integration Layer (Delta Section 8)
// STATUS: Stub — not implemented for MVP.
//
// When authorized, this will:
//   - Import authoritative personnel data (rank, MOS, unit, chain of command)
//   - Sync counseling dates to the official record
//   - Pull active-duty status codes
//   - Submit completed NCOERs directly to iPERMS
//
// Requires: IPPS-A API access, IL4 hosting, CAC/PKI auth.
// ─────────────────────────────────────────────────────────────────

export interface IppsaSoldierRecord {
  dodid: string;
  rank: string;
  mos: string;
  unit: string;
  // ...authoritative fields filled in once integration is live.
}

/**
 * Fetch a soldier's authoritative record from IPPS-A by DoD ID.
 * Stub — returns null until the integration is authorized for production.
 */
export async function fetchSoldierRecord(
  dodid: string
): Promise<IppsaSoldierRecord | null> {
  void dodid;
  console.warn("IPPS-A integration not yet implemented");
  return null;
}

/**
 * Submit a completed evaluation to iPERMS via IPPS-A.
 * Stub — returns failure until the integration is authorized for production.
 */
export async function submitToIPERMS(
  evaluationId: string
): Promise<{ success: boolean }> {
  void evaluationId;
  console.warn("iPERMS submission not yet implemented");
  return { success: false };
}
