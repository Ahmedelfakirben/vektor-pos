-- ==============================================================================
-- FIX: AGREGAR COLUMNAS DELETED_AT A CATEGORÍAS, PRODUCTOS Y PEDIDOS
-- ==============================================================================
-- Instrucciones:
-- 1. Abre el panel de tu proyecto Supabase: http://supabasekong-ck8o0kswcg8wo8w0ko8occck.95.217.8.39.sslip.io (o supabase dashboard)
-- 2. Ve a SQL Editor -> New Query.
-- 3. Pega este contenido y presiona "Run".
-- ==============================================================================

-- 1. Agregar columna deleted_at a categories
ALTER TABLE public.categories ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_categories_deleted_at ON public.categories(deleted_at);

-- 2. Agregar columna deleted_at a products
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_products_deleted_at ON public.products(deleted_at);

-- 3. Agregar columna deleted_at a orders
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_orders_deleted_at ON public.orders(deleted_at);

-- 4. Asegurar permisos para el rol authenticated
GRANT ALL ON TABLE public.categories TO authenticated;
GRANT ALL ON TABLE public.products TO authenticated;
GRANT ALL ON TABLE public.product_sizes TO authenticated;
GRANT ALL ON TABLE public.orders TO authenticated;

-- 5. Notificar a PostgREST para recargar la caché de schema inmediatamente
NOTIFY pgrst, 'reload schema';
