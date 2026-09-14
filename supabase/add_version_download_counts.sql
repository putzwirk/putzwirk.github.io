ALTER TABLE mod_versions ADD COLUMN IF NOT EXISTS download_count integer NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION increment_version_downloads(version_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE mod_versions SET download_count = download_count + 1 WHERE id = version_id;
END;
$$;

GRANT EXECUTE ON FUNCTION increment_version_downloads(uuid) TO anon, authenticated, service_role;

SELECT mod_id, version, download_count FROM mod_versions ORDER BY created_at DESC LIMIT 10;
