-- Migration to update existing templates table to new version

-- 1. Add user_id column linked to auth.users
alter table public.templates 
add column if not exists user_id uuid references auth.users;

-- 2. Make openai_key nullable (since it can now be stored in the user profile)
alter table public.templates 
alter column openai_key drop not null;

-- 3. Enable Row Level Security (RLS)
alter table public.templates enable row level security;

-- 4. Create RLS Policies

-- Allow users to view only their own templates
create policy "Users can view own templates" 
on public.templates for select 
using (auth.uid() = user_id);

-- Allow users to insert their own templates
-- Note: The check ensures the user_id in the row matches the authenticated user
create policy "Users can insert own templates" 
on public.templates for insert 
with check (auth.uid() = user_id);

-- Allow users to delete their own templates
create policy "Users can delete own templates" 
on public.templates for delete 
using (auth.uid() = user_id);

-- Allow users to update their own templates
create policy "Users can update own templates" 
on public.templates for update 
using (auth.uid() = user_id);

-- 5. Create index on user_id for faster queries
create index if not exists templates_user_id_idx 
on public.templates (user_id);

-- 6. (Optional) If you have existing data without user_id, you might want to handle it.
-- For a fresh SaaS start, new uploads will populate user_id correctly.
