-- ==============================================================================
-- SCHEMA EXACTO DEFINITIVO - CLIENTE NUEVO (LINVENTORY)
-- ==============================================================================
-- Instrucciones:
-- 1. Abre el panel de tu nuevo Supabase -> SQL Editor -> New Query.
-- 2. Pega TODO este script y haz clic en "Run".
-- ==============================================================================

-- 1. EXTENSIONES
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. ELIMINAR CONSTRAINTS RESTRICTIVOS DE RESTAURANTE QUE CAUSAN ERRORES
ALTER TABLE IF EXISTS public.orders DROP CONSTRAINT IF EXISTS orders_service_type_check;
ALTER TABLE IF EXISTS public.orders DROP CONSTRAINT IF EXISTS orders_status_check;
ALTER TABLE IF EXISTS public.products DROP CONSTRAINT IF EXISTS products_gender_check;
ALTER TABLE IF EXISTS public.products DROP CONSTRAINT IF EXISTS products_season_check;

-- 3. AJUSTAR COLUMNAS EN TABLAS EXISTENTES

-- Categorías
CREATE TABLE IF NOT EXISTS public.categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  description TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  deleted_at TIMESTAMPTZ
);
ALTER TABLE public.categories ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- Productos
CREATE TABLE IF NOT EXISTS public.products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id UUID REFERENCES public.categories(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  base_price DECIMAL(10,2) NOT NULL,
  image_url TEXT DEFAULT '',
  available BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  brand TEXT,
  material TEXT,
  gender TEXT,
  season TEXT,
  stock INTEGER DEFAULT 0,
  barcode TEXT,
  track_individual_units BOOLEAN DEFAULT false,
  purchase_price DECIMAL(10,2) DEFAULT 0,
  needs_validation BOOLEAN DEFAULT false,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  validated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  deleted_at TIMESTAMPTZ,
  is_promo BOOLEAN DEFAULT false,
  promo_price DECIMAL(10,2)
);
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS track_individual_units BOOLEAN DEFAULT false;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS purchase_price DECIMAL(10,2) DEFAULT 0;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS needs_validation BOOLEAN DEFAULT false;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS validated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS is_promo BOOLEAN DEFAULT false;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS promo_price DECIMAL(10,2);
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS barcode TEXT;

-- Tallas de producto
CREATE TABLE IF NOT EXISTS public.product_sizes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  size_name TEXT NOT NULL,
  price_modifier DECIMAL(10,2) DEFAULT 0,
  stock INTEGER DEFAULT 0,
  barcode TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.product_sizes ADD COLUMN IF NOT EXISTS barcode TEXT;
ALTER TABLE public.product_sizes ADD COLUMN IF NOT EXISTS stock INTEGER DEFAULT 0;

-- Clientes
CREATE TABLE IF NOT EXISTS public.customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  loyalty_points INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Mesas / Secciones (Compatibilidad)
CREATE TABLE IF NOT EXISTS public.tables (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  seats INTEGER NOT NULL DEFAULT 4,
  status TEXT NOT NULL DEFAULT 'available',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Pedidos (Orders)
CREATE TABLE IF NOT EXISTS public.orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
  employee_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  status TEXT DEFAULT 'preparing',
  total DECIMAL(10,2) DEFAULT 0,
  payment_method TEXT,
  order_number INTEGER,
  service_type TEXT NOT NULL DEFAULT 'store',
  table_id UUID REFERENCES public.tables(id) ON DELETE SET NULL,
  notes TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  amount_paid DECIMAL(10,2) DEFAULT 0,
  payment_status TEXT DEFAULT 'paid',
  tracking_code TEXT,
  shipping_status TEXT,
  shipping_date_report TIMESTAMPTZ,
  shipping_note TEXT,
  deleted_at TIMESTAMPTZ
);
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS amount_paid DECIMAL(10,2) DEFAULT 0;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS payment_status TEXT DEFAULT 'paid';
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS tracking_code TEXT;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS shipping_status TEXT;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS shipping_date_report TIMESTAMPTZ;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS shipping_note TEXT;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- Líneas de pedido (Order items)
CREATE TABLE IF NOT EXISTS public.order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  size_id UUID REFERENCES public.product_sizes(id) ON DELETE SET NULL,
  quantity INTEGER DEFAULT 1,
  unit_price DECIMAL(10,2) NOT NULL,
  subtotal DECIMAL(10,2) NOT NULL,
  notes TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT now(),
  purchase_price DECIMAL(10,2) DEFAULT 0
);
ALTER TABLE public.order_items ADD COLUMN IF NOT EXISTS purchase_price DECIMAL(10,2) DEFAULT 0;

-- Perfiles de empleados
CREATE TABLE IF NOT EXISTS public.employee_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  role TEXT DEFAULT 'cashier',
  phone TEXT,
  email TEXT,
  active BOOLEAN DEFAULT true,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  is_online BOOLEAN DEFAULT false,
  last_login TIMESTAMPTZ
);
ALTER TABLE public.employee_profiles ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE public.employee_profiles ADD COLUMN IF NOT EXISTS is_online BOOLEAN DEFAULT false;
ALTER TABLE public.employee_profiles ADD COLUMN IF NOT EXISTS last_login TIMESTAMPTZ;

-- Proveedores
CREATE TABLE IF NOT EXISTS public.suppliers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  contact_person TEXT,
  email TEXT,
  phone TEXT,
  address TEXT,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Gastos
DO $$ BEGIN
  CREATE TYPE public.expense_category AS ENUM ('supplier', 'salary', 'rent', 'utilities', 'maintenance', 'other');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS public.expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date DATE NOT NULL,
  category public.expense_category NOT NULL,
  description TEXT NOT NULL,
  amount DECIMAL(10,2) NOT NULL,
  supplier_id UUID REFERENCES public.suppliers(id) ON DELETE SET NULL,
  employee_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  receipt_url TEXT,
  created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Historial de pedidos
CREATE TABLE IF NOT EXISTS public.order_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID REFERENCES public.orders(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  status TEXT NOT NULL,
  total DECIMAL(10,2) NOT NULL,
  items JSONB,
  employee_id UUID REFERENCES public.employee_profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT timezone('UTC'::text, now()) NOT NULL
);

-- Sesiones de caja
CREATE TABLE IF NOT EXISTS public.cash_register_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES public.employee_profiles(id) ON DELETE CASCADE,
  opening_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  opened_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  closing_amount NUMERIC(12,2) NULL,
  closed_at TIMESTAMPTZ NULL,
  status TEXT NOT NULL DEFAULT 'open',
  notes TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Retiros de caja
CREATE TABLE IF NOT EXISTS public.cash_withdrawals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES public.cash_register_sessions(id) ON DELETE CASCADE,
  amount DECIMAL(10, 2) NOT NULL,
  reason TEXT NOT NULL,
  withdrawn_by UUID REFERENCES auth.users(id),
  withdrawn_at TIMESTAMPTZ DEFAULT now(),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Devoluciones (Order returns)
CREATE TABLE IF NOT EXISTS public.order_returns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_item_id UUID REFERENCES public.order_items(id) ON DELETE SET NULL,
  order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL,
  product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
  size_id UUID REFERENCES public.product_sizes(id) ON DELETE SET NULL,
  quantity_returned INTEGER NOT NULL DEFAULT 1,
  unit_price DECIMAL(10,2) NOT NULL,
  total_refund DECIMAL(10,2) NOT NULL,
  reason TEXT DEFAULT '',
  returned_by UUID REFERENCES auth.users(id),
  withdrawal_id UUID REFERENCES public.cash_withdrawals(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Movimientos de stock
CREATE TABLE IF NOT EXISTS public.stock_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID REFERENCES public.products(id) ON DELETE CASCADE,
  size_id UUID REFERENCES public.product_sizes(id) ON DELETE SET NULL,
  quantity INTEGER NOT NULL,
  type TEXT NOT NULL,
  reason TEXT DEFAULT '',
  employee_id UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Historial de eliminados
CREATE TABLE IF NOT EXISTS public.deleted_products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  original_id UUID NOT NULL,
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  category_id UUID,
  base_price DECIMAL(10,2) NOT NULL,
  image_url TEXT DEFAULT '',
  deleted_at TIMESTAMPTZ DEFAULT now(),
  deleted_reason TEXT DEFAULT 'Eliminado por usuario',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.deleted_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL,
  order_number INTEGER,
  total DECIMAL(10, 2) NOT NULL,
  items JSONB NOT NULL,
  deleted_by UUID REFERENCES public.employee_profiles(id) NOT NULL,
  deletion_note TEXT NOT NULL,
  deleted_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Permisos de roles
CREATE TABLE IF NOT EXISTS public.role_permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  role VARCHAR(50) NOT NULL,
  section VARCHAR(100) NOT NULL,
  page_id VARCHAR(100) NOT NULL,
  can_access BOOLEAN DEFAULT true,
  can_confirm_order BOOLEAN DEFAULT true,
  can_validate_order BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(role, section, page_id)
);

-- Ajustes de la empresa
CREATE TABLE IF NOT EXISTS public.company_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_name VARCHAR(255) NOT NULL DEFAULT 'Linventory',
  address TEXT DEFAULT 'Dirección Comercial',
  phone VARCHAR(50) DEFAULT '+34 000 000 000',
  language VARCHAR(20) DEFAULT 'es',
  theme VARCHAR(20) DEFAULT 'amber',
  instagram_link TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.company_settings ADD COLUMN IF NOT EXISTS instagram_link TEXT;

-- Divisas
CREATE TABLE IF NOT EXISTS public.app_currency_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  currency_code VARCHAR(3) NOT NULL DEFAULT 'EUR',
  currency_symbol VARCHAR(5) NOT NULL DEFAULT '€',
  currency_name VARCHAR(50) NOT NULL DEFAULT 'Euro',
  decimal_places INTEGER NOT NULL DEFAULT 2,
  position VARCHAR(10) NOT NULL DEFAULT 'after',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.available_currencies (
  code VARCHAR(3) PRIMARY KEY,
  symbol VARCHAR(5) NOT NULL,
  name VARCHAR(50) NOT NULL,
  decimal_places INTEGER DEFAULT 2,
  symbol_position VARCHAR(10) DEFAULT 'after'
);

-- Backups
CREATE TABLE IF NOT EXISTS public.backup_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT now(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  backup_type VARCHAR(20) DEFAULT 'manual',
  size_mb DECIMAL(10,2) NOT NULL,
  tables_included TEXT[] NOT NULL,
  status VARCHAR(20) DEFAULT 'completed',
  notes TEXT,
  s3_url TEXT,
  file_name VARCHAR(255)
);

CREATE TABLE IF NOT EXISTS public.backup_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tables TEXT[] NOT NULL DEFAULT ARRAY[
    'products', 'categories', 'orders', 'order_items', 'employee_profiles',
    'cash_register_sessions', 'role_permissions', 'company_settings', 'tables'
  ],
  s3_enabled BOOLEAN DEFAULT true,
  schedule_enabled BOOLEAN DEFAULT false,
  schedule_time VARCHAR(5) DEFAULT '02:00',
  schedule_frequency VARCHAR(20) DEFAULT 'daily',
  retention_days INTEGER DEFAULT 30,
  last_backup_at TIMESTAMPTZ,
  next_backup_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Caché de Códigos de Barras
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

-- Unidades individuales de producto
CREATE TABLE IF NOT EXISTS public.product_units (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID REFERENCES public.products(id) ON DELETE CASCADE,
  individual_barcode TEXT UNIQUE NOT NULL,
  status TEXT DEFAULT 'available',
  sold_at TIMESTAMPTZ,
  sold_in_order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Imágenes de productos
CREATE TABLE IF NOT EXISTS public.product_images (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID REFERENCES public.products(id) ON DELETE CASCADE,
  image_url TEXT NOT NULL,
  is_primary BOOLEAN DEFAULT false,
  display_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.product_images ADD COLUMN IF NOT EXISTS display_order INTEGER DEFAULT 0;

-- Perfiles de clientes online
CREATE TABLE IF NOT EXISTS public.customer_profiles (
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  full_name TEXT,
  phone TEXT,
  default_address TEXT,
  address TEXT,
  city TEXT,
  postal_code TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Pedidos online
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
  phone TEXT,
  shipping_address TEXT,
  tracking_code TEXT,
  shipping_status TEXT,
  shipping_date_report TIMESTAMPTZ,
  shipping_note TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Líneas de pedidos online
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

-- 4. ÍNDICES PRINCIPALES
CREATE INDEX IF NOT EXISTS idx_products_category ON public.products(category_id);
CREATE INDEX IF NOT EXISTS idx_products_barcode ON public.products(barcode);
CREATE INDEX IF NOT EXISTS idx_products_deleted_at ON public.products(deleted_at);
CREATE INDEX IF NOT EXISTS idx_product_sizes_product ON public.product_sizes(product_id);
CREATE INDEX IF NOT EXISTS idx_orders_employee ON public.orders(employee_id);
CREATE INDEX IF NOT EXISTS idx_orders_customer ON public.orders(customer_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON public.orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_deleted_at ON public.orders(deleted_at);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON public.orders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_order_items_order ON public.order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_order_items_product ON public.order_items(product_id);
CREATE INDEX IF NOT EXISTS idx_barcode_cache_barcode ON public.barcode_cache(barcode);

-- 5. RPCs PARA CONTROL ATÓMICO DE STOCK
CREATE OR REPLACE FUNCTION public.decrement_product_size_stock(p_size_id UUID, p_quantity INTEGER)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE public.product_sizes
  SET stock = stock - p_quantity
  WHERE id = p_size_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.decrement_product_stock(p_product_id UUID, p_quantity INTEGER)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE public.products
  SET stock = stock - p_quantity
  WHERE id = p_product_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.increment_product_stock(p_product_id UUID, p_quantity INTEGER)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE public.products
  SET stock = COALESCE(stock, 0) + p_quantity
  WHERE id = p_product_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.increment_product_size_stock(p_size_id UUID, p_quantity INTEGER)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE public.product_sizes
  SET stock = COALESCE(stock, 0) + p_quantity
  WHERE id = p_size_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.decrement_product_size_stock TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.decrement_product_stock TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.increment_product_stock TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.increment_product_size_stock TO authenticated, anon;

-- 6. PERMISOS Y RLS PERMISIVOS PARA USUARIOS AUTENTICADOS
DO $$ 
DECLARE 
  t text;
  tables text[] := ARRAY[
    'categories', 'products', 'product_sizes', 'product_images', 'customers',
    'orders', 'order_items', 'order_history', 'employee_profiles', 'suppliers',
    'expenses', 'tables', 'cash_register_sessions', 'cash_withdrawals', 'order_returns',
    'stock_movements', 'deleted_products', 'deleted_orders', 'role_permissions',
    'company_settings', 'app_currency_settings', 'available_currencies', 'backup_history',
    'backup_config', 'barcode_cache', 'product_units', 'customer_profiles',
    'online_orders', 'order_items_online'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I;', 'Allow Authenticated All ' || t, t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING (true) WITH CHECK (true);', 'Allow Authenticated All ' || t, t);
    EXECUTE format('GRANT ALL ON TABLE public.%I TO authenticated;', t);
  END LOOP;
END $$;

-- 7. AUTO-CONFIRMAR CORREO PARA TODOS LOS USUARIOS
CREATE OR REPLACE FUNCTION public.auto_confirm_new_user()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.email_confirmed_at IS NULL THEN
    NEW.email_confirmed_at := now();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_auto_confirm ON auth.users;
CREATE TRIGGER on_auth_user_auto_confirm
  BEFORE INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_confirm_new_user();

UPDATE auth.users
SET email_confirmed_at = COALESCE(email_confirmed_at, now())
WHERE email_confirmed_at IS NULL;

-- 8. RECARGAR CACHÉ DE POSTGREST
NOTIFY pgrst, 'reload schema';
