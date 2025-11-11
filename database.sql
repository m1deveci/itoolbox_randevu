-- Create experts table
CREATE TABLE IF NOT EXISTS experts (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) NOT NULL UNIQUE,
  password_hash VARCHAR(255),
  role VARCHAR(50) DEFAULT 'admin',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_email (email),
  INDEX idx_role (role)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Create availability table (specific dates and hours when experts are available)
CREATE TABLE IF NOT EXISTS availability (
  id INT AUTO_INCREMENT PRIMARY KEY,
  expert_id INT NOT NULL,
  availability_date DATE NOT NULL COMMENT 'Specific date for which availability is set',
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (expert_id) REFERENCES experts(id) ON DELETE CASCADE,
  INDEX idx_expert_date (expert_id, availability_date),
  UNIQUE KEY uk_expert_date (expert_id, availability_date, start_time, end_time)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Create appointments table
CREATE TABLE IF NOT EXISTS appointments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  expert_id INT NOT NULL,
  user_name VARCHAR(255) NOT NULL,
  user_email VARCHAR(255) DEFAULT NULL,
  user_phone VARCHAR(20) DEFAULT NULL,
  appointment_date DATE NOT NULL,
  appointment_time TIME NOT NULL,
  ticket_no VARCHAR(20) DEFAULT NULL,
  status ENUM('pending', 'approved', 'cancelled', 'completed') DEFAULT 'pending',
  notes TEXT,
  cancellation_reason TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (expert_id) REFERENCES experts(id) ON DELETE CASCADE,
  INDEX idx_expert_date (expert_id, appointment_date),
  INDEX idx_status (status),
  INDEX idx_date (appointment_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Create appointment locks table (temporary 90-second slots reservation)
CREATE TABLE IF NOT EXISTS appointment_locks (
  id INT AUTO_INCREMENT PRIMARY KEY,
  expert_id INT NOT NULL,
  appointment_date DATE NOT NULL,
  appointment_time TIME NOT NULL,
  session_id VARCHAR(36) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP NOT NULL,
  FOREIGN KEY (expert_id) REFERENCES experts(id) ON DELETE CASCADE,
  UNIQUE KEY uk_expert_slot (expert_id, appointment_date, appointment_time, session_id),
  INDEX idx_session (session_id),
  INDEX idx_expires (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

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
