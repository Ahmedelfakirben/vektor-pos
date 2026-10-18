-- Migration: Add shipping and tracking columns to orders table
-- This allows linking Oscario tracking code, shipping status, report dates and carrier notes.

ALTER TABLE public.orders 
ADD COLUMN IF NOT EXISTS tracking_code TEXT,
ADD COLUMN IF NOT EXISTS shipping_status TEXT,
ADD COLUMN IF NOT EXISTS shipping_date_report TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS shipping_note TEXT;

COMMENT ON COLUMN public.orders.tracking_code IS 'Oscario or carrier tracking code / parcel code';
COMMENT ON COLUMN public.orders.shipping_status IS 'Raw status reported by Oscario shipping carrier';
COMMENT ON COLUMN public.orders.shipping_date_report IS 'Date and time of the shipping status report';
COMMENT ON COLUMN public.orders.shipping_note IS 'Additional notes or comments from the shipping carrier';

-- Create index for fast query lookup by tracking_code
CREATE INDEX IF NOT EXISTS idx_orders_tracking_code ON public.orders(tracking_code);
