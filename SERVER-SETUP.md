# Accounts, database and recovery

Production uses PostgreSQL via the secret `DATABASE_URL`. The prepared free deployment
is described in DEPLOY-RENDER.md. There are no default accounts. The first distributor
uses `/setup.html` with `SETUP_TOKEN`; later employees are created by that distributor.

Passwords use scrypt hashing. Server-side cookies are HttpOnly and SameSite; HTTPS
production cookies are Secure. Database-backed sessions can be revoked from any device.
Employee uploads and administration are blocked by the server, not just hidden in the UI.

## Local use

Use Node.js 24.13 or newer. `npm ci` installs the locked PostgreSQL driver. Run
`./Start-Portal.ps1` on Windows, or `npm start`. Without `DATABASE_URL`, local development
uses `data/portal.sqlite`. Production requires PostgreSQL and fails startup if the URL
is missing; it never silently falls back to an ephemeral SQLite database.

For local administrator commands, set `DATABASE_URL` privately in the process environment
from your database provider's connection dialog. Do not paste its value into terminal
history or source files. Remote connections verify TLS certificates. A local PostgreSQL
server on 127.0.0.1 can be used without TLS for isolated development/tests.

## Recovery

Employees can change passwords in Account and password. Distributors create, disable
and reset employees in Settings. Resets revoke sessions and require a password change.
A server administrator can recover distributor access from a trusted local machine:

```powershell
$portalRecovery = Read-Host 'New temporary distributor password' -AsSecureString
$env:NEW_PASSWORD = [System.Net.NetworkCredential]::new('', $portalRecovery).Password
node manage.cjs reset-distributor 'your-email@example.com'
Remove-Item Env:NEW_PASSWORD
```

The machine must have the correct private `DATABASE_URL` environment variable. The
free Render service has no interactive shell; run administrative commands locally
against Neon. No public email-reset endpoint or outbound email is configured.

## Backups

Run from a trusted local machine with your private `DATABASE_URL` set:

```powershell
node manage.cjs backup 'E:\PrivateBackups\banisatya.backup.json'
```

This exports accounts (including password hashes), report datasets, families and audit
records in a consistent read-only database snapshot. Sessions are omitted. The destination
must not already exist. Store it securely outside GitHub. Local SQLite can also use a
`.sqlite` destination for a native SQLite backup. PostgreSQL provider exports/pg_dump
are another backup option. Treat backups as confidential investor data.

## Migrate existing SQLite data

For an existing local database, do this **before** running first-account setup on Neon:

1. Stop the old app and preserve a consistent copy of the SQLite database.
2. Set `DATABASE_URL` to your empty Neon database in a private local environment.
3. Run `node manage.cjs migrate-sqlite 'E:\path\portal.sqlite'`.
4. Sign in to the online app with your existing account password and verify imported
   records and family membership. All users must sign in again.

Migration is atomic, preserves the source and refuses a nonempty destination. No
accounts/reports are migrated automatically. Browser-only imports require uploading
the original RTA files, because browser storage is isolated by website origin.

## Validation

`npm test` runs the API, concurrency, permissions and persistence suite with local
SQLite. GitHub additionally runs the same suite against a disposable PostgreSQL 17
service using `TEST_DATABASE_URL`. Never point that test variable at operational data.
`test-browser.cjs` checks independent browser sessions, uploads and PDF download with
Playwright. Use a real Neon connection only for final deployment verification, not tests.
