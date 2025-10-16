begin;

-- Single BEFORE trigger with placeholder stripping + quality checks
create or replace function public.guard_bill_summaries()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  trimmed text;
begin
  -- sanitize placeholder first
  if new.summary_simple is not null and new.summary_simple ~* '^Placeholder for[[:space:]]' then
    new.summary_simple := null;
  end if;

  if tg_op = 'UPDATE' then
    if old.summary_simple is not null and new.summary_simple is distinct from old.summary_simple then
      raise exception 'summary_simple overwrite blocked';
    end if;
    if old.summary_medium is not null and new.summary_medium is distinct from old.summary_medium then
      raise exception 'summary_medium overwrite blocked';
    end if;
    if old.summary_complex is not null and new.summary_complex is distinct from old.summary_complex then
      raise exception 'summary_complex overwrite blocked';
    end if;

    if old.summary_simple is null and new.summary_simple is not null then
      trimmed := trim(new.summary_simple);
      if length(trimmed) < 40 or trimmed ~* '^(error[:\s]|placeholder)' or trimmed ~* 'placeholder' then
        raise exception 'invalid summary_simple';
      end if;
    end if;

    if old.summary_medium is null and new.summary_medium is not null then
      trimmed := trim(new.summary_medium);
      if length(trimmed) < 40 or trimmed ~* '^(error[:\s]|placeholder)' or trimmed ~* 'placeholder' then
        raise exception 'invalid summary_medium';
      end if;
    end if;

    if old.summary_complex is null and new.summary_complex is not null then
      trimmed := trim(new.summary_complex);
      if length(trimmed) < 40 or trimmed ~* '^(error[:\s]|placeholder)' or trimmed ~* 'placeholder' then
        raise exception 'invalid summary_complex';
      end if;
    end if;
  else
    if new.summary_simple is not null then
      trimmed := trim(new.summary_simple);
      if length(trimmed) < 40 or trimmed ~* '^(error[:\s]|placeholder)' or trimmed ~* 'placeholder' then
        raise exception 'invalid summary_simple';
      end if;
    end if;

    if new.summary_medium is not null then
      trimmed := trim(new.summary_medium);
      if length(trimmed) < 40 or trimmed ~* '^(error[:\s]|placeholder)' or trimmed ~* 'placeholder' then
        raise exception 'invalid summary_medium';
      end if;
    end if;

    if new.summary_complex is not null then
      trimmed := trim(new.summary_complex);
      if length(trimmed) < 40 or trimmed ~* '^(error[:\s]|placeholder)' or trimmed ~* 'placeholder' then
        raise exception 'invalid summary_complex';
      end if;
    end if;
  end if;

  return new;
end;
$$;

-- ensure only one BEFORE trigger exists
drop trigger if exists trg_strip_placeholder_simple on public.bills;
drop trigger if exists trg_guard_bill_summaries on public.bills;

create trigger trg_guard_bill_summaries
before insert or update on public.bills
for each row execute function public.guard_bill_summaries();

-- defense-in-depth constraint (lazy backfill)
alter table public.bills
  add constraint bills_summary_simple_no_placeholder
  check (summary_simple is null or summary_simple !~* '^Placeholder for[[:space:]]')
  not valid;

commit;
