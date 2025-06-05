/*
  # Create Offers Table Schema

  1. New Tables
    - `offers`
      - `id` (uuid, primary key)
      - `name` (text, not null)
      - `link` (text, not null)
      - `tags` (text array)
      - `user_id` (uuid, references auth.users)
      - `last_ad_count` (integer)
      - `last_ad_count_timestamp` (timestamptz)
      - `is_archived` (boolean)
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)

  2. Security
    - Enable RLS on `offers` table
    - Add policies for authenticated users to:
      - Read their own offers
      - Create new offers
      - Update their own offers
*/

-- Create the offers table
CREATE TABLE IF NOT EXISTS offers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  link text NOT NULL,
  tags text[] DEFAULT '{}',
  user_id uuid REFERENCES auth.users(id) NOT NULL,
  last_ad_count integer DEFAULT 0,
  last_ad_count_timestamp timestamptz,
  is_archived boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE offers ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can read their own offers"
  ON offers
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create offers"
  ON offers
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own offers"
  ON offers
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Create an index on user_id for better query performance
CREATE INDEX offers_user_id_idx ON offers(user_id);

-- Create an index on is_archived for filtering
CREATE INDEX offers_is_archived_idx ON offers(is_archived);

-- Function to automatically update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger to call the update function
CREATE TRIGGER update_offers_updated_at
  BEFORE UPDATE ON offers
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();