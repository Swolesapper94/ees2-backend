-- Add OBJECTIVE entries for SGT Davis support form
-- These are performance goals/expectations required by checkCompleteness()

INSERT INTO "SupportFormEntry" (
  id,
  "supportFormId",
  section,
  "entryType",
  "rawText",
  tags,
  "isHighlight",
  counseled,
  "createdAt",
  "updatedAt"
) VALUES (
  gen_random_uuid(),
  'dev-sf-davis',
  'CHARACTER',
  'OBJECTIVE',
  'Improve squad discipline and performance; achieve 95% pass rate on next PT test.',
  '["discipline", "fitness"]'::jsonb,
  false,
  false,
  NOW(),
  NOW()
), (
  gen_random_uuid(),
  'dev-sf-davis',
  'LEADS',
  'OBJECTIVE',
  'Achieve promotion to Staff Sergeant and complete Squad Leader Course.',
  '["promotion", "leadership"]'::jsonb,
  false,
  false,
  NOW(),
  NOW()
);
