/*
  # Fix delete functionality

  1. Security Updates
    - Add missing DELETE policies for offers table
    - Ensure proper CASCADE behavior for related data
    - Fix RLS policies to allow users to delete their own data

  2. Changes
    - Add DELETE policy for offers table
    - Verify CASCADE constraints are working properly
*/

-- Add DELETE policy for offers table
CREATE POLICY "Users can delete their own offers"
  ON offers
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Ensure foreign key constraints have proper CASCADE behavior
DO $$
BEGIN
  -- Check if the foreign key constraint exists and recreate it with CASCADE if needed
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'ad_counts_offer_id_fkey' 
    AND table_name = 'ad_counts'
  ) THEN
    ALTER TABLE ad_counts DROP CONSTRAINT ad_counts_offer_id_fkey;
  END IF;
  
  ALTER TABLE ad_counts 
  ADD CONSTRAINT ad_counts_offer_id_fkey 
  FOREIGN KEY (offer_id) REFERENCES offers(id) ON DELETE CASCADE;

  -- Same for comments
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'comments_offer_id_fkey' 
    AND table_name = 'comments'
  ) THEN
    ALTER TABLE comments DROP CONSTRAINT comments_offer_id_fkey;
  END IF;
  
  ALTER TABLE comments 
  ADD CONSTRAINT comments_offer_id_fkey 
  FOREIGN KEY (offer_id) REFERENCES offers(id) ON DELETE CASCADE;
END $$;