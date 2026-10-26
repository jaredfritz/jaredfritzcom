# Workout Log — jaredfritz.com/workout/

A mobile-first personal workout tracker with a single password screen and cloud sync.
The static page and its code are public; the server checks the password before issuing a
session for the configured owner. Workout history stays out of Git.

## Features
- Start, finish, or discard a workout; optional A/B/Quick suggestions
- Searchable exercise catalog and custom exercises
- Weights, reps, completed sets, body weight, and previous performance
- Workout history, movement coverage, and highest weights per exercise
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

## Verification
Run `node tools/test-workout-access.cjs` with Node 24 or later. These tests cover the locked
view, session exchange, clearing cached data, an in-flight sync after lock, and endpoint
validation/session responses with mocked Auth. Also test the deployed endpoint and database
grants directly; the tests do not replace live integration checks.

The security advisor's “RLS enabled, no policy” notice for the verifier table is intentional:
only the server's service role can access it.
