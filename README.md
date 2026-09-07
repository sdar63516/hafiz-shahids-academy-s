# Hafiz Shahid's Academy — FREE LIVE DEPLOYMENT

This package is intentionally **flat**: all project files are in the repository root. The server creates upload directories only when files are uploaded.

## 1) GitHub
1. Create a new empty GitHub repository.
2. Open the repository → **Add file → Upload files**.
3. Upload every file from this package (do not upload the ZIP itself if you want the files directly visible).
4. Commit changes.

## 2) Neon database
1. Create a free Neon PostgreSQL project.
2. Copy the connection string from Neon.
3. Keep `sslmode=require` in the connection string.

## 3) Render
1. Create a new **Web Service** and connect the GitHub repository.
2. Runtime: Node.
3. Build Command: `npm install`
4. Start Command: `npm start`
5. Plan: Free.
6. Add Environment Variables:
   - `DATABASE_URL` = your Neon connection string
   - `SUPER_ADMIN_PHONE` = `9858866415`
   - `NODE_ENV` = `production`
7. Deploy.
8. Open `/api/health` on your Render URL. It should return `"ok": true`.

## Login
- Student login: phone number → demo OTP.
- First student account: `123456`
- Second student account: `6789`
- Later new student accounts: random 6-digit demo OTP.
- Owner/Super Admin phone: `9858866415` → admin OTP `123456` → all courses/classes.
- Students only receive access to courses after the admin approves their payment.

### Important security note
This free build uses **demo OTP delivery** because a real SMS OTP cannot be delivered securely for free without an SMS provider. The OTP is shown in the login screen for testing. For real production authentication, connect an SMS provider and stop returning/displaying the OTP.

## Important free-hosting limitation
Neon keeps the database persistent. Render's local filesystem is not persistent across redeploys/restarts, so uploaded images/files/videos stored under `uploads/` can disappear. For a truly production-ready file system, use object storage (for example Cloudinary/S3-compatible storage) later. For videos, YouTube links are recommended.

## Features included
Student login, student dashboard, course catalog, applications, QR payment screenshot + UTR, admin payment approval, course access dates, recorded classes, YouTube/upload lessons, study materials, assignments, grading, live Zoom classes, notifications, certificates at 80%, receipts, profile, teachers, announcements/posts, responsive student UI and responsive admin UI.

## Local test
```bash
npm install
npm start
```
Then open `http://localhost:10000`.
