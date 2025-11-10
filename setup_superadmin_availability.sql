-- Tüm süper adminlerin 1 aylık takvimlerini (cumartesi-pazar hariç) müsait hale getir
-- Bu script bugünden itibaren 30 gün boyunca tüm superadmin'ler için müsaitlik ekler

-- Time slots: 09:00, 10:00, 11:00, 13:00, 14:00, 15:00, 16:00
-- Her slot için end_time = start_time + 59 dakika (örn: 09:00 -> 09:59)

SET @start_date = CURDATE();
SET @end_date = DATE_ADD(@start_date, INTERVAL 30 DAY);

-- Tüm superadmin'leri bul ve her biri için müsaitlik ekle
INSERT IGNORE INTO availability (expert_id, availability_date, start_time, end_time)
SELECT 
    e.id AS expert_id,
    dates.availability_date,
    slots.start_time,
    slots.end_time
FROM 
    experts e
    CROSS JOIN (
        -- Bugünden itibaren 30 gün boyunca tüm tarihleri oluştur
        SELECT DATE_ADD(@start_date, INTERVAL seq.seq DAY) AS availability_date
        FROM (
            SELECT 0 AS seq UNION SELECT 1 UNION SELECT 2 UNION SELECT 3 UNION SELECT 4 UNION
            SELECT 5 UNION SELECT 6 UNION SELECT 7 UNION SELECT 8 UNION SELECT 9 UNION
            SELECT 10 UNION SELECT 11 UNION SELECT 12 UNION SELECT 13 UNION SELECT 14 UNION
            SELECT 15 UNION SELECT 16 UNION SELECT 17 UNION SELECT 18 UNION SELECT 19 UNION
            SELECT 20 UNION SELECT 21 UNION SELECT 22 UNION SELECT 23 UNION SELECT 24 UNION
            SELECT 25 UNION SELECT 26 UNION SELECT 27 UNION SELECT 28 UNION SELECT 29
        ) seq
        WHERE DATE_ADD(@start_date, INTERVAL seq.seq DAY) <= @end_date
    ) dates
    CROSS JOIN (
        -- Time slots: 09:00-09:59, 10:00-10:59, 11:00-11:59, 13:00-13:59, 14:00-14:59, 15:00-15:59, 16:00-16:59
        SELECT '09:00:00' AS start_time, '09:59:00' AS end_time
        UNION SELECT '10:00:00', '10:59:00'
        UNION SELECT '11:00:00', '11:59:00'
        UNION SELECT '13:00:00', '13:59:00'
        UNION SELECT '14:00:00', '14:59:00'
        UNION SELECT '15:00:00', '15:59:00'
        UNION SELECT '16:00:00', '16:59:00'
    ) slots
WHERE 
    e.role = 'superadmin'
    -- Cumartesi (6) ve Pazar (0) hariç
    AND DAYOFWEEK(dates.availability_date) NOT IN (1, 7)
    -- Sadece bugün ve gelecek tarihler (geçmiş tarihleri ekleme)
    AND dates.availability_date >= @start_date;

-- Sonuçları göster
SELECT 
    e.name AS expert_name,
    e.email,
    COUNT(a.id) AS total_availabilities,
    MIN(a.availability_date) AS first_date,
    MAX(a.availability_date) AS last_date
FROM 
    experts e
    LEFT JOIN availability a ON e.id = a.expert_id 
        AND a.availability_date >= @start_date 
        AND a.availability_date <= @end_date
WHERE 
    e.role = 'superadmin'
GROUP BY 
    e.id, e.name, e.email
ORDER BY 
    e.name;

