-- Run once in the Coursewise Supabase SQL Editor as the project owner.
begin;
create table public.coursewise_admins (
 user_id uuid primary key references auth.users(id) on delete cascade,
 created_at timestamptz not null default now()
);
alter table public.coursewise_admins enable row level security;
revoke all on public.coursewise_admins from anon, authenticated;
create function public.coursewise_is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
 select exists(select 1 from public.coursewise_admins where user_id = auth.uid());
$$;
revoke all on function public.coursewise_is_admin() from public, anon;
grant execute on function public.coursewise_is_admin() to authenticated;
create table public.coursewise_objectives (
 id uuid primary key default gen_random_uuid(), title text not null check(length(trim(title)) between 1 and 300),
 owner text not null default '', period text not null default '', due date,
 status text not null default 'Not started' check(status in ('Not started','On track','At risk','Complete')),
 created_at timestamptz not null default now()
);
create table public.coursewise_key_results (
 id uuid primary key default gen_random_uuid(), objective_id uuid not null references public.coursewise_objectives(id) on delete cascade,
 title text not null check(length(trim(title)) between 1 and 300), baseline numeric not null default 0,
 current_value numeric not null default 0, target numeric not null, unit text not null default '',
 created_at timestamptz not null default now(),
 check (baseline <> target),
 check (baseline::text not in ('NaN','Infinity','-Infinity') and current_value::text not in ('NaN','Infinity','-Infinity') and target::text not in ('NaN','Infinity','-Infinity'))
);
create table public.coursewise_checkins (
 id uuid primary key default gen_random_uuid(), key_result_id uuid not null references public.coursewise_key_results(id) on delete cascade,
 value numeric not null, note text not null default '', author_id uuid references auth.users(id) on delete set null,
 created_at timestamptz not null default now()
);
create index on public.coursewise_key_results(objective_id);
create index on public.coursewise_checkins(key_result_id);
alter table public.coursewise_objectives enable row level security;
alter table public.coursewise_key_results enable row level security;
alter table public.coursewise_checkins enable row level security;
revoke all on public.coursewise_objectives,public.coursewise_key_results,public.coursewise_checkins from anon,authenticated;
grant select,insert,update,delete on public.coursewise_objectives,public.coursewise_key_results to authenticated;
grant select on public.coursewise_checkins to authenticated;
create policy admin_objectives on public.coursewise_objectives for all to authenticated using ((select public.coursewise_is_admin())) with check ((select public.coursewise_is_admin()));
create policy admin_results on public.coursewise_key_results for all to authenticated using ((select public.coursewise_is_admin())) with check ((select public.coursewise_is_admin()));
create policy admin_checkins on public.coursewise_checkins for select to authenticated using ((select public.coursewise_is_admin()));
create function public.coursewise_check_in(result_id uuid, new_value numeric, checkin_note text default '') returns void
language plpgsql security definer set search_path = '' as $$
begin
 if not public.coursewise_is_admin() then raise exception 'Admin access required' using errcode='42501'; end if;
 if new_value is null or new_value::text in ('NaN','Infinity','-Infinity') then raise exception 'Enter a finite value'; end if;
 update public.coursewise_key_results set current_value=new_value where id=result_id;
 if not found then raise exception 'Key result no longer exists'; end if;
 insert into public.coursewise_checkins(key_result_id,value,note,author_id) values(result_id,new_value,coalesce(checkin_note,''),auth.uid());
end; $$;
revoke all on function public.coursewise_check_in(uuid,numeric,text) from public,anon;
grant execute on function public.coursewise_check_in(uuid,numeric,text) to authenticated;
create function public.coursewise_admin_stats() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare output jsonb;
begin
 if not public.coursewise_is_admin() then raise exception 'Admin access required' using errcode='42501'; end if;
 select jsonb_build_object(
 'users',(select count(*) from public."User"),
 'new_users_30d',(select count(*) from public."User" where "UserCreationDate" >= (now() at time zone 'UTC') - interval '30 days'),
 'tasks',count(*), 'completed',count(*) filter(where "IsComplete" is true),
 'assignments',count(*) filter(where "IsAssignment" is true),
 'created_30d',count(*) filter(where "TaskCreationDate" >= now()-interval '30 days'),
 'as_of',now()) into output from public."Tasks";
 return output;
end; $$;
revoke all on function public.coursewise_admin_stats() from public,anon;
grant execute on function public.coursewise_admin_stats() to authenticated;
commit;
-- NEXT: grant admin access to a specific existing Auth user (see ADMIN-SETUP.md).
