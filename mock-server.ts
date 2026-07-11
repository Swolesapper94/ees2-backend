import express from "express";

const PORT = 4000;
const app = express();

app.use(express.json());
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "http://localhost:3000");
  res.header("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") {
    res.sendStatus(200);
    return;
  }
  next();
});

const DEV_CREDENTIALS = {
  "dev:peter.smith@army.mil:testpass": { userId: "dev-cpt-smith", name: "Peter Smith", rank: "CPT" },
  "dev:marcus.johnson@army.mil:testpass": { userId: "dev-ssg-johnson", name: "Marcus Johnson", rank: "SSG" },
  "dev:james.davis@army.mil:testpass": { userId: "dev-sgt-davis", name: "James Davis", rank: "SGT" },
  "dev:maria.torres@army.mil:testpass": { userId: "dev-1lt-torres", name: "Maria Torres", rank: "FIRST_LT" },
  "dev:robert.williams@army.mil:testpass": { userId: "dev-sfc-williams", name: "Robert Williams", rank: "SFC" },
};

app.use((req, res, next) => {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Missing bearer token" });
  }
  const token = header.slice("Bearer ".length).trim();
  if (token in DEV_CREDENTIALS) {
    req.user = DEV_CREDENTIALS[token];
    return next();
  }
  res.status(401).json({ error: "Invalid token" });
});

const SECTION_KEYS = ["CHARACTER", "PRESENCE", "INTELLECT", "LEADS", "DEVELOPS", "ACHIEVES", "RATER_OVERALL"] as const;

const mockSections = SECTION_KEYS.map((key, i) => ({
  id: `section-${i + 1}`,
  section: key,
  ratingBinary: key === "CHARACTER" ? null : null,
  ratingFourLevel: null,
  stagingBullets: [],
  finalBullets: [],
  bulletSources: {},
  isComplete: false,
}));

const mockEvaluations = [
  {
    id: "eval-1",
    formType: "NCOER_9_1",
    status: "DRAFT",
    periodStart: "2024-01-01",
    periodEnd: "2024-12-31",
    ratedMonths: 12,
    reasonForSubmission: "Annual",
    principalDutyTitle: "Squad Leader",
    dutyDescription: "Lead rifle squad",
    ratedSoldierName: "Smith, James",
    ratedSoldierRank: "SGT",
    sections: mockSections,
    ratingChain: {
      ratedSoldier: { firstName: "James", lastName: "Smith", rank: "SGT", mos: "11B" },
      rater: { firstName: "Robert", lastName: "Jones", rank: "SSG" },
      seniorRater: { firstName: "David", lastName: "Davis", rank: "SFC" },
    },
  },
];

const mockChains = [
  {
    id: "chain-1",
    ratedSoldier: { id: "smith", firstName: "James", lastName: "Smith", rank: "SGT" },
    rater: { id: "jones", firstName: "Robert", lastName: "Jones", rank: "SSG" },
    seniorRater: { id: "davis", firstName: "David", lastName: "Davis", rank: "SFC" },
  },
];

app.get("/api/health", (req, res) => res.json({ status: "ok", mode: "mock" }));
app.get("/api/evaluations", (req, res) => {
  console.log(`✅ GET /api/evaluations (user: ${req.user.name})`);
  res.json(mockEvaluations);
});
app.get("/api/rating-chains", (req, res) => {
  console.log(`✅ GET /api/rating-chains`);
  res.json(mockChains);
});
app.get("/api/evaluations/:id", (req, res) => {
  res.json(mockEvaluations[0]);
});
app.post("/api/evaluations", (req, res) => res.status(201).json({ id: "new", ...req.body }));
app.patch("/api/evaluations/:id", (req, res) => res.json(mockEvaluations[0]));
app.patch("/api/evaluations/:id/sections/:section", (req, res) => {
  const eval_ = mockEvaluations[0];
  const sec = eval_.sections.find((s) => s.section === req.params.section);
  if (sec) Object.assign(sec, req.body);
  res.json({ saved: true });
});
app.post("/api/evaluations/:id/sign", (req, res) => res.json({ success: true }));
app.post("/api/evaluations/:id/consistency-check", (req, res) => res.json({ isConsistent: true }));
app.get("/api/pdf/evaluations/:id", (req, res) => {
  res.set("Content-Type", "application/pdf");
  res.send(Buffer.from("Mock PDF"));
});

app.listen(PORT, () => {
  console.log(`
╔══════════════════════════════════════════════════════╗
║   🎖️  EES 2.0 MOCK API SERVER (NO DATABASE)        ║
╚══════════════════════════════════════════════════════╝
✅ Server on http://localhost:${PORT}
✅ Dev auth enabled
✅ CORS for localhost:3000
`);
});

// ────────────────────────────────────────────────────────────────
// Support Form Mock Data
// ────────────────────────────────────────────────────────────────

const mockSupportForms = [
  {
    id: "form-davis-2025",
    soldierId: "dev-sgt-davis",
    ratingChainId: "chain-davis",
    evalCategory: "NCOER_9_1",
    ratingPeriodStart: new Date("2025-06-01"),
    ratingPeriodEnd: new Date("2026-05-31"),
    dutyTitle: "Team Leader",
    dutyMosc: "11B",
    dailyDutiesScope: "Lead rifle squad (10 enlisted + 2 specialists) in combat operations and training. Manage equipment, personnel readiness, and training schedules.",
    areasOfEmphasis: "Combat readiness, soldier development, leadership by example",
    appointedDuties: "Squad leader, training coordinator, supply NCO for 1st squad",
    ssdNcoesMet: true,
    soldierGoals: "Complete Warrior Leader Course, earn promotion to SSG, improve squad marksmanship scores",
    createdAt: new Date("2025-06-01"),
    updatedAt: new Date("2026-07-07"),
  },
];

const mockSupportFormEntries = [
  // SGT Davis entries - CHARACTER section
  {
    id: "entry-davis-1",
    supportFormId: "form-davis-2025",
    section: "CHARACTER",
    entryType: "ACCOMPLISHMENT",
    rawText: "Maintained high ethical standards while leading squad through difficult combat situation; provided counsel to junior enlisted soldiers on military values",
    tags: ["leadership", "values"],
    isHighlight: true,
    entryDate: new Date("2025-08-15"),
  },
  // SGT Davis entries - PRESENCE section
  {
    id: "entry-davis-2",
    supportFormId: "form-davis-2025",
    section: "PRESENCE",
    entryType: "ACCOMPLISHMENT",
    rawText: "Consistently presented military bearing and appearance; set example for entire squad through attention to uniform and grooming standards",
    tags: ["appearance", "professionalism"],
    isHighlight: false,
    entryDate: new Date("2025-09-20"),
  },
  // SGT Davis entries - INTELLECT section
  {
    id: "entry-davis-3",
    supportFormId: "form-davis-2025",
    section: "INTELLECT",
    entryType: "ACCOMPLISHMENT",
    rawText: "Completed online military education courses; demonstrated tactical proficiency by developing squad-level training plans that improved team performance by 25% on land navigation course",
    tags: ["education", "tactics"],
    isHighlight: true,
    entryDate: new Date("2025-10-10"),
  },
  // SGT Davis entries - LEADS section
  {
    id: "entry-davis-4",
    supportFormId: "form-davis-2025",
    section: "LEADS",
    entryType: "OBJECTIVE",
    rawText: "Improve squad marksmanship scores to 95% qualification rate within next training cycle",
    tags: ["marksmanship", "goal"],
    isHighlight: false,
    entryDate: new Date("2025-11-01"),
  },
  {
    id: "entry-davis-5",
    supportFormId: "form-davis-2025",
    section: "LEADS",
    entryType: "ACCOMPLISHMENT",
    rawText: "Led 15-soldier squad through advanced rifle qualification; 14 soldiers achieved expert rating, exceeding battalion standard by 8 soldiers",
    tags: ["marksmanship", "leadership"],
    isHighlight: true,
    entryDate: new Date("2026-01-15"),
  },
  // SGT Davis entries - DEVELOPS section
  {
    id: "entry-davis-6",
    supportFormId: "form-davis-2025",
    section: "DEVELOPS",
    entryType: "ACCOMPLISHMENT",
    rawText: "Mentored PFC Rodriguez through promotion board preparation; Rodriguez passed promotion board on first attempt with score of 285/300",
    tags: ["mentoring", "development"],
    isHighlight: true,
    entryDate: new Date("2026-02-20"),
  },
  // SGT Davis entries - ACHIEVES section
  {
    id: "entry-davis-7",
    supportFormId: "form-davis-2025",
    section: "ACHIEVES",
    entryType: "ACCOMPLISHMENT",
    rawText: "Squad maintained 100% equipment accountability for all issued gear; completed two battalion-level training events without incident or loss",
    tags: ["accountability", "maintenance"],
    isHighlight: false,
    entryDate: new Date("2026-03-30"),
  },
];

// ────────────────────────────────────────────────────────────────
// Support Form API Endpoints
// ────────────────────────────────────────────────────────────────

// GET /api/support-forms/:id
app.get("/api/support-forms/:id", (req: AuthRequest, res) => {
  const form = mockSupportForms.find((f) => f.id === req.params.id);
  if (!form) {
    return res.status(404).json({ error: "Support form not found" });
  }
  const entries = mockSupportFormEntries.filter(
    (e) => e.supportFormId === form.id
  );
  res.json({ ...form, entries });
});

// GET /api/support-forms/soldier/:soldierId
app.get("/api/support-forms/soldier/:soldierId", (req: AuthRequest, res) => {
  const forms = mockSupportForms.filter(
    (f) => f.soldierId === req.params.soldierId
  );
  res.json({ forms });
});

// GET /api/support-forms/rating-chain/:chainId
app.get("/api/support-forms/rating-chain/:chainId", (req: AuthRequest, res) => {
  const forms = mockSupportForms.filter(
    (f) => f.ratingChainId === req.params.chainId
  );
  res.json({ forms });
});

// GET /api/users/me
app.get("/api/users/me", (req: AuthRequest, res) => {
  if (!req.user) {
    return res.status(401).json({ error: "Not authenticated" });
  }
  res.json({
    id: req.user.id,
    firstName: req.user.name.split(" ")[0],
    lastName: req.user.name.split(" ")[1] || "",
    rank: req.user.rank,
    email: `${req.user.name.toLowerCase().replace(" ", ".")}@army.mil`,
    roles: ["SOLDIER", "RATER"],
  });
});

