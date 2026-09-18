// Real authenticated HTTP requests and PostgreSQL constraints, in an isolated schema.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
require("dotenv").config({ path: path.resolve("apps/api/.env"), quiet: true });
const schema = `sl_test_${crypto.randomBytes(8).toString("hex")}`;

process.env.NODE_ENV = "test";
process.env.JWT_ACCESS_SECRET = crypto.randomBytes(48).toString("hex");
const db = require("../../apps/api/src/infrastructure/database/pool");
const originalQuery = db.query;
const originalTransaction = db.transaction;
const isolated = (fn) =>
  originalTransaction(async (tx) => {
    await tx.query(`SET LOCAL search_path TO ${schema}`);
    assert.equal(
      (await tx.queryOne("SELECT current_schema() AS name")).name,
      schema,
    );
    return fn(tx);
  });
db.transaction = isolated;
db.query = (sql, params) => isolated((tx) => tx.query(sql, params));
db.queryOne = (sql, params) => isolated((tx) => tx.queryOne(sql, params));
const {
  migrationFiles,
} = require("../../apps/api/src/infrastructure/database/migrate");
const {
  signAccessToken,
} = require("../../apps/api/src/modules/auth/auth.tokens");

test(
  "Shared Living authenticated API and database integration",
  { timeout: 600000 },
  async (t) => {
    let server;
    try {
      await originalQuery(`CREATE SCHEMA ${schema}`);
      const current = await db.queryOne("SELECT current_schema() AS name");
      assert.equal(current.name, schema, "Never run these tests in public");
      await db.query(
        "CREATE TABLE schema_migrations(name text PRIMARY KEY,applied_at timestamptz DEFAULT now())",
      );
      for (const file of migrationFiles())
        await db.query(
          fs.readFileSync(path.resolve("database/migrations", file), "utf8"),
        );
      const accounts = [];
      for (const name of ["Owner", "Viewer", "Outsider"])
        accounts.push(
          await db.queryOne(
            "INSERT INTO users(name,email,password,finance_mode,onboarding_completed) VALUES($1,$2,'test-only','shared_living',true) RETURNING id",
            [name, `${name.toLowerCase()}@example.test`],
          ),
        );
      const tokens = accounts.map((a) => signAccessToken(a.id));
      const app = require("express")();
      app.use(require("express").json());
      require("../../apps/api/src/routes")(app);
      app.use(
        require("../../apps/api/src/shared/middleware/errorHandler")
          .errorHandler,
      );
      await new Promise((resolve) => {
        server = app.listen(0, "127.0.0.1", resolve);
      });
      const request = async (method, url, body, who = 0) => {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 15000);
        try {
          const response = await fetch(
            `http://127.0.0.1:${server.address().port}/api${url}`,
            {
              method,
              headers: {
                "Content-Type": "application/json",
                ...(who === null
                  ? {}
                  : { Authorization: `Bearer ${tokens[who]}` }),
              },
              ...(body === undefined ? {} : { body: JSON.stringify(body) }),
              signal: controller.signal,
            },
          );
          return { status: response.status, ...(await response.json()) };
        } finally {
          clearTimeout(timeout);
        }
      };
      const call = async (method, url, body, who = 0) => {
        const r = await request(method, `/shared-living${url}`, body, who);
        assert.equal(r.status, 200, JSON.stringify(r));
        return r.data;
      };
      let space,
        other,
        base,
        monthPath,
        code,
        memberA,
        memberB,
        food,
        billCategory,
        bill,
        expense,
        payment;
      await t.test(
        "space creation initializes categories, owner role and hashed unique code",
        async () => {
          space = await call("POST", "/spaces", {
            name: "My Flat",
            currency: "PKR",
            residents: 2,
            month: "2024-02",
            budget: "1000",
            food_budget: "500",
            owner_id: accounts[2].id,
            role: "viewer",
          });
          code = space.invite.code;
          base = `/spaces/${space.id}`;
          monthPath = `${base}/months/2024-02`;
          assert.equal(space.owner_id, accounts[0].id);
          assert.equal(code.length, 43);
          const stored = await db.queryOne(
            "SELECT * FROM sl_invites WHERE space_id=$1",
            [space.id],
          );
          assert.notEqual(stored.code_hash, code);
          assert.equal(
            stored.code_hash,
            crypto.createHash("sha256").update(code).digest("hex"),
          );
          const dash = await call("GET", monthPath);
          assert.equal(dash.categories.length, 18);
          food = dash.categories.find((c) => c.kind === "food").id;
          billCategory = dash.categories.find((c) => c.kind === "bill").id;
          other = await call(
            "POST",
            "/spaces",
            {
              name: "Other Flat",
              currency: "PKR",
              residents: 1,
              month: "2024-02",
              budget: "100",
            },
            2,
          );
        },
      );
      if (!food) throw new Error("Shared Living fixture setup failed");
      await t.test(
        "valid joins are idempotent and always Viewer; invalid codes fail",
        async () => {
          assert.equal(
            (await call("POST", "/join", { code, role: "admin" }, 1)).space_id,
            space.id,
          );
          await call("POST", "/join", { code }, 1);
          assert.equal(
            (
              await db.queryOne(
                "SELECT count(*) AS n FROM sl_memberships WHERE space_id=$1",
                [space.id],
              )
            ).n,
            2,
          );
          assert.equal(
            (await call("GET", monthPath, undefined, 1)).space.role,
            "viewer",
          );
          assert.equal(
            (
              await request(
                "POST",
                "/shared-living/join",
                { code: "invalid" },
                1,
              )
            ).status,
            400,
          );
          assert.equal(
            (await request("GET", "/shared-living/spaces", undefined, null))
              .status,
            401,
          );
        },
      );
      await t.test(
        "all protected writes reject Viewer with 403, regardless of body",
        async () => {
          const id = crypto.randomUUID();
          const paths = [
            ["PATCH", base],
            ["POST", `${base}/invite`],
            ["PUT", monthPath],
            ["POST", `${base}/members`],
            ["PATCH", `${base}/members/${id}`],
            ["DELETE", `${base}/members/${id}`],
            ["POST", `${base}/categories`],
            ["PATCH", `${base}/categories/${id}`],
            ["POST", `${monthPath}/copy-bills`],
            ["POST", `${monthPath}/preview`],
            ["PUT", `${monthPath}/bills/${id}/receipt`],
          ];
          for (const kind of ["expenses", "bills", "payments"])
            for (const method of ["POST", "PATCH", "DELETE"])
              paths.push([
                method,
                `${monthPath}/${kind}${method === "POST" ? "" : `/${id}`}`,
              ]);
          for (const [method, url] of paths)
            assert.equal(
              (await request(method, `/shared-living${url}`, {}, 1)).status,
              403,
              `${method} ${url}`,
            );
        },
      );
      await t.test(
        "outsiders cannot read, mutate or use foreign ids",
        async () => {
          assert.equal(
            (await request("GET", `/shared-living${monthPath}`, undefined, 2))
              .status,
            404,
          );
          assert.equal(
            (await request("PATCH", `/shared-living${base}`, {}, 2)).status,
            404,
          );
          assert.equal((await call("GET", "/spaces", undefined, 1)).length, 1);
        },
      );
      await t.test(
        "members joining midmonth are excluded before their joining date",
        async () => {
          memberA = await call("POST", `${base}/members`, {
            name: "Ali",
            joined_on: "2024-02-01",
            weight: "1",
          });
          memberB = await call("POST", `${base}/members`, {
            name: "Bilal",
            joined_on: "2024-02-15",
            weight: "2",
          });
          expense = await call("POST", `${monthPath}/expenses`, {
            category_id: food,
            date: "2024-02-01",
            amount: "10.01",
          });
          assert.deepEqual(
            expense.shares.map((s) => s.amount_minor),
            [1001],
          );
          assert.equal(expense.shares[0].member_id, memberA.id);
          assert.equal(
            (
              await request("POST", `/shared-living${monthPath}/expenses`, {
                category_id: food,
                date: "2024-02-01",
                amount: "1",
                included: [memberB.id],
              })
            ).status,
            400,
          );
        },
      );
      await t.test(
        "bills use exact splits; wrong share totals and cross-space categories fail",
        async () => {
          bill = await call("POST", `${monthPath}/bills`, {
            name: "Rent",
            category_id: billCategory,
            date: "2024-02-16",
            due_date: "2024-02-20",
            amount: "20.01",
            method: "equal",
            recurring: true,
          });
          assert.deepEqual(
            bill.shares.map((s) => s.amount_minor),
            [1001, 1000],
          );
          const foreign = (
            await call(
              "GET",
              `/spaces/${other.id}/months/2024-02`,
              undefined,
              2,
            )
          ).categories[0].id;
          assert.equal(
            (
              await request("POST", `/shared-living${monthPath}/expenses`, {
                category_id: foreign,
                date: "2024-02-01",
                amount: "1",
              })
            ).status,
            400,
          );
          assert.equal(
            (
              await request("POST", `/shared-living${monthPath}/expenses`, {
                category_id: food,
                date: "2024-02-16",
                amount: "1",
                method: "percentage",
                values: { [memberA.id]: "50", [memberB.id]: "49" },
              })
            ).status,
            400,
          );
        },
      );
      await t.test(
        "payments, corrected payments, budgets, cash and due balances are exact",
        async () => {
          payment = await call("POST", `${monthPath}/payments`, {
            member_id: memberA.id,
            date: "2024-02-20",
            amount: "50",
            method: "cash",
          });
          let dash = await call("GET", monthPath);
          assert.equal(dash.summary.collected, "50.00");
          assert.equal(dash.summary.spent, "30.02");
          assert.equal(dash.summary.cash, "39.99");
          assert.equal(dash.summary.remainingBudget, "969.98");
          assert.equal(dash.summary.remainingFoodBudget, "489.99");
          await call("PATCH", `${monthPath}/payments/${payment.id}`, {
            member_id: memberA.id,
            date: "2024-02-20",
            amount: "40",
            method: "bank",
          });
          dash = await call("GET", monthPath);
          assert.equal(dash.summary.collected, "40.00");
          assert.equal(dash.summary.cash, "29.99");
        },
      );
      await t.test(
        "removing a resident preserves stored shares and contributions",
        async () => {
          const before = await call("GET", monthPath);
          await call("DELETE", `${base}/members/${memberA.id}`, {
            left_on: "2024-02-20",
          });
          const after = await call("GET", monthPath);
          assert.deepEqual(after.shares, before.shares);
          assert.deepEqual(after.payments, before.payments);
          assert.equal(
            after.summary.members.find((m) => m.id === memberA.id).archived,
            true,
          );
          const next = await call("POST", `${monthPath}/expenses`, {
            category_id: food,
            date: "2024-02-21",
            amount: "1",
          });
          assert.equal(next.shares[0].member_id, memberB.id);
        },
      );
      await t.test(
        "closing blocks every financial write and reopening restores access",
        async () => {
          await call("PUT", monthPath, { closed: true });
          for (const kind of ["expenses", "bills", "payments"])
            assert.equal(
              (await request("POST", `/shared-living${monthPath}/${kind}`, {}))
                .status,
              409,
            );
          assert.equal(
            (
              await request(
                "PATCH",
                `/shared-living${monthPath}/payments/${payment.id}`,
                {},
              )
            ).status,
            409,
          );
          assert.equal(
            (
              await request("PUT", `/shared-living${monthPath}`, {
                budget: "1",
              })
            ).status,
            409,
          );
          await call("PUT", monthPath, { closed: false });
          await call("PUT", `${base}/months/2024-03`, { budget: "1000" });
          const copied = await call(
            "POST",
            `${base}/months/2024-03/copy-bills`,
            { from: "2024-02" },
          );
          assert.equal(copied.length, 1);
          assert.equal(copied[0].paid, false);
          assert.equal(copied[0].shares[0].member_id, memberB.id);
          assert.equal(
            (
              await call("POST", `${base}/months/2024-03/copy-bills`, {
                from: "2024-02",
              })
            ).length,
            0,
          );
        },
      );
      await t.test(
        "revoked, regenerated and expired codes cannot admit new viewers",
        async () => {
          const rotated = await call("POST", `${base}/invite`, {});
          assert.notEqual(rotated.code, code);
          assert.equal(
            (await request("POST", "/shared-living/join", { code }, 2)).status,
            400,
          );
          await db.query(
            "UPDATE sl_invites SET expires_at=now()-interval '1 minute' WHERE space_id=$1 AND revoked_at IS NULL",
            [space.id],
          );
          assert.equal(
            (
              await request(
                "POST",
                "/shared-living/join",
                { code: rotated.code },
                2,
              )
            ).status,
            400,
          );
          await call("POST", `${base}/invite`, { disabled: true });
          assert.equal(
            (
              await request(
                "POST",
                "/shared-living/join",
                { code: rotated.code },
                2,
              )
            ).status,
            400,
          );
          const dash = await call("GET", monthPath, undefined, 1);
          assert.ok(!JSON.stringify(dash).includes("code_hash"));
        },
      );
      await t.test(
        "personal modes retain their records through switches and Shared Living stays separate",
        async () => {
          for (const mode of ["student", "householder"]) {
            await db.query(
              "INSERT INTO expenses(user_id,finance_mode,amount,category) VALUES($1,$2,123,$3)",
              [
                accounts[0].id,
                mode,
                mode === "student" ? "Mess/Food" : "groceries",
              ],
            );
            const result = await request("PUT", "/profile", {
              financeMode: mode,
            });
            assert.equal(result.status, 200);
            const personal = await request("GET", "/expenses");
            assert.equal(personal.status, 200);
          }
          await db.query(
            "UPDATE users SET finance_mode='shared_living' WHERE id=$1",
            [accounts[0].id],
          );
          for (const url of [
            "/expenses",
            "/income",
            "/goals",
            "/debts",
            "/budget",
            "/dashboard",
            "/reports",
            "/ai",
          ])
            assert.equal((await request("GET", url)).status, 403);
          assert.equal(
            (
              await db.queryOne(
                "SELECT count(*) AS n FROM expenses WHERE user_id=$1",
                [accounts[0].id],
              )
            ).n,
            2,
          );
        },
      );
      await t.test(
        "database enforces share totals, cross-space references and append-only audit",
        async () => {
          await assert.rejects(
            () =>
              db.transaction(async (tx) => {
                await tx.query(
                  "UPDATE sl_shares SET amount_minor=amount_minor+1 WHERE expense_id=$1",
                  [expense.id],
                );
              }),
            (e) => e.code === "23514",
          );
          await assert.rejects(
            () =>
              db.query(
                "UPDATE sl_activity SET action='forged' WHERE space_id=$1",
                [space.id],
              ),
            (e) => e.code === "23514",
          );
          await assert.rejects(
            () =>
              db.query("DELETE FROM sl_activity WHERE space_id=$1", [space.id]),
            (e) => e.code === "23514",
          );
          await assert.rejects(
            () =>
              db.query("UPDATE sl_payments SET member_id=$1 WHERE id=$2", [
                other.id,
                payment.id,
              ]),
            (e) => e.code === "23503",
          );
        },
      );
      await t.test('submission IDs and hashes are paired and uniquely scoped by group', async () => {
        const requestId = crypto.randomUUID();
        await assert.rejects(() => db.query('UPDATE sl_expenses SET request_id=$1 WHERE id=$2', [requestId, expense.id]), (e) => e.code === '23514');
        await db.query('UPDATE sl_expenses SET request_id=$1,request_hash=$2 WHERE id=$3', [requestId, 'a'.repeat(64), expense.id]);
        await assert.rejects(() => db.query(`INSERT INTO sl_expenses(space_id,period_id,category_id,date,amount_minor,method,request_id,request_hash)
          SELECT space_id,period_id,category_id,date,amount_minor,method,request_id,request_hash FROM sl_expenses WHERE id=$1`, [expense.id]), (e) => e.code === '23505');
      });
    } finally {
      if (server) await new Promise((resolve) => server.close(resolve));
      if (!/^sl_test_[a-f0-9]{16}$/.test(schema))
        throw new Error("Unsafe test schema");
      await originalQuery(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
      await db.closePool();
    }
  },
);
