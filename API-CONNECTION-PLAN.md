# HSA App — Online Sync / Update Architecture

This build is deliberately ready for the real Hafiz Shahid's Academy backend without changing the existing website.

## Why images are now safe
- Academy logo/mark are bundled locally in the app.
- Course and post images uploaded in the prototype are stored as data URLs, so they do not depend on a temporary browser file path.
- In production, course/post images should come from Cloudinary (or the existing durable backend storage), and the app should receive the permanent HTTPS URL from the API.

## Real online data
Set `window.HSA_API_BASE` before the app script loads if the app frontend is hosted on a different origin. If it is served by the same Express host, leave it empty and use relative `/api/...` routes.

The UI already checks `/api/health` and shows Online/Offline status. The next integration step is to map the existing academy endpoints for:
- public data / courses / posts
- student login + OTP
- student dashboard
- admin CRUD
- uploads
- purchases/payments
- classes / assignments / certificates

## Automatic updates for users
This is a PWA architecture. Users who install the hosted PWA receive the latest web app shell through the service worker. The app also checks the server every minute while open.

Important: a separately installed APK cannot silently replace its own native package. For automatic UI/content updates, the APK should load the hosted PWA/app URL; then UI and data can update from the server without asking every student to reinstall.
