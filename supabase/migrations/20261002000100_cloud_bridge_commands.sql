-- Application-owned configuration and command journal. Raw adapters never access Supabase.
create table public.bridge_settings (
  id boolean primary key default true check (id),
  device jsonb not null default '{"id":"k40-main","address":"","port":4370,"commKey":0,"forceUdp":false,"timeout":10}',
  controller_id uuid,
  controller_seen_at timestamptz,
  health jsonb not null default '{}',
  session jsonb not null default '{"connection":"disconnected","account":null}',
  reconnect boolean not null default true
);
insert into public.bridge_settings(id) values(true);
create table public.bridge_commands (
  request_id text primary key,
  component text not null check(component in ('hardware','whatsapp')),
  method text not null,
  arguments jsonb not null default '{}',
  target jsonb not null default '{}',
  state text not null default 'queued' check(state in ('queued','running','succeeded','failed','uncertain','cancelled')),
  result jsonb,
  error jsonb,
  claimed_by uuid,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz,
  processed_count integer not null default 0,
  ingested_at timestamptz,
  expires_at timestamptz not null default now() + interval '10 minutes'
);
create index bridge_commands_pending on public.bridge_commands(component,created_at) where state in ('queued','running');
alter table public.bridge_settings enable row level security;
alter table public.bridge_commands enable row level security;
revoke all on public.bridge_settings,public.bridge_commands from anon,authenticated;
grant all on public.bridge_settings,public.bridge_commands to service_role;

create function public.claim_bridge_command(p_runner uuid,p_component text) returns jsonb
language plpgsql security definer set search_path=public as $$
declare command public.bridge_commands;
begin
  -- Serialize claims and device configuration changes against one application-owned row.
  perform 1 from bridge_settings where id=true and controller_id=p_runner
    and controller_seen_at > now()-interval '30 seconds' for update;
  if not found then return null; end if;
  update bridge_commands set state='uncertain',finished_at=now(),error='{"message":"Controller stopped before reporting a result; not retried automatically"}'
    where state='running' and started_at < now()-interval '3 minutes';
  update bridge_commands set state='cancelled',finished_at=now(),error='{"message":"Command expired before dispatch"}'
    where state='queued' and expires_at<now();
  if exists(select 1 from bridge_commands where component=p_component and state='running') then return null; end if;
  select * into command from bridge_commands where component=p_component and state='queued'
    order by created_at,request_id limit 1 for update skip locked;
  if not found then return null; end if;
  update bridge_commands set state='running',claimed_by=p_runner,started_at=now()
    where request_id=command.request_id returning * into command;
  return to_jsonb(command);
end $$;
revoke all on function public.claim_bridge_command(uuid,text) from public,anon,authenticated;
grant execute on function public.claim_bridge_command(uuid,text) to service_role;

create function public.bridge_heartbeat(p_runner uuid,p_health jsonb,p_session jsonb) returns boolean
language plpgsql security definer set search_path=public as $$
begin
  update bridge_settings set controller_id=p_runner,controller_seen_at=now(),health=p_health,session=p_session
    where id=true and (controller_id=p_runner or controller_seen_at is null or controller_seen_at<now()-interval '30 seconds');
  return found;
end $$;
revoke all on function public.bridge_heartbeat(uuid,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.bridge_heartbeat(uuid,jsonb,jsonb) to service_role;
