-- Executar após as migrations, como postgres, em ambiente local/staging.
-- Somente inspeção; não mostra hashes, tickets ou valores de senhas.
select schemaname,tablename,rowsecurity from pg_tables
where (schemaname='public' and tablename in (
'stores','store_memberships','user_preferences','categories','suppliers','customers','customer_addresses','pets','products','product_packagings','inventory_balances','inventory_lots','services','cash_sessions','sales','sale_items','payments','receivables','receivable_payments','expense_categories','goods_receipts','goods_receipt_items','payables','payable_payments','cash_movements','cash_counts','inventory_counts','inventory_count_items','sale_returns','sale_return_items','inventory_movements','appointments','deliveries','delivery_events','audit_logs'))
or schemaname='private' order by schemaname,tablename;
select schemaname,tablename from pg_publication_tables where pubname='supabase_realtime' order by schemaname,tablename;
select schemaname,tablename,policyname,roles,cmd from pg_policies where schemaname in ('public','private','storage') order by schemaname,tablename,policyname;
select has_function_privilege('anon','public.issue_registration_ticket(text,text,text,text)','execute') as anon_gate_must_be_false,
 has_function_privilege('authenticated','public.issue_registration_ticket(text,text,text,text)','execute') as authenticated_gate_must_be_false,
 has_function_privilege('service_role','public.issue_registration_ticket(text,text,text,text)','execute') as server_gate_must_be_true,
 has_function_privilege('service_role','private.set_signup_password(text)','execute') as server_rotate_must_be_false;
select id,public,file_size_limit,allowed_mime_types from storage.buckets where id='store-assets';
select exists(select 1 from private.signup_authorization where singleton and active) as gate_configured;
-- true significa configurada; esta consulta não exibe o hash.
