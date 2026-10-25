# Workout Log — jaredfritz.com/workout/

A mobile-first, **unlisted but publicly downloadable** personal workout PWA. Nothing links to this URL from the main site. \`noindex\` and robots.txt discourage crawlers but **do not provide access control**. Keep all workout history out of Git.

## Features
- Quick start, A/B/quick suggestions (never enforced)
- Searchable exercise catalog and custom exercises
- Three set rows per exercise, weights/reps editing and completion checkmarks
- Previous performance per exercise, workout history, progress chart and movement distribution
- Works in local-only mode with browser storage, export/import backup
- Optional Supabase magic-link login and RLS-protected cloud sync

## Setup
1. Create a **new dedicated Supabase project**. Do not reuse a civic-data project.
2. Review and run \`workout/schema.sql\` in that project. Check RLS and the Data API exposed schemas/grants. Never run this SQL on a project with conflicting table names.
3. In Supabase Authentication > URL Configuration, allow \`https://jaredfritz.com/workout/\` as a redirect URL. Ensure email sign-in is enabled; consider disabling new signups once your account exists.
4. Edit only the **public** values in \`workout/config.js\`: project URL and publishable key. Do not use any service_role or secret key.
5. Test sign-in, sync and cross-account isolation, then deploy by merging this branch to the site's GitHub Pages publishing branch.
6. In the History tab, use Import to select the private \`workout-history-import.json\` generated from the legacy XLSM. The history data is intentionally NOT committed.

## Important
- Until Supabase is configured, the app works in *local-only mode*. Data stays in that browser's localStorage and is not backed up to the cloud. Use Export before clearing browser storage or switching devices.
- After sign-in, local records merge to your own Supabase account. Sync errors show a warning; local data is retained, and you can retry.
- A legacy sheet value of a single \`8\` represents **one recorded set**; do not infer three completed sets.
- This app is not medical guidance or a substitute for professional exercise programming.
