-- ==============================================================================
-- JOBBOT SUPABASE SETUP SCRIPT (UPDATED)
-- Copy and paste this entire script into your Supabase SQL Editor.
-- It handles both creating new tables and updating existing ones.
-- ==============================================================================

-- 0. RENAME PROFILES TO USERS (Migration Step)
do $$
begin
  if exists (select from pg_tables where schemaname = 'public' and tablename = 'profiles') then
    alter table public.profiles rename to users;
  end if;
end $$;

-- 1. USERS TABLE (For Admin Approval & Global Settings)
create table if not exists public.users (
  id uuid references auth.users not null primary key,
  email text,
  is_approved boolean default false,
  role boolean default false, -- false: user, true: admin
  password text, -- Storing encrypted password if needed (Auth uses auth.users)
  templates_count integer default 0,
  created_at timestamptz default now() not null
);

-- Update existing users table with new columns if they don't exist
do $$ 
begin 
  -- Handle 'role' column migration
  if exists (select 1 from information_schema.columns where table_name = 'users' and column_name = 'role') then
     -- If it exists and is not boolean (e.g. text), convert it
     if exists (select 1 from information_schema.columns where table_name = 'users' and column_name = 'role' and data_type = 'text') then
        alter table public.users drop constraint if exists users_role_check;
        alter table public.users alter column role drop default;
        alter table public.users alter column role type boolean using (role = 'admin');
        alter table public.users alter column role set default false;
     end if;
  else
     alter table public.users add column role boolean default false;
  end if;

  if not exists (select 1 from information_schema.columns where table_name = 'users' and column_name = 'password') then
    alter table public.users add column password text;
  end if;

  if not exists (select 1 from information_schema.columns where table_name = 'users' and column_name = 'templates_count') then
    alter table public.users add column templates_count integer default 0;
  end if;
  
  -- Remove openai_key if it exists (moved to templates or handled differently)
  if exists (select 1 from information_schema.columns where table_name = 'users' and column_name = 'openai_key') then
    alter table public.users drop column openai_key;
  end if;
end $$;

-- Enable Security
alter table public.users enable row level security;

-- Policies for Users (Drop first to allow re-running safely)
drop policy if exists "Public users are viewable by everyone." on public.users;
create policy "Public users are viewable by everyone." on public.users for select using (true);

drop policy if exists "Users can insert their own user record." on public.users;
create policy "Users can insert their own user record." on public.users for insert with check (auth.uid() = id);

drop policy if exists "Users can update own user record." on public.users;
create policy "Users can update own user record." on public.users for update using (auth.uid() = id);


-- 2. TEMPLATES TABLE (Update existing structure)
create table if not exists public.templates (
  id uuid primary key default gen_random_uuid(),
  username text not null,
  filename text not null,
  json_data jsonb not null,
  openai_key text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Add user_id column if it doesn't exist (Safe migration for existing table)
do $$ 
begin 
  if not exists (select 1 from information_schema.columns where table_name = 'templates' and column_name = 'user_id') then
    alter table public.templates add column user_id uuid references auth.users;
  end if;
end $$;

-- Make openai_key optional
alter table public.templates alter column openai_key drop not null;

-- Enable Security
alter table public.templates enable row level security;

-- Policies for Templates
drop policy if exists "Users can view own templates" on public.templates;
create policy "Users can view own templates" on public.templates for select using (auth.uid() = user_id);

drop policy if exists "Users can insert own templates" on public.templates;
create policy "Users can insert own templates" on public.templates for insert with check (auth.uid() = user_id);

drop policy if exists "Users can delete own templates" on public.templates;
create policy "Users can delete own templates" on public.templates for delete using (auth.uid() = user_id);

drop policy if exists "Users can update own templates" on public.templates;
create policy "Users can update own templates" on public.templates for update using (auth.uid() = user_id);

-- Indexes for performance
create index if not exists templates_user_id_idx on public.templates (user_id);
create index if not exists templates_created_at_idx on public.templates (created_at desc);


-- 3. HISTORY TABLE (For tracking usage)
create table if not exists public.history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users,
  template_id uuid references public.templates,
  company_name text,
  position text,
  resume_data jsonb,
  created_at timestamptz not null default now()
);

-- Enable Security
alter table public.history enable row level security;

-- Policies for History
drop policy if exists "Users can view own history" on public.history;
create policy "Users can view own history" on public.history for select using (auth.uid() = user_id);

drop policy if exists "Users can insert own history" on public.history;
create policy "Users can insert own history" on public.history for insert with check (auth.uid() = user_id);


-- 5. TEMPLATES COUNT TRIGGER (Maintain count in users table)
create or replace function public.update_templates_count()
returns trigger as $$
begin
  if (TG_OP = 'INSERT') then
    update public.users
    set templates_count = templates_count + 1
    where id = new.user_id;
    return new;
  elsif (TG_OP = 'DELETE') then
    update public.users
    set templates_count = templates_count - 1
    where id = old.user_id;
    return old;
  end if;
  return null;
end;
$$ language plpgsql security definer;

drop trigger if exists on_template_change on public.templates;
create trigger on_template_change
  after insert or delete on public.templates
  for each row execute procedure public.update_templates_count();

-- 6. USER SIGNUP TRIGGER (Automatically create user entry)
create or replace function public.handle_new_user() 
returns trigger as $$
begin
  insert into public.users (id, email, is_approved, role, templates_count)
  values (new.id, new.email, false, false, 0) -- role: false (user)
  on conflict (id) do nothing; -- Safety check
  return new;
end;
$$ language plpgsql security definer;

-- Recreate trigger to ensure it's active
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- 7. SYNC EXISTING USERS (One-time fix for existing users)
insert into public.users (id, email, is_approved, role, templates_count)
select id, email, false, false, 0
from auth.users
where id not in (select id from public.users)
on conflict (id) do nothing;
