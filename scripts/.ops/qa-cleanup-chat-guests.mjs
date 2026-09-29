// Remove guest-mode support-chat threads created by QA probes.
// These use obviously-synthetic guest UUIDs, so only those are touched.
import { runQuery } from "../.ops/_db.mjs";

const GUESTS = [
  "0f0f0f0f-0000-4000-8000-000000000099",
  "0f0f0f0f-0000-4000-8000-000000000100",
  "0f0f0f0f-0000-4000-8000-000000000101",
  "0f0f0f0f-0000-4000-8000-000000000102",
  "0f0f0f0f-0000-4000-8000-000000000103",
  "0f0f0f0f-0000-4000-8000-000000000090",
  "0f0f0f0f-0000-4000-8000-000000000091",
  "0f0f0f0f-0000-4000-8000-000000000092",
  "0f0f0f0f-0000-4000-8000-000000000093",
  "0f0f0f0f-0000-4000-8000-000000000094",
  "0f0f0f0f-0000-4000-8000-000000000095",
  "11111111-2222-4333-8444-555555555555",
];

const list = GUESTS.map((g) => `'${g}'`).join(",");
console.log("before ->", JSON.stringify(await runQuery(
  `select (select count(*)::int from support_chat_threads where guest_id in (${list})) as threads,
          (select count(*)::int from support_chat_messages m
             join support_chat_threads t on t.id = m.thread_id
            where t.guest_id in (${list})) as messages`
)));

console.log("deleted messages:", JSON.stringify(await runQuery(
  `with d as (
     delete from support_chat_messages m
      using support_chat_threads t
      where t.id = m.thread_id and t.guest_id in (${list})
     returning m.id)
   select count(*)::int as n from d`
)));
console.log("deleted threads:", JSON.stringify(await runQuery(
  `with d as (delete from support_chat_threads where guest_id in (${list}) returning id)
   select count(*)::int as n from d`
)));

console.log("after  ->", JSON.stringify(await runQuery(
  `select (select count(*)::int from support_chat_threads where guest_id in (${list})) as threads,
          (select count(*)::int from support_chat_messages m
             join support_chat_threads t on t.id = m.thread_id
            where t.guest_id in (${list})) as messages`
)));
