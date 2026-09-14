
alter table public.issues disable trigger enforce_issue_moderation;

insert into public.mods (id, name, tagline, description, author, sort_order, required_mods) values
  ('QualiaMods', 'QualiaMods Framework', 'The mod loader under everything.', 'QualiaMods is the loader that runs every other mod.', 'Putzwirk', 0, '{}'),
  ('ModA', 'Abyss Inventory', 'Inventory management.', 'A test inventory mod.', 'Putzwirk', 1, array['QualiaMods'])
on conflict (id) do nothing;

insert into public.mod_versions (id, mod_id, version, game_version, release_date, changelog, pck_filename, storage_path, download_count) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'QualiaMods', '2.0.1', '4.0', '2026-09-01', array['Published build.'], 'QualiaMods-v2.0.1+4.0.pck', 'QualiaMods/QualiaMods-v2.0.1+4.0.pck', 0),
  ('aaaaaaaa-0000-0000-0000-000000000002', 'ModA', '1.0.0', '4.0', '2026-09-02', array['Initial release.'], 'ModA-v1.0.0+4.0.pck', 'ModA/ModA-v1.0.0+4.0.pck', 0)
on conflict (id) do nothing;

insert into public.issues (id, mod_id, type, title, description, author_name, status, votes, created_at, attachment_urls, moderation_status, author_id) values
  ('bbbbbbbb-0000-0000-0000-000000000001', 'ModA', 'bug', 'Chest contents vanish', 'Open a chest, quit, reopen. Expected items kept, got an empty chest.', 'Anon', 'open', 0, '2026-09-03T10:00:00Z', '{}', 'approved', '22222222-2222-2222-2222-222222222222'),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'ModA', 'bug', 'Sorting ignores stack size', '', 'Player', 'open', 0, '2026-09-03T11:00:00Z', '{}', 'approved', null),
  ('bbbbbbbb-0000-0000-0000-000000000003', null, 'idea', 'Add a search bar to the inventory', 'A search field would help a lot.', 'Idea Person', 'open', 0, '2026-09-04T10:00:00Z', '{}', 'approved', null),
  ('bbbbbbbb-0000-0000-0000-000000000004', 'ModA', 'idea', 'Per-mod hotbar presets', 'Save hotbar layouts per mod.', 'Idea Person', 'open', 0, '2026-09-04T11:00:00Z', '{}', 'approved', null),
  ('bbbbbbbb-0000-0000-0000-000000000005', null, 'idea', 'This should be pending', 'A pending submission.', 'Anon', 'open', 0, '2026-09-05T10:00:00Z', '{}', 'pending', '33333333-3333-3333-3333-333333333333'),
  ('bbbbbbbb-0000-0000-0000-000000000006', null, 'bug', 'Rejected spam entry', 'porn', 'Anon', 'open', 0, '2026-09-05T11:00:00Z', '{}', 'rejected', null)
on conflict (id) do nothing;

alter table public.issues enable trigger enforce_issue_moderation;

insert into public.attachments (id, issue_id, storage_path, mime, size_bytes, uploader_id) values
  ('cccccccc-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000001', 'legacy/approved-shot.png', 'image/png', 1234, '22222222-2222-2222-2222-222222222222'),
  ('cccccccc-0000-0000-0000-000000000002', 'bbbbbbbb-0000-0000-0000-000000000005', 'legacy/pending-shot.png', 'image/png', 1234, '33333333-3333-3333-3333-333333333333')
on conflict (id) do nothing;

insert into storage.objects (id, bucket_id, name, owner) values
  ('dddddddd-0000-0000-0000-000000000001', 'issue-attachments', 'legacy/approved-shot.png', '22222222-2222-2222-2222-222222222222'),
  ('dddddddd-0000-0000-0000-000000000002', 'issue-attachments', 'legacy/pending-shot.png', '33333333-3333-3333-3333-333333333333')
on conflict (id) do nothing;

insert into public.issue_comments (id, issue_id, author_id, author_name, body, moderation_status, moderated_at) values
  ('eeeeeeee-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', 'Player', 'I can reproduce this on v1.0.0.', 'approved', now()),
  ('eeeeeeee-0000-0000-0000-000000000002', 'bbbbbbbb-0000-0000-0000-000000000001', null, 'Anon', 'This one is still awaiting review.', 'pending', null),
  ('eeeeeeee-0000-0000-0000-000000000003', 'bbbbbbbb-0000-0000-0000-000000000005', '33333333-3333-3333-3333-333333333333', 'Anon', 'Author note on the pending idea.', 'pending', null)
on conflict (id) do nothing;


insert into public.notification_preferences (user_id, email_replies, email_status) values
  ('22222222-2222-2222-2222-222222222222', true, true),
  ('33333333-3333-3333-3333-333333333333', false, true)
on conflict (user_id) do nothing;

insert into public.notifications (id, recipient_id, kind, issue_id, comment_id, payload, created_at) values
  ('ffffffff-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', 'comment', 'bbbbbbbb-0000-0000-0000-000000000001', 'eeeeeeee-0000-0000-0000-000000000002', jsonb_build_object('preview', 'This one is still awaiting review.'), '2026-09-06T10:00:00Z'),
  ('ffffffff-0000-0000-0000-000000000002', '33333333-3333-3333-3333-333333333333', 'moderation', 'bbbbbbbb-0000-0000-0000-000000000005', null, jsonb_build_object('status', 'pending', 'preview', 'This should be pending'), '2026-09-06T11:00:00Z')
on conflict (id) do nothing;

update public.mods set tags = array['inventory', 'ui'] where id = 'ModA';
update public.mods set tags = array['framework', 'library'] where id = 'QualiaMods';
update public.mods set screenshots = jsonb_build_array('mods/ModA/1.0.0/screenshot-1.png') where id = 'ModA';
