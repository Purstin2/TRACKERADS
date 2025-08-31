/*
  # Remove category requirement from offers

  1. Changes
    - Make category column nullable and set default to null
    - Update existing records to have null category
  
  2. Notes
    - This allows offers to exist without requiring a category
    - Simplifies the UI by removing category tabs
*/

-- Make category nullable and set default to null
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'offers' AND column_name = 'category'
  ) THEN
    ALTER TABLE offers ALTER COLUMN category DROP NOT NULL;
    ALTER TABLE offers ALTER COLUMN category SET DEFAULT null;
  END IF;
END $$;

-- Update all existing offers to have null category
UPDATE offers SET category = null WHERE category IS NOT NULL;