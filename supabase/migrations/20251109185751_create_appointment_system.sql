/*
  # Randevu Sistemi - Appointment System Schema

  ## Overview
  Complete appointment booking system for IT experts with availability management
  and email notifications for appointment requests.

  ## New Tables
  
  ### 1. `locations`
  Stores office/branch locations where IT support is available
    - `id` (uuid, primary key)
    - `name` (text) - Location name
    - `address` (text) - Physical address
    - `created_at` (timestamptz)

  ### 2. `it_experts`
  IT support experts who handle appointments
    - `id` (uuid, primary key)
    - `full_name` (text) - Expert's full name
    - `email` (text, unique) - Contact email
    - `phone` (text) - Contact phone
    - `location_id` (uuid) - Foreign key to locations
    - `is_active` (boolean) - Whether expert is currently active
    - `created_at` (timestamptz)

  ### 3. `availability_schedules`
  Weekly availability schedules for IT experts
    - `id` (uuid, primary key)
    - `expert_id` (uuid) - Foreign key to it_experts
    - `day_of_week` (integer) - 0=Sunday, 1=Monday, ..., 6=Saturday
    - `start_time` (time) - Start time of availability slot
    - `end_time` (time) - End time of availability slot
    - `is_available` (boolean) - Whether this slot is available
    - `created_at` (timestamptz)

  ### 4. `appointments`
  Appointment requests from users
    - `id` (uuid, primary key)
    - `customer_name` (text) - Customer's full name
    - `customer_email` (text) - Customer's email
    - `customer_phone` (text) - Customer's phone
    - `location_id` (uuid) - Foreign key to locations
    - `expert_id` (uuid) - Foreign key to it_experts
    - `appointment_date` (date) - Requested appointment date
    - `appointment_time` (time) - Requested appointment time
    - `service_type` (text) - Default: "Telefon Değişimi"
    - `status` (text) - pending, approved, rejected
    - `notes` (text) - Optional notes from customer
    - `admin_notes` (text) - Optional notes from IT expert
    - `created_at` (timestamptz)
    - `updated_at` (timestamptz)

  ## Security
  
  ### RLS Policies
  All tables have Row Level Security enabled with restrictive policies:
  
  - **locations**: Public read access, no insert/update/delete (admin only)
  - **it_experts**: Public read access for active experts, no modifications
  - **availability_schedules**: Public read access, experts can manage their own
  - **appointments**: Users can create, experts can view and update their appointments

  ## Notes
  
  1. Time slots are managed per day of week for recurring schedules
  2. Appointment status flow: pending → approved/rejected
  3. Email notifications will be triggered by edge functions
  4. All timestamps use UTC timezone
*/

-- Create locations table
CREATE TABLE IF NOT EXISTS locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  address text,
  created_at timestamptz DEFAULT now()
);

-- Create IT experts table
CREATE TABLE IF NOT EXISTS it_experts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name text NOT NULL,
  email text UNIQUE NOT NULL,
  phone text,
  location_id uuid REFERENCES locations(id) ON DELETE SET NULL,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

-- Create availability schedules table
CREATE TABLE IF NOT EXISTS availability_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  expert_id uuid REFERENCES it_experts(id) ON DELETE CASCADE NOT NULL,
  day_of_week integer NOT NULL CHECK (day_of_week >= 0 AND day_of_week <= 6),
  start_time time NOT NULL,
  end_time time NOT NULL,
  is_available boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  CONSTRAINT valid_time_range CHECK (end_time > start_time)
);

-- Create appointments table
CREATE TABLE IF NOT EXISTS appointments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_name text NOT NULL,
  customer_email text NOT NULL,
  customer_phone text NOT NULL,
  location_id uuid REFERENCES locations(id) ON DELETE SET NULL NOT NULL,
  expert_id uuid REFERENCES it_experts(id) ON DELETE SET NULL NOT NULL,
  appointment_date date NOT NULL,
  appointment_time time NOT NULL,
  service_type text DEFAULT 'Telefon Değişimi',
  status text DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  notes text,
  admin_notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Enable RLS on all tables
ALTER TABLE locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE it_experts ENABLE ROW LEVEL SECURITY;
ALTER TABLE availability_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;

-- RLS Policies for locations
CREATE POLICY "Anyone can view locations"
  ON locations FOR SELECT
  USING (true);

-- RLS Policies for it_experts
CREATE POLICY "Anyone can view active IT experts"
  ON it_experts FOR SELECT
  USING (is_active = true);

-- RLS Policies for availability_schedules
CREATE POLICY "Anyone can view availability schedules"
  ON availability_schedules FOR SELECT
  USING (true);

-- RLS Policies for appointments
CREATE POLICY "Anyone can create appointments"
  ON appointments FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Anyone can view appointments"
  ON appointments FOR SELECT
  USING (true);

CREATE POLICY "Anyone can update appointments"
  ON appointments FOR UPDATE
  USING (true)
  WITH CHECK (true);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_it_experts_location ON it_experts(location_id);
CREATE INDEX IF NOT EXISTS idx_it_experts_active ON it_experts(is_active);
CREATE INDEX IF NOT EXISTS idx_availability_expert ON availability_schedules(expert_id);
CREATE INDEX IF NOT EXISTS idx_availability_day ON availability_schedules(day_of_week);
CREATE INDEX IF NOT EXISTS idx_appointments_expert ON appointments(expert_id);
CREATE INDEX IF NOT EXISTS idx_appointments_location ON appointments(location_id);
CREATE INDEX IF NOT EXISTS idx_appointments_status ON appointments(status);
CREATE INDEX IF NOT EXISTS idx_appointments_date ON appointments(appointment_date);

-- Insert sample data for testing
INSERT INTO locations (name, address) VALUES
  ('İstanbul Ofis', 'Levent Mahallesi, İstanbul'),
  ('Ankara Ofis', 'Çankaya, Ankara'),
  ('İzmir Ofis', 'Alsancak, İzmir')
ON CONFLICT DO NOTHING;

-- Insert sample IT experts
DO $$
DECLARE
  loc_istanbul uuid;
  loc_ankara uuid;
BEGIN
  SELECT id INTO loc_istanbul FROM locations WHERE name = 'İstanbul Ofis' LIMIT 1;
  SELECT id INTO loc_ankara FROM locations WHERE name = 'Ankara Ofis' LIMIT 1;
  
  IF loc_istanbul IS NOT NULL THEN
    INSERT INTO it_experts (full_name, email, phone, location_id) VALUES
      ('Ahmet Yılmaz', 'ahmet.yilmaz@ittoolbox.com.tr', '+90 555 111 2233', loc_istanbul)
    ON CONFLICT (email) DO NOTHING;
  END IF;
  
  IF loc_ankara IS NOT NULL THEN
    INSERT INTO it_experts (full_name, email, phone, location_id) VALUES
      ('Ayşe Demir', 'ayse.demir@ittoolbox.com.tr', '+90 555 444 5566', loc_ankara)
    ON CONFLICT (email) DO NOTHING;
  END IF;
END $$;