-- MERIT's browser clients use Supabase Auth, but all domain records flow
-- through the authenticated Node API. Close the direct PostgREST path and
-- make every public table deny-by-default if privileges are ever restored.
DO $$
DECLARE
  relation_name text;
BEGIN
  FOR relation_name IN
    SELECT tablename
    FROM pg_tables
    WHERE schemaname = 'public'
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', relation_name);
  END LOOP;
END
$$;

REVOKE ALL ON SCHEMA public FROM anon, authenticated;
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;
REVOKE ALL ON ALL ROUTINES IN SCHEMA public FROM anon, authenticated;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON TABLES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON SEQUENCES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON ROUTINES FROM anon, authenticated;

-- Evidence is accessed only through authenticated API responses that issue
-- short-lived signed URLs or stream an authorized file.
UPDATE storage.buckets
SET public = false
WHERE id = 'evaluations';
