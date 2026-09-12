# Hafiz Shahid's Academy — Clean Website 8.0

This version is a **normal website**, not the student mobile/app dashboard.

Removed from the public website:
- Student dashboard
- Purchased Courses
- Student Courses workspace
- My Doubts / student support app screens
- App-style student navigation
- PWA/service-worker dependency
- Install requirement

Kept:
- Professional public academy homepage
- Live course catalogue from the existing backend
- Course details and syllabus
- Academy announcements
- Academy posts
- Academy branding
- Existing Owner/Admin panel and its management features
- Existing Node/Express + Neon backend

No installation is required for visitors. Open the website normally in a browser.

Deploy exactly as the existing Node/Express project. The public homepage reads `/api/public-state`, so courses/posts/announcements continue to come from the existing database.
