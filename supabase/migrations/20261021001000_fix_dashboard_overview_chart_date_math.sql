begin;

-- Keep day offsets as date arithmetic after generate_series yields timestamps.
create or replace function public.dashboard_overview(p_store uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare store_timezone text; local_today date; today_start timestamptz; tomorrow_start timestamptz;
  today_sales bigint; today_count bigint; receivable_total bigint; low_count bigint; appointments_count bigint;
  week_total bigint; previous_total bigint; cash_is_open boolean; chart_data jsonb; attention_data jsonb := '[]'::jsonb;
  recent_data jsonb; delivery_count bigint; payable_count bigint; appointment_data jsonb; appointment_customer text;
  appointment_pet text; appointment_service text; appointment_start timestamptz;
begin
  perform private.assert_member(p_store);
  select timezone into strict store_timezone from public.stores where id = p_store and archived_at is null;
  local_today = (now() at time zone store_timezone)::date;
  today_start = (local_today::timestamp at time zone store_timezone);
  tomorrow_start = ((local_today + 1)::timestamp at time zone store_timezone);

  select coalesce(sum(private.sale_net_total_cents(p_store, s.id)), 0), count(*) into today_sales, today_count
  from public.sales s where s.store_id = p_store and s.status in ('completed', 'partially_refunded', 'refunded')
    and s.completed_at >= today_start and s.completed_at < tomorrow_start;
  select coalesce(sum(remaining_cents), 0) into receivable_total from public.receivables
    where store_id = p_store and status = 'open';
  select count(*) into low_count from public.products p
    left join public.inventory_balances b on b.store_id = p.store_id and b.product_id = p.id
    where p.store_id = p_store and p.archived_at is null and p.minimum_stock > 0
      and coalesce(b.quantity, 0) <= p.minimum_stock;
  select count(*) into appointments_count from public.appointments
    where store_id = p_store and starts_at >= today_start and starts_at < tomorrow_start
      and status in ('scheduled', 'arrived', 'in_progress', 'ready');
  select exists(select 1 from public.cash_sessions where store_id = p_store and status = 'open') into cash_is_open;
  select coalesce(sum(private.sale_net_total_cents(p_store, s.id)), 0) into week_total from public.sales s
    where s.store_id = p_store and s.status in ('completed', 'partially_refunded', 'refunded')
      and s.completed_at >= ((local_today - 6)::timestamp at time zone store_timezone) and s.completed_at < tomorrow_start;
  select coalesce(sum(private.sale_net_total_cents(p_store, s.id)), 0) into previous_total from public.sales s
    where s.store_id = p_store and s.status in ('completed', 'partially_refunded', 'refunded')
      and s.completed_at >= ((local_today - 13)::timestamp at time zone store_timezone)
      and s.completed_at < ((local_today - 6)::timestamp at time zone store_timezone);

  select coalesce(jsonb_agg(jsonb_build_object(
    'date', days.day::date::text,
    'current_cents', coalesce(current_day.total_cents, 0),
    'previous_cents', coalesce(previous_day.total_cents, 0)
  ) order by days.day), '[]'::jsonb) into chart_data
  from generate_series(local_today - 6, local_today, interval '1 day') as days(day)
  left join lateral (
    select sum(private.sale_net_total_cents(p_store, s.id))::bigint as total_cents from public.sales s
    where s.store_id = p_store and s.status in ('completed', 'partially_refunded', 'refunded')
      and s.completed_at >= (days.day::timestamp at time zone store_timezone)
      and s.completed_at < ((days.day::date + 1)::timestamp at time zone store_timezone)
  ) current_day on true
  left join lateral (
    select sum(private.sale_net_total_cents(p_store, s.id))::bigint as total_cents from public.sales s
    where s.store_id = p_store and s.status in ('completed', 'partially_refunded', 'refunded')
      and s.completed_at >= ((days.day::date - 7)::timestamp at time zone store_timezone)
      and s.completed_at < ((days.day::date - 6)::timestamp at time zone store_timezone)
  ) previous_day on true;

  if low_count > 0 then attention_data = attention_data || jsonb_build_array(jsonb_build_object(
    'kind', 'stock', 'title', low_count || case when low_count = 1 then ' produto com estoque baixo' else ' produtos com estoque baixo' end,
    'description', 'Confira os itens e planeje a reposição.', 'href', '/estoque'));
  end if;
  select count(*) into delivery_count from public.deliveries where store_id = p_store
    and status in ('preparing', 'ready', 'out_for_delivery');
  if delivery_count > 0 then attention_data = attention_data || jsonb_build_array(jsonb_build_object(
    'kind', 'delivery', 'title', delivery_count || case when delivery_count = 1 then ' entrega em andamento' else ' entregas em andamento' end,
    'description', 'Acompanhe a preparação e a saída.', 'href', '/entregas'));
  end if;
  select a.starts_at, c.name, p.name, s.name into appointment_start, appointment_customer, appointment_pet, appointment_service
  from public.appointments a
  join public.customers c on c.store_id = a.store_id and c.id = a.customer_id
  join public.pets p on p.store_id = a.store_id and p.id = a.pet_id
  join public.services s on s.store_id = a.store_id and s.id = a.service_id
  where a.store_id = p_store and a.starts_at >= now() and a.starts_at < tomorrow_start
    and a.status in ('scheduled', 'arrived', 'in_progress', 'ready')
  order by a.starts_at limit 1;
  if appointment_start is not null then attention_data = attention_data || jsonb_build_array(jsonb_build_object(
    'kind', 'appointment', 'title', appointment_pet || ' tem atendimento hoje',
    'description', appointment_service || ' · ' || appointment_customer, 'href', '/agenda'));
  end if;
  select count(*) into payable_count from public.payables where store_id = p_store and status = 'open'
    and due_on between local_today and local_today + 7;
  if payable_count > 0 then attention_data = attention_data || jsonb_build_array(jsonb_build_object(
    'kind', 'payable', 'title', payable_count || case when payable_count = 1 then ' conta próxima do vencimento' else ' contas próximas do vencimento' end,
    'description', 'Organize os próximos pagamentos.', 'href', '/financeiro'));
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', recent.id, 'number', recent.number, 'customer', recent.customer, 'items', recent.items,
    'payment', recent.payment, 'status', recent.status, 'total_cents', recent.total_cents,
    'completed_at', recent.completed_at
  ) order by recent.completed_at desc), '[]'::jsonb) into recent_data
  from (
    select s.id, s.number, coalesce(c.name, 'Cliente avulso') as customer,
      coalesce((select string_agg(si.description || ' · ' || trim(to_char(si.quantity, 'FM999999990D999')), ', ' order by si.created_at)
        from public.sale_items si where si.store_id = s.store_id and si.sale_id = s.id), 'Venda sem itens') as items,
      coalesce((select pm.method from public.payments pm where pm.store_id = s.store_id and pm.sale_id = s.id order by pm.received_at desc limit 1),
        case when exists(select 1 from public.receivables r where r.store_id = s.store_id and r.sale_id = s.id) then 'credit' else 'pix' end) as payment,
      case when exists(select 1 from public.receivables r where r.store_id = s.store_id and r.sale_id = s.id and r.remaining_cents > 0) then 'receivable' else s.status end as status,
      s.total_cents, s.completed_at
    from public.sales s left join public.customers c on c.store_id = s.store_id and c.id = s.customer_id
    where s.store_id = p_store and s.status <> 'draft' and s.completed_at is not null
    order by s.completed_at desc limit 6
  ) recent;

  return jsonb_build_object(
    'today_sales_cents', today_sales, 'today_sales_count', today_count, 'receivables_cents', receivable_total,
    'low_stock_count', low_count, 'appointments_today_count', appointments_count, 'cash_open', cash_is_open,
    'week_total_cents', week_total, 'previous_week_total_cents', previous_total,
    'chart', chart_data, 'attention', attention_data, 'recent_sales', recent_data
  );
end $$;

commit;
