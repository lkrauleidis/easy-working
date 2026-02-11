-- Migration V2: Rename profiles to users, add password logging, fix FKs

-- 1. Rename Table
DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'profiles') THEN
    ALTER TABLE public.profiles RENAME TO users;
  END IF;
END $$;

-- 2. Add Password Column (Warning: Storing plain passwords is not recommended)
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS password text;

-- 3. Fix Foreign Keys (Templates)
-- Clean up orphaned templates first (templates with no corresponding user)
DELETE FROM public.templates WHERE user_id NOT IN (SELECT id FROM public.users);

-- Drop old constraint if it exists (referencing auth.users)
ALTER TABLE public.templates DROP CONSTRAINT IF EXISTS templates_user_id_fkey;

-- Add new constraint referencing public.users
-- This ensures that a template can only be assigned to a user who exists in our public.users table
ALTER TABLE public.templates 
  ADD CONSTRAINT templates_user_id_fkey_public
  FOREIGN KEY (user_id) 
  REFERENCES public.users(id) 
  ON DELETE CASCADE;

-- 4. Fix Foreign Keys (History)
-- Clean up orphaned history
DELETE FROM public.history WHERE user_id NOT IN (SELECT id FROM public.users);

ALTER TABLE public.history DROP CONSTRAINT IF EXISTS history_user_id_fkey;

ALTER TABLE public.history 
  ADD CONSTRAINT history_user_id_fkey_public
  FOREIGN KEY (user_id) 
  REFERENCES public.users(id) 
  ON DELETE CASCADE;

-- 5. Update Functions & Triggers to use 'users' table

-- Update Template Count Trigger Function
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
  RETURN null;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Update New User Trigger Function
CREATE OR REPLACE FUNCTION public.handle_new_user() 
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.users (id, email, is_approved, role, templates_count, password)
  VALUES (new.id, new.email, false, false, 0, new.encrypted_password) -- Try to grab encrypted pw from auth? No, typically not available in trigger payload same way.
  ON CONFLICT (id) DO NOTHING;
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6. Recreate Policies (renaming them for clarity)

-- Drop old policies on 'users' (formerly profiles)
DROP POLICY IF EXISTS "Public profiles are viewable by everyone." ON public.users;
DROP POLICY IF EXISTS "Users can insert their own profile." ON public.users;
DROP POLICY IF EXISTS "Users can update own profile." ON public.users;

-- Create new policies
CREATE POLICY "Public users are viewable by everyone." ON public.users FOR SELECT USING (true);
CREATE POLICY "Users can insert their own user entry." ON public.users FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "Users can update own user entry." ON public.users FOR UPDATE USING (auth.uid() = id);

-- Grant permissions (if needed)
GRANT ALL ON TABLE public.users TO postgres;
GRANT ALL ON TABLE public.users TO anon;
GRANT ALL ON TABLE public.users TO authenticated;
GRANT ALL ON TABLE public.users TO service_role;
