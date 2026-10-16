# Fixtures

Real responses from the OneJump server for its sample business (Dani Reyes, Reyes Strength):
the coach snapshot, one client, one thread, one check-in, the morning briefing, an Ask
Assist answer with a proposal, and an Assist nutrition plan.

The CI screenshots launch the app with `-ojFixture Fixtures -oj.signedIn YES`, so the
signed-in screens are checked against the server's real shapes without a server or password.

To refresh them after changing the server's mobile API, from the web app folder run the
`dump` test in `mobile-app/Fixtures/dump.test.js.txt` (copy it into `tests/`, run
`npx vitest run tests/zz-dump.test.js`, then delete it).
