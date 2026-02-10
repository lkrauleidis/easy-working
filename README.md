# JobBot - Tailored Resume Generator

A Chrome extension that generates tailored resumes from job descriptions, with templates served by a Node.js backend (local or hosted).

## Features

- Side panel UI (fixed on the right side of the browser)
- Template selection from backend (no upload in the extension)
- Job description extraction from supported job sites
- AI-powered tailoring and ATS-friendly formatting
- PDF and DOCX downloads
- Match score output (95 to 98)

## Installation

1. Clone or download this repository.
2. Open Chrome and navigate to `chrome://extensions/`.
3. Enable Developer mode.
4. Click "Load unpacked" and select the `JobBot` folder.

## Backend Setup (Node.js)

The extension loads resume templates from the backend. You can use the hosted backend or run it locally.

### Hosted Backend (Recommended)

The backend is deployed at:

- `https://easy-working.onrender.com`

### Local Backend (Development)

Start the backend locally:

1. Open a terminal in `server/`.
2. Run `npm install`.
3. Run `npm start`.

This starts the backend at `http://localhost:3000`.

### Upload Templates

Open the admin page in your browser:

- `http://localhost:3000/admin`

Upload JSON resume templates there. The extension will show them in the template dropdown.

## Extension Setup

1. Click the JobBot extension icon to open the side panel.
2. Upload templates (and your OpenAI API key) using the backend admin page.

## Usage

1. Select a resume template in the Profile tab.
2. Go to Generate tab.
3. Extract or paste a job description.
4. Click Generate Tailored Resume.
5. Download PDF or DOCX.

## File Structure

```
JobBot/
  manifest.json
  popup/
    popup.html
    popup.css
    popup.js
  background/
    background.js
  content/
    content.js
  utils/
    aiService.js
  templates/
    resumeTemplate.js
  server/
    server.js
    package.json
    admin/
      index.html
```

## Notes

- The extension CSP allows `https://easy-working.onrender.com`, `http://localhost:3000`, and `http://127.0.0.1:3000` for backend calls.
- The AI prompt enforces at least 5 bullets per experience and at least 7 skills per category.

## License

MIT
