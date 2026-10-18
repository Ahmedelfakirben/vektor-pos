-- ==============================================================================
-- FIX DEFINITIVO DE IMÁGENES Y STORAGE (LINVENTORY / SUPABASE)
-- ==============================================================================
-- Ejecutar este script en el SQL Editor de tu Supabase: https://hichousupabase.elfakir.com
-- ==============================================================================

-- 1. ASEGURAR QUE EL BUCKET 'product-images' EXISTE Y ES 100% PÚBLICO
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'product-images',
    'product-images',
    true,
    52428800, -- 50MB
    ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/svg+xml']
)
ON CONFLICT (id) DO UPDATE SET 
    public = true,
    file_size_limit = 52428800;

-- 2. POLÍTICAS DE ACCESO PARA STORAGE (LECTURA PÚBLICA Y ESCRITURA EMPLEADOS/AUTH)
DROP POLICY IF EXISTS "Public Read Product Images" ON storage.objects;
CREATE POLICY "Public Read Product Images" 
ON storage.objects FOR SELECT 
USING (bucket_id = 'product-images');

DROP POLICY IF EXISTS "Authenticated Upload Product Images" ON storage.objects;
CREATE POLICY "Authenticated Upload Product Images" 
ON storage.objects FOR INSERT 
TO authenticated 
WITH CHECK (bucket_id = 'product-images');

DROP POLICY IF EXISTS "Authenticated Update Product Images" ON storage.objects;
CREATE POLICY "Authenticated Update Product Images" 
ON storage.objects FOR UPDATE 
TO authenticated 
USING (bucket_id = 'product-images');

DROP POLICY IF EXISTS "Authenticated Delete Product Images" ON storage.objects;
CREATE POLICY "Authenticated Delete Product Images" 
ON storage.objects FOR DELETE 
TO authenticated 
USING (bucket_id = 'product-images');

-- 3. PERMISOS Y POLÍTICAS EN LA TABLA public.product_images
ALTER TABLE public.product_images ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "View Product Images All" ON public.product_images;
CREATE POLICY "View Product Images All" 
ON public.product_images FOR SELECT 
USING (true);

DROP POLICY IF EXISTS "Manage Product Images Insert" ON public.product_images;
DROP POLICY IF EXISTS "Manage Product Images Update" ON public.product_images;
DROP POLICY IF EXISTS "Manage Product Images Delete" ON public.product_images;
DROP POLICY IF EXISTS "Manage Product Images All" ON public.product_images;

CREATE POLICY "Manage Product Images All" 
ON public.product_images FOR ALL 
TO authenticated 
USING (true) 
WITH CHECK (true);

-- 4. ACTUALIZAR CUALQUIER URL VIEJA (HTTP / KONG) A LA NUEVA URL HTTPS SEGURA
UPDATE public.products
SET image_url = REPLACE(image_url, 'http://supabasekong-ck8o0kswcg8wo8w0ko8occck.95.217.8.39.sslip.io', 'https://hichousupabase.elfakir.com')
WHERE image_url LIKE '%supabasekong%';

UPDATE public.product_images
SET image_url = REPLACE(image_url, 'http://supabasekong-ck8o0kswcg8wo8w0ko8occck.95.217.8.39.sslip.io', 'https://hichousupabase.elfakir.com')
WHERE image_url LIKE '%supabasekong%';

-- 5. ASIGNAR LA PRIMERA FOTO DE GALERÍA A AQUELLOS PRODUCTOS CUYO image_url ESTÉ VACÍO O NULL
UPDATE public.products p
SET image_url = pi.image_url
FROM (
  SELECT DISTINCT ON (product_id) product_id, image_url 
  FROM public.product_images 
  ORDER BY product_id, display_order ASC, created_at ASC
) pi
WHERE p.id = pi.product_id 
  AND (p.image_url IS NULL OR TRIM(p.image_url) = '');

-- 6. ASOCIAR LAS FOTOS SUBIDAS DEL PRODUCTO ESPECÍFICO (SI EXISTE)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.products WHERE id = 'e5ede546-2c14-4b47-852c-4cfb5c2ec28f') THEN
    UPDATE public.products 
    SET image_url = 'https://hichousupabase.elfakir.com/storage/v1/object/public/product-images/products/e5ede546-2c14-4b47-852c-4cfb5c2ec28f/gallery_1792261222453_0.jpg'
    WHERE id = 'e5ede546-2c14-4b47-852c-4cfb5c2ec28f' 
      AND (image_url IS NULL OR image_url = '');

    INSERT INTO public.product_images (product_id, image_url, display_order)
    VALUES 
      ('e5ede546-2c14-4b47-852c-4cfb5c2ec28f', 'https://hichousupabase.elfakir.com/storage/v1/object/public/product-images/products/e5ede546-2c14-4b47-852c-4cfb5c2ec28f/gallery_1792254570893_0.jpg', 0),
      ('e5ede546-2c14-4b47-852c-4cfb5c2ec28f', 'https://hichousupabase.elfakir.com/storage/v1/object/public/product-images/products/e5ede546-2c14-4b47-852c-4cfb5c2ec28f/gallery_1792261222453_0.jpg', 1)
    ON CONFLICT DO NOTHING;
  END IF;
END $$;
