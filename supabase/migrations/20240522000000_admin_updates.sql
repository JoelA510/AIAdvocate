-- Add human_verified column to bill_translations
ALTER TABLE public.bill_translations
ADD COLUMN IF NOT EXISTS human_verified BOOLEAN DEFAULT FALSE;

-- Create a policy for admins to update bills (for panel_review)
-- Assuming app_admins table exists and contains user_ids of admins
-- We need to check if the user is in app_admins

CREATE POLICY "Admins can update bills" ON public.bills
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.app_admins
    WHERE user_id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.app_admins
    WHERE user_id = auth.uid()
  )
);

-- Create a policy for admins to update bill_translations (for human_verified)
CREATE POLICY "Admins can update translations" ON public.bill_translations
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.app_admins
    WHERE user_id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.app_admins
    WHERE user_id = auth.uid()
  )
);
