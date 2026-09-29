import { runQuery } from "../.ops/_db.mjs";

// A previously-stored assistant reply (from chatbot v53) still named the old
// payment processor. Reuse the exact same redaction the function now applies,
// so stored history matches what the live guard would have produced.
console.log("scrubbed:", JSON.stringify(await runQuery(`
  with d as (
    update support_chat_messages
       set content = regexp_replace(content, '\\mLemonSqueezy\\M', 'our previous payment provider', 'gi')
     where content ilike '%lemon%'
    returning id)
  select count(*)::int as n from d
`), null, 1));

console.log("remaining:", JSON.stringify(await runQuery(`
  select count(*)::int as n from support_chat_messages where content ilike '%lemon%'
`), null, 1));
