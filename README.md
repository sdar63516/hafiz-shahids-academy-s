# Hafiz Shahid's Academy — Live v6

## Render Environment Variables

Add these in Render → Environment:

- `NODE_ENV` = `production`
- `DATABASE_URL` = your Neon PostgreSQL connection string
- `SUPER_ADMIN_PHONE` = your private owner phone number
- `SUPER_ADMIN_PASSWORD` = your private owner password

**Never commit the owner phone/password or DATABASE_URL to GitHub.**

## Login

### Super Admin
Open `/admin.html` and enter the Super Admin password. The phone number is not displayed in the UI.

### Students
1. Student enters the exact registered name.
2. The server returns the student's unique ID, e.g. `HSA-001`.
3. Student enters that ID and password.
4. Passwords are stored as salted scrypt hashes and are never returned to the browser.

The owner creates student accounts from the Super Admin → Students section and assigns the student's initial password.

## Deploy

Render:
- Runtime: Node
- Build: `npm install`
- Start: `npm start`
- Health check: `/api/health`

Neon is used automatically when `DATABASE_URL` is present. The app creates its PostgreSQL state table on first start.
