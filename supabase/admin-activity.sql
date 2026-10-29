-- Run once after supabase/admin-setup.sql to enable the admin task analytics.
-- This does not change the existing admin permission table or admin check.
begin;

create table if not exists public.coursewise_task_activity (
  event_id bigint generated always as identity primary key,
  user_id text not null,
  task_id text not null,
  activity_type text not null check (activity_type in ('baseline','created','completed','reopened','state_changed','deleted')),
  occurred_at timestamptz not null default now(),
  due_at timestamptz,
  has_due_time boolean not null default false,
  is_complete boolean not null default false,
  is_assignment boolean not null default false,
  is_deleted boolean not null default false,
  is_excluded boolean not null default false
);

create table if not exists public.coursewise_task_activity_meta (
  singleton boolean primary key default true check (singleton),
  tracking_started_at timestamptz not null default now()
);
insert into public.coursewise_task_activity_meta(singleton)
values (true) on conflict (singleton) do nothing;

create index if not exists coursewise_task_activity_time_idx
  on public.coursewise_task_activity (occurred_at, activity_type);
create index if not exists coursewise_task_activity_task_idx
  on public.coursewise_task_activity (user_id, task_id, occurred_at desc, event_id desc);

alter table public.coursewise_task_activity enable row level security;
alter table public.coursewise_task_activity_meta enable row level security;
revoke all on public.coursewise_task_activity, public.coursewise_task_activity_meta from anon, authenticated;
revoke all on sequence public.coursewise_task_activity_event_id_seq from anon, authenticated;

-- Seed one current-state snapshot per retained task. The seed enables current
-- overdue counts immediately; it does not invent historical completion events.
insert into public.coursewise_task_activity
  (user_id, task_id, activity_type, occurred_at, due_at, has_due_time, is_complete, is_assignment, is_deleted, is_excluded)
select t."UserID"::text, t."TaskID"::text, 'baseline', now(), t."TaskDueDate"::timestamptz,
       coalesce(t."HasDueTime", false),
       coalesce(t."IsComplete", false), coalesce(t."IsAssignment", false), false,
       coalesce(t."CanvasExcluded", false)
from public."Tasks" t
where not exists (
  select 1 from public.coursewise_task_activity a
  where a.activity_type = 'baseline'
    and a.user_id = t."UserID"::text
    and a.task_id = t."TaskID"::text
);

-- TaskCreationDate is already stored, so recent additions can seed the active
-- user filter without claiming that prior completions are known.
insert into public.coursewise_task_activity
  (user_id, task_id, activity_type, occurred_at, due_at, has_due_time, is_complete, is_assignment, is_deleted, is_excluded)
select t."UserID"::text, t."TaskID"::text, 'created', t."TaskCreationDate"::timestamptz,
       t."TaskDueDate"::timestamptz, coalesce(t."HasDueTime", false), false, coalesce(t."IsAssignment", false), false,
       coalesce(t."CanvasExcluded", false)
from public."Tasks" t
where t."TaskCreationDate" >= now() - interval '30 days'
  and not exists (
    select 1 from public.coursewise_task_activity a
    where a.activity_type = 'created'
      and a.user_id = t."UserID"::text
      and a.task_id = t."TaskID"::text
  );

create or replace function public.coursewise_capture_task_activity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_type text;
  v_user text;
  v_task text;
  v_due timestamptz;
  v_has_due_time boolean;
  v_complete boolean;
  v_assignment boolean;
  v_deleted boolean;
  v_excluded boolean;
begin
  if tg_op = 'DELETE' then
    v_user := old."UserID"::text;
    v_task := old."TaskID"::text;
    v_due := old."TaskDueDate"::timestamptz;
    v_has_due_time := coalesce(old."HasDueTime", false);
    v_complete := coalesce(old."IsComplete", false);
    v_assignment := coalesce(old."IsAssignment", false);
    v_excluded := coalesce(old."CanvasExcluded", false);
    v_type := 'deleted';
    v_deleted := true;
  elsif tg_op = 'INSERT' then
    v_user := new."UserID"::text;
    v_task := new."TaskID"::text;
    v_due := new."TaskDueDate"::timestamptz;
    v_has_due_time := coalesce(new."HasDueTime", false);
    v_complete := coalesce(new."IsComplete", false);
    v_assignment := coalesce(new."IsAssignment", false);
    v_excluded := coalesce(new."CanvasExcluded", false);
    v_type := 'created';
    v_deleted := false;
  else
    if old."IsComplete" is not distinct from new."IsComplete"
       and old."TaskDueDate" is not distinct from new."TaskDueDate"
       and old."HasDueTime" is not distinct from new."HasDueTime"
       and old."IsAssignment" is not distinct from new."IsAssignment"
       and old."CanvasExcluded" is not distinct from new."CanvasExcluded" then
      return new;
    end if;
    v_user := new."UserID"::text;
    v_task := new."TaskID"::text;
    v_due := new."TaskDueDate"::timestamptz;
    v_has_due_time := coalesce(new."HasDueTime", false);
    v_complete := coalesce(new."IsComplete", false);
    v_assignment := coalesce(new."IsAssignment", false);
    v_excluded := coalesce(new."CanvasExcluded", false);
    v_deleted := false;
    if old."IsComplete" is distinct from new."IsComplete" and v_complete then
      v_type := 'completed';
    elsif old."IsComplete" is distinct from new."IsComplete" and not v_complete then
      v_type := 'reopened';
    else
      v_type := 'state_changed';
    end if;
  end if;

  insert into public.coursewise_task_activity
    (user_id, task_id, activity_type, due_at, has_due_time, is_complete, is_assignment, is_deleted, is_excluded)
  values (v_user, v_task, v_type, v_due, v_has_due_time, v_complete, v_assignment, v_deleted, v_excluded);
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
revoke all on function public.coursewise_capture_task_activity() from public, anon, authenticated;

drop trigger if exists coursewise_task_activity_capture on public."Tasks";
create trigger coursewise_task_activity_capture
after insert or update or delete on public."Tasks"
for each row execute function public.coursewise_capture_task_activity();

create or replace function public.coursewise_admin_activity(
  p_days integer default 30,
  p_source text default 'all',
  p_active_only boolean default false
) returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_days integer := case when p_days in (7, 30, 180, 365) then p_days else 30 end;
  v_step integer;
  v_tracking_start timestamptz;
  v_range_start timestamptz;
  v_completed bigint;
  v_overdue bigint;
  v_active_users bigint;
  v_canvas_completed bigint;
  v_non_canvas_completed bigint;
  v_canvas_overdue bigint;
  v_non_canvas_overdue bigint;
  v_chart jsonb;
begin
  if not public.coursewise_is_admin() then
    raise exception 'Admin access required' using errcode = '42501';
  end if;
  if p_source is null or p_source not in ('all','canvas','non_canvas') then
    raise exception 'Invalid task source filter';
  end if;

  select tracking_started_at into v_tracking_start
  from public.coursewise_task_activity_meta where singleton = true;
  v_tracking_start := coalesce(v_tracking_start, now());
  v_range_start := greatest(now() - make_interval(days => v_days), v_tracking_start);
  v_step := case when v_days <= 30 then 1 else 7 end;

  select count(distinct user_id) into v_active_users
  from public.coursewise_task_activity
  where not is_excluded
    and ((activity_type = 'created' and occurred_at >= now() - interval '30 days')
      or (activity_type = 'completed' and occurred_at >= greatest(now() - interval '30 days', v_tracking_start)))
    and occurred_at <= now();

  select count(*) into v_completed
  from public.coursewise_task_activity a
  where a.activity_type = 'completed'
    and not a.is_excluded
    and a.occurred_at >= v_range_start and a.occurred_at <= now()
    and (p_source = 'all' or (p_source = 'canvas' and a.is_assignment) or (p_source = 'non_canvas' and not a.is_assignment))
    and (not p_active_only or exists (
      select 1 from public.coursewise_task_activity active
      where active.user_id = a.user_id
        and not active.is_excluded
        and ((active.activity_type = 'created' and active.occurred_at >= now() - interval '30 days')
          or (active.activity_type = 'completed' and active.occurred_at >= greatest(now() - interval '30 days', v_tracking_start)))
        and active.occurred_at <= now()
    ));

  with latest as (
    select distinct on (a.user_id, a.task_id)
      a.user_id, a.task_id, a.due_at, a.has_due_time, a.is_complete, a.is_assignment, a.is_deleted, a.is_excluded
    from public.coursewise_task_activity a
    where a.occurred_at <= now()
    order by a.user_id, a.task_id, a.occurred_at desc, a.event_id desc
  )
  select count(*) filter (where is_assignment), count(*) filter (where not is_assignment)
    into v_canvas_overdue, v_non_canvas_overdue
  from latest l
  where not l.is_deleted and not l.is_excluded and not l.is_complete
    and l.due_at is not null
    and ((l.has_due_time and l.due_at < now()) or (not l.has_due_time and l.due_at::date < now()::date))
    and (not p_active_only or exists (
      select 1 from public.coursewise_task_activity active
      where active.user_id = l.user_id
        and not active.is_excluded
        and ((active.activity_type = 'created' and active.occurred_at >= now() - interval '30 days')
          or (active.activity_type = 'completed' and active.occurred_at >= greatest(now() - interval '30 days', v_tracking_start)))
        and active.occurred_at <= now()
    ));
  v_overdue := coalesce(v_canvas_overdue,0) + coalesce(v_non_canvas_overdue,0);

  select count(*) filter (where is_assignment), count(*) filter (where not is_assignment)
    into v_canvas_completed, v_non_canvas_completed
  from public.coursewise_task_activity a
  where a.activity_type = 'completed'
    and not a.is_excluded
    and a.occurred_at >= v_range_start and a.occurred_at <= now()
    and (not p_active_only or exists (
      select 1 from public.coursewise_task_activity active
      where active.user_id = a.user_id
        and not active.is_excluded
        and ((active.activity_type = 'created' and active.occurred_at >= now() - interval '30 days')
          or (active.activity_type = 'completed' and active.occurred_at >= greatest(now() - interval '30 days', v_tracking_start)))
        and active.occurred_at <= now()
    ));

  with buckets as (
    select bucket_day::date as bucket_date,
           least(bucket_day::timestamptz + make_interval(days => v_step), now()) as bucket_end
    from generate_series(
      date_trunc('day', v_range_start)::date::timestamp,
      date_trunc('day', now())::timestamp,
      make_interval(days => v_step)
    ) as bucket_day
  ),
  bucket_metrics as (
    select b.bucket_date,
      (select count(*) from public.coursewise_task_activity c
       where c.activity_type = 'completed'
         and not c.is_excluded
         and c.occurred_at >= greatest(b.bucket_date::timestamptz, v_range_start)
         and c.occurred_at < b.bucket_end
         and (p_source = 'all' or (p_source = 'canvas' and c.is_assignment) or (p_source = 'non_canvas' and not c.is_assignment))
         and (not p_active_only or exists (
           select 1 from public.coursewise_task_activity active
           where active.user_id = c.user_id
             and not active.is_excluded
             and ((active.activity_type = 'created' and active.occurred_at >= now() - interval '30 days')
               or (active.activity_type = 'completed' and active.occurred_at >= greatest(now() - interval '30 days', v_tracking_start)))
             and active.occurred_at <= now()
         ))) as completed,
      (select count(*) from (
        select distinct on (a.user_id,a.task_id)
          a.user_id,a.task_id,a.due_at,a.has_due_time,a.is_complete,a.is_assignment,a.is_deleted,a.is_excluded
        from public.coursewise_task_activity a
        where a.occurred_at < b.bucket_end
        order by a.user_id,a.task_id,a.occurred_at desc,a.event_id desc
      ) state
       where not state.is_deleted and not state.is_excluded and not state.is_complete
         and state.due_at is not null
         and ((state.has_due_time and state.due_at < b.bucket_end)
           or (not state.has_due_time and state.due_at::date < b.bucket_end::date))
         and (p_source = 'all' or (p_source = 'canvas' and state.is_assignment) or (p_source = 'non_canvas' and not state.is_assignment))
         and (not p_active_only or exists (
           select 1 from public.coursewise_task_activity active
           where active.user_id = state.user_id
             and not active.is_excluded
             and ((active.activity_type = 'created' and active.occurred_at >= now() - interval '30 days')
               or (active.activity_type = 'completed' and active.occurred_at >= greatest(now() - interval '30 days', v_tracking_start)))
             and active.occurred_at <= now()
         ))) as overdue
    from buckets b
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'date',bucket_date,
    'completed',completed,
    'overdue',overdue,
    'ratio',case when overdue > 0 then round(completed::numeric / overdue, 2) else null end
  ) order by bucket_date),'[]'::jsonb)
  into v_chart from bucket_metrics;

  return jsonb_build_object(
    'tracking_started_at', v_tracking_start,
    'range_start', v_range_start,
    'range_end', now(),
    'days', v_days,
    'completed_count', coalesce(v_completed,0),
    'overdue_count', coalesce(v_overdue,0),
    'ratio', case when coalesce(v_overdue,0) > 0 then round(v_completed::numeric / v_overdue, 2) else null end,
    'active_users_30d', coalesce(v_active_users,0),
    'chart', v_chart,
    'source_breakdown', jsonb_build_object(
      'canvas', jsonb_build_object('completed',coalesce(v_canvas_completed,0),'overdue',coalesce(v_canvas_overdue,0)),
      'non_canvas', jsonb_build_object('completed',coalesce(v_non_canvas_completed,0),'overdue',coalesce(v_non_canvas_overdue,0))
    )
  );
end;
$$;
revoke all on function public.coursewise_admin_activity(integer,text,boolean) from public, anon;
grant execute on function public.coursewise_admin_activity(integer,text,boolean) to authenticated;

commit;
