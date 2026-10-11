CREATE TABLE public.orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id uuid REFERENCES public.listings(id) ON DELETE SET NULL,
  item_id uuid,
  seller_id uuid NOT NULL,
  buyer_id uuid,
  item_name text NOT NULL DEFAULT '',
  price numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending',
  carrier text,
  tracking_number text,
  ship_to jsonb,
  shipped_at timestamptz,
  delivered_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.orders TO authenticated;
GRANT ALL ON public.orders TO service_role;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "seller buyer admin read orders" ON public.orders FOR SELECT TO authenticated
  USING (auth.uid() = seller_id OR auth.uid() = buyer_id OR public.has_role(auth.uid(), 'admin'));
CREATE INDEX orders_seller_idx ON public.orders(seller_id, created_at DESC);
CREATE TRIGGER orders_touch BEFORE UPDATE ON public.orders FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE public.order_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  status text NOT NULL,
  note text,
  source text NOT NULL DEFAULT 'merchant',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.order_events TO authenticated;
GRANT ALL ON public.order_events TO service_role;
ALTER TABLE public.order_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "order parties read events" ON public.order_events FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_id AND (o.seller_id = auth.uid() OR o.buyer_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))));

CREATE OR REPLACE FUNCTION public.merchant_update_order(_id uuid, _status text, _carrier text DEFAULT NULL, _tracking text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE o public.orders;
BEGIN
  SELECT * INTO o FROM public.orders WHERE id = _id FOR UPDATE;
  IF o.id IS NULL OR o.seller_id <> auth.uid() THEN RAISE EXCEPTION 'Not allowed'; END IF;
  IF NOT (
    (o.status = 'pending' AND _status IN ('accepted','declined')) OR
    (o.status = 'accepted' AND _status IN ('shipped','cancelled')) OR
    (o.status = 'shipped' AND _status IN ('refunded'))
  ) THEN RAISE EXCEPTION 'Cannot change a % order to %', o.status, _status; END IF;
  UPDATE public.orders SET status = _status,
    carrier = COALESCE(_carrier, carrier), tracking_number = COALESCE(_tracking, tracking_number),
    shipped_at = CASE WHEN _status = 'shipped' THEN now() ELSE shipped_at END
  WHERE id = _id;
  IF _status IN ('declined','cancelled','refunded') AND o.listing_id IS NOT NULL THEN
    UPDATE public.listings SET status = 'active' WHERE id = o.listing_id AND status = 'sold';
  END IF;
  INSERT INTO public.order_events(order_id, status, source) VALUES (_id, _status, 'merchant');
END $$;
GRANT EXECUTE ON FUNCTION public.merchant_update_order(uuid, text, text, text) TO authenticated;