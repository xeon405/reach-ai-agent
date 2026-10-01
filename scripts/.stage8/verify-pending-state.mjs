// Verify the pending-state table is live with the shape the agent expects.
import { runQuery } from "../../scripts/.ops/_db.mjs";

const out = [];
const q = async (sql) => (await runQuery(sql)) ?? [];

const cols = await q(
  "select column_name from information_schema.columns "
  + "where table_name='agent_pending_state' order by ordinal_position",
);
out.push("columns: " + cols.map((r) => r.column_name).join(", "));

const pk = await q(
  "select pg_get_constraintdef(oid) as d from pg_constraint "
  + "where conrelid='agent_pending_state'::regclass and contype='p'",
);
out.push("PK: " + (pk[0]?.d ?? "none"));

const rls = await q(
  "select relrowsecurity as rls, relforcerowsecurity as forced from pg_class "
  + "where relname='agent_pending_state'",
);
out.push("RLS enabled: " + rls[0]?.rls + " | forced: " + rls[0]?.forced);

const pol = await q(
  "select count(*)::int as n from pg_policies where tablename='agent_pending_state'",
);
out.push("customer policies (must be 0): " + pol[0]?.n);

process.stdout.write(out.join("\n") + "\n");
process.exit(0);