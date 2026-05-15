-- Add missing DELETE policy for offers table
-- Without this, authenticated users cannot delete their own offers (RLS blocks it)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'offers' AND cmd = 'DELETE'
  ) THEN
    CREATE POLICY "Users can delete their own offers"
      ON offers FOR DELETE TO authenticated
      USING (auth.uid() = user_id);
  END IF;
END $$;
