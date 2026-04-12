-- Update admin@therailapp.company to admin role
UPDATE users SET role = 'admin' WHERE email = 'admin@therailapp.company';

-- Update Gabriel Toledo to user role
UPDATE users SET role = 'user' WHERE email = 'gabriel.toledo999@gmail.com';

-- Verify changes
SELECT id, name, email, role FROM users WHERE email IN ('admin@therailapp.company', 'gabriel.toledo999@gmail.com');
