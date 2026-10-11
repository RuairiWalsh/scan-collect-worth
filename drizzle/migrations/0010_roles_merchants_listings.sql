CREATE TYPE public.app_role AS ENUM ('admin', 'merchant', 'user');

CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE POLICY "read own roles" ON public.user_roles FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.merchant_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  store_name text NOT NULL,
  about text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  created_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz,
  reviewed_by uuid
);
GRANT SELECT, INSERT ON public.merchant_applications TO authenticated;
GRANT ALL ON public.merchant_applications TO service_role;
ALTER TABLE public.merchant_applications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read own or admin applications" ON public.merchant_applications FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "submit own application" ON public.merchant_applications FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id AND status = 'pending');

CREATE TABLE public.listings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id uuid NOT NULL REFERENCES public.items(id) ON DELETE CASCADE,
  seller_id uuid NOT NULL DEFAULT auth.uid(),
  price numeric NOT NULL CHECK (price > 0),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','sold','removed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX listings_one_active_per_item ON public.listings(item_id) WHERE status = 'active';
GRANT SELECT, INSERT, UPDATE, DELETE ON public.listings TO authenticated;
GRANT ALL ON public.listings TO service_role;
ALTER TABLE public.listings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read active or own listings" ON public.listings FOR SELECT TO authenticated
  USING (status = 'active' OR auth.uid() = seller_id OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "merchants list own items" ON public.listings FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = seller_id AND public.has_role(auth.uid(), 'merchant')
    AND EXISTS (SELECT 1 FROM public.items i WHERE i.id = item_id AND i.user_id = auth.uid()));
CREATE POLICY "merchants update own listings" ON public.listings FOR UPDATE TO authenticated
  USING (auth.uid() = seller_id) WITH CHECK (auth.uid() = seller_id AND status IN ('active','removed'));
CREATE POLICY "merchants delete own listings" ON public.listings FOR DELETE TO authenticated
  USING (auth.uid() = seller_id);
CREATE TRIGGER listings_touch BEFORE UPDATE ON public.listings FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Marketplace view of active listings (items are otherwise private to their owner)
CREATE OR REPLACE FUNCTION public.market_listings()
RETURNS TABLE (listing_id uuid, price numeric, created_at timestamptz, seller_id uuid, store_name text,
  item_id uuid, name text, category text, set_name text, number text, variant text, condition text,
  grader text, grade text, image text, est_value numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT l.id, l.price, l.created_at, l.seller_id,
    (SELECT a.store_name FROM public.merchant_applications a WHERE a.user_id = l.seller_id AND a.status = 'approved' ORDER BY a.created_at DESC LIMIT 1),
    i.id, i.name, i.category, i.set_name, i.number, i.variant, i.condition, i.grader, i.grade,
    COALESCE(i.official_image, i.thumbnail), i.est_value
  FROM public.listings l JOIN public.items i ON i.id = l.item_id
  WHERE l.status = 'active' AND auth.uid() IS NOT NULL
  ORDER BY l.created_at DESC
$$;
REVOKE EXECUTE ON FUNCTION public.market_listings() FROM anon, public;
GRANT EXECUTE ON FUNCTION public.market_listings() TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_review_application(_id uuid, _approve boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Not allowed'; END IF;
  UPDATE public.merchant_applications SET status = CASE WHEN _approve THEN 'approved' ELSE 'rejected' END,
    reviewed_at = now(), reviewed_by = auth.uid()
  WHERE id = _id RETURNING user_id INTO _uid;
  IF _approve AND _uid IS NOT NULL THEN
    INSERT INTO public.user_roles(user_id, role) VALUES (_uid, 'merchant') ON CONFLICT DO NOTHING;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.admin_set_role(_user uuid, _role public.app_role, _enabled boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Not allowed'; END IF;
  IF _role = 'admin' AND NOT _enabled AND _user = auth.uid() THEN RAISE EXCEPTION 'You cannot remove your own admin role'; END IF;
  IF _enabled THEN
    INSERT INTO public.user_roles(user_id, role) VALUES (_user, _role) ON CONFLICT DO NOTHING;
  ELSE
    DELETE FROM public.user_roles WHERE user_id = _user AND role = _role;
    IF _role = 'merchant' THEN UPDATE public.listings SET status = 'removed' WHERE seller_id = _user AND status = 'active'; END IF;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.admin_users()
RETURNS TABLE (user_id uuid, email text, created_at timestamptz, last_sign_in_at timestamptz,
  roles text[], item_count bigint, collection_value numeric)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Not allowed'; END IF;
  RETURN QUERY
  SELECT u.id, u.email::text, u.created_at, u.last_sign_in_at,
    COALESCE((SELECT array_agg(r.role::text ORDER BY r.role) FROM public.user_roles r WHERE r.user_id = u.id), '{}'),
    (SELECT count(*) FROM public.items i WHERE i.user_id = u.id AND i.status = 'collection'),
    (SELECT COALESCE(sum(i.est_value * i.quantity), 0) FROM public.items i WHERE i.user_id = u.id AND i.status = 'collection')
  FROM auth.users u ORDER BY u.created_at DESC;
END $$;

CREATE OR REPLACE FUNCTION public.admin_stats()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Not allowed'; END IF;
  RETURN jsonb_build_object(
    'users', (SELECT count(*) FROM auth.users),
    'new_users_7d', (SELECT count(*) FROM auth.users WHERE created_at > now() - interval '7 days'),
    'active_users_7d', (SELECT count(*) FROM auth.users WHERE last_sign_in_at > now() - interval '7 days'),
    'items', (SELECT count(*) FROM public.items WHERE status = 'collection'),
    'scans_7d', (SELECT count(*) FROM public.items WHERE created_at > now() - interval '7 days'),
    'collection_value', (SELECT COALESCE(sum(est_value * quantity), 0) FROM public.items WHERE status = 'collection'),
    'tracked_cards', (SELECT count(*) FROM public.catalog_prices),
    'prices_updated_at', (SELECT max(updated_at) FROM public.catalog_prices),
    'merchants', (SELECT count(*) FROM public.user_roles WHERE role = 'merchant'),
    'pending_applications', (SELECT count(*) FROM public.merchant_applications WHERE status = 'pending'),
    'active_listings', (SELECT count(*) FROM public.listings WHERE status = 'active'),
    'listed_value', (SELECT COALESCE(sum(price), 0) FROM public.listings WHERE status = 'active'),
    'by_category', (SELECT COALESCE(jsonb_object_agg(category, n), '{}') FROM (SELECT category, count(*) n FROM public.items WHERE status = 'collection' GROUP BY category) c)
  );
END $$;

REVOKE EXECUTE ON FUNCTION public.admin_review_application(uuid, boolean) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.admin_set_role(uuid, public.app_role, boolean) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.admin_users() FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.admin_stats() FROM anon, public;
GRANT EXECUTE ON FUNCTION public.admin_review_application(uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_role(uuid, public.app_role, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_users() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_stats() TO authenticated;

-- First admin: rory@datroai.com, now or whenever that account signs up
CREATE OR REPLACE FUNCTION public.grant_founding_admin()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF lower(NEW.email) = 'rory@datroai.com' THEN
    INSERT INTO public.user_roles(user_id, role) VALUES (NEW.id, 'admin') ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER on_auth_user_founding_admin AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.grant_founding_admin();
INSERT INTO public.user_roles(user_id, role)
  SELECT id, 'admin' FROM auth.users WHERE lower(email) = 'rory@datroai.com' ON CONFLICT DO NOTHING;