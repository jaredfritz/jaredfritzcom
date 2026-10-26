# Workout Log — jaredfritz.com/workout/

A mobile-first personal workout tracker with a single password screen and cloud sync.
The static page and its code are public; the server checks the password before issuing a
session for the configured owner. Workout history stays out of Git.

## Features
- Start, finish, or discard a workout without fixed routines
- Searchable exercise list showing days since each exercise was last logged
- Exercise picker sort options: name, oldest last log first, or newest last log first; the choice is remembered on the device
- Three sets by default, with previous weights and reps prefilled and editable
- Edit sets to change the count or individual weights/reps; no completion checkboxes
- Treadmill distance in miles, duration in minutes, and incline in percent
- Only treadmill and previously recorded exercises appear by default; custom exercises remain available
- Workout history, movement coverage, and highest weights per exercise
- Select any history session to edit its date, exercises, individual sets, treadmill details, or body weight
- Browser-local persistence while unlocked, JSON export/import, and cross-device sync
- A remembered session on each device; Settings → Lock tracker clears its local workout cache

## Server-side password access
The browser posts the password over HTTPS to the Supabase `workout-unlock` Edge Function.
The function calls a service-only database verifier, then creates a normal Supabase Auth
session for the existing owner without sending email. Existing workout RLS remains in force.

The password is stored only as a salted bcrypt hash in `workout_password_access`.
Neither that table nor the verifier can be accessed by anonymous or authenticated browser
clients. The verifier uses a row lock to enforce a global maximum of five attempts per
minute across all function instances. This intentionally simple single-user limit can
temporarily block legitimate login attempts too. Already unlocked devices can still sync.

No password, password hash, owner email, service key, or workout records belong in this repo.
The function uses Supabase's server-injected environment variables. Its `verify_jwt=false`
setting allows login before a session exists; the function performs its own password check.

## Deployment
1. Use the dedicated workout Supabase project and the existing tables in `schema.sql`.
2. Apply `password-access.sql` once.
3. In the private SQL editor, provision the singleton row using your existing Auth user ID
   and `extensions.crypt(password, extensions.gen_salt('bf',12))`. Do not commit this statement
   with the actual password or its resulting hash. Changing the password does not revoke
   sessions already issued; revoke those separately if needed.
4. Deploy `supabase/functions/workout-unlock/index.ts` with JWT verification disabled.
   Allow the production origin in the function; CORS is not a substitute for its password check.
5. Set the public project URL and publishable key in `config.js`. Never use a service key.
6. Verify wrong-password rejection, correct-password login, history access, anonymous denial,
   and locking before publishing the static page.

The existing owner's cloud data is retained; this flow does not create a replacement account.
Existing email-link sessions also remain valid. The static app no longer offers email login.

## Backup and legacy import
Export a JSON backup before clearing browser storage or locking while sync is pending.
Sync failures keep the local copy while the tracker remains unlocked.
The private legacy import supports the original XLSM conversion; a single recorded rep value
represents one set, not three completed sets.

Strength entries still store individual sets, even when the compact view edits them together.
The three-set default applies only to new entries; historical set counts remain unchanged.
When individual sets differ, the compact view displays “Varies” and preserves those values
until a shared value is explicitly entered. Treadmill entries use a separate item shape
with `kind`, `miles`, `durationMinutes`, and `inclinePercent` instead of sets. These fields
round-trip through the existing session JSON payload and backup format without a schema change.
Unused starter exercises are hidden based on recorded history, not removed from historical data.

Sorting uses the last completed session with recorded values, excluding the workout being
edited and future-dated entries. Never-logged exercises appear first in oldest-first order
and last in newest-first order. Equal dates are ordered alphabetically.

Treadmill aliases are consolidated into one catalog entry when loading a browser cache,
importing a backup, or syncing. All historical items and measurements are preserved,
including multiple intervals in a single workout. During cloud sync, session references
are saved under the canonical exercise ID before redundant catalog rows are removed.
Creating another exercise with a treadmill name reuses the existing entry.

History edits remain in a separate draft until Save changes is selected. Cancel discards
the draft, including newly created exercises. Saving updates the original session and its
sync timestamp without changing its ID, import source, status, or the current workout.
If a newer version arrives from another device while editing, cancel and reopen the editor
to avoid overwriting it. Legacy set counts are preserved when opening existing sessions.

## Verification
Run `node tools/test-workout-access.cjs` with Node 24 or later. These tests cover the locked
view, session exchange, clearing cached data, an in-flight sync after lock, and endpoint
validation/session responses with mocked Auth. Also test the deployed endpoint and database
grants directly; the tests do not replace live integration checks.

Run `node tools/test-workout-logging.cjs` for recency, catalog visibility, set defaults,
and treadmill data tests. With Playwright and Chromium installed, run
`node tools/test-workout-browser.cjs` for a mobile browser check using synthetic local
data and a mocked cloud client; it does not write to the live database.

The security advisor's “RLS enabled, no policy” notice for the verifier table is intentional:
only the server's service role can access it.
