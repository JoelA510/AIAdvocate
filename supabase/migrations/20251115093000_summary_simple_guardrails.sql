-- Enforce that placeholder values cannot persist in bills.summary_simple

create or replace function public.fn_strip_placeholder_simple()
returns trigger
language plpgsql
as $$
begin
  if new.summary_simple ~* '^Placeholder for[[:space:]]' then
    new.summary_simple := null;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_strip_placeholder_simple on public.bills;
create trigger trg_strip_placeholder_simple
before insert or update of summary_simple on public.bills
for each row
execute function public.fn_strip_placeholder_simple();

alter table public.bills
  add constraint bills_summary_simple_no_placeholder
  check (
    summary_simple is null
    or summary_simple !~* '^Placeholder for[[:space:]]'
  )
  not valid;
