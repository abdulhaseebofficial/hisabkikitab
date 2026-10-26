# Disposable PostgreSQL for integration tests

The DB, migration, API E2E and security suites write accounts and financial rows. Run them only against a disposable **local** PostgreSQL database. The test guard rejects remote hosts, requires `NODE_ENV=test`, `ALLOW_DESTRUCTIVE_TEST_DB=true`, and requires a database name beginning `test_` or ending `_test`. It overrides any inherited application `DATABASE_URL`, `POSTGRES_URL`, `DIRECT_URL` and `POSTGRES_URL_NON_POOLING` with `TEST_DATABASE_URL` before tests connect. It also rejects a non-local `HW_API` target.

Example PowerShell setup, after installing/running PostgreSQL locally and creating an empty `hisabkikitab_test` database:

```powershell
$env:NODE_ENV = 'test'
$env:ALLOW_DESTRUCTIVE_TEST_DB = 'true'
$env:TEST_DATABASE_URL = 'postgresql://LOCAL_USER:LOCAL_PASSWORD@127.0.0.1:5432/hisabkikitab_test'
$env:DATABASE_URL = $env:TEST_DATABASE_URL
$env:POSTGRES_URL = $env:TEST_DATABASE_URL
$env:DIRECT_URL = $env:TEST_DATABASE_URL
$env:POSTGRES_URL_NON_POOLING = $env:TEST_DATABASE_URL
npm run migrate
npm run test:migrations
npm run test:db
```

## Getting a local PostgreSQL without installing one

The guard accepts only `localhost`, so these suites need a real local server.
If PostgreSQL is not installed and a system-wide install is unwanted, the
official Windows **binaries** zip runs from any directory with no installer and
no administrator rights:

```powershell
$sp = "$env:TEMP\hkk-pg"
Invoke-WebRequest 'https://get.enterprisedb.com/postgresql/postgresql-17.6-1-windows-x64-binaries.zip' -OutFile "$sp.zip"
# Extract only pgsql/bin, pgsql/lib and pgsql/share. The bundled pgAdmin has
# paths long enough to break Expand-Archive on Windows.
& "$sp\pgsql\bin\initdb.exe" -D "$sp\data" -U postgres --pwfile=pw.txt -E UTF8 --locale=C
Start-Process "$sp\pgsql\bin\postgres.exe" -ArgumentList '-D',"$sp\data",'-p','5432' -WindowStyle Hidden
```

Then create `hisabkikitab_test` and continue with the variables above. Delete the
data directory when finished; nothing in it is worth keeping. `pg_ctl start`
through a wrapper that captures stdout can appear to hang on Windows - launching
`postgres.exe` directly and detaching it avoids that.

Note that `.github/workflows/ci.yml` currently runs a dependency audit only: it
has no PostgreSQL service and does not run these suites, so they are verified
locally or not at all.

For API E2E, use a local API on `http://localhost:5000` connected to the same disposable database. Seed the disposable demo account and start the API before `npm run test:e2e`; do not point `HW_API` or `BROWSER_BASE_URL` at production.

This guard intentionally accepts only localhost. If a separate staging server is needed later, create an explicit allowlist and prove the database is disposable; do not weaken the default guard or use the production connection string. Never run these suites against user financial data.
