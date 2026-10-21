begin;
create table private.signup_authorization (
 singleton boolean primary key default true check(singleton), password_hash text not null,
 version bigint not null default 1, active boolean not null default true, updated_at timestamptz not null default now()
);
create table private.registration_tickets (
 token_hash text primary key, email text not null, store_name text not null,
 gate_version bigint not null, expires_at timestamptz not null, consumed_at timestamptz,
 created_at timestamptz not null default now()
);
create table private.signup_rate_limits (
 rate_key text primary key, window_start timestamptz not null, attempts integer not null check(attempts>=0)
);
alter table private.signup_authorization enable row level security;
alter table private.registration_tickets enable row level security;
alter table private.signup_rate_limits enable row level security;
revoke all on all tables in schema private from public,anon,authenticated;
-- Run only as postgres in SQL Editor, never from a client/API.
create or replace function private.set_signup_password(p_plaintext text) returns void
language plpgsql security definer set search_path='' as $$
begin
 if p_plaintext is null or octet_length(p_plaintext)<16 or octet_length(p_plaintext)>72 or p_plaintext='SUBSTITUA_POR_UMA_SENHA_FORTE' then
  raise exception 'Use uma senha de 16 a 72 bytes; substitua o placeholder.';
 end if;
 insert into private.signup_authorization(singleton,password_hash)
 values(true,extensions.crypt(p_plaintext,extensions.gen_salt('bf',12)))
 on conflict(singleton) do update set password_hash=excluded.password_hash,version=private.signup_authorization.version+1,active=true,updated_at=now();
 delete from private.registration_tickets where consumed_at is null;
end $$;
revoke all on function private.set_signup_password(text) from public,anon,authenticated,service_role;
-- No default password: registration fails closed until sql/alterar-senha-cadastro.sql is run.
-- Only the Next server may request a ticket. p_rate_key must be an HMAC of the trusted ingress IP.
create or replace function public.issue_registration_ticket(p_password text,p_email text,p_store_name text,p_rate_key text)
returns text language plpgsql security definer set search_path='' as $$
declare gate private.signup_authorization%rowtype; limiter private.signup_rate_limits%rowtype; token text;
begin
 if p_rate_key is null or length(p_rate_key)<32 then return null; end if;
 insert into private.signup_rate_limits(rate_key,window_start,attempts) values(p_rate_key,now(),0) on conflict do nothing;
 select * into limiter from private.signup_rate_limits where rate_key=p_rate_key for update;
 if limiter.window_start<now()-interval '15 minutes' then
  update private.signup_rate_limits set window_start=now(),attempts=1 where rate_key=p_rate_key;
 elsif limiter.attempts>=5 then return null;
 else update private.signup_rate_limits set attempts=attempts+1 where rate_key=p_rate_key;
 end if;
 select * into gate from private.signup_authorization where singleton=true and active;
 if not found then return null; end if;
 if p_password is null or octet_length(p_password)>72 or octet_length(p_password)<16 then return null; end if;
 if extensions.crypt(p_password,gate.password_hash)<>gate.password_hash then return null; end if;
 if p_email is null or position('@' in p_email)<2 or length(trim(p_store_name)) not between 1 and 120 then return null; end if;
 token=encode(extensions.gen_random_bytes(32),'hex');
 insert into private.registration_tickets(token_hash,email,store_name,gate_version,expires_at)
 values(encode(extensions.digest(token,'sha256'),'hex'),lower(trim(p_email)),trim(p_store_name),gate.version,now()+interval '2 minutes');
 return token;
end $$;
revoke all on function public.issue_registration_ticket(text,text,text,text) from public,anon,authenticated;
grant execute on function public.issue_registration_ticket(text,text,text,text) to service_role;
-- Hard gate: applies even if someone bypasses Next and calls auth.signUp directly.
-- Existing accounts are not modified. Review other Auth triggers/providers before applying.
create or replace function private.require_registration_ticket() returns trigger
language plpgsql security definer set search_path='' as $$
declare ticket private.registration_tickets%rowtype; token text;
begin
 token=new.raw_user_meta_data->>'registration_ticket';
 if token is null or length(token)<>64 then raise exception 'registration_not_authorized'; end if;
 select t.* into ticket from private.registration_tickets t
 join private.signup_authorization g on g.singleton=true and g.active and g.version=t.gate_version
 where t.token_hash=encode(extensions.digest(token,'sha256'),'hex') and t.email=lower(trim(new.email))
 and t.expires_at>now() and t.consumed_at is null for update of t;
 if not found then raise exception 'registration_not_authorized'; end if;
 update private.registration_tickets set consumed_at=now() where token_hash=ticket.token_hash;
 new.raw_user_meta_data=coalesce(new.raw_user_meta_data,'{}'::jsonb)-'registration_ticket';
 new.raw_app_meta_data=jsonb_set(coalesce(new.raw_app_meta_data,'{}'::jsonb),'{registration_store_name}',to_jsonb(ticket.store_name));
 return new;
end $$;
create or replace function private.provision_store() returns trigger
language plpgsql security definer set search_path='' as $$
declare tenant uuid;
begin
 insert into public.stores(name,owner_user_id) values(new.raw_app_meta_data->>'registration_store_name',new.id) returning id into tenant;
 insert into public.store_memberships(store_id,user_id,role) values(tenant,new.id,'owner');
 insert into public.user_preferences(user_id) values(new.id);
 insert into public.expense_categories(store_id,name) values(tenant,'Despesas da loja'),(tenant,'Compra de mercadoria'),(tenant,'Despesas fixas');
 return new;
end $$;
revoke all on function private.require_registration_ticket(),private.provision_store() from public,anon,authenticated,service_role;
create trigger petshop_require_registration_ticket before insert on auth.users for each row execute function private.require_registration_ticket();
create trigger petshop_provision_store after insert on auth.users for each row execute function private.provision_store();
-- Secrets/tickets/rate limits are NOT in supabase_realtime. Every business table is.
-- Never publish password_hash, authorization plaintext, tokens or auth.users over Realtime.
commit;
