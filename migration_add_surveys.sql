-- Migration: Add appointment_surveys table and update appointments status enum
-- Date: 2024-12-19

-- Add 'completed' to appointments status ENUM
ALTER TABLE appointments 
MODIFY COLUMN status ENUM('pending', 'approved', 'cancelled', 'completed') DEFAULT 'pending';

-- Create appointment_surveys table (survey responses for completed appointments)
CREATE TABLE IF NOT EXISTS appointment_surveys (
  id INT AUTO_INCREMENT PRIMARY KEY,
  appointment_id INT NOT NULL,
  user_email VARCHAR(255) NOT NULL,
  service_satisfaction TINYINT NOT NULL CHECK (service_satisfaction >= 1 AND service_satisfaction <= 5),
  system_satisfaction TINYINT NOT NULL CHECK (system_satisfaction >= 1 AND system_satisfaction <= 5),
  problem_description TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (appointment_id) REFERENCES appointments(id) ON DELETE CASCADE,
  UNIQUE KEY uk_appointment_survey (appointment_id),
  INDEX idx_user_email (user_email),
  INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

