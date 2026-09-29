import { runQuery } from "../.ops/_db.mjs";

// Post-cleanup sanity: the real account must be untouched by all QA.
console.log(JSON.stringify(await runQuery(`
  select
    (select count(*)::int from profiles
      where email = 'outreachai.team@gmail.com') as profile_rows,
    (select coalesce(plan,'') from profiles
      where email = 'outreachai.team@gmail.com' limit 1) as plan,
    (select count(*)::int from payments
      where user_id = (select id from profiles
        where email = 'outreachai.team@gmail.com' limit 1)) as payments,
    (select count(*)::int from support_chat_threads
      where guest_id is not null) as guest_threads_left,
    (select count(*)::int from support_chat_messages
      where content ilike '%lemon%') as stored_msgs_naming_processor
`), null, 1));
