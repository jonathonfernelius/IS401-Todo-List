# Coursewise admin analytics setup

The admin page preserves the existing coursewise_is_admin() permission check. Admin is a permission granted to selected signed-in accounts, not a separate account type. Supabase remains the authorization boundary for every aggregate analytics function.

## Apply the SQL

In the Coursewise Supabase project, open **SQL Editor** and run the files in this order:

1. supabase/admin-setup.sql if the existing admin permissions and helper functions have not already been installed.
2. supabase/admin-activity.sql if task activity tracking has not already been installed. It creates the protected task event log needed by the completed-versus-overdue dashboard and the additional retention/Canvas charts.
3. supabase/admin-okr-analytics.sql to add the aggregate data used by the other three OKRs.

If the first two files were already applied for the prior admin dashboard, run only admin-okr-analytics.sql. The new file creates indexes and a protected aggregate function. It does not add columns to User or Tasks, and it does not change the existing admin table or permission logic.

## What each OKR measures

- **New accounts:** account registrations by UserCreationDate, cumulative registered accounts, and change against the previous period of the same length.
- **Canvas adoption and usage:** the number and share of accounts with at least one imported Canvas assignment still represented in task activity, plus assignment imports and completions over time.
- **Tasks completed per day:** daily completion count, unique accounts completing at least one task, and those accounts as a share of accounts registered by that day. The Canvas/non-Canvas and active-user filters are available.
- **Tasks completed vs. overdue:** the period completion count, current overdue backlog, completion-to-overdue ratio, and Canvas/non-Canvas comparison. Date-only tasks become overdue the next day; timed tasks become overdue after the due time.

“Active” means that an account added or completed a task in the last 30 days. The task event log starts when admin-activity.sql is applied. Previous completion dates cannot be reconstructed. The initial activity migration seeds the current task state and recent task creation dates, so it can show the current overdue count immediately but does not invent earlier completion history.

## Canvas connection status

The supplied website calls a canvas-connect Supabase Edge Function for each signed-in account. Its connection status is not exposed as a field in the supplied User or Tasks schema, and the Edge Function source was not included in the project archive. The admin dashboard therefore measures Canvas use through imported assignments. This confirms that an account imported Canvas data, but it cannot count accounts that connected Canvas and have not imported an assignment. No Canvas feed URL or token is exposed to the browser or these analytics functions.

If you need the precise connected-account percentage, the canvas-connect Edge Function will need to record a connection state in a protected database table or provide a separate admin-only aggregate. The source for that deployed function is needed to add this without guessing how it stores Canvas credentials.

## Deployment

Keep the updated files in their existing paths:

- admin.html
- css/admin.css
- js/admin.js
- supabase/admin-okr-analytics.sql
- ADMIN-SETUP.md

Deploy the website through the same GitHub Pages workflow as the other Coursewise pages. No service-role key belongs in frontend code.

## Data access and history

The new RPC checks coursewise_is_admin() and returns aggregate counts and chart points only. The page reads only the signed-in administrator's own profile fields to show avatar initials. The activity table has row-level security enabled and no direct browser grants. Account registration counts use the existing UserCreationDate field.
