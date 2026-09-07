# Hafiz Shahid's Academy — Automatic Student Login

## Student flow
1. Student enters their full name.
2. If the name already exists, the permanent HSA ID is shown and the student enters their password.
3. If the name is new, the server automatically creates the next HSA ID (HSA-001, HSA-002, ...).
4. The student creates an 8+ character password.
5. The account is logged in immediately.

No OTP is used by the student or Super Admin login.

## Render environment variables
- `DATABASE_URL` = Neon PostgreSQL connection string
- `NODE_ENV` = `production`
- `SUPER_ADMIN_PHONE` = private owner phone number (server-side only)
- `SUPER_ADMIN_PASSWORD` = owner password

## Health check
`/api/health`

## Security note
Student IDs are identifiers, not passwords. Passwords are stored as scrypt hashes. New self-registered students are not automatically enrolled in paid courses; course access is controlled by the existing enrollment/payment workflow.
