# Brevo Email Automation

The existing student login is unchanged. Brevo is used only for transactional email.

## Render Environment Variables
- `BREVO_API_KEY` — your Brevo API key (server-side only)
- `BREVO_FROM_EMAIL` — the exact sender email verified/added in Brevo
- `BREVO_FROM_NAME` — `Hafiz Shahid's Academy` (optional)

## Automatic emails
- Course purchase submitted → purchase received email
- Course payment approved → course access activated email
- New YouTube/recorded class → class available email to active students in that course
- New Cloudinary recorded class → class available email
- New Live/Zoom class → live class email with Join Class link

If a student has no valid email, the action still saves and the Notification Center records the skipped email.

## Persistence fix
Homepage post images and payment screenshots are stored in Neon as data URLs, so they no longer depend on Render's temporary filesystem. Large videos continue using Cloudinary.
