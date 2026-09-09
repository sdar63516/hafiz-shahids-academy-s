# Large Video Upload Setup — Hafiz Shahid's Academy

This version uploads recorded-class videos **directly from the Admin browser to Cloudinary** in chunks. Render no longer receives the large video file and the video file is not stored on Render's temporary filesystem. The returned Cloudinary video URL is saved with the lesson in Neon.

## 1) Cloudinary
1. Create/sign in to a Cloudinary account.
2. Open **Settings → Upload → Upload presets**.
3. Create an **Unsigned** upload preset.
4. Configure the preset for video uploads and use a dedicated folder if desired.
5. Copy:
   - **Cloud name**
   - **Upload preset name**

## 2) Render Environment Variables
Add these two variables to the existing Render service:

- `CLOUDINARY_CLOUD_NAME` = your Cloudinary cloud name
- `CLOUDINARY_UPLOAD_PRESET` = your unsigned upload preset name

Keep the existing `DATABASE_URL`, `NODE_ENV`, `SUPER_ADMIN_PHONE`, and `SUPER_ADMIN_PASSWORD` variables unchanged.

After adding/changing environment variables, redeploy/restart the Render service.

## 3) How it works
- Admin selects a video.
- Browser uploads it directly to Cloudinary in 20 MB chunks.
- Upload progress is shown on the Save Recorded Class button.
- When Cloudinary finishes, the secure video URL is saved in the lesson record in Neon.
- Students play the video from Cloudinary instead of Render.

The existing YouTube lesson option is unchanged.
