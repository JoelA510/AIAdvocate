begin;

-- Helper: validates one summary field; raises on failure
create or replace function public.validate_bill_summary(summary_text text, field_name text)
returns void
language plpgsql
as $$
declare trimmed text;
begin
  if summary_text is null then
    return;
  end if;
  trimmed := trim(summary_text);
  if length(trimmed) < 40 or trimmed ~* '^(error[:\s]|placeholder)' or trimmed ~* 'placeholder' then
    raise exception 'invalid %', field_name;
  end if;
end;
$$;

-- Unified trigger
create or replace function public.guard_bill_summaries()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- sanitize placeholder first
  if new.summary_simple is not null and new.summary_simple ~* '^Placeholder for[[:space:]]' then
    new.summary_simple := null;
  end if;

  if tg_op = 'UPDATE' then
    if old.summary_simple  is not null and new.summary_simple  is distinct from old.summary_simple  then raise exception 'summary_simple overwrite blocked';  end if;
    if old.summary_medium  is not null and new.summary_medium  is distinct from old.summary_medium  then raise exception 'summary_medium overwrite blocked';  end if;
    if old.summary_complex is not null and new.summary_complex is distinct from old.summary_complex then raise exception 'summary_complex overwrite blocked'; end if;

    if old.summary_simple  is null and new.summary_simple  is not null then perform public.validate_bill_summary(new.summary_simple,  'summary_simple');  end if;
    if old.summary_medium  is null and new.summary_medium  is not null then perform public.validate_bill_summary(new.summary_medium,  'summary_medium');  end if;
    if old.summary_complex is null and new.summary_complex is not null then perform public.validate_bill_summary(new.summary_complex, 'summary_complex'); end if;
  else
    perform public.validate_bill_summary(new.summary_simple,  'summary_simple');
    perform public.validate_bill_summary(new.summary_medium,  'summary_medium');
    perform public.validate_bill_summary(new.summary_complex, 'summary_complex');
  end if;

  return new;
end;
$$;

drop trigger if exists trg_strip_placeholder_simple on public.bills;
drop trigger if exists trg_guard_bill_summaries on public.bills;
create trigger trg_guard_bill_summaries
before insert or update on public.bills
for each row execute function public.guard_bill_summaries();

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.bills'::regclass
      and conname = 'bills_summary_simple_no_placeholder'
  ) then
    execute
      'alter table public.bills
         add constraint bills_summary_simple_no_placeholder
         check (summary_simple is null or summary_simple !~* ''^Placeholder for[[:space:]]'')
         not valid';
  end if;
end;
$$;

commit;
