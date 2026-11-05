# PRD + Plan: Notification Preferences

## Problem and goal
"Too many emails" is the #1 support complaint (~40% of tickets). Goal: let users control notifications per category and channel, with quiet hours.
Success metric: reduce notification-related support tickets by 50% within 8 weeks; unsubscribe rate on marketing mails tracked as a KPI.

## Non-goals
Out of scope for this iteration: SMS delivery (vendor not selected), push channel implementation, A/B testing of digest cadence.

## Requirements
- Per-category (reminder, digest, marketing) and per-channel (email now; push/SMS later) toggles, stored per user.
- Quiet hours defined in the user's own time zone (User.timezone, IANA); notifications in the window are held and delivered after.
- Legal: marketing mails carry a one-click unsubscribe link (CAN-SPAM / GDPR); unsubscribe updates preferences immediately.
- Security/transactional reminder notices can never be fully disabled (always on, mandatory).
- Default for existing users: everything enabled so behavior is backward compatible.

## Acceptance criteria
- Given a user disabled `digest`, when a digest is triggered, then no mail is sent.
- Given quiet hours 22:00-07:00 Asia/Seoul, when a reminder fires at 23:00 KST, then it is deferred to 07:00.
- Given a marketing mail, then it contains a working unsubscribe link and clicking it disables marketing for that user.
- Given mandatory security notices, then the toggle is not offered.

## Data model and migration
New table `notification_preferences(user_id, category, channel, enabled)` plus `quiet_hours(user_id, start, end)`; plain SQL migration, backfilled with defaults for existing users.

## Task breakdown (estimates, 2 engineers + 0.5 designer, 2 weeks)
1. [1d] Finalize UX flows and copy for preferences screen (designer) - blocks task 8.
2. [1d] SQL migration for preference tables with defaults backfill.
3. [1d] Preferences repository + validation (depends on 2).
4. [1d] Add feature flag `notification_prefs` using src/flags.ts.
5. [2d] Refactor src/notify.ts to check preferences before calling src/mailer.ts (depends on 3).
6. [1d] Mandatory-category guard so reminder/security notices cannot be disabled.
7. [2d] Quiet-hours scheduler with timezone handling (depends on 3, 5).
8. [2d] Preferences UI (depends on 1, 3).
9. [1d] Unsubscribe token generation + one-click endpoint (depends on 3).
10. [1d] Inject unsubscribe link/headers into marketing mails (depends on 9).
11. [2d] Unit tests for preference logic and timezone edge cases (DST).
12. [1d] Integration tests: notify -> mailer outbox with preferences.
13. [1d] Rollout: enable flag for staff, then 10%, then 100%; dashboards for unsubscribe/ticket metrics.
14. [0.5d] Docs and support macros.

## Risks
- Timezone/DST bugs in quiet hours (mitigate with tests). Legal non-compliance if unsubscribe fails (mitigate: test + legal review).
- Scope creep into SMS/push.

## Open questions
Quiet-hours behavior for digests (defer vs drop)? SMS vendor timeline?
