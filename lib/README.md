# Libraries

This extension loads JavaScript libraries dynamically from CDN:

- **PDF.js** (v3.11.174) - PDF parsing
- **Mammoth.js** (v1.6.0) - DOCX parsing
- **jsPDF** (v2.5.1) - PDF generation
- **docx** (v8.2.0) - DOCX generation

Libraries are loaded on-demand when needed to minimize initial load time.

If you prefer to bundle libraries locally for offline use:

1. Download the library files from their respective CDNs
2. Place them in this directory
3. Update the `loadScript()` calls in `popup/popup.js` to use local paths
