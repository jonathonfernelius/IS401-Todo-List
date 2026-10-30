-- Extra aggregate data for the three OKR dashboards that share the existing
-- task-activity log. Run this after admin-setup.sql and admin-activity.sql.
--
-- This migration adds no columns to User or Tasks. It returns counts and
-- chart points only; it never returns names, email addresses, task titles,
-- Canvas feed URLs, or Canvas credentials.

begin;

-- Helps the Canvas chart find assignment-related activity in the chosen range.
create index if not exists coursewise_task_activity_assignment_time_idx
  on public.coursewise_task_activity (occurred_at, user_id)
  where is_assignment;

-- Account creation is used by both acquisition and daily completion rates.
create index if not exists coursewise_user_creation_date_idx
  on public."User" ("UserCreationDate");

create or replace function public.coursewise_admin_okr_analytics(
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
  v_days integer := case
    when p_days in (7, 30, 180, 365) then p_days
    else 30
  end;
  v_now timestamptz := now();
  v_display_start timestamptz;
  v_previous_start timestamptz;
  v_task_start timestamptz;
  v_tracking_start timestamptz;

  v_total_accounts bigint := 0;
  v_accounts_before_range bigint := 0;
  v_accounts_before_task_history bigint := 0;
  v_new_accounts bigint := 0;
  v_previous_accounts bigint := 0;
  v_accounts_chart jsonb := '[]'::jsonb;

  v_task_completions bigint := 0;
  v_average_daily_completions numeric := 0;
  v_average_daily_completers numeric := 0;
  v_average_completion_rate numeric := 0;
  v_daily_task_chart jsonb := '[]'::jsonb;

  v_canvas_accounts bigint := 0;
  v_canvas_imports bigint := 0;
  v_canvas_completions bigint := 0;
  v_canvas_chart jsonb := '[]'::jsonb;
begin
  -- RPCs are callable only by authenticated users with the existing admin
  -- permission. Keep this check even if the caller already checked in JS.
  if not public.coursewise_is_admin() then
    raise exception 'Admin access required' using errcode = '42501';
  end if;

  if p_source is null or p_source not in ('all', 'canvas', 'non_canvas') then
    raise exception 'Invalid task source filter';
  end if;

  select tracking_started_at
    into v_tracking_start
  from public.coursewise_task_activity_meta
  where singleton = true;
  v_tracking_start := coalesce(v_tracking_start, v_now);

  -- Account data can use the full registration history. Task event data starts
  -- at the activity-log setup date because earlier completion dates are absent.
  -- Keep the KPI window exact; charts start at that window's calendar day and
  -- show the first and current buckets as partial days when appropriate.
  v_display_start := v_now - make_interval(days => v_days);
  v_previous_start := v_display_start - make_interval(days => v_days);
  v_task_start := greatest(v_display_start, v_tracking_start);

  select count(*)
    into v_total_accounts
  from public."User";

  select count(*)
    into v_accounts_before_range
  from public."User" u
  where u."UserCreationDate" < (v_display_start at time zone 'UTC');

  select count(*)
    into v_accounts_before_task_history
  from public."User" u
  where u."UserCreationDate" < (v_task_start at time zone 'UTC');

  select count(*)
    into v_new_accounts
  from public."User" u
  where u."UserCreationDate" >= (v_display_start at time zone 'UTC')
    and u."UserCreationDate" <= (v_now at time zone 'UTC');

  select count(*)
    into v_previous_accounts
  from public."User" u
  where u."UserCreationDate" >= (v_previous_start at time zone 'UTC')
    and u."UserCreationDate" < (v_display_start at time zone 'UTC');

  -- Account acquisition chart: daily registrations plus the cumulative account
  -- total as of each day. Aggregate registrations once, then fill quiet days.
  with day_buckets as (
    select
      (generated.bucket_start at time zone 'UTC')::date as bucket_date
    from generate_series(
      date_trunc('day', v_display_start),
      date_trunc('day', v_now),
      interval '1 day'
    ) as generated(bucket_start)
  ),
  account_daily as (
    select
      date_trunc(
        'day',
        u."UserCreationDate" at time zone 'UTC'
      )::date as bucket_date,
      count(*) as new_accounts
    from public."User" u
    where u."UserCreationDate" >= (v_display_start at time zone 'UTC')
      and u."UserCreationDate" <= (v_now at time zone 'UTC')
    group by 1
  ),
  account_totals as (
    select
      b.bucket_date,
      coalesce(a.new_accounts, 0) as new_accounts,
      v_accounts_before_range
        + sum(coalesce(a.new_accounts, 0)) over (order by b.bucket_date) as total_accounts
    from day_buckets b
    left join account_daily a using (bucket_date)
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'date', bucket_date,
        'new_accounts', new_accounts,
        'total_accounts', total_accounts
      )
      order by bucket_date
    ),
    '[]'::jsonb
  )
  into v_accounts_chart
  from account_totals;

  -- Daily retention data. Aggregate matching completion events once, then
  -- join the results to the date buckets and each day's registered account
  -- total. "Completing users" counts distinct accounts per day.
  with day_buckets as (
    select
      (generated.bucket_start at time zone 'UTC')::date as bucket_date
    from generate_series(
      date_trunc('day', v_task_start),
      date_trunc('day', v_now),
      interval '1 day'
    ) as generated(bucket_start)
  ),
  completion_events_by_day as (
    select
      date_trunc('day', a.occurred_at at time zone 'UTC')::date as bucket_date,
      count(*) as completed,
      count(distinct a.user_id) as completing_users
    from public.coursewise_task_activity a
    where a.activity_type = 'completed'
      and not a.is_excluded
      and a.occurred_at >= v_task_start
      and a.occurred_at <= v_now
      and (
        p_source = 'all'
        or (p_source = 'canvas' and a.is_assignment)
        or (p_source = 'non_canvas' and not a.is_assignment)
      )
      and (
        not p_active_only
        or exists (
          select 1
          from public.coursewise_task_activity active
          where active.user_id = a.user_id
            and not active.is_excluded
            and (
              (
                active.activity_type = 'created'
                and active.occurred_at >= v_now - interval '30 days'
              )
              or (
                active.activity_type = 'completed'
                and active.occurred_at >= greatest(
                  v_now - interval '30 days',
                  v_tracking_start
                )
              )
            )
            and active.occurred_at <= v_now
        )
      )
    group by 1
  ),
  registered_accounts_by_day as (
    select
      date_trunc(
        'day',
        u."UserCreationDate" at time zone 'UTC'
      )::date as bucket_date,
      count(*) as created_accounts
    from public."User" u
    where u."UserCreationDate" >= (v_task_start at time zone 'UTC')
      and u."UserCreationDate" <= (v_now at time zone 'UTC')
    group by 1
  ),
  account_totals_by_day as (
    select
      b.bucket_date,
      v_accounts_before_task_history
        + sum(coalesce(a.created_accounts, 0)) over (order by b.bucket_date) as registered_accounts
    from day_buckets b
    left join registered_accounts_by_day a using (bucket_date)
  ),
  daily_counts as (
    select
      b.bucket_date,
      coalesce(c.completed, 0) as completed,
      coalesce(c.completing_users, 0) as completing_users,
      coalesce(a.registered_accounts, v_accounts_before_task_history) as registered_accounts
    from day_buckets b
    left join completion_events_by_day c using (bucket_date)
    left join account_totals_by_day a using (bucket_date)
  ),
  daily_rates as (
    select
      bucket_date,
      completed,
      completing_users,
      registered_accounts,
      case
        when registered_accounts > 0
          then round(completing_users::numeric * 100 / registered_accounts, 2)
        else 0
      end as completion_rate
    from daily_counts
  )
  select
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'date', bucket_date,
          'completed', completed,
          'completing_users', completing_users,
          'registered_accounts', registered_accounts,
          'completion_rate', completion_rate
        )
        order by bucket_date
      ),
      '[]'::jsonb
    ),
    coalesce(sum(completed), 0),
    coalesce(avg(completing_users), 0),
    coalesce(avg(completion_rate), 0)
  into
    v_daily_task_chart,
    v_task_completions,
    v_average_daily_completers,
    v_average_completion_rate
  from daily_rates;

  v_average_daily_completions := case
    when jsonb_array_length(v_daily_task_chart) > 0
      then round(v_task_completions::numeric / jsonb_array_length(v_daily_task_chart), 2)
    else 0
  end;

  -- Canvas "adoption" is a privacy-safe proxy: an account has Canvas use when
  -- at least one imported assignment is still represented in the task log.
  -- The actual connected/disconnected state is held behind the canvas-connect
  -- Edge Function and is not exposed in the supplied database schema.
  with latest_assignment_state as (
    select distinct on (a.user_id, a.task_id)
      a.user_id,
      a.is_assignment,
      a.is_deleted
    from public.coursewise_task_activity a
    where a.occurred_at <= v_now
    order by a.user_id, a.task_id, a.occurred_at desc, a.event_id desc
  )
  select count(distinct user_id)
    into v_canvas_accounts
  from latest_assignment_state
  where is_assignment
    and not is_deleted;

  select
    count(*) filter (where a.activity_type = 'created'),
    count(*) filter (where a.activity_type = 'completed')
  into v_canvas_imports, v_canvas_completions
  from public.coursewise_task_activity a
  where a.is_assignment
    and not a.is_excluded
    and a.occurred_at >= v_task_start
    and a.occurred_at <= v_now
    and a.activity_type in ('created', 'completed');

  -- Canvas trend: accounts adding imported assignments and completed Canvas
  -- tasks per day. Baseline snapshots are intentionally not treated as imports.
  with day_buckets as (
    select
      (generated.bucket_start at time zone 'UTC')::date as bucket_date
    from generate_series(
      date_trunc('day', v_task_start),
      date_trunc('day', v_now),
      interval '1 day'
    ) as generated(bucket_start)
  ),
  canvas_events_by_day as (
    select
      date_trunc('day', a.occurred_at at time zone 'UTC')::date as bucket_date,
      count(distinct a.user_id) filter (
        where a.activity_type = 'created'
      ) as importing_accounts,
      count(*) filter (
        where a.activity_type = 'completed'
      ) as completed_assignments
    from public.coursewise_task_activity a
    where a.activity_type in ('created', 'completed')
      and a.is_assignment
      and not a.is_excluded
      and a.occurred_at >= v_task_start
      and a.occurred_at <= v_now
    group by 1
  ),
  canvas_daily as (
    select
      b.bucket_date,
      coalesce(c.importing_accounts, 0) as importing_accounts,
      coalesce(c.completed_assignments, 0) as completed_assignments
    from day_buckets b
    left join canvas_events_by_day c using (bucket_date)
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'date', bucket_date,
        'importing_accounts', importing_accounts,
        'completed_assignments', completed_assignments
      )
      order by bucket_date
    ),
    '[]'::jsonb
  )
  into v_canvas_chart
  from canvas_daily;

  return jsonb_build_object(
    'tracking_started_at', v_tracking_start,
    'range_start', v_display_start,
    'task_history_start', v_task_start,
    'range_end', v_now,
    'days', v_days,
    'accounts', jsonb_build_object(
      'total_count', v_total_accounts,
      'created_count', v_new_accounts,
      'previous_period_count', v_previous_accounts,
      'growth_percent', case
        when v_previous_accounts > 0
          then round(
            (v_new_accounts - v_previous_accounts)::numeric
            * 100 / v_previous_accounts,
            1
          )
        else null
      end,
      'chart', v_accounts_chart
    ),
    'daily_tasks', jsonb_build_object(
      'completed_count', v_task_completions,
      'average_completions_per_day', v_average_daily_completions,
      'average_completing_users', round(v_average_daily_completers, 2),
      'average_completion_rate', round(v_average_completion_rate, 2),
      'chart', v_daily_task_chart
    ),
    'canvas', jsonb_build_object(
      'accounts_with_assignments', v_canvas_accounts,
      'adoption_percent', case
        when v_total_accounts > 0
          then round(v_canvas_accounts::numeric * 100 / v_total_accounts, 2)
        else 0
      end,
      'import_count', coalesce(v_canvas_imports, 0),
      'completion_count', coalesce(v_canvas_completions, 0),
      'chart', v_canvas_chart
    )
  );
end;
$$;

revoke all on function public.coursewise_admin_okr_analytics(integer, text, boolean)
  from public, anon;
grant execute on function public.coursewise_admin_okr_analytics(integer, text, boolean)
  to authenticated;

commit;
