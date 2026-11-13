-- Post-deploy checks for 20261121120000_drop_bills_embedding_ivfflat.sql.
-- Read-only.

-- 1. No index on bills.embedding: expect no rows.
select indexname from pg_indexes
where schemaname = 'public' and tablename = 'bills' and indexdef ilike '%embedding%';

-- 2. Every bill with an embedding now gets five related bills when at least
--    six bills have embeddings: expect min_related = max_related = 5.
select count(*) as bills_checked,
  min(n) as min_related,
  round(avg(n), 2) as avg_related,
  max(n) as max_related
from (
  select (select count(*) from public.get_related_bills(b.id)) as n
  from public.bills b
  where b.embedding is not null
) x;

-- 3. Cost of one call (expect a few milliseconds at this table size).
explain analyze
select * from public.get_related_bills((select id from public.bills where embedding is not null limit 1));
