import { randomUUID } from "node:crypto";
import postgres from "postgres";

/** Superuser connection for seeding fixtures (bypasses RLS). Never used by code under test. */
export function adminSql() {
  const url = process.env.TEST_ADMIN_DATABASE_URL;
  if (!url) throw new Error("TEST_ADMIN_DATABASE_URL is required");
  return postgres(url, { max: 1, onnotice: () => {} });
}

/** Raw runtime-role connection with no tenant context, for fail-closed assertions. */
export function appRoleSql(max = 1) {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is required");
  return postgres(url, { max, onnotice: () => {} });
}

type Role = "owner" | "admin" | "manager" | "operator" | "viewer";

/**
 * Two ventures with overlapping and disjoint members. Every run uses fresh UUIDs and
 * emails so suites never depend on each other's data.
 *
 *   Venture A: alice (owner), dave (admin), erin (manager), carol (viewer)
 *   Venture B: bob (owner), dave (manager)
 *   mallory:   authenticated, no memberships
 */
export async function seedTwoVentures(sql: postgres.Sql) {
  const tag = randomUUID().slice(0, 8);
  const names = ["alice", "bob", "carol", "dave", "erin", "mallory"] as const;
  const user = Object.fromEntries(names.map((n) => [n, randomUUID()])) as Record<
    (typeof names)[number],
    string
  >;

  for (const n of names) {
    await sql`insert into users (id, name, email, email_verified)
              values (${user[n]}, ${n}, ${`${n}-${tag}@example.test`}, true)`;
  }

  const ventureA = randomUUID();
  const ventureB = randomUUID();
  await sql`insert into ventures (id, name, created_by) values
            (${ventureA}, ${`Venture A ${tag}`}, ${user.alice}),
            (${ventureB}, ${`Venture B ${tag}`}, ${user.bob})`;

  const memberships: Array<[string, string, Role]> = [
    [ventureA, user.alice, "owner"],
    [ventureA, user.dave, "admin"],
    [ventureA, user.erin, "manager"],
    [ventureA, user.carol, "viewer"],
    [ventureB, user.bob, "owner"],
    [ventureB, user.dave, "manager"],
  ];
  for (const [v, u, role] of memberships) {
    await sql`insert into venture_memberships (venture_id, user_id, role) values (${v}, ${u}, ${role})`;
  }

  return { user, ventureA, ventureB, tag };
}

/**
 * Simulates a state the product can never reach — an Owner who is suspended or removed
 * (e.g. by a future break-glass support procedure) — so tests can prove that access checks
 * still fail closed for it. The Owner invariant trigger (migration 0007) rejects this for
 * every role, so the fixture skips triggers for this one superuser transaction only.
 */
export async function forceOwnerMembershipStatus(
  sql: postgres.Sql,
  ventureId: string,
  status: "active" | "suspended" | "removed",
) {
  await sql.begin(async (tx) => {
    await tx`set local session_replication_role = replica`;
    await tx`update venture_memberships set status = ${status},
              removed_at = case when ${status} = 'removed' then now() end
              where venture_id = ${ventureId} and role = 'owner'`;
  });
}

/** Unwraps Drizzle's query error to the underlying PostgreSQL error. */
export function pgError(error: unknown): { code?: string; message: string } {
  let current: unknown = error;
  while (current && typeof current === "object") {
    const e = current as { code?: unknown; message?: unknown; cause?: unknown };
    if (typeof e.code === "string" && /^[0-9A-Z]{5}$/.test(e.code)) {
      return { code: e.code, message: String(e.message) };
    }
    current = e.cause;
  }
  return { message: String(error) };
}

/** Asserts the promise rejects with the given SQLSTATE (and optional message fragment). */
export async function expectPgError(promise: Promise<unknown>, code: string, messagePart?: string) {
  let caught: unknown;
  try {
    await promise;
  } catch (error) {
    caught = error;
  }
  if (caught === undefined)
    throw new Error(`Expected PostgreSQL error ${code}, but the operation succeeded`);
  const err = pgError(caught);
  if (err.code !== code || (messagePart && !err.message.includes(messagePart))) {
    throw new Error(
      `Expected ${code}${messagePart ? ` "${messagePart}"` : ""}, got ${err.code}: ${err.message}`,
    );
  }
}

export const RLS_VIOLATION = "42501"; // insufficient_privilege: RLS WITH CHECK and missing grants
