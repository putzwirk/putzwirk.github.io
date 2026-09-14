ALTER TABLE mods ADD COLUMN IF NOT EXISTS required_mods text[] NOT NULL DEFAULT '{}';

CREATE OR REPLACE FUNCTION set_mod_dependencies(mod_slug text, deps_csv text)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE mods
  SET required_mods = CASE
    WHEN deps_csv IS NULL OR btrim(deps_csv) = '' THEN '{}'::text[]
    ELSE (SELECT coalesce(array_agg(btrim(slug)), '{}') FROM unnest(string_to_array(deps_csv, ',')) AS slug WHERE btrim(slug) <> '')
  END
  WHERE id = mod_slug;
END;
$$;

UPDATE mods SET required_mods = ARRAY['QualiaMods'] WHERE id <> 'QualiaMods' AND (required_mods IS NULL OR required_mods = '{}');

SELECT id, required_mods FROM mods ORDER BY id;
