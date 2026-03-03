-- Add OTP verification step to flow_config.
-- Placed between "inicio" (order 2) and "dados-bancarios" (order 3).
-- Uses a DO block so it is idempotent: safe to run even if the row already exists.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.flow_config WHERE step_key = 'otp') THEN
    -- Shift every step at order >= 3 up by one to make room
    UPDATE public.flow_config SET step_order = step_order + 1 WHERE step_order >= 3;

    -- Insert OTP between "inicio" (2) and "dados-bancarios" (now 4)
    INSERT INTO public.flow_config (step_key, step_label, step_order, enabled)
    VALUES ('otp', 'Verificação OTP', 3, true);
  END IF;
END $$;
