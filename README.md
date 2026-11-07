# Banisatya distributor portal

Shared distributor/employee access for CAMS/KFintech imports and investor/family PDF reports.

The default online deployment uses **Render Free + Neon Free PostgreSQL**, without
an attached disk or a paid database. Free tiers have quotas and may sleep; they are
not a guarantee of unlimited hosting or permanent pricing.

- [Free deployment guide](DEPLOY-RENDER.md)
- [Accounts, backup and recovery](SERVER-SETUP.md)
- [Import formats and duplicate handling](RTA-IMPORTS.md)

Requires Node.js 24.13+. Run `npm ci` then `npm test`.
Production requires `DATABASE_URL` (a PostgreSQL secret) and an HTTPS origin.
Render supplies its HTTPS origin automatically. SQLite remains available locally
for development when `DATABASE_URL` is absent. Production refuses temporary local storage.

Never put database URLs, reports, real investor records, passwords or backups in GitHub.
