-- Migration: allow role selection on signup (worker / admin)
-- The app passes the requested role in auth.users.raw_user_meta_data->>'role'.
-- Defaults to 'worker' and rejects any value outside the allowed list.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  requested_role TEXT;
BEGIN
  requested_role := COALESCE(NEW.raw_user_meta_data->>'role', 'worker');
  IF requested_role NOT IN ('admin', 'worker') THEN
    requested_role := 'worker';
  END IF;
  INSERT INTO public.profiles (id, full_name, email, phone, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'phone', ''),
    requested_role
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
