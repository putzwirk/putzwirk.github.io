alter function public.text_is_blocked(text) set search_path = '';
alter function public.issue_status_from_state(text) set search_path = '';

revoke all on function public.remove_expired_issue_attachments() from anon, authenticated;
grant execute on function public.remove_expired_issue_attachments() to service_role;

revoke all on function public.consume_rate_limit(text, text, integer, integer) from anon, authenticated;
revoke all on function public.register_download(uuid, text) from anon, authenticated;
revoke all on function public.toggle_vote(uuid) from anon;
grant execute on function public.toggle_vote(uuid) to authenticated;
