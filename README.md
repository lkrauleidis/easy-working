# JobBot - Tailored Resume Generator

A Chrome extension that generates tailored resumes from job descriptions, with templates served by a local Node.js backend.

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

The extension loads resume templates from the backend. Start the backend first:

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
2. Go to Settings and set your OpenAI API key.
3. (Optional) Set the Backend URL if different from `http://localhost:3000`.

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

- If you change the backend host or port, update the extension Setting "Backend URL".
- The extension CSP currently allows `http://localhost:3000` and `http://127.0.0.1:3000` for template fetches.
- The AI prompt enforces at least 5 bullets per experience and at least 7 skills per category.

## License

MIT
