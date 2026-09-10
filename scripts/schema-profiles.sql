select table_name, column_name, is_nullable, column_default, data_type
from information_schema.columns
where table_schema='public' and table_name='profiles'
order by ordinal_position;