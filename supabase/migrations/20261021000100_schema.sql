-- Petshop: schema inicial. Executar em projeto Supabase novo após revisar o projeto Next existente.
-- Não altera confirmação de e-mail nem configurações de Auth via SQL.
begin;
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
alter default privileges in schema private revoke all on tables from public, anon, authenticated;
alter default privileges in schema private revoke execute on functions from public, anon, authenticated;
create table public.stores (
 id uuid primary key default gen_random_uuid(), name text not null check(length(trim(name)) between 1 and 120),
 owner_user_id uuid not null references auth.users(id), phone text, email text, address jsonb not null default '{}'::jsonb,
 timezone text not null default 'America/Sao_Paulo', logo_path text,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), archived_at timestamptz
);
create table public.store_memberships (
 id uuid primary key default gen_random_uuid(), store_id uuid not null references public.stores(id),
 user_id uuid not null references auth.users(id), role text not null default 'owner' check(role in ('owner','staff')),
 active boolean not null default true, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(store_id,user_id), unique(store_id,id)
);
create table public.user_preferences (
 id uuid primary key default gen_random_uuid(), user_id uuid not null unique references auth.users(id),
 theme text not null default 'system' check(theme in ('system','light','dark')), sidebar_collapsed boolean not null default false,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.categories (
 id uuid primary key default gen_random_uuid(), store_id uuid not null references public.stores(id),
 name text not null, archived_at timestamptz, unique(store_id,name),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(store_id,id)
);
create table public.suppliers (
 id uuid primary key default gen_random_uuid(), store_id uuid not null references public.stores(id),
 name text not null, phone text, email text, address jsonb not null default '{}'::jsonb, notes text, archived_at timestamptz,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(store_id,id)
);
create table public.customers (
 id uuid primary key default gen_random_uuid(), store_id uuid not null references public.stores(id),
 name text not null, phone text, email text, notes text, archived_at timestamptz,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(store_id,id)
);
create table public.customer_addresses (
 id uuid primary key default gen_random_uuid(), store_id uuid not null references public.stores(id),
 customer_id uuid not null, label text, street text not null, number text, complement text, district text, city text not null, state text, postal_code text, reference text, archived_at timestamptz, foreign key(store_id,customer_id) references public.customers(store_id,id),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(store_id,id)
);
create table public.pets (
 id uuid primary key default gen_random_uuid(), store_id uuid not null references public.stores(id),
 customer_id uuid not null, name text not null, species text not null, breed text, birth_date date, weight_kg numeric(12,3) check(weight_kg>=0), care_notes text, behavior_notes text, archived_at timestamptz, foreign key(store_id,customer_id) references public.customers(store_id,id), unique(store_id,customer_id,id),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(store_id,id)
);
create table public.products (
 id uuid primary key default gen_random_uuid(), store_id uuid not null references public.stores(id),
 name text not null, description text, brand text, sku text, barcode text, category_id uuid, unit text not null check(unit in ('un','kg','g','L','ml','pacote','caixa')), unit_precision smallint not null default 0 check(unit_precision between 0 and 3), sale_price_cents bigint not null check(sale_price_cents>=0), average_cost_cents bigint not null default 0 check(average_cost_cents>=0), minimum_stock numeric(15,3) not null default 0 check(minimum_stock>=0), track_lots boolean not null default false, archived_at timestamptz, foreign key(store_id,category_id) references public.categories(store_id,id),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(store_id,id)
);
create table public.product_packagings (
 id uuid primary key default gen_random_uuid(), store_id uuid not null references public.stores(id),
 product_id uuid not null, label text not null, barcode text, base_quantity numeric(15,3) not null check(base_quantity>0), foreign key(store_id,product_id) references public.products(store_id,id),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(store_id,id)
);
create table public.inventory_balances (
 id uuid primary key default gen_random_uuid(), store_id uuid not null references public.stores(id),
 product_id uuid not null, quantity numeric(15,3) not null default 0 check(quantity>=0), version bigint not null default 0, unique(store_id,product_id), foreign key(store_id,product_id) references public.products(store_id,id),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(store_id,id)
);
create table public.inventory_lots (
 id uuid primary key default gen_random_uuid(), store_id uuid not null references public.stores(id),
 product_id uuid not null, code text not null, expires_on date, quantity numeric(15,3) not null default 0 check(quantity>=0), foreign key(store_id,product_id) references public.products(store_id,id), unique(store_id,product_id,code), unique(store_id,product_id,id),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(store_id,id)
);
create table public.services (
 id uuid primary key default gen_random_uuid(), store_id uuid not null references public.stores(id),
 name text not null, price_cents bigint not null check(price_cents>=0), duration_minutes integer not null default 60 check(duration_minutes>0), archived_at timestamptz,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(store_id,id)
);
create table public.cash_sessions (
 id uuid primary key default gen_random_uuid(), store_id uuid not null references public.stores(id),
 opened_by uuid not null references auth.users(id), opened_at timestamptz not null default now(), opening_cents bigint not null check(opening_cents>=0), closed_by uuid references auth.users(id), closed_at timestamptz, counted_cents bigint check(counted_cents>=0), expected_cents bigint, difference_cents bigint, notes text, status text not null default 'open' check(status in ('open','closed')), check((status='open' and closed_at is null) or (status='closed' and closed_at is not null and counted_cents is not null and expected_cents is not null and difference_cents=counted_cents-expected_cents)),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(store_id,id)
);
create table public.sales (
 id uuid primary key default gen_random_uuid(), store_id uuid not null references public.stores(id),
 number bigint generated always as identity, customer_id uuid, cash_session_id uuid, status text not null default 'draft' check(status in ('draft','completed','partially_refunded','refunded','cancelled')), subtotal_cents bigint not null default 0 check(subtotal_cents>=0), discount_cents bigint not null default 0 check(discount_cents>=0), delivery_fee_cents bigint not null default 0 check(delivery_fee_cents>=0), total_cents bigint not null default 0 check(total_cents>=0), idempotency_key uuid not null, completed_at timestamptz, cancelled_at timestamptz, cancellation_reason text, foreign key(store_id,customer_id) references public.customers(store_id,id), foreign key(store_id,cash_session_id) references public.cash_sessions(store_id,id), unique(store_id,idempotency_key),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(store_id,id)
);
create table public.sale_items (
 id uuid primary key default gen_random_uuid(), store_id uuid not null references public.stores(id),
 sale_id uuid not null, product_id uuid, service_id uuid, description text not null, unit text not null, quantity numeric(15,3) not null check(quantity>0), unit_price_cents bigint not null check(unit_price_cents>=0), unit_cost_cents bigint not null default 0 check(unit_cost_cents>=0), line_total_cents bigint not null check(line_total_cents>=0), check((product_id is not null)::int+(service_id is not null)::int=1), foreign key(store_id,sale_id) references public.sales(store_id,id), foreign key(store_id,product_id) references public.products(store_id,id), foreign key(store_id,service_id) references public.services(store_id,id), unique(store_id,sale_id,id),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(store_id,id)
);
create table public.payments (
 id uuid primary key default gen_random_uuid(), store_id uuid not null references public.stores(id),
 sale_id uuid not null, method text not null check(method in ('cash','pix','debit_card','credit_card')), amount_cents bigint not null check(amount_cents>0), tendered_cents bigint, change_cents bigint, received_at timestamptz not null default now(), idempotency_key uuid not null, foreign key(store_id,sale_id) references public.sales(store_id,id), unique(store_id,idempotency_key), check((method='cash' and tendered_cents is not null and change_cents is not null and tendered_cents>=amount_cents and change_cents=tendered_cents-amount_cents) or (method<>'cash' and tendered_cents is null and change_cents is null)),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(store_id,id)
);
create table public.receivables (
 id uuid primary key default gen_random_uuid(), store_id uuid not null references public.stores(id),
 sale_id uuid not null, customer_id uuid not null, original_cents bigint not null check(original_cents>0), remaining_cents bigint not null check(remaining_cents>=0 and remaining_cents<=original_cents), due_on date, status text not null default 'open' check(status in ('open','paid','cancelled')), unique(store_id,sale_id), foreign key(store_id,sale_id) references public.sales(store_id,id), foreign key(store_id,customer_id) references public.customers(store_id,id),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(store_id,id)
);
create table public.receivable_payments (
 id uuid primary key default gen_random_uuid(), store_id uuid not null references public.stores(id),
 receivable_id uuid not null, payment_id uuid not null, amount_cents bigint not null check(amount_cents>0), foreign key(store_id,receivable_id) references public.receivables(store_id,id), foreign key(store_id,payment_id) references public.payments(store_id,id), unique(store_id,payment_id),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(store_id,id)
);
create table public.expense_categories (
 id uuid primary key default gen_random_uuid(), store_id uuid not null references public.stores(id),
 name text not null, archived_at timestamptz, unique(store_id,name),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(store_id,id)
);
create table public.goods_receipts (
 id uuid primary key default gen_random_uuid(), store_id uuid not null references public.stores(id),
 supplier_id uuid, invoice_reference text, received_at timestamptz not null default now(), total_cents bigint not null check(total_cents>=0), idempotency_key uuid not null, notes text, foreign key(store_id,supplier_id) references public.suppliers(store_id,id), unique(store_id,idempotency_key),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(store_id,id)
);
create table public.goods_receipt_items (
 id uuid primary key default gen_random_uuid(), store_id uuid not null references public.stores(id),
 receipt_id uuid not null, product_id uuid not null, lot_id uuid, packages numeric(15,3) not null check(packages>0), conversion_factor numeric(15,3) not null default 1 check(conversion_factor>0), base_quantity numeric(15,3) not null check(base_quantity>0), total_cost_cents bigint not null check(total_cost_cents>=0), foreign key(store_id,receipt_id) references public.goods_receipts(store_id,id), foreign key(store_id,product_id) references public.products(store_id,id), foreign key(store_id,product_id,lot_id) references public.inventory_lots(store_id,product_id,id),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(store_id,id)
);
create table public.payables (
 id uuid primary key default gen_random_uuid(), store_id uuid not null references public.stores(id),
 supplier_id uuid, category_id uuid, receipt_id uuid, description text not null, original_cents bigint not null check(original_cents>0), remaining_cents bigint not null check(remaining_cents>=0 and remaining_cents<=original_cents), due_on date not null, status text not null default 'open' check(status in ('open','paid','cancelled')), foreign key(store_id,supplier_id) references public.suppliers(store_id,id), foreign key(store_id,category_id) references public.expense_categories(store_id,id), foreign key(store_id,receipt_id) references public.goods_receipts(store_id,id), unique(store_id,receipt_id),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(store_id,id)
);
create table public.payable_payments (
 id uuid primary key default gen_random_uuid(), store_id uuid not null references public.stores(id),
 payable_id uuid not null, amount_cents bigint not null check(amount_cents>0), method text not null check(method in ('cash','pix','debit_card','credit_card','transfer')), paid_at timestamptz not null default now(), cash_session_id uuid, idempotency_key uuid not null, foreign key(store_id,payable_id) references public.payables(store_id,id), foreign key(store_id,cash_session_id) references public.cash_sessions(store_id,id), unique(store_id,idempotency_key),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(store_id,id)
);
create table public.cash_movements (
 id uuid primary key default gen_random_uuid(), store_id uuid not null references public.stores(id),
 cash_session_id uuid not null, kind text not null check(kind in ('sale','receivable','reinforcement','withdrawal','expense','refund')), amount_cents bigint not null check(amount_cents<>0), payment_id uuid, payable_payment_id uuid, reason text not null, idempotency_key uuid not null, occurred_at timestamptz not null default now(), foreign key(store_id,cash_session_id) references public.cash_sessions(store_id,id), foreign key(store_id,payment_id) references public.payments(store_id,id), foreign key(store_id,payable_payment_id) references public.payable_payments(store_id,id), unique(store_id,idempotency_key), unique(store_id,payment_id), unique(store_id,payable_payment_id), check((kind in ('sale','receivable','reinforcement') and amount_cents>0) or (kind in ('withdrawal','expense','refund') and amount_cents<0)),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(store_id,id)
);
create table public.cash_counts (
 id uuid primary key default gen_random_uuid(), store_id uuid not null references public.stores(id),
 cash_session_id uuid not null, phase text not null check(phase in ('opening','closing')), denomination_cents integer not null check(denomination_cents in (20000,10000,5000,2000,1000,500,200,100,50,25,10,5)), quantity integer not null check(quantity>=0), foreign key(store_id,cash_session_id) references public.cash_sessions(store_id,id), unique(store_id,cash_session_id,phase,denomination_cents),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(store_id,id)
);
create table public.inventory_counts (
 id uuid primary key default gen_random_uuid(), store_id uuid not null references public.stores(id),
 status text not null default 'draft' check(status in ('draft','applied','cancelled')), applied_at timestamptz, notes text,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(store_id,id)
);
create table public.inventory_count_items (
 id uuid primary key default gen_random_uuid(), store_id uuid not null references public.stores(id),
 count_id uuid not null, product_id uuid not null, expected_quantity numeric(15,3) not null, counted_quantity numeric(15,3) not null check(counted_quantity>=0), balance_version bigint not null, foreign key(store_id,count_id) references public.inventory_counts(store_id,id), foreign key(store_id,product_id) references public.products(store_id,id), unique(store_id,count_id,product_id),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(store_id,id)
);
create table public.sale_returns (
 id uuid primary key default gen_random_uuid(), store_id uuid not null references public.stores(id),
 sale_id uuid not null, reason text not null, refund_cents bigint not null default 0 check(refund_cents>=0), idempotency_key uuid not null, foreign key(store_id,sale_id) references public.sales(store_id,id), unique(store_id,idempotency_key),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(store_id,id)
);
create table public.sale_return_items (
 id uuid primary key default gen_random_uuid(), store_id uuid not null references public.stores(id),
 return_id uuid not null, sale_id uuid not null, sale_item_id uuid not null, quantity numeric(15,3) not null check(quantity>0), restock boolean not null default false, foreign key(store_id,return_id) references public.sale_returns(store_id,id), foreign key(store_id,sale_id,sale_item_id) references public.sale_items(store_id,sale_id,id),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(store_id,id)
);
create table public.inventory_movements (
 id uuid primary key default gen_random_uuid(), store_id uuid not null references public.stores(id),
 product_id uuid not null, lot_id uuid, quantity_delta numeric(15,3) not null check(quantity_delta<>0), kind text not null check(kind in ('receipt','sale','return','loss','count','correction','bulk_out','bulk_in')), reason text not null, sale_item_id uuid, receipt_item_id uuid, count_item_id uuid, return_item_id uuid, transfer_group uuid, idempotency_key uuid not null, occurred_at timestamptz not null default now(), foreign key(store_id,product_id) references public.products(store_id,id), foreign key(store_id,product_id,lot_id) references public.inventory_lots(store_id,product_id,id), foreign key(store_id,sale_item_id) references public.sale_items(store_id,id), foreign key(store_id,receipt_item_id) references public.goods_receipt_items(store_id,id), foreign key(store_id,count_item_id) references public.inventory_count_items(store_id,id), foreign key(store_id,return_item_id) references public.sale_return_items(store_id,id), unique(store_id,idempotency_key),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(store_id,id)
);
create table public.appointments (
 id uuid primary key default gen_random_uuid(), store_id uuid not null references public.stores(id),
 customer_id uuid not null, pet_id uuid not null, service_id uuid not null, sale_id uuid, starts_at timestamptz not null, ends_at timestamptz not null, price_cents bigint not null check(price_cents>=0), status text not null default 'scheduled' check(status in ('scheduled','arrived','in_progress','ready','delivered','cancelled','no_show')), notes text, version bigint not null default 0, check(ends_at>starts_at), foreign key(store_id,customer_id) references public.customers(store_id,id), foreign key(store_id,customer_id,pet_id) references public.pets(store_id,customer_id,id), foreign key(store_id,service_id) references public.services(store_id,id), foreign key(store_id,sale_id) references public.sales(store_id,id),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(store_id,id)
);
create table public.deliveries (
 id uuid primary key default gen_random_uuid(), store_id uuid not null references public.stores(id),
 sale_id uuid not null, customer_id uuid not null, address_snapshot jsonb not null, fee_cents bigint not null default 0 check(fee_cents>=0), status text not null default 'preparing' check(status in ('preparing','ready','out_for_delivery','delivered','cancelled')), position numeric(20,6) not null default 0, version bigint not null default 0, delivery_notes text, delivered_at timestamptz, unique(store_id,sale_id), foreign key(store_id,sale_id) references public.sales(store_id,id), foreign key(store_id,customer_id) references public.customers(store_id,id),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(store_id,id)
);
create table public.delivery_events (
 id uuid primary key default gen_random_uuid(), store_id uuid not null references public.stores(id),
 delivery_id uuid not null, from_status text, to_status text not null, reason text, foreign key(store_id,delivery_id) references public.deliveries(store_id,id),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(store_id,id)
);
create table public.audit_logs (
 id uuid primary key default gen_random_uuid(), store_id uuid not null references public.stores(id),
 actor_user_id uuid references auth.users(id), action text not null, entity_table text not null, entity_id uuid, details jsonb not null default '{}'::jsonb,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(store_id,id)
);
create unique index products_barcode_store_key on public.products(store_id,barcode) where barcode is not null and barcode<>'';
create unique index products_sku_store_key on public.products(store_id,sku) where sku is not null and sku<>'';
create unique index packaging_barcode_key on public.product_packagings(store_id,barcode) where barcode is not null and barcode<>'';
create unique index cash_sessions_one_open_per_store on public.cash_sessions(store_id) where status='open';
create index appointments_date_idx on public.appointments(store_id,starts_at);
create index deliveries_board_idx on public.deliveries(store_id,status,position);
create index receivables_open_idx on public.receivables(store_id,due_on) where status='open';
create index payables_open_idx on public.payables(store_id,due_on) where status='open';
create index inventory_movements_product_idx on public.inventory_movements(store_id,product_id,occurred_at desc);
create index sales_completed_idx on public.sales(store_id,completed_at desc);
create index payments_received_idx on public.payments(store_id,received_at);
create index cash_movements_session_idx on public.cash_movements(store_id,cash_session_id);
create index memberships_user_idx on public.store_memberships(user_id,store_id) where active;
commit;
