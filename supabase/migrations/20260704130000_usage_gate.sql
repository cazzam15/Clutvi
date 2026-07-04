-- Usage gate: per-user daily generation counts, so trial users can't burn the
-- Anthropic API budget. One row per user per day; claude-proxy (service role)
-- is the only writer, the frontend reads its own rows to show "N left today".

create table public.usage (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  date        date not null default current_date,
  count       integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (user_id, date)
);

alter table public.usage enable row level security;

-- Users may read their own usage (the app shows remaining generations).
-- No insert/update policies: only the service role (Edge Functions) writes.
create policy "Users can view own usage"
  on public.usage for select
  using (auth.uid() = user_id);

-- Atomically bump today's count and return the new value. The gate increments
-- first and checks the returned count, so two parallel requests can never both
-- sneak under the cap.
create function public.increment_usage(p_user_id uuid, p_date date)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  new_count integer;
begin
  insert into public.usage (user_id, date, count)
  values (p_user_id, p_date, 1)
  on conflict (user_id, date)
  do update set count = usage.count + 1, updated_at = now()
  returning count into new_count;
  return new_count;
end;
$$;

-- Only Edge Functions (service role) may call this — without the revoke, any
-- signed-in user could burn another user's quota through the PostgREST RPC.
revoke execute on function public.increment_usage(uuid, date) from public, anon, authenticated;
