import { runQuery } from "../.ops/_db.mjs";

// A table with RLS DISABLED is fully exposed through PostgREST to any holder of
// the publishable key — no edge function, no policy, no code path involved.
// This is the one exposure that code review of the functions cannot find.
console.log("=== tables with RLS DISABLED (fully exposed) ===");
console.log(JSON.stringify(await runQuery(`
  select c.relname as table,
         c.relrowsecurity as rls,
         has_table_privilege('anon', c.oid, 'SELECT')         as anon_can_select,
         has_table_privilege('authenticated', c.oid, 'SELECT') as auth_can_select,
         has_table_privilege('anon', c.oid, 'INSERT')         as anon_can_insert,
         has_table_privilege('anon', c.oid, 'UPDATE')         as anon_can_update,
         has_table_privilege('anon', c.oid, 'DELETE')         as anon_can_delete
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind in ('r','p')
     and not c.relrowsecurity
   order by c.relname
`), null, 1));

console.log("=== sanity: total public tables vs protected ===");
console.log(JSON.stringify(await runQuery(`
  select count(*) filter (where relrowsecurity)::int as rls_on,
         count(*) filter (where not relrowsecurity)::int as rls_off
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname='public' and c.relkind in ('r','p')
`), null, 1));
