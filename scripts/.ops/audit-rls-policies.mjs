import { runQuery } from "../.ops/_db.mjs";

// RLS being ENABLED is not the same as RLS being CORRECT. A policy of
// `using (true)` is enabled, restrictive-looking in pg_class, and still lets
// any authenticated user read every tenant's rows straight through PostgREST.
console.log(JSON.stringify(await runQuery(`
  select tablename, policyname, cmd, roles::text,
         qual          as using_expr,
         with_check    as check_expr
    from pg_policies
   where schemaname = 'public'
     and tablename in ('leads','campaigns','emails_sent','owner_alerts','profiles',
                       'send_queue','gmail_tokens','payments','ai_classifications',
                       'audit_events','intro_requests','referrals','suppressions',
                       'agent_config','lead_score','booking_events','push_subscriptions')
   order by tablename, policyname
`), null, 1));
