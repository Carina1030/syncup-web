<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/drive/11LKhm9f13v4ZO0f3QsukPySXU9mQBuC0

## Run Locally

**Prerequisites:**  Node.js

1. Install dependencies:
   ```bash
   npm install
   ```

2. Set up environment variables:
   - Copy `.env.local.example` to `.env.local` (or create it)
   - Add your API keys:
     ```env
     GEMINI_API_KEY=your_gemini_api_key_here
     VITE_GOOGLE_CLIENT_ID=your_google_client_id_here
     VITE_GOOGLE_API_KEY=your_google_api_key_here
     ```

3. (Optional) Set up Google Calendar integration:
   - See [GOOGLE_CALENDAR_SETUP.md](GOOGLE_CALENDAR_SETUP.md) for detailed instructions
   - Or use demo mode by clicking "Sync Calendar" without connecting

4. Run the app:
   ```bash
   npm run dev
   ```

## Apple Calendar Integration

To connect your real Apple Calendar (iCloud):
1. Follow the setup guide in [APPLE_CALENDAR_SETUP.md](APPLE_CALENDAR_SETUP.md)
2. Generate an app-specific password at appleid.apple.com
3. Click "Connect Apple" button in the app
4. Enter your Apple ID and app-specific password
5. Click "Sync Calendar" to fetch your events

**Note**: For production use, you may need a backend proxy server to handle CalDAV requests due to CORS restrictions. See the setup guide for details.
