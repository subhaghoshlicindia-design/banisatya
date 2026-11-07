# Artha distributor portal

Shared distributor and employee access for CAMS/KFintech report imports and investor
and family PDF reports. Requires Node.js 24.13 or newer and persistent SQLite storage.

- [Local setup and account administration](SERVER-SETUP.md)
- [Deploy from GitHub to Render](DEPLOY-RENDER.md)
- [Supported reports and import rules](RTA-IMPORTS.md)

Run `npm test` before deployment. On Windows, `./Start-Portal.ps1` locates a supported
Node runtime. In production, deploy the server and frontend together; GitHub Pages
cannot run the server. Accounts, sessions, investor data and family membership belong
in the database, never in the GitHub repository.

`render.yaml` describes a paid, single-instance Render service in Singapore with a
1 GB persistent disk. It creates no resources until you deploy it in your Render
account. Review the service and disk charges in Render before confirming deployment.
