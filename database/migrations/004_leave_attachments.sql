USE carcare_db;

ALTER TABLE leave_requests ADD COLUMN attachment_original_name VARCHAR(255) NULL;
ALTER TABLE leave_requests ADD COLUMN attachment_stored_name VARCHAR(255) NULL;
ALTER TABLE leave_requests ADD COLUMN attachment_mime VARCHAR(100) NULL;
ALTER TABLE leave_requests ADD COLUMN attachment_size INT UNSIGNED NULL;
