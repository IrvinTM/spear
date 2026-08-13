# Spear Architecture Todo List

## Completed ✅
- Removed hardcoded paths (`/home/irvin/...`) and implemented environment variable fallbacks
- Fixed circular import (`lib/email/sync.ts` → `app/setup/actions.ts`)
- Removed `sync_error.txt` debug dump in `lib/moodle/sync.ts`
- Fixed `sync_log` CHECK constraint violation ('pending' → 'partial')
- Extracted `getAgentHome()` to shared `lib/config.ts`
- Removed dangerous Next.js interfering `process.on()` handlers in `db.ts`
- Extracted sidebar to shared `app/(dashboard)/layout.tsx` to stop copy-pasting
- Extracted shared domain types to `lib/types.ts`
- Implemented robust server-side session management (`lib/auth-session.ts`) to avoid leaking the master password.

## Pending ⏳
(none)

## Recently Completed
- **Update Moodle Scraping**: Switched `lib/moodle/api.ts` from regex HTML parsing to `SessionManager.callApi()` with `core_enrol_get_users_courses`, `mod_assign_get_assignments`, `core_course_get_contents`.
- **Extract Components**: Extracted `PasswordModal`, `EmptyState`, and `AlertBanner` into `src/components/`. Updated dashboard, email, and materials pages.
- **Database Migrations**: Added `src/lib/migrations/runner.ts` with `schema_migrations` tracking table. Schema lives in numbered `.sql` files (e.g. `001_initial.sql`).
- **Asynchronous Audio Generation**: Split TTS into a separate `/api/chat/audio` endpoint. Chat returns text immediately; audio loads in the background.
- **Batch Email Processing**: Emails now process LLM calls in parallel pools (concurrency 5) instead of sequentially. DB inserts remain sequential.
- **API Authentication**: Added `getSessionCredentials()` guard to `api/chat/route.ts` — returns 401 if no valid session.
