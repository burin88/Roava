-- Install after requirement-multiple-attachments.sql.
-- Return URLs only to authenticated readers under existing RLS. Anonymous readers
-- receive [] without any attachment metadata query or new column privileges.
-- This does not enable or change public bucket access.
begin;
create or replace function public.roava_requirement_attachment_urls(refs jsonb) returns jsonb
language plpgsql stable security invoker set search_path='' as $$
declare result jsonb;
begin
 if auth.uid() is null and current_user not in ('postgres','service_role') then return '[]'::jsonb; end if;
 select coalesce(jsonb_agg('https://pub-53399cf357004c6ebc046f04bd7ea2b7.r2.dev/' || encoded.key order by ref.position),'[]'::jsonb)
 into result
 from jsonb_array_elements(refs) with ordinality as ref(item,position)
 join public.attachments a on a.id=ref.item->>'id' and a.profiles_id::text=ref.item->>'profiles_id'
 cross join lateral (
   select string_agg(case when byte between 48 and 57 or byte between 65 and 90 or byte between 97 and 122 or byte in (45,46,47,95,126)
     then chr(byte) else '%' || upper(lpad(to_hex(byte),2,'0')) end,'' order by n) as key
   from (select n,get_byte(convert_to(a.path,'UTF8'),n) as byte from generate_series(0,octet_length(convert_to(a.path,'UTF8'))-1) as n) bytes
 ) encoded
 where a.valid and a.type='requirement' and a.status='ready' and a.storage_provider='r2'
   and a.bucket='roava-storage' and a.path like 'roava/media/%'
   and a.path !~ '(^|/)\.\.?(/|$)';
 return result;
end;
$$;
revoke all on function public.roava_requirement_attachment_urls(jsonb) from public;
grant execute on function public.roava_requirement_attachment_urls(jsonb) to anon,authenticated;
create or replace view public.requirement_listing with (security_invoker=true) as
 select r.id,r.title,r.description,r.requirement_type,r.priority,r.status,
 r.created_at,r.created_by,r.modified_at,r.modified_by,r.valid,
 t.name as type_name,p.name as priority_name,s.name as status_name,
 t.sort_sequence as type_sequence,p.sort_sequence as priority_sequence,
 (select count(*) from public.requirement_prs pr where pr.requirement_id=r.id and pr.valid) as pr_count,
 r.attachments_id,r.attachments_profiles_id,r.attachments,
 public.roava_requirement_attachment_urls(r.attachments) as attachment_urls
 from public.requirements r
 join public.master_requirement_type t on t.code=r.requirement_type
 join public.master_requirement_priority p on p.code=r.priority
 join public.master_requirement_status s on s.code=r.status;
notify pgrst,'reload schema';
commit;
