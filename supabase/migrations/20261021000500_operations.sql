begin;
create or replace function public.adjust_stock(p_store uuid,p_product uuid,p_counted numeric,p_reason text,p_key uuid,p_lot uuid default null) returns uuid language plpgsql security definer set search_path='' as $$
declare current_qty numeric; result uuid; precision_digits int;
begin
 perform private.assert_member(p_store);
 select id into result from public.inventory_movements where store_id=p_store and idempotency_key=p_key; if found then return result; end if;
 select unit_precision into strict precision_digits from public.products where store_id=p_store and id=p_product for update;
 if p_counted<0 or round(p_counted,precision_digits)<>p_counted or coalesce(length(trim(p_reason)),0)=0 then raise exception 'invalid_adjustment'; end if;
 if p_lot is not null then select quantity into strict current_qty from public.inventory_lots where store_id=p_store and product_id=p_product and id=p_lot for update;
 else select coalesce((select quantity from public.inventory_balances where store_id=p_store and product_id=p_product),0) into current_qty; end if;
 if p_counted=current_qty then return null; end if;
 insert into public.inventory_movements(store_id,product_id,lot_id,quantity_delta,kind,reason,idempotency_key) values(p_store,p_product,p_lot,p_counted-current_qty,'correction',p_reason,p_key) returning id into result;
 insert into public.audit_logs(store_id,actor_user_id,action,entity_table,entity_id,details) values(p_store,auth.uid(),'adjust_stock','inventory_movements',result,jsonb_build_object('previous',current_qty,'counted',p_counted));
 return result;
end $$;
create or replace function public.pay_payable(p_store uuid,p_payable uuid,p_amount bigint,p_method text,p_session uuid,p_key uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare bill public.payables%rowtype; result uuid; expected bigint;
begin
 perform private.assert_member(p_store);
 if p_method='cash' then perform private.lock_open_cash(p_store,p_session); end if;
 select id into result from public.payable_payments where store_id=p_store and idempotency_key=p_key; if found then return result; end if;
 select * into strict bill from public.payables where store_id=p_store and id=p_payable and status='open' for update;
 if p_amount<=0 or p_amount>bill.remaining_cents then raise exception 'invalid_amount'; end if;
 if p_method='cash' then
  select opening_cents+coalesce((select sum(amount_cents) from public.cash_movements where cash_session_id=p_session),0) into expected from public.cash_sessions where id=p_session;
  if p_amount>expected then raise exception 'insufficient_cash'; end if;
 end if;
 insert into public.payable_payments(store_id,payable_id,amount_cents,method,cash_session_id,idempotency_key)
 values(p_store,p_payable,p_amount,p_method,case when p_method='cash' then p_session end,p_key) returning id into result;
 if p_method='cash' then insert into public.cash_movements(store_id,cash_session_id,kind,amount_cents,payable_payment_id,reason,idempotency_key) values(p_store,p_session,'expense',-p_amount,result,bill.description,p_key); end if;
 update public.payables set remaining_cents=remaining_cents-p_amount,status=case when remaining_cents=p_amount then 'paid' else 'open' end where id=p_payable;
 return result;
end $$;
create or replace function public.create_expense(p_store uuid,p_description text,p_category uuid,p_amount bigint,p_due date,p_key uuid,p_pay_now boolean default false,p_method text default 'pix',p_session uuid default null)
returns uuid language plpgsql security definer set search_path='' as $$
declare result uuid;
begin
 perform private.assert_member(p_store);
 if p_pay_now and p_method='cash' then perform private.lock_open_cash(p_store,p_session); end if;
 -- Serialize by store for retry protection; payable IDs derive from the request UUID.
 perform 1 from public.stores where id=p_store for update;
 select id into result from public.payables where store_id=p_store and id=p_key; if found then return result; end if;
 if p_amount<=0 or coalesce(length(trim(p_description)),0)=0 then raise exception 'invalid_expense'; end if;
 insert into public.payables(id,store_id,description,category_id,original_cents,remaining_cents,due_on) values(p_key,p_store,p_description,p_category,p_amount,p_amount,p_due) returning id into result;
 if p_pay_now then perform public.pay_payable(p_store,result,p_amount,p_method,p_session,p_key); end if;
 return result;
end $$;
create or replace function public.receive_goods(p_store uuid,p_supplier uuid,p_items jsonb,p_key uuid,p_due date,p_pay_now boolean default false,p_method text default 'pix',p_session uuid default null)
returns uuid language plpgsql security definer set search_path='' as $$
declare result uuid; item jsonb; product public.products%rowtype; qty numeric; current_qty numeric; total bigint:=0; cost bigint; item_id uuid; lot uuid; payable uuid;
begin
 perform private.assert_member(p_store);
 -- When a cash payment is requested, lock session first to match complete_sale's lock order.
 if p_pay_now and p_method='cash' then perform private.lock_open_cash(p_store,p_session); end if;
 perform 1 from public.stores where id=p_store for update;
 select id into result from public.goods_receipts where store_id=p_store and idempotency_key=p_key; if found then return result; end if;
 if jsonb_array_length(p_items)<1 or jsonb_array_length(p_items)>200 then raise exception 'invalid_receipt'; end if;
 perform id from public.products where store_id=p_store and id in(select (value->>'product_id')::uuid from jsonb_array_elements(p_items)) order by id for update;
 insert into public.goods_receipts(store_id,supplier_id,total_cents,idempotency_key) values(p_store,p_supplier,0,p_key) returning id into result;
 for item in select value from jsonb_array_elements(p_items) loop
  select * into strict product from public.products where store_id=p_store and id=(item->>'product_id')::uuid and archived_at is null;
  qty=(item->>'packages')::numeric*(item->>'conversion_factor')::numeric; cost=(item->>'total_cost_cents')::bigint;
  if qty<=0 or qty is null or round(qty,product.unit_precision)<>qty or cost<0 or cost is null then raise exception 'invalid_receipt_item'; end if;
  lot=null;
  if product.track_lots then
   insert into public.inventory_lots(store_id,product_id,code,expires_on) values(p_store,product.id,item->>'lot_code',(item->>'expires_on')::date)
   on conflict(store_id,product_id,code) do update set code=excluded.code returning id into lot;
   if exists(select 1 from public.inventory_lots where id=lot and expires_on is distinct from (item->>'expires_on')::date) then raise exception 'lot_expiration_mismatch'; end if;
  end if;
  select coalesce((select quantity from public.inventory_balances where store_id=p_store and product_id=product.id),0) into current_qty;
  update public.products set average_cost_cents=round((current_qty*average_cost_cents+cost)/(current_qty+qty)) where id=product.id;
  insert into public.goods_receipt_items(store_id,receipt_id,product_id,lot_id,packages,conversion_factor,base_quantity,total_cost_cents)
  values(p_store,result,product.id,lot,(item->>'packages')::numeric,(item->>'conversion_factor')::numeric,qty,cost) returning id into item_id;
  insert into public.inventory_movements(store_id,product_id,lot_id,quantity_delta,kind,reason,receipt_item_id,idempotency_key) values(p_store,product.id,lot,qty,'receipt','Recebimento de mercadoria',item_id,gen_random_uuid());
  total=total+cost;
 end loop;
 update public.goods_receipts set total_cents=total where id=result;
 if total>0 then
  insert into public.payables(store_id,supplier_id,receipt_id,description,original_cents,remaining_cents,due_on) values(p_store,p_supplier,result,'Recebimento de mercadoria',total,total,p_due) returning id into payable;
  if p_pay_now then perform public.pay_payable(p_store,payable,total,p_method,p_session,p_key); end if;
 end if;
 return result;
end $$;
create or replace function public.save_appointment(p_store uuid,p_customer uuid,p_pet uuid,p_service uuid,p_start timestamptz,p_end timestamptz,p_price bigint,p_notes text default '') returns uuid language plpgsql security definer set search_path='' as $$
declare result uuid;
begin
 perform private.assert_member(p_store);
 insert into public.appointments(store_id,customer_id,pet_id,service_id,starts_at,ends_at,price_cents,notes) values(p_store,p_customer,p_pet,p_service,p_start,p_end,p_price,p_notes) returning id into result;
 return result;
end $$;
create or replace function public.set_appointment_status(p_store uuid,p_appointment uuid,p_status text,p_expected_version bigint)
returns bigint language plpgsql security definer set search_path='' as $$
declare result bigint;
begin perform private.assert_member(p_store);
 update public.appointments set status=p_status,version=version+1 where store_id=p_store and id=p_appointment and version=p_expected_version returning version into result;
 if not found then raise exception 'version_conflict' using errcode='40001'; end if; return result;
end $$;
revoke all on function public.adjust_stock(uuid,uuid,numeric,text,uuid,uuid),public.pay_payable(uuid,uuid,bigint,text,uuid,uuid),public.create_expense(uuid,text,uuid,bigint,date,uuid,boolean,text,uuid),public.receive_goods(uuid,uuid,jsonb,uuid,date,boolean,text,uuid),public.save_appointment(uuid,uuid,uuid,uuid,timestamptz,timestamptz,bigint,text),public.set_appointment_status(uuid,uuid,text,bigint) from public,anon;
grant execute on function public.adjust_stock(uuid,uuid,numeric,text,uuid,uuid),public.pay_payable(uuid,uuid,bigint,text,uuid,uuid),public.create_expense(uuid,text,uuid,bigint,date,uuid,boolean,text,uuid),public.receive_goods(uuid,uuid,jsonb,uuid,date,boolean,text,uuid),public.save_appointment(uuid,uuid,uuid,uuid,timestamptz,timestamptz,bigint,text),public.set_appointment_status(uuid,uuid,text,bigint) to authenticated;
commit;
