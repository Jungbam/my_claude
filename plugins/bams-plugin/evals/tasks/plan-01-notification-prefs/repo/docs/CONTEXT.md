# Project context: Acme Reminders

- Users get email notifications from `src/notify.ts` for three categories: `reminder`, `digest`, `marketing`.
- Today every user receives every email. There is no per-user setting and no unsubscribe link.
- Support tickets: "too many emails" is the #1 complaint (about 40% of tickets last quarter).
- Legal: marketing emails must include a working one-click unsubscribe (CAN-SPAM / GDPR). Transactional `reminder` emails may not be fully disabled for security notices.
- Only the email channel exists. Product wants push and SMS later; an SMS vendor is not selected yet.
- Users live in multiple time zones; `User.timezone` (IANA string) already exists.
- Team: 2 engineers, 1 designer (part-time), 2-week window. Deploys are weekly; a feature-flag helper exists in `src/flags.ts`.
- Data store: a single `users` table (see `src/user.ts`); migrations are plain SQL files run in order.
