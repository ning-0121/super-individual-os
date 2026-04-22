-- Add onboarding fields to user_profiles
alter table user_profiles
  add column if not exists onboarding_completed boolean default false,
  add column if not exists onboarding_goal text default '',
  add column if not exists onboarding_pain text default '';
