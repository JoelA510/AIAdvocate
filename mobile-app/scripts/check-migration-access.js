// Guards the database access rules in AGENTS.md section 4a. Since
// 20261119120000 the client roles (anon, authenticated) get nothing on new
// objects in public unless a migration grants it, so each new object needs
// its access decided in the migration that creates it. This check makes the
// decision visible and catches the omissions that have bitten this project:
// a function left executable by the public key, a SECURITY DEFINER function
// with an open search_path, a table without row-level security, and a view
// that reads as its owner.
//
// For every migration newer than BASELINE:
//   1. CREATE TABLE public.x      needs ALTER TABLE public.x ENABLE ROW LEVEL
//                                 SECURITY in the same file.
//   2. CREATE FUNCTION public.f   needs a GRANT or REVOKE ... ON FUNCTION
//                                 public.f in the same file, stating who may
//                                 call it (CREATE OR REPLACE included: write
//                                 the grant again so the reader sees it).
//   3. ... SECURITY DEFINER       needs SET search_path in the same statement.
//   4. CREATE VIEW public.v       needs security_invoker, so row-level
//                                 security applies to whoever reads it.
//
// Older migrations are not checked: they predate the rules and are applied.
//
//   node scripts/check-migration-access.js            check the repo
//   node scripts/check-migration-access.js --self-test check this checker

const fs = require("node:fs");
const path = require("node:path");

const BASELINE = "20261119120000";
const migrationsDir = path.resolve(__dirname, "..", "..", "supabase", "migrations");

// Comments and dollar-quoted bodies hold prose and code that must not satisfy
// or trip a rule. Bodies are replaced with an empty literal so statement
// boundaries survive.
const stripSql = (sql) =>
  sql
    .replace(/\$([A-Za-z_][A-Za-z0-9_]*)?\$[\s\S]*?\$\1\$/g, "''")
    .replace(/--[^\n]*/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "");

const ident = String.raw`(?:"([^"]+)"|([A-Za-z_][A-Za-z0-9_]*))`;
const nameOf = (m, i) => (m[i] ?? m[i + 1]).toLowerCase();
const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const qualified = (name) => String.raw`public\s*\.\s*"?${escape(name)}"?`;

function checkSql(sql) {
  const problems = [];
  const text = stripSql(sql);
  const statements = text.split(";").map((s) => s.replace(/\s+/g, " ").trim());

  for (const stmt of statements) {
    const table = stmt.match(
      new RegExp(
        String.raw`^create\s+(?:unlogged\s+)?table\s+(?:if\s+not\s+exists\s+)?public\s*\.\s*${ident}`,
        "i",
      ),
    );
    if (table) {
      const name = nameOf(table, 1);
      const rls = new RegExp(
        String.raw`alter\s+table\s+(?:if\s+exists\s+)?(?:only\s+)?${qualified(name)}\s+enable\s+row\s+level\s+security`,
        "i",
      );
      if (!rls.test(text))
        problems.push(`table public.${name}: enable row level security in the same migration`);
    }

    const fn = stmt.match(
      new RegExp(String.raw`^create\s+(?:or\s+replace\s+)?function\s+public\s*\.\s*${ident}`, "i"),
    );
    if (fn) {
      const name = nameOf(fn, 1);
      const access = new RegExp(
        String.raw`(?:grant|revoke)\s[^;]*?\bon\s+function\s+${qualified(name)}\s*\(`,
        "i",
      );
      if (!access.test(text)) {
        problems.push(
          `function public.${name}: GRANT or REVOKE EXECUTE on it in the same migration`,
        );
      }
      if (/\bsecurity\s+definer\b/i.test(stmt) && !/\bset\s+search_path\b/i.test(stmt)) {
        problems.push(`function public.${name}: SECURITY DEFINER needs SET search_path`);
      }
    }

    const view = stmt.match(
      new RegExp(String.raw`^create\s+(?:or\s+replace\s+)?view\s+public\s*\.\s*${ident}`, "i"),
    );
    if (view && !/security_invoker\s*=\s*(?:true|on|1)/i.test(stmt)) {
      problems.push(`view public.${nameOf(view, 1)}: create it WITH (security_invoker = true)`);
    }
  }
  return problems;
}

function runSelfTest() {
  const cases = [
    [
      "table with RLS",
      "create table public.t (id int); alter table public.t enable row level security;",
      0,
    ],
    ["table without RLS", "create table if not exists public.t (id int);", 1],
    [
      "RLS only in a comment",
      "create table public.t (id int); -- alter table public.t enable row level security",
      1,
    ],
    [
      "function with grant",
      "create or replace function public.f(a int) returns int language sql as $$ select a $$;\nrevoke all on function public.f(int) from public, anon;\ngrant execute on function public.f(int) to authenticated;",
      0,
    ],
    [
      "function without grant",
      "create function public.f() returns int language sql as $$ select 1 $$;",
      1,
    ],
    [
      "definer without search_path",
      "create function public.f() returns int language sql security definer as $$ select 1 $$;\ngrant execute on function public.f() to service_role;",
      1,
    ],
    [
      "definer with search_path after the body",
      "create function public.f() returns int as $body$ select 1; $body$ language sql security definer set search_path = '';\nrevoke all on function public.f() from public;",
      0,
    ],
    [
      "grant text inside a body does not count",
      "create function public.f() returns void language plpgsql as $$ begin execute 'grant execute on function public.f() to anon'; end $$;",
      1,
    ],
    [
      "grant on a different function",
      "create function public.f() returns int language sql as $$ select 1 $$;\ngrant execute on function public.fx() to anon;",
      1,
    ],
    ["view without security_invoker", "create view public.v as select 1;", 1],
    [
      "view with security_invoker",
      "create or replace view public.v with (security_invoker = true) as select 1;",
      0,
    ],
    [
      "other schemas are out of scope",
      "create table private.t (id int); create function private.f() returns int language sql as $$ select 1 $$;",
      0,
    ],
  ];
  let failed = 0;
  for (const [label, sql, expected] of cases) {
    const got = checkSql(sql).length;
    if (got !== expected) {
      failed += 1;
      console.error(
        `self-test "${label}": expected ${expected} problem(s), got ${got}: ${checkSql(sql).join("; ")}`,
      );
    }
  }
  if (failed) process.exit(1);
  console.log(`Migration access guardrail self-test passed (${cases.length} cases).`);
}

function run() {
  const files = fs
    .readdirSync(migrationsDir)
    .filter((f) => /^\d{14}_.*\.sql$/.test(f) && f.slice(0, 14) > BASELINE)
    .sort();
  const failures = [];
  for (const file of files) {
    for (const problem of checkSql(fs.readFileSync(path.join(migrationsDir, file), "utf8"))) {
      failures.push(`${file}: ${problem}`);
    }
  }
  if (failures.length) {
    console.error("Migration access guardrail failed (see AGENTS.md section 4a):");
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log(
    `Migration access guardrail passed (${files.length} migration(s) after ${BASELINE}).`,
  );
}

if (process.argv.includes("--self-test")) runSelfTest();
else run();
