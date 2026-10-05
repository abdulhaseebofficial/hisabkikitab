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

For API E2E, use a local API on `http://localhost:5000` connected to the same disposable database. Seed the disposable demo account and start the API before `npm run test:e2e`; do not point `HW_API` or `BROWSER_BASE_URL` at production. CI uses a short-lived PostgreSQL 17 service and sets the same guard variables (`.github/workflows/ci.yml`).

This guard intentionally accepts only localhost. If a separate staging server is needed later, create an explicit allowlist and prove the database is disposable; do not weaken the default guard or use the production connection string. Never run these suites against user financial data.
