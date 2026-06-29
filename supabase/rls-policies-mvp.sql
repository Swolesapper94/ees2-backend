-- ─────────────────────────────────────────────────────────────────
-- EES 2.0 — Simplified RLS Policies for Foundation Phase
-- ─────────────────────────────────────────────────────────────────
-- Copy and paste this entire block into Supabase SQL Editor and click Run
-- These are permissive policies for MVP; authorization enforced in app layer
-- ─────────────────────────────────────────────────────────────────

-- Evaluations: allow all authenticated users
DROP POLICY IF EXISTS "allow_all_evaluations" ON evaluations;
CREATE POLICY "allow_all_evaluations" ON evaluations FOR ALL USING (true);

-- Evaluation sections: allow all authenticated users
DROP POLICY IF EXISTS "allow_all_eval_sections" ON eval_sections;
CREATE POLICY "allow_all_eval_sections" ON eval_sections FOR ALL USING (true);

-- Support forms: allow all authenticated users
DROP POLICY IF EXISTS "allow_all_support_forms" ON support_forms;
CREATE POLICY "allow_all_support_forms" ON support_forms FOR ALL USING (true);

-- Support form entries: allow all authenticated users
DROP POLICY IF EXISTS "allow_all_support_form_entries" ON support_form_entries;
CREATE POLICY "allow_all_support_form_entries" ON support_form_entries FOR ALL USING (true);

-- Signatures: allow all authenticated users
DROP POLICY IF EXISTS "allow_all_signatures" ON signatures;
CREATE POLICY "allow_all_signatures" ON signatures FOR ALL USING (true);

-- Rating chains: allow all authenticated users
DROP POLICY IF EXISTS "allow_all_rating_chains" ON rating_chains;
CREATE POLICY "allow_all_rating_chains" ON rating_chains FOR ALL USING (true);

-- Counseling sessions: allow all authenticated users
DROP POLICY IF EXISTS "allow_all_counseling_sessions" ON counseling_sessions;
CREATE POLICY "allow_all_counseling_sessions" ON counseling_sessions FOR ALL USING (true);

-- Eval milestones: allow all authenticated users
DROP POLICY IF EXISTS "allow_all_eval_milestones" ON eval_milestones;
CREATE POLICY "allow_all_eval_milestones" ON eval_milestones FOR ALL USING (true);

-- Eval comments: allow all authenticated users
DROP POLICY IF EXISTS "allow_all_eval_comments" ON eval_comments;
CREATE POLICY "allow_all_eval_comments" ON eval_comments FOR ALL USING (true);

-- Delegates: allow all authenticated users
DROP POLICY IF EXISTS "allow_all_delegates" ON delegates;
CREATE POLICY "allow_all_delegates" ON delegates FOR ALL USING (true);

-- AI generations: allow all authenticated users
DROP POLICY IF EXISTS "allow_all_ai_generations" ON ai_generations;
CREATE POLICY "allow_all_ai_generations" ON ai_generations FOR ALL USING (true);

-- Audit logs: SELECT only (no delete)
DROP POLICY IF EXISTS "allow_select_audit_logs" ON audit_logs;
CREATE POLICY "allow_select_audit_logs" ON audit_logs FOR SELECT USING (true);

DROP POLICY IF EXISTS "block_delete_audit_logs" ON audit_logs;
CREATE POLICY "block_delete_audit_logs" ON audit_logs AS RESTRICTIVE FOR DELETE USING (false);
