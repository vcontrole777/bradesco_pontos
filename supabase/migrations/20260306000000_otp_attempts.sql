-- Add attempt counter to otp_codes for brute-force protection.
-- After 5 wrong attempts the code is invalidated and the user must request a new one.
ALTER TABLE public.otp_codes ADD COLUMN IF NOT EXISTS attempts INTEGER NOT NULL DEFAULT 0;
