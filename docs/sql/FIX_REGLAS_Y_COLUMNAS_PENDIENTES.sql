-- ==============================================================================
-- FIX DEFINITIVO: TODAS LAS COLUMNAS Y TABLAS RESTANTES (AUDITORÍA 100% OK)
-- ==============================================================================
-- Instrucciones:
-- 1. Abre Supabase -> SQL Editor -> New Query.
-- 2. Pega este script completo y haz clic en "Run".
-- ==============================================================================

-- 1. Tablas existentes: Columnas faltantes para ventas, costos y empresa
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS payment_status TEXT DEFAULT 'paid';
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS amount_paid DECIMAL(10,2) DEFAULT 0;

ALTER TABLE public.order_items ADD COLUMN IF NOT EXISTS purchase_price DECIMAL(10,2) DEFAULT 0;

ALTER TABLE public.company_settings ADD COLUMN IF NOT EXISTS instagram_link TEXT;

-- 2. Tabla de caché para escáner de códigos de barras (barcode_cache)
CREATE TABLE IF NOT EXISTS public.barcode_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  barcode TEXT UNIQUE NOT NULL,
  product_name TEXT,
  brand TEXT,
  description TEXT,
  category TEXT,
  image_url TEXT,
  api_source TEXT DEFAULT 'ean-search',
  last_updated TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_barcode_cache_barcode ON public.barcode_cache(barcode);
ALTER TABLE public.barcode_cache ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Barcode Cache All" ON public.barcode_cache;
CREATE POLICY "Barcode Cache All" ON public.barcode_cache FOR ALL TO authenticated USING (true) WITH CHECK (true);
GRANT ALL ON public.barcode_cache TO authenticated;

-- 3. Tablas de Tienda Online / Pedidos Web
CREATE TABLE IF NOT EXISTS public.customer_profiles (
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  full_name TEXT,
  phone TEXT,
  default_address TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.customer_profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Customer Profiles All" ON public.customer_profiles;
CREATE POLICY "Customer Profiles All" ON public.customer_profiles FOR ALL TO authenticated USING (true) WITH CHECK (true);
GRANT ALL ON public.customer_profiles TO authenticated;

CREATE TABLE IF NOT EXISTS public.online_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number SERIAL,
  customer_id UUID REFERENCES public.customer_profiles(id) ON DELETE CASCADE,
  total DECIMAL(10,2) NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  delivery_address TEXT,
  delivery_notes TEXT,
  payment_method TEXT,
  payment_status TEXT DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.online_orders ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Online Orders All" ON public.online_orders;
CREATE POLICY "Online Orders All" ON public.online_orders FOR ALL TO authenticated USING (true) WITH CHECK (true);
GRANT ALL ON public.online_orders TO authenticated;

CREATE TABLE IF NOT EXISTS public.order_items_online (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID REFERENCES public.online_orders(id) ON DELETE CASCADE,
  product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
  product_name TEXT NOT NULL,
  product_size TEXT,
  quantity INTEGER NOT NULL,
  unit_price DECIMAL(10,2) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.order_items_online ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Order Items Online All" ON public.order_items_online;
CREATE POLICY "Order Items Online All" ON public.order_items_online FOR ALL TO authenticated USING (true) WITH CHECK (true);
GRANT ALL ON public.order_items_online TO authenticated;

-- 4. Notificar a PostgREST para recargar la caché inmediatamente
NOTIFY pgrst, 'reload schema';
