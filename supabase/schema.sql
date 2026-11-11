-- Shared ledger: only the two administrator-configured email slots can access it.
create schema if not exists ledger_private;
revoke all on schema ledger_private from public, anon;
grant usage on schema ledger_private to authenticated;
create table ledger_private.members (
 slot smallint primary key check (slot in (1,2)),
 email text not null unique check (email = lower(email))
);
alter table ledger_private.members enable row level security;
revoke all on ledger_private.members from public, anon, authenticated;
create function ledger_private.is_member() returns boolean
language sql stable security definer set search_path = '' as $$
 select exists (select 1 from auth.users u join ledger_private.members m on m.email = lower(u.email)
 where u.id = (select auth.uid()) and u.email_confirmed_at is not null);
$$;
revoke all on function ledger_private.is_member() from public, anon;
grant execute on function ledger_private.is_member() to authenticated;
create table public.shared_ledger (
 id boolean primary key default true check (id),
 state jsonb not null default '{"transactions":[],"recurring":[],"budgets":{},"categoryRules":{}}'::jsonb,
 version integer not null default 0,
 updated_at timestamptz not null default now(),
 constraint valid_ledger check (
 jsonb_typeof(state) = 'object' and
 coalesce(jsonb_typeof(state->'transactions') = 'array',false) and
 coalesce(jsonb_typeof(state->'recurring') = 'array',false) and
 coalesce(jsonb_typeof(state->'budgets') = 'object',false))
);
insert into public.shared_ledger (id) values (true);
alter table public.shared_ledger enable row level security;
revoke all on public.shared_ledger from public, anon, authenticated;
grant select on public.shared_ledger to authenticated;
grant update (state) on public.shared_ledger to authenticated;
create policy member_read on public.shared_ledger for select to authenticated using ((select ledger_private.is_member()));
create policy member_write on public.shared_ledger for update to authenticated using ((select ledger_private.is_member())) with check ((select ledger_private.is_member()));
create function ledger_private.bump_version() returns trigger language plpgsql set search_path = '' as $$
begin new.version := old.version + 1; new.updated_at := now(); return new; end $$;
revoke all on function ledger_private.bump_version() from public, anon, authenticated;
create trigger ledger_version before update on public.shared_ledger for each row execute function ledger_private.bump_version();
create function public.save_shared_ledger(expected_version integer, new_state jsonb)
returns table (version integer) language plpgsql security invoker set search_path = '' as $$
begin
 return query update public.shared_ledger l set state = new_state where l.id = true and l.version = expected_version returning l.version;
 if not found then raise exception 'Ledger changed or access denied' using errcode = '40001'; end if;
end $$;
revoke all on function public.save_shared_ledger(integer,jsonb) from public, anon;
grant execute on function public.save_shared_ledger(integer,jsonb) to authenticated;
