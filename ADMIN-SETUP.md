# Coursewise admin setup

The admin page keeps the existing `coursewise_is_admin()` permission check. Admin is a permission granted to selected signed-in accounts; it is not a separate account type. Supabase remains the authorization boundary.

## 1. Install the existing admin setup

In the Coursewise Supabase project, open **SQL Editor** and run `supabase/admin-setup.sql` once. It creates the existing admin permission table, RLS policies, and admin-only aggregate functions. If this setup was already applied, do not drop or recreate its tables.

## 2. Grant the existing admin permission

In Supabase **Authentication → Users**, copy the UID of each existing account that should administer Coursewise. Replace the placeholder below and run it in SQL Editor:

```sql
insert into public.coursewise_admins (user_id)
values ('YOUR_AUTH_USER_UUID'::uuid)
on conflict (user_id) do nothing;
```

Use the Auth UID, not the `UserID` from the public profile table. To remove permission later:

```sql
delete from public.coursewise_admins
where user_id = 'YOUR_AUTH_USER_UUID'::uuid;
```

## 3. Enable task activity analytics

Run `supabase/admin-activity.sql` once after `admin-setup.sql`. This adds a protected activity log and the `coursewise_admin_activity` aggregate function. It does not change the existing admin permission table or policies, and it does not add columns to `User` or `Tasks`.

The migration seeds a current-state snapshot for existing tasks and uses the existing `TaskCreationDate` values to identify accounts that added tasks in the last 30 days. A trigger records task creation, completion, reopening, due-date/source changes, and deletion from then on. Previous completion dates cannot be recovered, so completion trends and active-user status based on completing tasks are available only from setup onward.

The dashboard defines:

- **Overdue:** incomplete, non-excluded tasks past their due date. Date-only tasks become overdue the next day; tasks with a due time become overdue after that time.
- **Active user:** an account that added or completed a task in the last 30 days.
- **Completed-to-overdue ratio:** completion events during the selected range divided by the current overdue task count.
- **Canvas filter:** tasks marked `IsAssignment`; non-Canvas tasks are not marked as assignments.

The time-range menu offers one week, one month, six months, and one year. Historical overdue counts are reconstructed from task state changes recorded after setup. Existing tasks contribute to the current overdue count immediately, but do not create pre-setup history.

## 4. Deploy the page

Copy the updated `admin.html`, `css/admin.css`, and `js/admin.js` into the repository, along with `supabase/admin-activity.sql` and this setup note. Keep the files at the same paths, then deploy the site. The page uses the existing public Supabase client configuration; do not put a service-role key in frontend code.

The four OKR cards are present. **Tasks completed vs. overdue** is connected to Supabase and has live metrics and charts. The other three cards are ready placeholders until their metric definitions and data sources are added. Canvas connection rate will need a separate admin-safe aggregate of Canvas connection status; the current project only exposes per-account status through a server function.

## Data access

The analytics RPC checks `coursewise_is_admin()` and returns aggregate counts and time-series points only. The page does not fetch other users' task names, email addresses, passwords, or Canvas tokens. The activity table has RLS enabled and no direct browser grants. Do not add a service-role key to client code.
