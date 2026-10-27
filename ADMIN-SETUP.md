# Coursewise admin setup

This package adds admin.html, css/admin.css, js/admin.js, js/admin-link.js,
and supabase/admin-setup.sql. It adds the admin-link script to home.html,
todo.html, calendar.html, and profile.html. Existing app behavior is retained.

## 1. Install the database additions
Open your Coursewise project in Supabase → SQL Editor → New query.
Paste all of supabase/admin-setup.sql and run it once.
It runs in a transaction and adds dedicated admin/OKR tables, RLS policies,
and three RPC functions. It does not alter existing user/task tables or their policies.
If you see “already exists,” do not drop tables: check whether setup already ran.

## 2. Give your existing account admin access
In Supabase → Authentication → Users, find your own existing Coursewise login
and copy its User UID. Replace YOUR_AUTH_USER_UUID below and run in SQL Editor:

```sql
insert into public.coursewise_admins (user_id)
values ('YOUR_AUTH_USER_UUID'::uuid)
on conflict (user_id) do nothing;
```

Use the UUID from Authentication, not the text UserID from the public User table.
Repeat only for teammates who should manage goals and see aggregate site stats.
No extra password or service-role key is needed. Normal users cannot grant themselves admin access.
To remove access later:

```sql
delete from public.coursewise_admins
where user_id = 'YOUR_AUTH_USER_UUID'::uuid;
```

## 3. Update GitHub
Copy the contents of the coursewise folder into your existing website repository,
replacing matching files. Keep index.html at the repository root. Commit and push
with GitHub Desktop, then wait for GitHub Pages to deploy.

Log in with your admin account. The Admin link appears in the main navigation.
You can also open admin.html alongside home.html on your website.
If the link does not appear, reload after completing steps 1 and 2.

## 4. Enter the team's goals
Create an objective, owner/team, period, optional deadline, and status.
Add key results with a starting value, target, and unit. Both increasing goals
(0 → 100 students) and decreasing goals (10 → 3 minutes) are supported.
Use Check in to update a result and add a note. Supabase saves both atomically.
Edit result changes its definition; Check in changes its measured value.
Refresh gets other admins' changes. Export downloads objectives, results, and
all retained check-ins as JSON. There is no import feature in this version.
Deleting objectives/results also deletes their dependent check-ins; export first
if you need to retain those records.

## What the statistics mean
- Registered profiles: rows in public.User, not auth.users.
- New profiles: UserCreationDate in the last 30 days (timestamps interpreted as UTC).
- Tasks created: currently retained rows in Tasks; deleted tasks are excluded.
- Completion rate: IsComplete=true divided by all currently retained tasks.
- Assignment tasks: rows with IsAssignment=true.
- New tasks: TaskCreationDate in the last 30 days.

These are all-app aggregates delivered by an admin-checked function. The page
does not fetch other people's task text, email addresses, passwords, or Canvas tokens.
Weekly active users, retention, and completion-by-week are not shown because the
provided schema does not contain the necessary historical events. OKR values are
manual; they are not automatically linked to these site totals.

## Validation and limits
JavaScript syntax checks passed. In an isolated UI test using mock Supabase
responses, checked objective creation, decreasing-target progress, check-in notes,
filters, and the non-admin blocked screen. The test fixtures are not in this ZIP.
The migration has not been executed against your project. Actual RLS and shared
persistence must be verified after applying the SQL:
1. An admin can create an objective, add a result, and save a check-in.
2. After reloading, the data remains. Another admin sees it after Refresh.
3. A normal signed-in account is denied at admin.html and cannot select/modify
   the OKR tables or call coursewise_admin_stats/coursewise_check_in.
4. A logged-out browser cannot retrieve admin data.
5. Compare the aggregate totals with the Supabase tables.

The UI alone is not an access control. Keep the SQL policies and RPC checks.
Do not put a service-role key in frontend code. Existing app RLS was not changed
or audited by this update. This package has not been pushed to your GitHub repo.
