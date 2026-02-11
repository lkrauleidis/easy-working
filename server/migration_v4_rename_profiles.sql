-- Rename profiles table to users
ALTER TABLE IF EXISTS public.profiles RENAME TO users;

-- Rename constraint if it exists (optional, but good for consistency)
-- ALTER TABLE public.users RENAME CONSTRAINT profiles_pkey TO users_pkey;

-- Update policies (drop and recreate with new name)
DROP POLICY IF EXISTS "Public profiles are viewable by everyone." ON public.users;
DROP POLICY IF EXISTS "Users can insert their own profile." ON public.users;
DROP POLICY IF EXISTS "Users can update own profile." ON public.users;

-- Recreate policies for users table
CREATE POLICY "Public users are viewable by everyone." ON public.users FOR SELECT USING (true);
CREATE POLICY "Users can insert their own user record." ON public.users FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "Users can update own user record." ON public.users FOR UPDATE USING (auth.uid() = id);

-- Update triggers that reference profiles
CREATE OR REPLACE FUNCTION public.update_templates_count()
RETURNS TRIGGER AS $$
BEGIN
  IF (TG_OP = 'INSERT') THEN
    UPDATE public.users
    SET templates_count = templates_count + 1
    WHERE id = new.user_id;
    RETURN new;
  ELSIF (TG_OP = 'DELETE') THEN
    UPDATE public.users
    SET templates_count = templates_count - 1
    WHERE id = old.user_id;
    RETURN old;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.handle_new_user() 
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.users (id, email, is_approved, role, templates_count)
  VALUES (new.id, new.email, false, false, 0)
  ON CONFLICT (id) DO NOTHING;
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
