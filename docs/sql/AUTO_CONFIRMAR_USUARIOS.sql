-- ==============================================================================
-- AUTO-CONFIRMAR CORREO PARA TODOS LOS USUARIOS (LOGIN SIN CONFIRMACIÓN)
-- ==============================================================================
-- Instrucciones:
-- 1. Abre el panel de tu Supabase (http://supabasekong-ck8o0kswcg8wo8w0ko8occck.95.217.8.39.sslip.io o dashboard de Supabase).
-- 2. Ve a SQL Editor -> New Query.
-- 3. Pega este código y haz clic en "Run".
-- ==============================================================================

-- 1. Confirmar inmediatamente todos los usuarios existentes (incluyendo admin@admin.com)
UPDATE auth.users
SET email_confirmed_at = COALESCE(email_confirmed_at, now())
WHERE email_confirmed_at IS NULL;

-- 2. Función de trigger que auto-confirma el correo de cualquier usuario nuevo
CREATE OR REPLACE FUNCTION public.auto_confirm_new_user()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.email_confirmed_at IS NULL THEN
    NEW.email_confirmed_at := now();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Trigger antes de insertar en auth.users
DROP TRIGGER IF EXISTS on_auth_user_auto_confirm ON auth.users;
CREATE TRIGGER on_auth_user_auto_confirm
  BEFORE INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_confirm_new_user();

-- 4. Recargar caché de PostgREST
NOTIFY pgrst, 'reload schema';
