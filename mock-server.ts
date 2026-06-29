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
  "dev:james.smith@army.mil:testpass": { userId: "seed-soldier-smith", name: "James Smith", rank: "SGT" },
  "dev:robert.jones@army.mil:testpass": { userId: "seed-rater-jones", name: "Robert Jones", rank: "SSG" },
  "dev:david.davis@army.mil:testpass": { userId: "seed-sr-davis", name: "David Davis", rank: "SFC" },
  "dev:patricia.brown@army.mil:testpass": { userId: "seed-admin-brown", name: "Patricia Brown", rank: "SSG" },
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
