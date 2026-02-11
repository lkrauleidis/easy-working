-- Enable RLS (Row Level Security) if not already enabled
-- Create a table for user profiles (extends default auth.users)
create table if not exists public.profiles (
  id uuid references auth.users not null primary key,
  email text,
  is_approved boolean default false,
  openai_key text,
  created_at timestamptz default now() not null
);

-- Enable RLS on profiles
alter table public.profiles enable row level security;

-- Create policies for profiles
create policy "Public profiles are viewable by everyone." on public.profiles for select using (true);
create policy "Users can insert their own profile." on public.profiles for insert with check (auth.uid() = id);
create policy "Users can update own profile." on public.profiles for update using (auth.uid() = id);

-- Templates table (Updated Schema)
create table if not exists public.templates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users, -- Added for ownership
  username text not null, -- Name on resume
  filename text not null,
  json_data jsonb not null,
  openai_key text, -- Can be null if using profile key
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Enable RLS on templates
alter table public.templates enable row level security;

-- Templates Policies
create policy "Users can view own templates" 
on public.templates for select 
using (auth.uid() = user_id);

create policy "Users can insert own templates" 
on public.templates for insert 
with check (auth.uid() = user_id);

create policy "Users can delete own templates" 
on public.templates for delete 
using (auth.uid() = user_id);

create policy "Users can update own templates" 
on public.templates for update 
using (auth.uid() = user_id);

-- Indexes
create index if not exists templates_user_id_idx on public.templates (user_id);
create index if not exists templates_created_at_idx on public.templates (created_at desc);

-- History table
create table if not exists public.history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users,
  template_id uuid references public.templates,
  company_name text,
  position text,
  resume_data jsonb, -- Snapshot of the generated resume
  created_at timestamptz not null default now()
);

-- Enable RLS on history
alter table public.history enable row level security;

create policy "Users can view own history" 
on public.history for select 
using (auth.uid() = user_id);

create policy "Users can insert own history" 
on public.history for insert 
with check (auth.uid() = user_id);

-- Function to handle new user signup (automatically create profile)
create or replace function public.handle_new_user() 
returns trigger as $$
begin
  insert into public.profiles (id, email, is_approved)
  values (new.id, new.email, false);
  return new;
end;
$$ language plpgsql security definer;

-- Trigger the function every time a user is created
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
