
drop policy if exists admin_insert_mods on public.mods;
create policy admin_insert_mods on public.mods
  for insert to authenticated with check (public.is_staff());
drop policy if exists admin_update_mods on public.mods;
create policy admin_update_mods on public.mods
  for update to authenticated using (public.is_staff()) with check (public.is_staff());
drop policy if exists admin_delete_mods on public.mods;
create policy admin_delete_mods on public.mods
  for delete to authenticated using (public.is_staff());

drop policy if exists admin_insert_mod_versions on public.mod_versions;
create policy admin_insert_mod_versions on public.mod_versions
  for insert to authenticated with check (public.is_staff());
drop policy if exists admin_update_mod_versions on public.mod_versions;
create policy admin_update_mod_versions on public.mod_versions
  for update to authenticated using (public.is_staff()) with check (public.is_staff());
drop policy if exists admin_delete_mod_versions on public.mod_versions;
create policy admin_delete_mod_versions on public.mod_versions
  for delete to authenticated using (public.is_staff());

drop policy if exists admin_upload_mod_files on storage.objects;
create policy admin_upload_mod_files on storage.objects
  for insert to authenticated with check (bucket_id = 'mod-files' and public.is_staff());
drop policy if exists admin_update_mod_files on storage.objects;
create policy admin_update_mod_files on storage.objects
  for update to authenticated using (bucket_id = 'mod-files' and public.is_staff())
  with check (bucket_id = 'mod-files' and public.is_staff());
drop policy if exists admin_delete_mod_files on storage.objects;
create policy admin_delete_mod_files on storage.objects
  for delete to authenticated using (bucket_id = 'mod-files' and public.is_staff());
