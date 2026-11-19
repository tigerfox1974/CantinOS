-- =====================================================================
-- OKUL BÜFESİ — 0005 Herkese açık RPC'ler
-- =====================================================================

create or replace function public.get_public_menu()
returns jsonb
language sql
stable
security definer
set search_path = public, extensions, pg_temp
as $$
  select jsonb_build_object(
    'onlineOrderingEnabled',
      coalesce((select value = 'true' from public.system_settings where key = 'online_ordering_enabled'), false),
    'categories',
      coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'id', c.id,
            'name', c.name,
            'sortOrder', c.sort_order,
            'products', coalesce((
              select jsonb_agg(
                jsonb_build_object(
                  'id', p.id,
                  'name', p.name,
                  'description', p.description,
                  'price', p.price,
                  'imageUrl', p.image_url,
                  'sortOrder', p.sort_order,
                  'availabilityStatus', p.availability_status,
                  'availabilityNote',
                    case
                      when p.availability_status = 'CLOSED' and p.availability_note_public then p.availability_note
                      else null
                    end
                )
                order by p.sort_order, p.name
              )
              from public.products p
              where p.category_id = c.id
                and p.availability_status <> 'ARCHIVED'
            ), '[]'::jsonb)
          )
          order by c.sort_order, c.name
        )
        from public.categories c
        where c.is_archived = false
          and exists (
            select 1 from public.products p
            where p.category_id = c.id and p.availability_status <> 'ARCHIVED'
          )
      ), '[]'::jsonb)
  );
$$;

create or replace function public.get_public_delivery_slots()
returns jsonb
language sql
stable
security definer
set search_path = public, extensions, pg_temp
as $$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', s.id,
        'label', s.label,
        'targetTime', to_char(s.target_time, 'HH24:MI'),
        'targetAt', ((private.today_local() + s.target_time) at time zone 'Asia/Nicosia'),
        'sortOrder', s.sort_order,
        'available', ((private.today_local() + s.target_time) at time zone 'Asia/Nicosia') > now()
      )
      order by s.sort_order, s.label
    ),
    '[]'::jsonb
  )
  from public.delivery_slots s
  where s.active = true;
$$;

create or replace function public.create_online_order(
  p_customer_name text,
  p_customer_phone text,
  p_delivery jsonb,
  p_note text,
  p_items jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_enabled boolean;
  v_name text := btrim(coalesce(p_customer_name, ''));
  v_phone text := btrim(coalesce(p_customer_phone, ''));
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_order_id uuid := gen_random_uuid();
  v_number bigint;
  v_token text;
  v_label text;
  v_target timestamptz;
  v_total numeric(12, 2) := 0;
  v_line record;
begin
  select value = 'true' into v_enabled
    from public.system_settings where key = 'online_ordering_enabled';

  if coalesce(v_enabled, false) = false then
    raise exception 'Şu an online siparişe kapalıyız. Lütfen daha sonra tekrar deneyin.';
  end if;

  if length(v_name) < 2 then
    raise exception 'Ad Soyad en az 2 karakter olmalıdır.';
  end if;
  if length(v_name) > 80 then
    raise exception 'Ad Soyad en fazla 80 karakter olabilir.';
  end if;

  if length(v_phone) < 7 then
    raise exception 'Telefon en az 7 karakter olmalıdır.';
  end if;
  if length(v_phone) > 20 then
    raise exception 'Telefon en fazla 20 karakter olabilir.';
  end if;

  if v_note is not null and length(v_note) > 500 then
    raise exception 'Sipariş notu en fazla 500 karakter olabilir.';
  end if;

  select d.delivery_label, d.target_at into v_label, v_target
    from private.resolve_delivery(p_delivery) d;

  v_number := nextval('public.order_number_seq');
  v_token := encode(gen_random_bytes(24), 'hex');

  insert into public.orders (
    id, order_number, source, customer_name, customer_phone,
    delivery_label, target_delivery_at, general_note,
    order_status, payment_status, total_amount, tracking_token
  ) values (
    v_order_id, v_number, 'ONLINE', v_name, v_phone,
    v_label, v_target, v_note,
    'NEW', 'WAITING', 0, v_token
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
    v_total := v_total + v_line.line_total;
  end loop;

  update public.orders set total_amount = v_total where id = v_order_id;

  perform private.log_event(v_order_id, 'ORDER_CREATED', null, 'ONLINE', null);

  return jsonb_build_object(
    'orderId', v_order_id,
    'orderNumber', v_number,
    'trackingToken', v_token,
    'trackingPath', '/takip/' || v_number::text || '/' || v_token,
    'totalAmount', v_total,
    'targetDeliveryAt', v_target,
    'deliveryLabel', v_label,
    'createdAt', now()
  );
end;
$$;

create or replace function public.track_order(p_order_number bigint, p_tracking_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_order public.orders;
begin
  if p_order_number is null or p_tracking_token is null or length(btrim(p_tracking_token)) < 16 then
    return null;
  end if;

  select * into v_order
    from public.orders
   where order_number = p_order_number
     and tracking_token = btrim(p_tracking_token)
   limit 1;

  if v_order.id is null then
    return null;
  end if;

  if v_order.tracking_expires_at is not null and now() > v_order.tracking_expires_at then
    return jsonb_build_object('expired', true, 'order', null);
  end if;

  return jsonb_build_object(
    'expired', false,
    'order', jsonb_build_object(
      'orderNumber', v_order.order_number,
      'status', v_order.order_status,
      'paymentStatus', v_order.payment_status,
      'totalAmount', v_order.total_amount,
      'deliveryLabel', v_order.delivery_label,
      'targetDeliveryAt', v_order.target_delivery_at,
      'generalNote', v_order.general_note,
      'createdAt', v_order.created_at,
      'updatedAt', v_order.updated_at,
      'deliveredAt', v_order.delivered_at,
      'items', coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'productName', i.product_name_snapshot,
            'quantity', i.quantity,
            'lineNote', i.line_note,
            'unitPrice', i.unit_price_snapshot,
            'lineTotal', i.line_total
          )
          order by i.created_at, i.product_name_snapshot
        )
        from public.order_items i
        where i.order_id = v_order.id
      ), '[]'::jsonb)
    )
  );
end;
$$;

create or replace function public.public_display_orders()
returns jsonb
language sql
stable
security definer
set search_path = public, extensions, pg_temp
as $$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'orderNumber', o.order_number,
        'status', o.order_status,
        'updatedAt', o.updated_at
      )
      order by o.updated_at
    ),
    '[]'::jsonb
  )
  from public.orders o
  where o.order_status in ('PREPARING', 'READY');
$$;
