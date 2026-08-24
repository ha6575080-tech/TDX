-- TDX Initial Schema
-- Creates profiles and settings tables

-- Enable UUID extension
create extension if not exists "pgcrypto";

-- Updated-at trigger function for consistent timestamps
create or replace function public.handle_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Profiles table
-- One row per authenticated user, linked to auth.users
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Settings table
-- One row per user for display preferences
create table public.settings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.profiles (id) on delete cascade,
  currency text not null default 'PKR',
  theme text not null default 'system' check (theme in ('light', 'dark', 'system')),
  date_format text not null default 'DD-MM-YYYY',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Triggers for updated_at
create trigger handle_profiles_updated_at
  before update on public.profiles
  for each row execute function public.handle_updated_at();

create trigger handle_settings_updated_at
  before update on public.settings
  for each row execute function public.handle_updated_at();