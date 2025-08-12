# Pincode Search + Price Calculator (Vercel)

## Setup
1. Clone this repository.
2. Place your Excel files into `api/data/`:
   - Pincode excel (file name must include 'pincode')
   - urgent excel (file name must include 'urgent')
3. Install dependencies:
   ```
   npm install
   ```

## Local dev (Vercel)
- Install Vercel CLI and run:
  ```
  npm run start
  ```
  This uses `vercel dev` to run serverless functions locally.

## Deploy to Vercel
1. `vercel login`
2. `vercel` (follow prompts) or `vercel --prod` to deploy production

The site will be served as a static site and the serverless function endpoint will be available at `/api/search`.

## Notes
- Inputs:
  - `pincode` (string or number)
  - `weightKg` (number, kg)
  - `serviceType` ('normal' or 'urgent')
  - `transportMode` ('surface' or 'air') — required for normal service >=5kg
- The server expects your pincode excel to contain a column with `Pincode` or similar, and a column with `Category`/`Area`. The urgent file should contain destination rows.
- If you want me to adapt parsing to your exact Excel column names, upload the two files and I will customize the serverless code to match exact column headers.
