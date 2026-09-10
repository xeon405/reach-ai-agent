begin;
create table __rollback_probe(x int);
rollback;
select count(*) as leaked
from pg_tables
where tablename = '__rollback_probe';