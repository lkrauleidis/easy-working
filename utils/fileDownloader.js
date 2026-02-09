// File Downloader Utility

/**
 * Download a file using Chrome downloads API or fallback method
 * @param {Blob} blob - The file blob to download
 * @param {string} filename - The filename for the download
 * @param {string} mimeType - The MIME type of the file
 */
export async function downloadFile(blob, filename, mimeType) {
  // Create a URL for the blob
  const url = URL.createObjectURL(blob);

  try {
    // Use Chrome downloads API if available (preferred for extensions)
    if (typeof chrome !== 'undefined' && chrome.downloads) {
      await chrome.downloads.download({
        url: url,
        filename: filename,
        saveAs: true
      });
    } else {
      // Fallback to anchor click method
      downloadViaAnchor(url, filename);
    }
  } catch (error) {
    console.error('Download error:', error);
    // Try fallback method
    downloadViaAnchor(url, filename);
  } finally {
    // Clean up the URL after a delay
    setTimeout(() => {
      URL.revokeObjectURL(url);
    }, 10000);
  }
}

/**
 * Download file using anchor element click
 * @param {string} url - The blob URL
 * @param {string} filename - The filename
 */
function downloadViaAnchor(url, filename) {
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.style.display = 'none';

  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
}

/**
 * Convert ArrayBuffer to Base64 string
 * @param {ArrayBuffer} buffer - The buffer to convert
 * @returns {string} Base64 encoded string
 */
export function arrayBufferToBase64(buffer) {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;

  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }

  return btoa(binary);
}

/**
 * Convert Base64 string to ArrayBuffer
 * @param {string} base64 - The base64 string to convert
 * @returns {ArrayBuffer} The resulting ArrayBuffer
 */
export function base64ToArrayBuffer(base64) {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);

  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }

  return bytes.buffer;
}

/**
 * Create a blob from base64 data
 * @param {string} base64 - The base64 encoded data
 * @param {string} mimeType - The MIME type
 * @returns {Blob} The resulting blob
 */
export function base64ToBlob(base64, mimeType) {
  const buffer = base64ToArrayBuffer(base64);
  return new Blob([buffer], { type: mimeType });
}

/**
 * Read a file as ArrayBuffer
 * @param {File} file - The file to read
 * @returns {Promise<ArrayBuffer>} The file contents as ArrayBuffer
 */
export function readFileAsArrayBuffer(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
}

/**
 * Read a file as Base64
 * @param {File} file - The file to read
 * @returns {Promise<string>} The file contents as Base64 string
 */
export function readFileAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      // Remove the data URL prefix (e.g., "data:application/pdf;base64,")
      const base64 = reader.result.split(',')[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/**
 * Get file extension from MIME type
 * @param {string} mimeType - The MIME type
 * @returns {string} The file extension
 */
export function getExtensionFromMimeType(mimeType) {
  const mimeToExt = {
    'application/pdf': 'pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
    'application/msword': 'doc',
    'text/plain': 'txt',
    'application/json': 'json'
  };

  return mimeToExt[mimeType] || 'bin';
}

/**
 * Get MIME type from file extension
 * @param {string} extension - The file extension
 * @returns {string} The MIME type
 */
export function getMimeTypeFromExtension(extension) {
  const extToMime = {
    'pdf': 'application/pdf',
    'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'doc': 'application/msword',
    'txt': 'text/plain',
    'json': 'application/json'
  };

  return extToMime[extension.toLowerCase()] || 'application/octet-stream';
}

/**
 * Sanitize a filename by removing invalid characters
 * @param {string} filename - The filename to sanitize
 * @returns {string} The sanitized filename
 */
export function sanitizeFilename(filename) {
  // Remove or replace invalid characters for Windows/Mac/Linux
  return filename
    .replace(/[<>:"/\\|?*]/g, '-')   // Replace invalid chars with dash
    .replace(/\s+/g, '-')             // Replace spaces with dash
    .replace(/-+/g, '-')              // Collapse multiple dashes
    .replace(/^-|-$/g, '')            // Remove leading/trailing dashes
    .substring(0, 200);               // Limit length
}

/**
 * Generate a unique filename with timestamp
 * @param {string} baseName - The base filename
 * @param {string} extension - The file extension
 * @returns {string} The unique filename
 */
export function generateUniqueFilename(baseName, extension) {
  const sanitized = sanitizeFilename(baseName);
  const timestamp = new Date().toISOString().split('T')[0];
  return `${sanitized}-${timestamp}.${extension}`;
}
