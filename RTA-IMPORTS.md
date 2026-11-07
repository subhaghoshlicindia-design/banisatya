# RTA imports and PDF reports

This portal now uses a shared Node server with PostgreSQL in production and SQLite locally with distributor and employee
accounts. See [SERVER-SETUP.md](SERVER-SETUP.md) for first setup, deployment, backups
and password recovery. Browser session flags are no longer used for authentication.

## Distributor workflow

1. Select the report code and upload an extracted CSV, delimited TXT, Excel or DBF.
2. For multiple files, filenames must contain their report codes. All files validate
   before any changes are saved. Unselected categories remain available.
3. The import status reports duplicates, updates and snapshot replacement.

Supported codes are listed in the import selector. WBR9 and MFSD211/311 are client
masters; WBR2 and MFSD201/307 are transactions; WBR22 and MFSD203/310 are AUM;
WBR49 and MFSD243/313/230 are systematic plans; WBR6/77 and MFSD205/208 are brokerage.
Some RTA exports have customized field selections. Download a template to see the
canonical headings; unknown columns are retained. Mandatory fields fail validation
rather than silently creating zero amounts. ZIP/password-protected archives must
be extracted before uploading. Excel reading uses the existing SheetJS CDN.

## Duplicate and update rules

- Records remain separate between CAMS and KFintech.
- Repeated transaction IDs are scoped by ARN, AMC, folio and scheme. Identical rows
  are skipped; conflicting financial rows reject the import without saving.
- Without an RTA ID, only identical complete rows are skipped. Different rows are
  retained because two legitimate transactions can share a date and amount.
- Investor master rows update by RTA/AMC/folio; SIP registrations update by their ID.
- An AUM import replaces that RTA's entire AUM snapshot. Upload a complete snapshot
  for that provider, not only the changed folios. Other providers are preserved.
- Changing brokerage report codes replaces that provider's brokerage dataset to
  avoid adding summary and detailed commission feeds together. Same-code uploads
  merge; include brokerage periods and transaction IDs for reliable matching.
- Alternative KFintech on-demand/subscription codes share a category dataset.
- Existing imported data is retained. Reimport old exports if they predate these
  duplicate rules; this change does not silently remove historical legacy rows.

## Employee reports

Open Reports and choose an investor or saved family, report type and optional dates.
Generate a preview, then Download PDF. Available sections are client master,
transactions, AUM, systematic plans, brokerage, or a complete portfolio.

Investors match by PAN. Rows without PAN may link through an unambiguous
RTA/AMC/folio association; names alone never merge people. Families are explicit, distributor-managed
saved memberships and may be edited or deleted without deleting investor data.

Dates filter transactions by transaction date, SIPs by start date, and brokerage
by transaction date or period end. Undated/unrecognized dates are excluded and
counted when filters are selected. AUM and client master remain current snapshots.
This does not calculate historical valuation, capital gains, XIRR, tax statements,
or external-asset reports without the required underlying data and rules.

PDFs are generated offline as multipage A4 documents using browser-rendered page
images, supporting Unicode names. Their text is not selectable/searchable.

## Validation

`npm test` checks database and API rules. `test-browser.cjs` checks real login and
shared data flows in independent browser contexts using Playwright. Fixtures are synthetic; no actual ARN exports were supplied.
Real customized CAMS/KFintech files should be checked before operational use.
