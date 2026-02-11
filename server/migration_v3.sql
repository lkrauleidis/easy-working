-- Migration V3: Restore openai_key to users table
-- Run this if you want to allow users to save a global OpenAI key in their profile

ALTER TABLE public.users ADD COLUMN IF NOT EXISTS openai_key text;
