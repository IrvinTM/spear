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
- **Update Moodle Scraping**: Switch `lib/moodle/api.ts` away from fragile regex HTML parsing and use `SessionManager.callApi()` to query the JSON Web Services (`core_enrol_get_users_courses`, `mod_assign_get_assignments`, `core_calendar_get_calendar_upcoming_view`).
- **Extract Components**: Extract modals, cards, and empty states from `client.tsx` files into reusable components in `src/components/`.
- **Database Migrations**: Add a simple SQL migration system (e.g. `001_initial.sql`) for better local-first schema evolution.
- **Asynchronous Audio Generation**: Split Piper TTS out of the chat response payload so the bot can respond immediately while audio streams in the background.
- **Batch Email Processing**: Optimize `lib/email/sync.ts` to process emails with `agy` in batches or parallel pools instead of strictly sequentially.
- **API Authentication**: Add basic token or session guards to the `api/chat/route.ts` endpoint.
