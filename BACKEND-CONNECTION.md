# Hafiz Shahid’s Academy APP — Backend Connection

This app now calls the existing academy backend instead of using the localStorage demo database.

## Default backend
The app is configured for:
`https://hafiz-shahids-academy.onrender.com`

If your real Render URL is different, set `window.HSA_API_BASE` before the app script or change the value near the top of `index.html`.

## Existing backend endpoints used
- `/api/health`
- `/api/public-state`
- `/api/auth/student-id`
- `/api/auth/student-register-password`
- `/api/auth/student-login`
- `/api/student-state`
- `/api/certificates`
- `/api/admin/login`
- `/api/admin/logout`
- `/api/admin-state`
- Course CRUD
- Lesson CRUD
- Post CRUD + poster upload
- Live/Zoom CRUD
- Assignment CRUD + student submission
- Study material CRUD
- Student account CRUD/password reset
- Payment approve/reject

## CORS requirement
Because the app is a separately hosted PWA, the academy Render server must allow the app origin with CORS. Do **not** put `DATABASE_URL`, `BREVO_API_KEY`, Cloudinary secrets, or the admin password in the app. They remain server-side.

The website UI itself does not need to be redesigned or replaced. Only a small CORS middleware may be needed in its `server.js` if the browser reports a CORS error.

## Automatic updates
New courses/posts/classes added in the admin backend are loaded from the server whenever the app opens, refreshes, or resumes a session. The service worker is also versioned (`v4`) so future UI shell changes can be delivered as PWA updates without reinstalling the app.

A native APK cannot silently replace its own package, but a hosted PWA/WebView-style app can receive server-side content and UI updates automatically.
