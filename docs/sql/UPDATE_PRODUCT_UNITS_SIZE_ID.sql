-- ==============================================================================
-- SOPORTE DE CÓDIGOS DE BARRA INDIVIDUALES POR UNIDAD (PRODUCT_UNITS)
-- ==============================================================================
-- Ejecutar este script en el SQL Editor de tu Supabase: https://hichousupabase.elfakir.com
-- ==============================================================================

-- 1. Crear tabla product_units si no existiera
CREATE TABLE IF NOT EXISTS public.product_units (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    size_id UUID REFERENCES public.product_sizes(id) ON DELETE CASCADE,
    individual_barcode TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'available' CHECK (status IN ('available', 'sold', 'reserved')),
    sold_at TIMESTAMPTZ,
    sold_in_order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Asegurar columna size_id si la tabla ya existía
ALTER TABLE public.product_units 
ADD COLUMN IF NOT EXISTS size_id UUID REFERENCES public.product_sizes(id) ON DELETE CASCADE;

-- 3. Crear índices para búsquedas ultra rápidas al escanear y filtrar
CREATE INDEX IF NOT EXISTS idx_product_units_product_id ON public.product_units(product_id);
CREATE INDEX IF NOT EXISTS idx_product_units_size_id ON public.product_units(size_id);
CREATE INDEX IF NOT EXISTS idx_product_units_barcode ON public.product_units(individual_barcode);
CREATE INDEX IF NOT EXISTS idx_product_units_status ON public.product_units(status);

-- 4. Políticas RLS permisivas para authenticated y anon
ALTER TABLE public.product_units ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view product units" ON public.product_units;
CREATE POLICY "Users can view product units" 
ON public.product_units FOR SELECT 
TO public 
USING (true);

DROP POLICY IF EXISTS "Users can manage product units" ON public.product_units;
CREATE POLICY "Users can manage product units" 
ON public.product_units FOR ALL 
TO public 
USING (true) 
WITH CHECK (true);

GRANT ALL ON public.product_units TO authenticated;
GRANT ALL ON public.product_units TO anon;
GRANT ALL ON public.product_units TO service_role;

