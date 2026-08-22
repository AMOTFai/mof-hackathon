import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { PUBLIC_TABLES, TABLES_WITHOUT_TENANT_ID } from "./tables";

const SQL = readFileSync(resolve(__dirname, "../../supabase/migrations/0001_init.sql"), "utf8");

function createdTables(sql: string): string[] {
  return [...sql.matchAll(/create table public\.(\w+)/g)].map((m) => m[1]!);
}

function rlsEnabledTables(sql: string): string[] {
  return [...sql.matchAll(/alter table public\.(\w+) enable row level security/g)].map((m) => m[1]!);
}

function policiesFor(table: string): string[] {
  const re = new RegExp(`create policy "[^"]+" on public\\.${table}\\b`, "g");
  return sqlMatch(re);
}

function sqlMatch(re: RegExp): string[] {
  return [...SQL.matchAll(re)].map((m) => m[0]);
}

describe("0001_init schema coverage", () => {
  it("creates every table in the canonical list and no extras", () => {
    const created = createdTables(SQL);
    expect(created.sort()).toEqual([...PUBLIC_TABLES].sort());
  });

  it("enables RLS on every public table", () => {
    const enabled = rlsEnabledTables(SQL);
    for (const table of PUBLIC_TABLES) {
      expect(enabled, `${table} must have RLS enabled`).toContain(table);
    }
  });

  it("declares at least one policy per table", () => {
    for (const table of PUBLIC_TABLES) {
      expect(policiesFor(table).length, `${table} has no policies`).toBeGreaterThan(0);
    }
  });

  it("puts nullable tenant_id on every table except tenants", () => {
    for (const table of PUBLIC_TABLES) {
      if (TABLES_WITHOUT_TENANT_ID.includes(table)) continue;
      const block = tableBlock(table);
      expect(block, table).toMatch(/tenant_id uuid references public\.tenants/);
    }
  });

  it("does not store prompt or response bodies on api_calls", () => {
    const block = tableBlock("api_calls");
    expect(block).not.toMatch(/request_body|response_body|prompt|completion_text/);
  });

  it("records two-phase scores with a unique constraint including phase", () => {
    const block = tableBlock("scores");
    expect(block).toMatch(/phase text not null default 'prepanel'/);
    expect(block).toMatch(/unique \(team_id, judge_id, criterion_id, phase\)/);
  });

  it("gives every team a rotatable proxy_token and an idempotency key", () => {
    const block = tableBlock("teams");
    expect(block).toMatch(/proxy_token text unique not null/);
    expect(block).toMatch(/submission_idempotency_key/);
  });

  it("defines the Part 3 helper functions as security definer", () => {
    for (const fn of ["auth_has_event_role", "auth_team_ids"]) {
      expect(SQL).toMatch(new RegExp(`create or replace function public\\.${fn}[\\s\\S]*security definer`));
    }
  });

  it("locks live scoring behind calibration in RLS (not only app code)", () => {
    expect(SQL).toMatch(/create policy "judge upsert own scores"/);
    expect(SQL).toMatch(/calibration_results cr/);
  });

  it("hides expired talent consent in RLS", () => {
    const talentPolicies = [...SQL.matchAll(/create policy "[^"]+" on public\.talent_profiles[\s\S]*?;/g)]
      .map((m) => m[0])
      .join("\n");
    expect(talentPolicies).toMatch(/recruiters read consented/);
    expect(talentPolicies).toMatch(/consent_expires_at > now\(\)/);
  });
});

function tableBlock(table: string): string {
  const start = SQL.indexOf(`create table public.${table}`);
  expect(start, `missing table ${table}`).toBeGreaterThan(-1);
  const next = SQL.indexOf("create table public.", start + 1);
  const idx = SQL.indexOf("\ncreate index ", start + 1);
  const trig = SQL.indexOf("\ncreate trigger ", start + 1);
  const endCandidates = [next, idx, trig, SQL.length].filter((n) => n > start);
  const end = Math.min(...endCandidates);
  return SQL.slice(start, end);
}
