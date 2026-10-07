import { runQuery } from "../.ops/_db.mjs";

// Does the DATABASE stop a cross-tenant read/write, or does every function rely
// on remembering to add .eq("user_id", ...)? This decides whether an agent
// running on the service-role key is structurally safe or merely carefully written.
console.log(JSON.stringify(await runQuery(`
  select c.relname as table,
         c.relrowsecurity as rls_enabled,
         (select count(*)::int from pg_policies p where p.schemaname='public' and p.tablename=c.relname) as policies
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname='public' and c.relkind='r'
     and c.relname in ('leads','campaigns','emails_sent','owner_alerts','profiles',
                       'send_queue','gmail_tokens','payments','ai_classifications','audit_events')
   order by c.relname
`), null, 1));
