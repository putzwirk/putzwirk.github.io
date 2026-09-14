
create table if not exists public.attachments (
  id uuid primary key default gen_random_uuid(),
  issue_id uuid references public.issues(id) on delete cascade,
  comment_id uuid,
  storage_path text not null,
  mime text,
  size_bytes integer,
  uploader_id uuid,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

create unique index if not exists attachments_storage_path_key on public.attachments (storage_path);
create index if not exists idx_attachments_issue on public.attachments (issue_id) where deleted_at is null;
create index if not exists idx_attachments_pending_purge on public.attachments (deleted_at) where deleted_at is not null;

insert into public.attachments (issue_id, storage_path, uploader_id)
select i.id, split_part(u, '/object/public/issue-attachments/', 2), i.author_id
from public.issues i
cross join lateral unnest(i.attachment_urls) as u
where u like '%/object/public/issue-attachments/%'
  and split_part(u, '/object/public/issue-attachments/', 2) <> ''
on conflict (storage_path) do nothing;

alter table public.attachments enable row level security;

drop policy if exists attachments_select on public.attachments;
create policy attachments_select on public.attachments
  for select to anon, authenticated
  using (
    public.is_staff()
    or exists (
      select 1 from public.issues i
      where i.id = attachments.issue_id
        and (
          (i.moderation_status = 'approved' and i.deleted_at is null)
          or i.author_id = auth.uid()
          or attachments.uploader_id = auth.uid()
        )
    )
  );

drop policy if exists attachments_insert_staff on public.attachments;
create policy attachments_insert_staff on public.attachments
  for insert to authenticated with check (public.is_staff());

drop policy if exists attachments_update_own on public.attachments;
create policy attachments_update_own on public.attachments
  for update to authenticated
  using (public.is_staff() or attachments.uploader_id = auth.uid())
  with check (public.is_staff() or attachments.uploader_id = auth.uid());

drop policy if exists attachments_delete_own on public.attachments;
create policy attachments_delete_own on public.attachments
  for delete to authenticated
  using (public.is_staff() or attachments.uploader_id = auth.uid());

revoke all on table public.attachments from anon, authenticated;
grant select on table public.attachments to anon, authenticated;
grant update, delete on table public.attachments to authenticated;
grant all on table public.attachments to service_role;
revoke truncate, references, trigger on public.attachments from anon, authenticated;

create or replace function public.can_read_attachment(object_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    public.is_staff()
    or exists (
      select 1
      from public.attachments a
      join public.issues i on i.id = a.issue_id
      where a.storage_path = object_name
        and a.deleted_at is null
        and (
          (i.moderation_status = 'approved' and i.deleted_at is null)
          or i.author_id = auth.uid()
          or a.uploader_id = auth.uid()
        )
    );
$$;

grant execute on function public.can_read_attachment(text) to anon, authenticated, service_role;

update storage.buckets set public = false where id = 'issue-attachments';

drop policy if exists public_read_issue_attachments on storage.objects;
drop policy if exists public_upload_issue_attachments on storage.objects;
drop policy if exists issue_attachments_read on storage.objects;
drop policy if exists issue_attachments_insert on storage.objects;
drop policy if exists issue_attachments_delete on storage.objects;

create policy issue_attachments_read on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'issue-attachments' and public.can_read_attachment(name));

create policy issue_attachments_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'issue-attachments'
    and auth.uid() is not null
    and (
      array_length(storage.foldername(name), 1) is null
      or ((storage.foldername(name))[1] = 'issues' and (storage.foldername(name))[3] = auth.uid()::text)
    )
  );

create policy issue_attachments_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'issue-attachments'
    and (
      public.is_staff()
      or (storage.foldername(name))[3] = auth.uid()::text
    )
  );

create or replace function public.remove_expired_issue_attachments()
returns void
language plpgsql
security definer
set search_path = 'public'
as $$
begin
  update public.attachments a
  set deleted_at = now()
  where a.deleted_at is null
    and a.issue_id in (
      select id from public.issues
      where status = 'closed'
        and closed_at is not null
        and closed_at < now() - interval '24 hours'
    );

  update public.issues
  set attachment_urls = '{}'
  where status = 'closed'
    and closed_at is not null
    and closed_at < now() - interval '24 hours'
    and coalesce(cardinality(attachment_urls), 0) > 0;
end;
$$;
