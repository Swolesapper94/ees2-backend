import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
} from "@react-pdf/renderer";
import React from "react";

export interface EvalPdfSection {
  section: string;
  rating: string | null;
  bullets: string[];
}

export interface EvalPdfData {
  formTitle: string;
  soldierName: string;
  rank: string;
  mos: string;
  dutyTitle: string;
  unit: string;
  periodStart: string;
  periodEnd: string;
  ratedMonths?: number;
  dutyDescription?: string;
  raterName: string;
  seniorRaterName: string;
  seniorRaterRating: string | null;
  sections: EvalPdfSection[];
  // MVP audit 5.15 — true when the evaluation's workflow status is not yet
  // COMPLETE/SUBMITTED/ACCEPTED. Renders a diagonal "DRAFT" watermark across
  // the page instead of silently producing an official-looking export for
  // an evaluation that hasn't actually finished the review/signature
  // process.
  isDraftPreview: boolean;
}

// Army-standard section labels for the form
const SECTION_DISPLAY: Record<string, string> = {
  CHARACTER: "a. CHARACTER",
  PRESENCE: "b. PRESENCE",
  INTELLECT: "c. INTELLECT",
  LEADS: "d. LEADS",
  DEVELOPS: "e. DEVELOPS",
  ACHIEVES: "f. ACHIEVES",
  RATER_OVERALL: "RATER — OVERALL PERFORMANCE",
  SENIOR_RATER_OVERALL: "SENIOR RATER — OVERALL POTENTIAL",
  SOLDIER_COMMENTS: "RATED SOLDIER COMMENTS",
};

const RATING_DISPLAY: Record<string, string> = {
  MET_STANDARD: "MET STANDARD",
  DID_NOT_MEET_STANDARD: "DID NOT MEET STANDARD",
  NOT_MET_STANDARD: "NOT MET STANDARD",
  QUALIFIED: "QUALIFIED",
  EXCEEDED_STANDARD: "EXCEEDED STANDARD",
  FAR_EXCEEDED_STANDARD: "FAR EXCEEDED STANDARD",
  MOST_QUALIFIED: "MOST QUALIFIED",
  HIGHLY_QUALIFIED: "HIGHLY QUALIFIED",
  NOT_QUALIFIED: "NOT QUALIFIED",
};

// Army olive drab accent
const ARMY_GREEN = "#4B5320";
const BORDER_DARK = "#1a1a1a";
const LABEL_BG = "#f0f0e8";

const styles = StyleSheet.create({
  page: {
    paddingTop: 24,
    paddingBottom: 24,
    paddingHorizontal: 28,
    fontSize: 8,
    fontFamily: "Helvetica",
    color: "#111",
    backgroundColor: "#fff",
  },
  // ── Form header ────────────────────────────────────────
  formHeader: {
    borderBottom: `2pt solid ${BORDER_DARK}`,
    marginBottom: 6,
    paddingBottom: 4,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
  },
  formTitleBlock: { flex: 1 },
  formTitle: { fontSize: 11, fontFamily: "Helvetica-Bold", color: ARMY_GREEN },
  formSubtitle: { fontSize: 6.5, color: "#555", marginTop: 2 },
  formNumber: { fontSize: 7, color: "#555", textAlign: "right" },

  // ── Part labels ────────────────────────────────────────
  partHeader: {
    backgroundColor: ARMY_GREEN,
    paddingHorizontal: 6,
    paddingVertical: 3,
    marginBottom: 0,
  },
  partHeaderText: {
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
    color: "#fff",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },

  // ── Field grid ─────────────────────────────────────────
  fieldGrid: {
    border: `1pt solid ${BORDER_DARK}`,
    borderTop: "0",
    marginBottom: 5,
  },
  fieldRow: {
    flexDirection: "row",
    borderBottom: `0.5pt solid #999`,
  },
  fieldRowLast: {
    flexDirection: "row",
  },
  fieldCell: {
    flex: 1,
    paddingHorizontal: 5,
    paddingVertical: 3,
    borderRight: `0.5pt solid #999`,
  },
  fieldCellLast: {
    flex: 1,
    paddingHorizontal: 5,
    paddingVertical: 3,
  },
  fieldLabel: {
    fontSize: 6,
    fontFamily: "Helvetica-Bold",
    color: "#555",
    textTransform: "uppercase",
    marginBottom: 1,
    backgroundColor: LABEL_BG,
  },
  fieldValue: {
    fontSize: 8.5,
    fontFamily: "Helvetica-Bold",
  },

  // ── Part IV sections ───────────────────────────────────
  sectionBlock: {
    border: `1pt solid ${BORDER_DARK}`,
    marginBottom: 4,
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: LABEL_BG,
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderBottom: `0.5pt solid #999`,
  },
  sectionName: { fontSize: 8, fontFamily: "Helvetica-Bold" },
  ratingBox: {
    backgroundColor: ARMY_GREEN,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 2,
  },
  ratingText: {
    fontSize: 7,
    fontFamily: "Helvetica-Bold",
    color: "#fff",
    textTransform: "uppercase",
  },
  bulletArea: { paddingHorizontal: 8, paddingVertical: 4 },
  bulletRow: { flexDirection: "row", marginBottom: 2 },
  bulletDot: { width: 8, fontSize: 8 },
  bulletText: { flex: 1, fontSize: 8, lineHeight: 1.4 },
  noBullets: { fontSize: 7.5, color: "#888", paddingVertical: 2 },

  // ── Signature block ────────────────────────────────────
  sigSection: {
    border: `1pt solid ${BORDER_DARK}`,
    marginTop: 4,
  },
  sigRow: {
    flexDirection: "row",
  },
  sigCell: {
    flex: 1,
    padding: 6,
    borderRight: `0.5pt solid #999`,
  },
  sigCellLast: {
    flex: 1,
    padding: 6,
  },
  sigLabel: {
    fontSize: 6,
    fontFamily: "Helvetica-Bold",
    color: "#555",
    textTransform: "uppercase",
    marginBottom: 2,
  },
  sigName: { fontSize: 8.5, fontFamily: "Helvetica-Bold" },
  sigRating: { fontSize: 8, color: ARMY_GREEN, marginTop: 1 },
  sigLine: {
    borderBottom: `0.5pt solid #999`,
    marginTop: 12,
    marginBottom: 2,
  },
  sigLinelabel: { fontSize: 6, color: "#888" },

  // ── Footer ─────────────────────────────────────────────
  footer: {
    marginTop: 8,
    borderTop: `0.5pt solid #ccc`,
    paddingTop: 3,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  footerText: { fontSize: 6, color: "#888" },
  // MVP audit 5.15 — diagonal, low-opacity overlay marking an export of an
  // evaluation that hasn't reached a final workflow state.
  watermark: {
    position: "absolute",
    top: 320,
    left: -120,
    width: 700,
    textAlign: "center",
    fontSize: 64,
    fontWeight: 700,
    color: "#c0392b",
    opacity: 0.18,
    transform: "rotate(-38deg)",
  },
});

export function NCOERTemplate({ data }: { data: EvalPdfData }): React.ReactElement {
  const partIVSections = data.sections.filter((s) =>
    ["CHARACTER", "PRESENCE", "INTELLECT", "LEADS", "DEVELOPS", "ACHIEVES"].includes(s.section),
  );
  const raterOverall = data.sections.find((s) => s.section === "RATER_OVERALL");
  const srOverall = data.sections.find((s) => s.section === "SENIOR_RATER_OVERALL");
  const soldierComments = data.sections.find((s) => s.section === "SOLDIER_COMMENTS");

  return (
    <Document>
      <Page size="LETTER" style={styles.page}>
        {data.isDraftPreview ? (
          <Text style={styles.watermark} fixed>
            DRAFT — NOT FOR OFFICIAL USE
          </Text>
        ) : null}

        {/* ── Form Header ── */}
        <View style={styles.formHeader}>
          <View style={styles.formTitleBlock}>
            <Text style={styles.formTitle}>{data.formTitle}</Text>
            <Text style={styles.formSubtitle}>
              For use of this form, see AR 623-3; the proponent agency is DCS, G-1.
            </Text>
          </View>
          <Text style={styles.formNumber}>Generated by EES 2.0</Text>
        </View>

        {/* ── Part I: Administrative Data ── */}
        <View style={styles.partHeader}>
          <Text style={styles.partHeaderText}>Part I — Administrative Data</Text>
        </View>
        <View style={styles.fieldGrid}>
          <View style={styles.fieldRow}>
            <View style={styles.fieldCell}>
              <Text style={styles.fieldLabel}>Name (Last, First MI)</Text>
              <Text style={styles.fieldValue}>{data.soldierName}</Text>
            </View>
            <View style={styles.fieldCell}>
              <Text style={styles.fieldLabel}>Rank / Grade</Text>
              <Text style={styles.fieldValue}>{data.rank}</Text>
            </View>
            <View style={styles.fieldCellLast}>
              <Text style={styles.fieldLabel}>MOS / AOC</Text>
              <Text style={styles.fieldValue}>{data.mos}</Text>
            </View>
          </View>
          <View style={styles.fieldRow}>
            <View style={styles.fieldCell}>
              <Text style={styles.fieldLabel}>Unit / Organization</Text>
              <Text style={styles.fieldValue}>{data.unit}</Text>
            </View>
            <View style={styles.fieldCell}>
              <Text style={styles.fieldLabel}>Period Covered (From)</Text>
              <Text style={styles.fieldValue}>{data.periodStart}</Text>
            </View>
            <View style={styles.fieldCellLast}>
              <Text style={styles.fieldLabel}>Period Covered (Thru)</Text>
              <Text style={styles.fieldValue}>{data.periodEnd}</Text>
            </View>
          </View>
        </View>

        {/* ── Part III: Duty Description ── */}
        <View style={styles.partHeader}>
          <Text style={styles.partHeaderText}>Part III — Duty Description</Text>
        </View>
        <View style={styles.fieldGrid}>
          <View style={styles.fieldRowLast}>
            <View style={styles.fieldCellLast}>
              <Text style={styles.fieldLabel}>Principal Duty Title</Text>
              <Text style={styles.fieldValue}>{data.dutyTitle || "(not set)"}</Text>
            </View>
          </View>
        </View>

        {/* ── Part IV: Army Values / Performance Objectives ── */}
        <View style={styles.partHeader}>
          <Text style={styles.partHeaderText}>Part IV — Army Values / NCO Responsibilities</Text>
        </View>

        {partIVSections.map((s) => (
          <View key={s.section} style={styles.sectionBlock} wrap={false}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionName}>
                {SECTION_DISPLAY[s.section] ?? s.section}
              </Text>
              {s.rating ? (
                <View style={styles.ratingBox}>
                  <Text style={styles.ratingText}>
                    {RATING_DISPLAY[s.rating] ?? s.rating}
                  </Text>
                </View>
              ) : (
                <View style={[styles.ratingBox, { backgroundColor: "#bbb" }]}>
                  <Text style={styles.ratingText}>NOT RATED</Text>
                </View>
              )}
            </View>
            <View style={styles.bulletArea}>
              {s.bullets.length === 0 ? (
                <Text style={styles.noBullets}>(no bullets entered)</Text>
              ) : (
                s.bullets.map((b, i) => (
                  <View key={i} style={styles.bulletRow}>
                    <Text style={styles.bulletDot}>•</Text>
                    <Text style={styles.bulletText}>{b}</Text>
                  </View>
                ))
              )}
            </View>
          </View>
        ))}

        {/* ── Rater Overall ── */}
        {raterOverall && raterOverall.bullets.length > 0 && (
          <>
            <View style={styles.partHeader}>
              <Text style={styles.partHeaderText}>Part IV — Rater Overall Performance</Text>
            </View>
            <View style={styles.sectionBlock} wrap={false}>
              <View style={styles.bulletArea}>
                {raterOverall.bullets.map((b, i) => (
                  <View key={i} style={styles.bulletRow}>
                    <Text style={styles.bulletDot}>•</Text>
                    <Text style={styles.bulletText}>{b}</Text>
                  </View>
                ))}
              </View>
            </View>
          </>
        )}

        {/* ── Senior Rater Overall ── */}
        <View style={styles.partHeader}>
          <Text style={styles.partHeaderText}>Part V — Senior Rater</Text>
        </View>
        <View style={styles.sectionBlock} wrap={false}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionName}>Overall Potential</Text>
            {data.seniorRaterRating ? (
              <View style={styles.ratingBox}>
                <Text style={styles.ratingText}>
                  {RATING_DISPLAY[data.seniorRaterRating] ?? data.seniorRaterRating}
                </Text>
              </View>
            ) : (
              <View style={[styles.ratingBox, { backgroundColor: "#bbb" }]}>
                <Text style={styles.ratingText}>PENDING</Text>
              </View>
            )}
          </View>
          {srOverall && srOverall.bullets.length > 0 && (
            <View style={styles.bulletArea}>
              {srOverall.bullets.map((b, i) => (
                <View key={i} style={styles.bulletRow}>
                  <Text style={styles.bulletDot}>•</Text>
                  <Text style={styles.bulletText}>{b}</Text>
                </View>
              ))}
            </View>
          )}
        </View>

        {/* ── Soldier Comments ── */}
        {soldierComments && soldierComments.bullets.length > 0 && (
          <>
            <View style={styles.partHeader}>
              <Text style={styles.partHeaderText}>Rated Soldier Comments</Text>
            </View>
            <View style={styles.sectionBlock} wrap={false}>
              <View style={styles.bulletArea}>
                {soldierComments.bullets.map((b, i) => (
                  <View key={i} style={styles.bulletRow}>
                    <Text style={styles.bulletDot}>•</Text>
                    <Text style={styles.bulletText}>{b}</Text>
                  </View>
                ))}
              </View>
            </View>
          </>
        )}

        {/* ── Signatures ── */}
        <View style={styles.sigSection} wrap={false}>
          <View style={styles.sigRow}>
            <View style={styles.sigCell}>
              <Text style={styles.sigLabel}>Rater Signature</Text>
              <Text style={styles.sigName}>{data.raterName}</Text>
              <View style={styles.sigLine} />
              <Text style={styles.sigLinelabel}>Signature / Date</Text>
            </View>
            <View style={styles.sigCellLast}>
              <Text style={styles.sigLabel}>Senior Rater Signature</Text>
              <Text style={styles.sigName}>{data.seniorRaterName}</Text>
              {data.seniorRaterRating ? (
                <Text style={styles.sigRating}>
                  {RATING_DISPLAY[data.seniorRaterRating] ?? data.seniorRaterRating}
                </Text>
              ) : null}
              <View style={styles.sigLine} />
              <Text style={styles.sigLinelabel}>Signature / Date</Text>
            </View>
          </View>
          <View style={[styles.sigRow, { borderTop: "0.5pt solid #999" }]}>
            <View style={styles.sigCellLast}>
              <Text style={styles.sigLabel}>Rated Soldier Acknowledgment</Text>
              <Text style={{ fontSize: 7.5, color: "#555" }}>
                I have read this completed report. My signature does not necessarily constitute concurrence.
              </Text>
              <View style={styles.sigLine} />
              <Text style={styles.sigLinelabel}>Signature / Date</Text>
            </View>
          </View>
        </View>

        {/* ── Footer ── */}
        <View style={styles.footer}>
          <Text style={styles.footerText}>
            Generated by EES 2.0 · AR 623-3 · UNCLASSIFIED
          </Text>
          <Text style={styles.footerText}>
            {new Date().toLocaleDateString("en-US", {
              year: "numeric",
              month: "long",
              day: "numeric",
            })}
          </Text>
        </View>
      </Page>
    </Document>
  );
}


export interface EvalPdfSection {
  section: string;
  rating: string | null;
  bullets: string[];
}

export interface EvalPdfData {
  formTitle: string; // e.g. "DA FORM 2166-9-1 (NCO EVALUATION REPORT)"
  soldierName: string;
  rank: string;
  mos: string;
  dutyTitle: string;
  unit: string;
  periodStart: string;
  periodEnd: string;
  raterName: string;
  seniorRaterName: string;
  seniorRaterRating: string | null;
  sections: EvalPdfSection[];
}
