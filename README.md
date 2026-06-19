# ALS Project

This is a static Vite site designed for deployment on Vercel with Supabase backend integration.

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Add environment variables:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`

   Create a `.env` file in the root:
   ```env
   VITE_SUPABASE_URL=https://xyz123.supabase.co
   VITE_SUPABASE_ANON_KEY=your-anon-key
   ```

3. Run locally:
   ```bash
   npm run dev
   ```

## Deploying to Vercel

1. Push the project to GitHub.
2. Connect the repository to Vercel.
3. Set the same environment variables in Vercel:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
4. Vercel will use the build command:
   ```bash
   npm run build
   ```

## Notes

- This project uses Vite so `app.js` is loaded as a module.
- Supabase config is read from Vite env vars.
