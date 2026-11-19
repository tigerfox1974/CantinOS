-- =====================================================================
-- OKUL BÜFESİ — 0007 Personel sipariş RPC'leri
-- =====================================================================

create or replace function private.staff_order_items_json(p_order_id uuid, p_with_money boolean)
returns jsonb
language sql
stable
security definer
set search_path = public, extensions, pg_temp
as $$
  select coalesce(
    jsonb_agg(
      case
        when p_with_money then jsonb_build_object(
          'productId', i.product_id,
          'productName', i.product_name_snapshot,
          'categoryName', i.category_name_snapshot,
          'unitPrice', i.unit_price_snapshot,
          'quantity', i.quantity,
          'lineNote', i.line_note,
          'lineTotal', i.line_total
        )
        else jsonb_build_object(
          'productName', i.product_name_snapshot,
          'quantity', i.quantity,
          'lineNote', i.line_note
        )
      end
      order by i.created_at, i.product_name_snapshot
    ),
    '[]'::jsonb
  )
  from public.order_items i
  where i.order_id = p_order_id;
$$;

create or replace function private.staff_order_problems_json(p_order_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public, extensions, pg_temp
as $$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', p.id,
        'problemType', p.problem_type,
        'note', p.note,
        'reportedAt', p.reported_at,
        'reportedByName', (select sa.display_name from public.staff_accounts sa where sa.id = p.reported_by_staff_id),
        'informedAt', p.informed_at,
        'informedByName', (select sa.display_name from public.staff_accounts sa where sa.id = p.informed_by_staff_id),
        'clearedAt', p.cleared_at,
        'clearedByName', (select sa.display_name from public.staff_accounts sa where sa.id = p.cleared_by_staff_id)
      )
      order by p.reported_at desc
    ),
    '[]'::jsonb
  )
  from public.order_problems p
  where p.order_id = p_order_id;
$$;

create or replace function private.staff_order_payments_json(p_order_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public, extensions, pg_temp
as $$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', p.id,
        'paymentType', p.payment_type,
        'paymentMethod', p.payment_method,
        'amount', p.amount,
        'receivedAmount', p.received_amount,
        'changeAmount', p.change_amount,
        'createdAt', p.created_at,
        'createdByName', (select sa.display_name from public.staff_accounts sa where sa.id = p.created_by_staff_id),
        'note', p.note
      )
      order by p.created_at
    ),
    '[]'::jsonb
  )
  from public.payments p
  where p.order_id = p_order_id;
$$;

create or replace function private.staff_order_json(p_order public.orders, p_full boolean)
returns jsonb
language sql
stable
security definer
set search_path = public, extensions, pg_temp
as $$
  select case
    when p_full then jsonb_build_object(
      'id', p_order.id,
      'orderNumber', p_order.order_number,
      'source', p_order.source,
      'customerName', p_order.customer_name,
      'customerPhone', p_order.customer_phone,
      'deliveryLabel', p_order.delivery_label,
      'targetDeliveryAt', p_order.target_delivery_at,
      'generalNote', p_order.general_note,
      'status', p_order.order_status,
      'paymentStatus', p_order.payment_status,
      'totalAmount', p_order.total_amount,
      'paidAmount', private.order_paid(p_order.id),
      'priorityOverride', p_order.priority_override,
      'priorityOverrideReason', p_order.priority_override_reason,
      'createdAt', p_order.created_at,
      'updatedAt', p_order.updated_at,
      'deliveredAt', p_order.delivered_at,
      'items', private.staff_order_items_json(p_order.id, true),
      'problems', private.staff_order_problems_json(p_order.id),
      'payments', private.staff_order_payments_json(p_order.id),
      'cancellationReason', (select c.reason from public.order_cancellations c where c.order_id = p_order.id)
    )
    else jsonb_build_object(
      'id', p_order.id,
      'orderNumber', p_order.order_number,
      'source', p_order.source,
      'deliveryLabel', p_order.delivery_label,
      'targetDeliveryAt', p_order.target_delivery_at,
      'generalNote', p_order.general_note,
      'status', p_order.order_status,
      'priorityOverride', p_order.priority_override,
      'createdAt', p_order.created_at,
      'updatedAt', p_order.updated_at,
      'items', private.staff_order_items_json(p_order.id, false)
    )
  end;
$$;

create or replace function public.staff_orders(
  p_token text,
  p_mode text default 'ACTIVE',
  p_search text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_staff public.staff_accounts := private.require_staff(p_token);
  v_result jsonb;
  v_mode text := upper(coalesce(p_mode, 'ACTIVE'));
  v_search text := nullif(btrim(coalesce(p_search, '')), '');
begin
  if v_staff.role = 'KITCHEN' then
    select coalesce(jsonb_agg(j order by prio desc, target_at asc, created_at asc), '[]'::jsonb)
      into v_result
      from (
        select o.priority_override as prio,
               o.target_delivery_at as target_at,
               o.created_at,
               private.staff_order_json(o, false) as j
          from public.orders o
         where o.order_status in ('NEW', 'PREPARING', 'READY')
      ) s;
    return v_result;
  end if;

  if v_staff.role = 'CASHIER' then
    select coalesce(jsonb_agg(j order by target_at asc, created_at asc), '[]'::jsonb)
      into v_result
      from (
        select o.target_delivery_at as target_at,
               o.created_at,
               private.staff_order_json(o, true) as j
          from public.orders o
         where o.order_status not in ('DELIVERED', 'CANCELLED')
           and (
             o.order_status = 'READY'
             or exists (
               select 1 from public.order_problems p
               where p.order_id = o.id and p.cleared_at is null
             )
           )
      ) s;
    return v_result;
  end if;

  select coalesce(jsonb_agg(j order by created_at desc), '[]'::jsonb)
    into v_result
    from (
      select o.created_at,
             private.staff_order_json(o, true) as j
        from public.orders o
       where (v_mode = 'ALL' or o.order_status not in ('DELIVERED', 'CANCELLED'))
         and (
           v_search is null
           or o.order_number::text ilike '%' || v_search || '%'
           or coalesce(o.customer_name, '') ilike '%' || v_search || '%'
           or coalesce(o.customer_phone, '') ilike '%' || v_search || '%'
         )
       order by o.created_at desc
       limit 300
    ) s;

  return v_result;
end;
$$;

create or replace function public.staff_create_cashier_order(
  p_token text,
  p_items jsonb,
  p_payment_method text,
  p_received_amount numeric default null,
  p_customer_name text default null,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_staff public.staff_accounts := private.require_staff(p_token, array['CASHIER', 'MANAGER']);
  v_method text := upper(coalesce(p_payment_method, ''));
  v_order_id uuid := gen_random_uuid();
  v_number bigint;
  v_total numeric(12, 2) := 0;
  v_received numeric(12, 2);
  v_change numeric(12, 2) := 0;
  v_line record;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_customer text := nullif(btrim(coalesce(p_customer_name, '')), '');
  v_created timestamptz := now();
begin
  if v_method not in ('CASH', 'CARD') then
    raise exception 'Ödeme yöntemi seçmelisiniz.';
  end if;

  if v_note is not null and length(v_note) > 500 then
    raise exception 'Sipariş notu en fazla 500 karakter olabilir.';
  end if;

  if v_customer is not null and length(v_customer) > 80 then
    raise exception 'Müşteri adı en fazla 80 karakter olabilir.';
  end if;

  for v_line in select * from private.load_items(p_items)
  loop
    v_total := v_total + v_line.line_total;
  end loop;

  if v_total <= 0 then
    raise exception 'Sipariş tutarı geçersiz.';
  end if;

  if v_method = 'CASH' then
    if p_received_amount is null or p_received_amount < v_total then
      raise exception 'Alınan para sipariş toplamından düşük olamaz.';
    end if;
    v_received := round(p_received_amount, 2);
    v_change := round(v_received - v_total, 2);
  else
    v_received := v_total;
    v_change := 0;
  end if;

  v_number := nextval('public.order_number_seq');

  insert into public.orders (
    id, order_number, source, customer_name, delivery_label,
    target_delivery_at, general_note, order_status, payment_status,
    total_amount, created_at
  ) values (
    v_order_id, v_number, 'CASHIER', v_customer, 'Hemen',
    v_created, v_note, 'NEW', 'PAID',
    v_total, v_created
  );

  for v_line in select * from private.load_items(p_items)
  loop
    insert into public.order_items (
      order_id, product_id, product_name_snapshot, category_name_snapshot,
      unit_price_snapshot, quantity, line_note, line_total
    ) values (
      v_order_id, v_line.product_id, v_line.product_name, v_line.category_name,
      v_line.unit_price, v_line.quantity, v_line.line_note, v_line.line_total
    );
  end loop;

  insert into public.payments (
    order_id, payment_type, payment_method, amount,
    received_amount, change_amount, created_by_staff_id, note
  ) values (
    v_order_id, 'PAYMENT', v_method, v_total,
    v_received, v_change, v_staff.id, 'Kasa siparişi'
  );

  perform private.log_event(v_order_id, 'ORDER_CREATED', null, 'CASHIER', v_staff.id);

  return jsonb_build_object(
    'orderId', v_order_id,
    'orderNumber', v_number,
    'createdAt', v_created,
    'totalAmount', v_total,
    'paymentMethod', v_method,
    'receivedAmount', v_received,
    'changeAmount', v_change,
    'cashierName', v_staff.display_name,
    'items', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'productName', i.product_name_snapshot,
          'quantity', i.quantity,
          'unitPrice', i.unit_price_snapshot,
          'lineTotal', i.line_total
        )
        order by i.created_at, i.product_name_snapshot
      )
      from public.order_items i where i.order_id = v_order_id
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.staff_set_order_status(
  p_token text,
  p_order_id uuid,
  p_status text
)
returns boolean
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_staff public.staff_accounts := private.require_staff(p_token, array['KITCHEN', 'CASHIER', 'MANAGER']);
  v_order public.orders;
  v_status text := upper(coalesce(p_status, ''));
begin
  select * into v_order from public.orders where id = p_order_id for update;
  if v_order.id is null then
    raise exception 'Sipariş bulunamadı.';
  end if;

  if v_status not in ('NEW', 'PREPARING', 'READY', 'DELIVERED') then
    raise exception 'Geçersiz sipariş durumu.';
  end if;

  if v_order.order_status in ('DELIVERED', 'CANCELLED') then
    raise exception 'Bu sipariş kapanmış; durumu değiştirilemez.';
  end if;

  if v_staff.role = 'KITCHEN' then
    if not (
      (v_order.order_status = 'NEW' and v_status = 'PREPARING')
      or (v_order.order_status = 'PREPARING' and v_status = 'READY')
      or (v_order.order_status = 'READY' and v_status = 'PREPARING')
    ) then
      raise exception 'Mutfak bu durum geçişini yapamaz.';
    end if;
  elsif v_staff.role = 'CASHIER' then
    if not (v_order.order_status = 'READY' and v_status = 'DELIVERED') then
      raise exception 'Kasa yalnız hazır siparişi teslim edebilir.';
    end if;
  end if;

  if v_status = 'DELIVERED' then
    if v_order.payment_status <> 'PAID' then
      raise exception 'Ödemesi alınmamış sipariş teslim edilemez.';
    end if;
    perform private.require_settled(v_order.id);

    update public.orders
       set order_status = 'DELIVERED',
           delivered_at = now(),
           tracking_expires_at = now() + interval '1 hour'
     where id = v_order.id;
  else
    update public.orders
       set order_status = v_status
     where id = v_order.id;
  end if;

  perform private.log_event(v_order.id, 'STATUS_CHANGED', v_order.order_status, v_status, v_staff.id);
  return true;
end;
$$;

create or replace function public.staff_take_payment(
  p_token text,
  p_order_id uuid,
  p_method text,
  p_received_amount numeric default null,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_staff public.staff_accounts := private.require_staff(p_token, array['CASHIER', 'MANAGER']);
  v_order public.orders;
  v_method text := upper(coalesce(p_method, ''));
  v_paid numeric;
  v_outstanding numeric;
  v_received numeric;
  v_change numeric := 0;
begin
  if v_method not in ('CASH', 'CARD') then
    raise exception 'Ödeme yöntemi seçmelisiniz.';
  end if;

  select * into v_order from public.orders where id = p_order_id for update;
  if v_order.id is null then
    raise exception 'Sipariş bulunamadı.';
  end if;

  if v_order.order_status in ('DELIVERED', 'CANCELLED') then
    raise exception 'Kapanmış siparişe ödeme alınamaz.';
  end if;

  v_paid := private.order_paid(v_order.id);
  v_outstanding := round(v_order.total_amount - v_paid, 2);

  if v_outstanding <= 0.005 then
    raise exception 'Bu sipariş için ödeme tamamlanmış.';
  end if;

  if v_method = 'CASH' then
    if p_received_amount is null or p_received_amount < v_outstanding then
      raise exception 'Alınan para kalan tutardan düşük olamaz.';
    end if;
    v_received := round(p_received_amount, 2);
    v_change := round(v_received - v_outstanding, 2);
  else
    v_received := v_outstanding;
    v_change := 0;
  end if;

  insert into public.payments (
    order_id, payment_type, payment_method, amount,
    received_amount, change_amount, created_by_staff_id, note
  ) values (
    v_order.id, 'PAYMENT', v_method, v_outstanding,
    v_received, v_change, v_staff.id, nullif(btrim(coalesce(p_note, '')), '')
  );

  update public.orders set payment_status = 'PAID' where id = v_order.id;

  perform private.log_event(
    v_order.id, 'PAYMENT_RECEIVED', v_order.payment_status, 'PAID', v_staff.id
  );

  return jsonb_build_object(
    'paidAmount', v_outstanding,
    'changeAmount', v_change,
    'paymentStatus', 'PAID'
  );
end;
$$;

create or replace function public.staff_refund_order(
  p_token text,
  p_order_id uuid,
  p_method text,
  p_amount numeric,
  p_reason text
)
returns boolean
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_staff public.staff_accounts := private.require_staff(p_token, array['MANAGER']);
  v_order public.orders;
  v_method text := upper(coalesce(p_method, ''));
  v_reason text := private.require_reason(p_reason, 'İade nedeni');
  v_paid numeric;
  v_remaining numeric;
begin
  if v_method not in ('CASH', 'CARD') then
    raise exception 'İade yöntemi seçmelisiniz.';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'İade tutarı sıfırdan büyük olmalıdır.';
  end if;

  select * into v_order from public.orders where id = p_order_id for update;
  if v_order.id is null then
    raise exception 'Sipariş bulunamadı.';
  end if;

  v_paid := private.order_paid(v_order.id);
  if p_amount > v_paid + 0.005 then
    raise exception 'İade tutarı alınan ödemeden büyük olamaz.';
  end if;

  insert into public.payments (
    order_id, payment_type, payment_method, amount,
    created_by_staff_id, note
  ) values (
    v_order.id, 'REFUND', v_method, round(p_amount, 2), v_staff.id, v_reason
  );

  v_remaining := round(v_paid - p_amount, 2);

  update public.orders
     set payment_status = case
       when v_order.order_status = 'CANCELLED' and v_remaining <= 0.005 then 'REFUNDED'
       when v_order.order_status = 'CANCELLED' then 'REFUND_PENDING'
       when v_remaining <= 0.005 then 'REFUNDED'
       when v_remaining >= v_order.total_amount - 0.005 then 'PAID'
       else 'REFUND_PENDING'
     end
   where id = v_order.id;

  perform private.log_event(
    v_order.id, 'REFUND_ISSUED', v_order.payment_status, v_remaining::text, v_staff.id
  );

  return true;
end;
$$;

create or replace function public.staff_cancel_order(
  p_token text,
  p_order_id uuid,
  p_reason text
)
returns boolean
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_staff public.staff_accounts := private.require_staff(p_token, array['MANAGER']);
  v_order public.orders;
  v_reason text := private.require_reason(p_reason, 'İptal nedeni');
  v_paid numeric;
begin
  select * into v_order from public.orders where id = p_order_id for update;
  if v_order.id is null then
    raise exception 'Sipariş bulunamadı.';
  end if;

  if v_order.order_status = 'DELIVERED' then
    raise exception 'Teslim edilmiş sipariş iptal edilemez.';
  end if;
  if v_order.order_status = 'CANCELLED' then
    raise exception 'Bu sipariş zaten iptal edilmiş.';
  end if;

  v_paid := private.order_paid(v_order.id);

  insert into public.order_cancellations (order_id, reason, cancelled_by_staff_id)
  values (v_order.id, v_reason, v_staff.id);

  update public.orders
     set order_status = 'CANCELLED',
         payment_status = case when v_paid > 0.005 then 'REFUND_PENDING' else payment_status end
   where id = v_order.id;

  perform private.log_event(v_order.id, 'ORDER_CANCELLED', v_order.order_status, v_reason, v_staff.id);
  return true;
end;
$$;

create or replace function public.staff_adjust_order(
  p_token text,
  p_order_id uuid,
  p_items jsonb,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_staff public.staff_accounts := private.require_staff(p_token, array['MANAGER']);
  v_order public.orders;
  v_reason text := private.require_reason(p_reason, 'Düzeltme nedeni');
  v_total numeric(12, 2) := 0;
  v_old_items jsonb;
  v_line record;
begin
  select * into v_order from public.orders where id = p_order_id for update;
  if v_order.id is null then
    raise exception 'Sipariş bulunamadı.';
  end if;

  if v_order.order_status in ('DELIVERED', 'CANCELLED') then
    raise exception 'Kapanmış sipariş düzeltilemez.';
  end if;

  v_old_items := private.staff_order_items_json(v_order.id, true);

  delete from public.order_items where order_id = v_order.id;

  for v_line in select * from private.load_items(p_items)
  loop
    insert into public.order_items (
      order_id, product_id, product_name_snapshot, category_name_snapshot,
      unit_price_snapshot, quantity, line_note, line_total
    ) values (
      v_order.id, v_line.product_id, v_line.product_name, v_line.category_name,
      v_line.unit_price, v_line.quantity, v_line.line_note, v_line.line_total
    );
    v_total := v_total + v_line.line_total;
  end loop;

  update public.orders set total_amount = v_total where id = v_order.id;

  perform private.log_event(
    v_order.id,
    'ORDER_ADJUSTED',
    v_old_items::text || ' | toplam: ' || v_order.total_amount::text,
    v_total::text || ' | neden: ' || v_reason,
    v_staff.id
  );

  return jsonb_build_object(
    'totalAmount', v_total,
    'paidAmount', private.order_paid(v_order.id),
    'reason', v_reason
  );
end;
$$;

create or replace function public.staff_report_problem(
  p_token text,
  p_order_id uuid,
  p_problem_type text,
  p_note text default null
)
returns boolean
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_staff public.staff_accounts := private.require_staff(p_token, array['KITCHEN', 'CASHIER', 'MANAGER']);
  v_order public.orders;
  v_type text := upper(coalesce(p_problem_type, ''));
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  if v_type not in ('OUT_OF_STOCK', 'MISSING_INGREDIENT', 'NOTE_UNCLEAR', 'EQUIPMENT_BUSY', 'WONT_MAKE_BREAK', 'OTHER') then
    raise exception 'Geçersiz sorun türü.';
  end if;
  if v_note is not null and length(v_note) > 500 then
    raise exception 'Sorun açıklaması en fazla 500 karakter olabilir.';
  end if;

  select * into v_order from public.orders where id = p_order_id;
  if v_order.id is null then
    raise exception 'Sipariş bulunamadı.';
  end if;
  if v_order.order_status in ('DELIVERED', 'CANCELLED') then
    raise exception 'Kapanmış siparişe sorun bildirilemez.';
  end if;

  insert into public.order_problems (order_id, problem_type, note, reported_by_staff_id)
  values (v_order.id, v_type, v_note, v_staff.id);

  perform private.log_event(v_order.id, 'PROBLEM_REPORTED', null, v_type, v_staff.id);
  return true;
end;
$$;

create or replace function public.staff_mark_informed(p_token text, p_problem_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_staff public.staff_accounts := private.require_staff(p_token, array['CASHIER', 'MANAGER']);
  v_problem public.order_problems;
begin
  select * into v_problem from public.order_problems where id = p_problem_id for update;
  if v_problem.id is null then
    raise exception 'Sorun kaydı bulunamadı.';
  end if;

  update public.order_problems
     set informed_at = coalesce(informed_at, now()),
         informed_by_staff_id = coalesce(informed_by_staff_id, v_staff.id)
   where id = v_problem.id;

  perform private.log_event(v_problem.order_id, 'PROBLEM_INFORMED', null, v_problem.problem_type, v_staff.id);
  return true;
end;
$$;

create or replace function public.staff_clear_problem(p_token text, p_problem_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_staff public.staff_accounts := private.require_staff(p_token, array['CASHIER', 'MANAGER']);
  v_problem public.order_problems;
begin
  select * into v_problem from public.order_problems where id = p_problem_id for update;
  if v_problem.id is null then
    raise exception 'Sorun kaydı bulunamadı.';
  end if;

  update public.order_problems
     set cleared_at = coalesce(cleared_at, now()),
         cleared_by_staff_id = coalesce(cleared_by_staff_id, v_staff.id)
   where id = v_problem.id;

  perform private.log_event(v_problem.order_id, 'PROBLEM_CLEARED', v_problem.problem_type, null, v_staff.id);
  return true;
end;
$$;

create or replace function public.staff_set_priority_override(
  p_token text,
  p_order_id uuid,
  p_priority boolean,
  p_reason text
)
returns boolean
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_staff public.staff_accounts := private.require_staff(p_token, array['MANAGER']);
  v_order public.orders;
  v_reason text;
begin
  select * into v_order from public.orders where id = p_order_id for update;
  if v_order.id is null then
    raise exception 'Sipariş bulunamadı.';
  end if;
  if v_order.order_status in ('DELIVERED', 'CANCELLED') then
    raise exception 'Kapanmış siparişe öncelik verilemez.';
  end if;

  if coalesce(p_priority, false) then
    v_reason := private.require_reason(p_reason, 'Öncelik nedeni');
  else
    v_reason := null;
  end if;

  update public.orders
     set priority_override = coalesce(p_priority, false),
         priority_override_reason = v_reason
   where id = v_order.id;

  perform private.log_event(
    v_order.id,
    'PRIORITY_CHANGED',
    v_order.priority_override::text,
    coalesce(p_priority, false)::text || coalesce(' | ' || v_reason, ''),
    v_staff.id
  );

  return true;
end;
$$;
