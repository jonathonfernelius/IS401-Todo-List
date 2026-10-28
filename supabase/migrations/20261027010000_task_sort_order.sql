-- Run once in the Supabase SQL Editor to enable task ordering and moving.
begin;

alter table public."Tasks"
  add column "SortOrder" integer not null default 0;

with ordered_tasks as (
  select "TaskID",
         row_number() over (
           partition by "UserID", "ListID"
           order by "TaskID"
         ) - 1 as position
  from public."Tasks"
)
update public."Tasks" as tasks
set "SortOrder" = ordered_tasks.position
from ordered_tasks
where tasks."TaskID" = ordered_tasks."TaskID";

create function public.tidy_reorder_tasks(
  p_task_id text,
  p_target_list_id text,
  p_target_task_ids text[],
  p_source_task_ids text[]
) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_user_id public."User"."UserID"%TYPE;
  v_source_list_id public."Tasks"."ListID"%TYPE;
  v_target_count integer;
  v_target_matches integer;
  v_source_count integer;
  v_source_matches integer;
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

  if p_task_id is null or p_target_list_id is null
     or p_target_task_ids is null or p_source_task_ids is null
     or array_position(p_target_task_ids, p_task_id) is null
     or cardinality(p_target_task_ids) <> (
       select count(distinct task_id)
       from unnest(p_target_task_ids) as requested(task_id)
     )
     or cardinality(p_source_task_ids) <> (
       select count(distinct task_id)
       from unnest(p_source_task_ids) as requested(task_id)
     ) then
    raise exception 'Invalid task order.';
  end if;

  select "ListID" into v_source_list_id
  from public."Tasks"
  where "TaskID"::text = p_task_id
    and "UserID" = v_user_id
    and coalesce("CanvasExcluded", false) = false
  for update;
  if not found then
    raise exception 'Task not found. Reload the page.' using errcode = 'P0002';
  end if;

  if not exists (
    select 1 from public."Lists"
    where "ListID"::text = p_target_list_id and "UserID" = v_user_id
  ) then
    raise exception 'The destination list no longer exists.' using errcode = 'P0002';
  end if;

  select count(*) into v_target_count
  from public."Tasks"
  where "UserID" = v_user_id
    and "ListID"::text = p_target_list_id
    and coalesce("CanvasExcluded", false) = false;
  if v_source_list_id::text is distinct from p_target_list_id then
    v_target_count := v_target_count + 1;
  end if;

  select count(*) into v_target_matches
  from unnest(p_target_task_ids) as requested(task_id)
  where exists (
    select 1 from public."Tasks" as tasks
    where tasks."TaskID"::text = requested.task_id
      and tasks."UserID" = v_user_id
      and coalesce(tasks."CanvasExcluded", false) = false
      and (tasks."ListID"::text = p_target_list_id or requested.task_id = p_task_id)
  );
  if cardinality(p_target_task_ids) <> v_target_count
     or v_target_matches <> cardinality(p_target_task_ids) then
    raise exception 'The destination tasks changed. Reload the page and try again.';
  end if;

  if v_source_list_id is null or v_source_list_id::text = p_target_list_id then
    if cardinality(p_source_task_ids) <> 0 then
      raise exception 'Invalid source task order.';
    end if;
  else
    select count(*) into v_source_count
    from public."Tasks"
    where "UserID" = v_user_id
      and "ListID" = v_source_list_id
      and "TaskID"::text <> p_task_id
      and coalesce("CanvasExcluded", false) = false;

    select count(*) into v_source_matches
    from unnest(p_source_task_ids) as requested(task_id)
    where exists (
      select 1 from public."Tasks" as tasks
      where tasks."TaskID"::text = requested.task_id
        and tasks."UserID" = v_user_id
        and tasks."ListID" = v_source_list_id
        and tasks."TaskID"::text <> p_task_id
        and coalesce(tasks."CanvasExcluded", false) = false
    );
    if cardinality(p_source_task_ids) <> v_source_count
       or v_source_matches <> cardinality(p_source_task_ids) then
      raise exception 'The source tasks changed. Reload the page and try again.';
    end if;
  end if;

  update public."Tasks" as tasks
  set "ListID" = target."ListID",
      "ListName" = target."Title",
      "SortOrder" = requested.position::integer
  from unnest(p_target_task_ids) with ordinality as requested(task_id, position),
       public."Lists" as target
  where target."ListID"::text = p_target_list_id
    and target."UserID" = v_user_id
    and tasks."TaskID"::text = requested.task_id
    and tasks."UserID" = v_user_id
    and coalesce(tasks."CanvasExcluded", false) = false
    and (tasks."ListID"::text = p_target_list_id or tasks."TaskID"::text = p_task_id);

  if v_source_list_id is not null and v_source_list_id::text <> p_target_list_id then
    update public."Tasks" as tasks
    set "SortOrder" = requested.position::integer
    from unnest(p_source_task_ids) with ordinality as requested(task_id, position)
    where tasks."TaskID"::text = requested.task_id
      and tasks."UserID" = v_user_id
      and tasks."ListID" = v_source_list_id
      and coalesce(tasks."CanvasExcluded", false) = false;
  end if;
end;
$$;

revoke all on function public.tidy_reorder_tasks(text,text,text[],text[]) from public, anon;
grant execute on function public.tidy_reorder_tasks(text,text,text[],text[]) to authenticated;

commit;
