create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

create table if not exists public.hook_tokens (
  name text primary key,
  token_hash text not null,
  created_at timestamptz not null default now()
);

grant all on public.hook_tokens to service_role;
alter table public.hook_tokens enable row level security;
-- no policies: only service_role (which bypasses RLS) may read these tokens

do $$
declare
  raw text;
begin
  if not exists (select 1 from public.hook_tokens where name = 'ingest_letters') then
    raw := encode(extensions.gen_random_bytes(32), 'hex');
    insert into public.hook_tokens(name, token_hash)
    values ('ingest_letters', encode(extensions.digest(raw, 'sha256'), 'hex'));
    perform vault.create_secret(raw, 'ingest_letters_hook_token', 'Token for the hourly FDA ingest hook');
  end if;
end $$;

select cron.unschedule(jobid) from cron.job where jobname = 'fda-ingest-hourly';

select cron.schedule(
  'fda-ingest-hourly',
  '7 * * * *',
  $cron$
  select net.http_post(
    url := 'https://fdacontent.org/api/public/hooks/ingest-letters',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'ingest_letters_hook_token' limit 1)
    ),
    body := jsonb_build_object('mode', 'incremental', 'hydrateLimit', 25),
    timeout_milliseconds := 120000
  );
  $cron$
);