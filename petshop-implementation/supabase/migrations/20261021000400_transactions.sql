begin;
create or replace function private.assert_member(p_store uuid) returns void language plpgsql security definer set search_path='' as $$
begin if auth.uid() is null or not private.is_store_member(p_store) then raise exception 'not_authorized' using errcode='42501'; end if; end $$;
revoke all on function private.assert_member(uuid) from public,anon,authenticated;
-- Every inventory write is posted to the ledger; balance changes are atomic.
create or replace function private.apply_inventory_movement() returns trigger language plpgsql security definer set search_path='' as $$
declare product public.products%rowtype; current_quantity numeric; lot_quantity numeric;
begin
 select * into strict product from public.products where store_id=new.store_id and id=new.product_id for update;
 if round(abs(new.quantity_delta),product.unit_precision)<>abs(new.quantity_delta) then raise exception 'invalid_quantity_precision'; end if;
 if product.track_lots and new.lot_id is null then raise exception 'lot_required'; end if;
 insert into public.inventory_balances(store_id,product_id,quantity) values(new.store_id,new.product_id,0) on conflict(store_id,product_id) do nothing;
 select quantity into current_quantity from public.inventory_balances where store_id=new.store_id and product_id=new.product_id for update;
 if current_quantity+new.quantity_delta<0 then raise exception 'insufficient_stock'; end if;
 if new.lot_id is not null then
  select quantity into strict lot_quantity from public.inventory_lots where store_id=new.store_id and product_id=new.product_id and id=new.lot_id for update;
  if lot_quantity+new.quantity_delta<0 then raise exception 'insufficient_lot_stock'; end if;
  if new.kind='sale' and exists(select 1 from public.inventory_lots where id=new.lot_id and expires_on<current_date) then raise exception 'expired_lot'; end if;
  update public.inventory_lots set quantity=quantity+new.quantity_delta where id=new.lot_id;
 end if;
 update public.inventory_balances set quantity=quantity+new.quantity_delta,version=version+1 where store_id=new.store_id and product_id=new.product_id;
 return new;
end $$;
revoke all on function private.apply_inventory_movement() from public,anon,authenticated;
create trigger apply_inventory_movement before insert on public.inventory_movements for each row execute function private.apply_inventory_movement();
create or replace function private.lock_open_cash(p_store uuid,p_session uuid) returns void language plpgsql security definer set search_path='' as $$
begin perform 1 from public.cash_sessions where store_id=p_store and id=p_session and status='open' for update;
 if not found then raise exception 'cash_session_not_open'; end if; end $$;
revoke all on function private.lock_open_cash(uuid,uuid) from public,anon,authenticated;
create or replace function public.open_cash(p_store uuid,p_opening bigint,p_counts jsonb default '[]') returns uuid language plpgsql security definer set search_path='' as $$
declare result uuid; denomination jsonb; counted bigint;
begin
 perform private.assert_member(p_store);
 perform 1 from public.stores where id=p_store for update;
 if p_opening<0 then raise exception 'invalid_amount'; end if;
 if exists(select 1 from public.cash_sessions where store_id=p_store and status='open') then raise exception 'cash_already_open'; end if;
 if jsonb_array_length(p_counts)>0 then
  select sum((value->>'denomination_cents')::bigint*(value->>'quantity')::bigint) into counted from jsonb_array_elements(p_counts);
  if counted<>p_opening then raise exception 'count_mismatch'; end if;
 end if;
 insert into public.cash_sessions(store_id,opened_by,opening_cents) values(p_store,auth.uid(),p_opening) returning id into result;
 for denomination in select value from jsonb_array_elements(p_counts) loop
  insert into public.cash_counts(store_id,cash_session_id,phase,denomination_cents,quantity) values(p_store,result,'opening',(denomination->>'denomination_cents')::int,(denomination->>'quantity')::int);
 end loop;
 return result;
end $$;
create or replace function public.close_cash(p_store uuid,p_session uuid,p_counted bigint,p_notes text default '',p_counts jsonb default '[]') returns jsonb language plpgsql security definer set search_path='' as $$
declare expected bigint; counted bigint; denomination jsonb;
begin
 perform private.assert_member(p_store); perform private.lock_open_cash(p_store,p_session);
 if p_counted<0 then raise exception 'invalid_amount'; end if;
 select opening_cents+coalesce((select sum(amount_cents) from public.cash_movements where store_id=p_store and cash_session_id=p_session),0) into expected from public.cash_sessions where id=p_session;
 if jsonb_array_length(p_counts)>0 then
  select sum((value->>'denomination_cents')::bigint*(value->>'quantity')::bigint) into counted from jsonb_array_elements(p_counts);
  if counted<>p_counted then raise exception 'count_mismatch'; end if;
 end if;
 for denomination in select value from jsonb_array_elements(p_counts) loop
  insert into public.cash_counts(store_id,cash_session_id,phase,denomination_cents,quantity) values(p_store,p_session,'closing',(denomination->>'denomination_cents')::int,(denomination->>'quantity')::int);
 end loop;
 update public.cash_sessions set status='closed',closed_by=auth.uid(),closed_at=now(),counted_cents=p_counted,expected_cents=expected,difference_cents=p_counted-expected,notes=p_notes where id=p_session;
 return jsonb_build_object('expected_cents',expected,'counted_cents',p_counted,'difference_cents',p_counted-expected);
end $$;
create or replace function public.move_cash(p_store uuid,p_session uuid,p_kind text,p_amount bigint,p_reason text,p_key uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare result uuid; expected bigint;
begin
 perform private.assert_member(p_store); perform private.lock_open_cash(p_store,p_session);
 select id into result from public.cash_movements where store_id=p_store and idempotency_key=p_key;
 if found then return result; end if;
 if p_kind not in ('reinforcement','withdrawal') or p_amount<=0 or length(trim(p_reason))=0 then raise exception 'invalid_movement'; end if;
 select opening_cents+coalesce((select sum(amount_cents) from public.cash_movements where cash_session_id=p_session),0) into expected from public.cash_sessions where id=p_session;
 if p_kind='withdrawal' and p_amount>expected then raise exception 'insufficient_cash'; end if;
 insert into public.cash_movements(store_id,cash_session_id,kind,amount_cents,reason,idempotency_key) values(p_store,p_session,p_kind,case when p_kind='withdrawal' then -p_amount else p_amount end,p_reason,p_key) returning id into result;
 return result;
end $$;
-- Prices always come from the catalog. Client sends quantities and IDs, never trusted totals.
create or replace function public.complete_sale(p_store uuid,p_session uuid,p_customer uuid,p_items jsonb,p_payments jsonb,p_discount bigint,p_key uuid,p_due date default null,p_delivery_fee bigint default 0,p_delivery_address jsonb default null)
returns uuid language plpgsql security definer set search_path='' as $$
declare result uuid; item jsonb; pay jsonb; product public.products%rowtype; service public.services%rowtype; qty numeric; price bigint; line bigint; subtotal bigint:=0; total bigint; paid bigint:=0; item_id uuid; pay_id uuid; cash_tender bigint; method text; pending bigint;
begin
 perform private.assert_member(p_store); perform private.lock_open_cash(p_store,p_session);
 select id into result from public.sales where store_id=p_store and idempotency_key=p_key;
 if found then return result; end if;
 if p_customer is not null then perform 1 from public.customers where store_id=p_store and id=p_customer and archived_at is null; if not found then raise exception 'customer_not_found'; end if; end if;
 if jsonb_array_length(p_items)<1 or jsonb_array_length(p_items)>200 or p_discount<0 then raise exception 'invalid_sale'; end if;
 -- Deterministic product lock order prevents deadlocks on multi-product sales.
 perform id from public.products where store_id=p_store and id in (select (value->>'product_id')::uuid from jsonb_array_elements(p_items) where value->>'product_id' is not null) order by id for update;
 insert into public.sales(store_id,customer_id,cash_session_id,idempotency_key) values(p_store,p_customer,p_session,p_key) returning id into result;
 for item in select value from jsonb_array_elements(p_items) loop
  qty=(item->>'quantity')::numeric;
  if qty is null or qty<=0 or scale(qty)>3 then raise exception 'invalid_quantity'; end if;
  if (item->>'product_id' is not null)::int+(item->>'service_id' is not null)::int<>1 then raise exception 'invalid_item'; end if;
  if item->>'product_id' is not null then
   select * into strict product from public.products where store_id=p_store and id=(item->>'product_id')::uuid and archived_at is null;
   if round(qty,product.unit_precision)<>qty then raise exception 'invalid_quantity_precision'; end if;
   price=product.sale_price_cents; line=round(qty*price);
   insert into public.sale_items(store_id,sale_id,product_id,description,unit,quantity,unit_price_cents,unit_cost_cents,line_total_cents)
   values(p_store,result,product.id,product.name,product.unit,qty,price,product.average_cost_cents,line) returning id into item_id;
   insert into public.inventory_movements(store_id,product_id,lot_id,quantity_delta,kind,reason,sale_item_id,idempotency_key)
   values(p_store,product.id,(item->>'lot_id')::uuid,-qty,'sale','Venda',item_id,gen_random_uuid());
  else
   select * into strict service from public.services where store_id=p_store and id=(item->>'service_id')::uuid and archived_at is null;
   if trunc(qty)<>qty then raise exception 'invalid_service_quantity'; end if;
   price=service.price_cents; line=qty*price;
   insert into public.sale_items(store_id,sale_id,service_id,description,unit,quantity,unit_price_cents,line_total_cents) values(p_store,result,service.id,service.name,'un',qty,price,line);
  end if;
  subtotal=subtotal+line;
 end loop;
 if p_delivery_fee<0 or (p_delivery_address is not null and p_customer is null) then raise exception 'invalid_delivery'; end if;
 total=subtotal-p_discount+p_delivery_fee;
 if total<0 then raise exception 'invalid_discount'; end if;
 for pay in select value from jsonb_array_elements(p_payments) loop
  method=pay->>'method'; line=(pay->>'amount_cents')::bigint;
  if line is null or line<=0 then raise exception 'invalid_payment'; end if;
  cash_tender=case when method='cash' then (pay->>'tendered_cents')::bigint else null end;
  if method='cash' and (cash_tender is null or cash_tender<line) then raise exception 'invalid_tender'; end if;
  insert into public.payments(store_id,sale_id,method,amount_cents,tendered_cents,change_cents,idempotency_key)
  values(p_store,result,method,line,cash_tender,case when method='cash' then cash_tender-line end,gen_random_uuid()) returning id into pay_id;
  if method='cash' then insert into public.cash_movements(store_id,cash_session_id,kind,amount_cents,payment_id,reason,idempotency_key) values(p_store,p_session,'sale',line,pay_id,'Venda',gen_random_uuid()); end if;
  paid=paid+line;
 end loop;
 if paid>total then raise exception 'payment_above_total'; end if;
 pending=total-paid;
 if pending>0 then
  if p_customer is null then raise exception 'customer_required_for_credit'; end if;
  insert into public.receivables(store_id,sale_id,customer_id,original_cents,remaining_cents,due_on) values(p_store,result,p_customer,pending,pending,p_due);
 end if;
 update public.sales set status='completed',subtotal_cents=subtotal,discount_cents=p_discount,delivery_fee_cents=p_delivery_fee,total_cents=total,completed_at=now() where id=result;
 if p_delivery_address is not null then insert into public.deliveries(store_id,sale_id,customer_id,address_snapshot,fee_cents) values(p_store,result,p_customer,p_delivery_address,p_delivery_fee); end if;
 insert into public.audit_logs(store_id,actor_user_id,action,entity_table,entity_id) values(p_store,auth.uid(),'complete_sale','sales',result);
 return result;
end $$;
create or replace function public.receive_receivable(p_store uuid,p_receivable uuid,p_amount bigint,p_method text,p_session uuid,p_key uuid,p_tendered bigint default null)
returns uuid language plpgsql security definer set search_path='' as $$
declare r public.receivables%rowtype; result uuid;
begin
 perform private.assert_member(p_store);
 -- Consistent lock order: cash session before receivable, same as other posting functions.
 if p_method='cash' then perform private.lock_open_cash(p_store,p_session); end if;
 select id into result from public.payments where store_id=p_store and idempotency_key=p_key; if found then return result; end if;
 select * into strict r from public.receivables where store_id=p_store and id=p_receivable and status='open' for update;
 if p_amount<=0 or p_amount>r.remaining_cents then raise exception 'invalid_amount'; end if;
 if p_method='cash' and (p_tendered is null or p_tendered<p_amount) then raise exception 'invalid_tender'; end if;
 insert into public.payments(store_id,sale_id,method,amount_cents,tendered_cents,change_cents,idempotency_key)
 values(p_store,r.sale_id,p_method,p_amount,case when p_method='cash' then p_tendered end,case when p_method='cash' then p_tendered-p_amount end,p_key) returning id into result;
 insert into public.receivable_payments(store_id,receivable_id,payment_id,amount_cents) values(p_store,p_receivable,result,p_amount);
 if p_method='cash' then insert into public.cash_movements(store_id,cash_session_id,kind,amount_cents,payment_id,reason,idempotency_key) values(p_store,p_session,'receivable',p_amount,result,'Recebimento de saldo',p_key); end if;
 update public.receivables set remaining_cents=remaining_cents-p_amount,status=case when remaining_cents=p_amount then 'paid' else 'open' end where id=p_receivable;
 return result;
end $$;
create or replace function public.move_delivery(p_store uuid,p_delivery uuid,p_status text,p_position numeric,p_expected_version bigint,p_reason text default null)
returns bigint language plpgsql security definer set search_path='' as $$
declare d public.deliveries%rowtype;
begin
 perform private.assert_member(p_store);
 select * into strict d from public.deliveries where store_id=p_store and id=p_delivery for update;
 if d.version<>p_expected_version then raise exception 'version_conflict' using errcode='40001'; end if;
 if d.status in ('delivered','cancelled') and p_status<>d.status and coalesce(length(trim(p_reason)),0)=0 then raise exception 'reason_required'; end if;
 update public.deliveries set status=p_status,position=p_position,version=version+1,delivered_at=case when p_status='delivered' then coalesce(delivered_at,now()) else null end where id=p_delivery;
 insert into public.delivery_events(store_id,delivery_id,from_status,to_status,reason) values(p_store,p_delivery,d.status,p_status,p_reason);
 return d.version+1;
end $$;
-- Explicit grants: newly created SECURITY DEFINER functions must never retain PUBLIC execute.
revoke all on function public.open_cash(uuid,bigint,jsonb), public.close_cash(uuid,uuid,bigint,text,jsonb), public.move_cash(uuid,uuid,text,bigint,text,uuid), public.complete_sale(uuid,uuid,uuid,jsonb,jsonb,bigint,uuid,date,bigint,jsonb),public.receive_receivable(uuid,uuid,bigint,text,uuid,uuid,bigint),public.move_delivery(uuid,uuid,text,numeric,bigint,text) from public,anon;
grant execute on function public.open_cash(uuid,bigint,jsonb), public.close_cash(uuid,uuid,bigint,text,jsonb), public.move_cash(uuid,uuid,text,bigint,text,uuid),public.complete_sale(uuid,uuid,uuid,jsonb,jsonb,bigint,uuid,date,bigint,jsonb),public.receive_receivable(uuid,uuid,bigint,text,uuid,uuid,bigint),public.move_delivery(uuid,uuid,text,numeric,bigint,text) to authenticated;
commit;
