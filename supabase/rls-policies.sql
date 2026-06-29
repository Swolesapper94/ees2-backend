-- ─────────────────────────────────────────────────────────────────
-- EES 2.0 — Row Level Security Policies (Delta Sections 12, 19, 20)
-- Run in the Supabase SQL editor AFTER `prisma db push` has created the
-- tables. Re-running is safe — policies are dropped and recreated.
-- ─────────────────────────────────────────────────────────────────

-- ── Enable RLS ────────────────────────────────────────────────────
ALTER TABLE users                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE evaluations           ENABLE ROW LEVEL SECURITY;
ALTER TABLE eval_sections         ENABLE ROW LEVEL SECURITY;
ALTER TABLE support_forms         ENABLE ROW LEVEL SECURITY;
ALTER TABLE support_form_entries  ENABLE ROW LEVEL SECURITY;
ALTER TABLE signatures            ENABLE ROW LEVEL SECURITY;
ALTER TABLE rating_chains         ENABLE ROW LEVEL SECURITY;
ALTER TABLE counseling_sessions   ENABLE ROW LEVEL SECURITY;
ALTER TABLE eval_milestones       ENABLE ROW LEVEL SECURITY;
ALTER TABLE eval_comments         ENABLE ROW LEVEL SECURITY;
ALTER TABLE delegates             ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_generations        ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs            ENABLE ROW LEVEL SECURITY;

-- ── Helper functions ──────────────────────────────────────────────
CREATE OR REPLACE FUNCTION current_user_id()
RETURNS TEXT AS $$
  SELECT id FROM users WHERE supabase_id = auth.uid()::text
$$ LANGUAGE sql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM users
    WHERE supabase_id = auth.uid()::text
      AND 'ADMIN' = ANY(roles)
  )
$$ LANGUAGE sql SECURITY DEFINER;

-- ── Evaluations: visible to anyone in the rating chain ────────────
DROP POLICY IF EXISTS "eval_chain_access" ON evaluations;
CREATE POLICY "eval_chain_access" ON evaluations FOR ALL USING (
  is_admin() OR
  EXISTS (
    SELECT 1 FROM rating_chains rc
    WHERE rc.id = evaluations.rating_chain_id AND (
      rc.rated_soldier_id = current_user_id() OR
      rc.rater_id         = current_user_id() OR
      rc.senior_rater_id  = current_user_id() OR
      rc.reviewer_id      = current_user_id()
    )
  )
);

-- ── Support forms: soldier sees own; rater/SR sees their chain's ──
DROP POLICY IF EXISTS "support_form_access" ON support_forms;
CREATE POLICY "support_form_access" ON support_forms FOR ALL USING (
  is_admin() OR
  soldier_id = current_user_id() OR
  EXISTS (
    SELECT 1 FROM rating_chains rc
    WHERE rc.rated_soldier_id = support_forms.soldier_id AND (
      rc.rater_id        = current_user_id() OR
      rc.senior_rater_id = current_user_id()
    )
  )
);

-- ── Signatures: users can only update their own row ───────────────
DROP POLICY IF EXISTS "signature_own_update" ON signatures;
CREATE POLICY "signature_own_update" ON signatures
  FOR UPDATE USING (user_id = current_user_id());

DROP POLICY IF EXISTS "signature_chain_read" ON signatures;
CREATE POLICY "signature_chain_read" ON signatures FOR SELECT USING (
  is_admin() OR
  EXISTS (
    SELECT 1 FROM rating_chains rc
    JOIN evaluations e ON e.rating_chain_id = rc.id
    WHERE e.id = signatures.evaluation_id AND (
      rc.rated_soldier_id = current_user_id() OR
      rc.rater_id         = current_user_id() OR
      rc.senior_rater_id  = current_user_id() OR
      rc.reviewer_id      = current_user_id()
    )
  )
);

-- ── Delegates: can see eval STATUS (not content) for their principal ─
DROP POLICY IF EXISTS "delegate_eval_status_read" ON evaluations;
CREATE POLICY "delegate_eval_status_read" ON evaluations FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM delegates d
    WHERE d.delegate_user_id = current_user_id()
      AND d.principal_id = (
        SELECT rc.rated_soldier_id FROM rating_chains rc
        WHERE rc.id = evaluations.rating_chain_id
      )
      AND d.is_active = true
      AND (d.expiry_date IS NULL OR d.expiry_date > NOW())
  )
);
-- Note: eval_sections has no delegate policy — content stays private.

-- ── Commanders: see all evals in their unit + subordinate units ───
DROP POLICY IF EXISTS "commander_formation_read" ON evaluations;
CREATE POLICY "commander_formation_read" ON evaluations FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM users u
    JOIN rating_chains rc ON rc.id = evaluations.rating_chain_id
    JOIN users soldier ON soldier.id = rc.rated_soldier_id
    JOIN units ON units.id = soldier.unit_id
    WHERE u.id = current_user_id()
      AND 'COMMANDER' = ANY(u.roles)
      AND (
        soldier.unit_id = u.unit_id OR
        units.parent_id = u.unit_id
      )
  )
);
-- Note: commanders see status only, never eval_sections content.

-- ── Audit log: read-only, never delete ───────────────────────────
DROP POLICY IF EXISTS "audit_log_read" ON audit_logs;
CREATE POLICY "audit_log_read" ON audit_logs
  FOR SELECT USING (is_admin() OR actor_id = current_user_id());

DROP POLICY IF EXISTS "audit_log_no_delete" ON audit_logs;
CREATE POLICY "audit_log_no_delete" ON audit_logs
  AS RESTRICTIVE FOR DELETE USING (false);
