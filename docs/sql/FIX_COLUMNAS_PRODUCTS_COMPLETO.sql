-- ==============================================================================
-- FIX: AGREGAR TODAS LAS COLUMNAS FALTANTES A LA TABLA PRODUCTS
-- ==============================================================================
-- Instrucciones:
-- 1. Abre el panel de tu Supabase -> SQL Editor -> New Query.
-- 2. Pega este script y presiona "Run".
-- ==============================================================================

-- 1. Columnas de auditoría y trazabilidad
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS validated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS needs_validation BOOLEAN DEFAULT false;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

-- 2. Precios de compra y promociones
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS purchase_price DECIMAL(10,2) DEFAULT 0;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS is_promo BOOLEAN DEFAULT false;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS promo_price DECIMAL(10,2);

-- 3. Código de barras y borrado lógico
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS barcode TEXT;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- 4. Índices
CREATE INDEX IF NOT EXISTS idx_products_barcode ON public.products(barcode);
CREATE INDEX IF NOT EXISTS idx_products_created_by ON public.products(created_by);
CREATE INDEX IF NOT EXISTS idx_products_deleted_at ON public.products(deleted_at);

-- 5. Permisos
GRANT ALL ON TABLE public.products TO authenticated;

-- 6. Recargar caché de PostgREST inmediatamente
NOTIFY pgrst, 'reload schema';
