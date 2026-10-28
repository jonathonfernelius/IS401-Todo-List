-- Run once in the Supabase SQL Editor before deploying the list-ordering frontend.
begin;

alter table public."Lists"
  add column "SortOrder" integer not null default 0;

with ordered_lists as (
  select "ListID",
         row_number() over (partition by "UserID" order by "ListID") - 1 as position
  from public."Lists"
)
update public."Lists" as lists
set "SortOrder" = ordered_lists.position
from ordered_lists
where lists."ListID" = ordered_lists."ListID";

create function public.tidy_reorder_lists(p_list_ids text[]) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_user_id public."User"."UserID"%TYPE;
  v_expected integer;
  v_updated integer;
begin
  if auth.uid() is null then
    raise exception 'Please log in again.' using errcode = '42501';
  end if;

  select "UserID" into v_user_id
  from public."User"
  where "AuthUserID" = auth.uid();
  if not found then
    raise exception 'This account has no Tidy profile.' using errcode = '42501';
  end if;

  if p_list_ids is null
     or cardinality(p_list_ids) <> (
       select count(distinct list_id)
       from unnest(p_list_ids) as requested(list_id)
     ) then
    raise exception 'Invalid list order.';
  end if;

  select count(*) into v_expected
  from public."Lists"
  where "UserID" = v_user_id;
  if cardinality(p_list_ids) <> v_expected then
    raise exception 'The lists changed. Reload the page and try again.';
  end if;

  update public."Lists" as lists
  set "SortOrder" = requested.position::integer
  from unnest(p_list_ids) with ordinality as requested(list_id, position)
  where lists."UserID" = v_user_id
    and lists."ListID"::text = requested.list_id;
  get diagnostics v_updated = row_count;

  if v_updated <> v_expected then
    raise exception 'The lists changed. Reload the page and try again.';
  end if;
end;
$$;

revoke all on function public.tidy_reorder_lists(text[]) from public, anon;
grant execute on function public.tidy_reorder_lists(text[]) to authenticated;

commit;
