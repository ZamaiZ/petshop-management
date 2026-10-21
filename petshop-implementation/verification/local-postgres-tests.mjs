import {PGlite} from '@electric-sql/pglite';import fs from 'node:fs';
const db=new PGlite();
await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create schema storage;
create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb default '{}',raw_app_meta_data jsonb default '{}');
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;
create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
create table storage.objects(id uuid primary key,name text,bucket_id text);alter table storage.objects enable row level security;
create function storage.foldername(text) returns text[] language sql immutable as $$ select string_to_array($1,'/') $$;
create schema extensions;
-- Crypto is deliberately NOT stub-validated. Gate functions are created but not called in this harness.
`);
const root=new URL('../',import.meta.url).pathname;
for(const f of fs.readdirSync(root+'/supabase/migrations').sort()){
 let sql=fs.readFileSync(root+'/supabase/migrations/'+f,'utf8').replace('create extension if not exists pgcrypto with schema extensions;','');
 try{await db.exec(sql);console.log('DDL OK '+f)}catch(e){console.log('DDL FAIL '+f+' '+e.message);throw e}
}
// Existing accounts seeded before business testing: no Auth insert through managed API here.
await db.exec(`alter table auth.users disable trigger petshop_require_registration_ticket;alter table auth.users disable trigger petshop_provision_store;
insert into auth.users(id,email) values('00000000-0000-0000-0000-000000000001','a@example.test'),('00000000-0000-0000-0000-000000000002','b@example.test');
alter table auth.users enable trigger petshop_require_registration_ticket;alter table auth.users enable trigger petshop_provision_store;
insert into public.stores(id,name,owner_user_id) values('10000000-0000-0000-0000-000000000001','A','00000000-0000-0000-0000-000000000001'),('10000000-0000-0000-0000-000000000002','B','00000000-0000-0000-0000-000000000002');
insert into public.store_memberships(store_id,user_id) values('10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001'),('10000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000002');
insert into public.products(id,store_id,name,unit,unit_precision,sale_price_cents) values('20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','Ração','kg',3,1890);
insert into public.inventory_movements(store_id,product_id,quantity_delta,kind,reason,idempotency_key) values('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001',20,'receipt','Saldo inicial',gen_random_uuid());
set role authenticated;set request.jwt.claim.sub='00000000-0000-0000-0000-000000000001';`);
const A='10000000-0000-0000-0000-000000000001';const product='20000000-0000-0000-0000-000000000001';
let stores=await db.query('select name from public.stores');if(stores.rows.length!==1||stores.rows[0].name!=='A')throw Error('RLS tenant read failed');console.log('PASS tenant isolation SELECT');
try{await db.query("insert into public.stores(name,owner_user_id) values('X','00000000-0000-0000-0000-000000000001')");throw Error('unexpected insert')}catch(e){if(e.message==='unexpected insert')throw e;console.log('PASS direct store insert denied')}
let session=(await db.query(`select public.open_cash($1,15000) id`,[A])).rows[0].id;
let key='30000000-0000-0000-0000-000000000001';let items=JSON.stringify([{product_id:product,quantity:.75}]);let payments=JSON.stringify([{method:'cash',amount_cents:1418,tendered_cents:2000}]);
let sale=(await db.query('select public.complete_sale($1,$2,null,$3::jsonb,$4::jsonb,0,$5) id',[A,session,items,payments,key])).rows[0].id;
let again=(await db.query('select public.complete_sale($1,$2,null,$3::jsonb,$4::jsonb,0,$5) id',[A,session,items,payments,key])).rows[0].id;if(sale!==again)throw Error('duplicate sale');
let check=(await db.query('select total_cents from public.sales where id=$1',[sale])).rows[0];if(Number(check.total_cents)!==1418)throw Error('rounding');console.log('PASS sale rounding + idempotent retry');
let balance=(await db.query('select quantity from public.inventory_balances where product_id=$1',[product])).rows[0];if(Number(balance.quantity)!==19.25)throw Error('stock');console.log('PASS stock ledger decrement');
let movement=(await db.query('select sum(amount_cents) amount from public.cash_movements where cash_session_id=$1',[session])).rows[0];if(Number(movement.amount)!==1418)throw Error('cash tender overcount');console.log('PASS cash net of change');
try{await db.query('select public.complete_sale($1,$2,null,$3::jsonb,$4::jsonb,0,$5)',[A,session,JSON.stringify([{product_id:product,quantity:200}]),'[]','30000000-0000-0000-0000-000000000002']);throw Error('unexpected oversell')}catch(e){if(e.message==='unexpected oversell')throw e;console.log('PASS insufficient stock rollback')}
let closed=(await db.query('select public.close_cash($1,$2,16400) result',[A,session])).rows[0].result;if(Number(closed.expected_cents)!==16418||Number(closed.difference_cents)!==-18)throw Error('cash close');console.log('PASS closing expected/count/difference');
try{await db.query('select public.move_cash($1,$2,\'reinforcement\',100,\'X\',gen_random_uuid())',[A,session]);throw Error('unexpected closed write')}catch(e){if(e.message==='unexpected closed write')throw e;console.log('PASS closed cash mutation denied')}
await db.close();
