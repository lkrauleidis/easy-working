// Content Script for Job Description Extraction

// Listen for messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'extractJD') {
    const result = extractJobDescription();
    sendResponse(result);
  }
  return true;
});

function extractJobDescription() {
  try {
    // Try to extract structured data first
    let jobDescription = '';
    let position = '';
    let company = '';

    // Try LinkedIn
    if (window.location.hostname.includes('linkedin.com')) {
      const result = extractLinkedIn();
      if (result.jobDescription) return { success: true, ...result };
    }

    // Try Indeed
    if (window.location.hostname.includes('indeed.com')) {
      const result = extractIndeed();
      if (result.jobDescription) return { success: true, ...result };
    }

    // Try Glassdoor
    if (window.location.hostname.includes('glassdoor.com')) {
      const result = extractGlassdoor();
      if (result.jobDescription) return { success: true, ...result };
    }

    // Try generic extraction for other sites
    const genericResult = extractGeneric();
    if (genericResult.jobDescription) {
      return { success: true, ...genericResult };
    }

    // Fall back to full page text
    const pageText = extractPageText();
    if (pageText.length > 100) {
      return {
        success: true,
        jobDescription: pageText,
        position: extractPositionFromText(pageText),
        company: extractCompanyFromPage()
      };
    }

    return { success: false, error: 'Could not extract job description' };
  } catch (error) {
    console.error('Error extracting JD:', error);
    return { success: false, error: error.message };
  }
}

// LinkedIn extraction
function extractLinkedIn() {
  let jobDescription = '';
  let position = '';
  let company = '';

  // Job title
  const titleEl = document.querySelector('.job-details-jobs-unified-top-card__job-title h1') ||
    document.querySelector('.jobs-unified-top-card__job-title') ||
    document.querySelector('.t-24.t-bold.jobs-unified-top-card__job-title');
  if (titleEl) position = titleEl.textContent.trim();

  // Company name
  const companyEl = document.querySelector('.job-details-jobs-unified-top-card__company-name') ||
    document.querySelector('.jobs-unified-top-card__company-name') ||
    document.querySelector('.jobs-unified-top-card__subtitle-primary-grouping a');
  if (companyEl) company = companyEl.textContent.trim();

  // Job description
  const descEl = document.querySelector('.jobs-description__content') ||
    document.querySelector('.jobs-box__html-content') ||
    document.querySelector('.job-details-jobs-unified-top-card__job-insight');
  if (descEl) jobDescription = cleanText(descEl.textContent);

  return { jobDescription, position, company };
}

// Indeed extraction
function extractIndeed() {
  let jobDescription = '';
  let position = '';
  let company = '';

  // Job title
  const titleEl = document.querySelector('.jobsearch-JobInfoHeader-title') ||
    document.querySelector('[data-testid="jobsearch-JobInfoHeader-title"]') ||
    document.querySelector('h1.icl-u-xs-mb--xs');
  if (titleEl) position = titleEl.textContent.trim();

  // Company name
  const companyEl = document.querySelector('[data-testid="inlineHeader-companyName"]') ||
    document.querySelector('.jobsearch-InlineCompanyRating-companyHeader') ||
    document.querySelector('.icl-u-lg-mr--sm');
  if (companyEl) company = companyEl.textContent.trim();

  // Job description
  const descEl = document.querySelector('#jobDescriptionText') ||
    document.querySelector('.jobsearch-jobDescriptionText') ||
    document.querySelector('[data-testid="jobsearch-JobComponent-description"]');
  if (descEl) jobDescription = cleanText(descEl.textContent);

  return { jobDescription, position, company };
}

// Glassdoor extraction
function extractGlassdoor() {
  let jobDescription = '';
  let position = '';
  let company = '';

  // Job title
  const titleEl = document.querySelector('[data-test="job-title"]') ||
    document.querySelector('.css-1vg6q84');
  if (titleEl) position = titleEl.textContent.trim();

  // Company name
  const companyEl = document.querySelector('[data-test="employerName"]') ||
    document.querySelector('.css-87uc0g');
  if (companyEl) company = companyEl.textContent.trim();

  // Job description
  const descEl = document.querySelector('.jobDescriptionContent') ||
    document.querySelector('[data-test="description"]') ||
    document.querySelector('.desc');
  if (descEl) jobDescription = cleanText(descEl.textContent);

  return { jobDescription, position, company };
}

// Generic extraction for any job site
function extractGeneric() {
  let jobDescription = '';
  let position = '';
  let company = '';

  // Common selectors for job titles
  const titleSelectors = [
    'h1.job-title', '.job-title h1', '[class*="job-title"]',
    'h1[class*="title"]', '.posting-headline h2',
    '[data-automation="job-detail-title"]',
    '.job-header h1', '.position-title'
  ];

  for (const selector of titleSelectors) {
    const el = document.querySelector(selector);
    if (el && el.textContent.trim().length > 2) {
      position = el.textContent.trim();
      break;
    }
  }

  // Common selectors for company names
  const companySelectors = [
    '.company-name', '[class*="company-name"]',
    '[class*="employer"]', '.job-company',
    '[data-automation="job-detail-company"]'
  ];

  for (const selector of companySelectors) {
    const el = document.querySelector(selector);
    if (el && el.textContent.trim().length > 1) {
      company = el.textContent.trim();
      break;
    }
  }

  // Common selectors for job descriptions
  const descSelectors = [
    '.job-description', '[class*="job-description"]',
    '.job-details', '[class*="job-details"]',
    '.description', '#job-description',
    '[data-automation="jobDescription"]',
    '.posting-requirements', '.job-content',
    'article', '.job-body', '.job-info'
  ];

  for (const selector of descSelectors) {
    const el = document.querySelector(selector);
    if (el && el.textContent.trim().length > 200) {
      jobDescription = cleanText(el.textContent);
      break;
    }
  }

  // If no description found, look for the main content area
  if (!jobDescription) {
    const mainContent = document.querySelector('main') ||
      document.querySelector('[role="main"]') ||
      document.querySelector('.content') ||
      document.querySelector('#content');

    if (mainContent) {
      jobDescription = cleanText(mainContent.textContent);
    }
  }

  return { jobDescription, position, company };
}

// Extract all visible text from page
function extractPageText() {
  const walker = document.createTreeWalker(
    document.body,
    NodeFilter.SHOW_TEXT,
    {
      acceptNode: function (node) {
        // Skip hidden elements
        const parent = node.parentElement;
        if (!parent) return NodeFilter.FILTER_REJECT;

        const style = window.getComputedStyle(parent);
        if (style.display === 'none' || style.visibility === 'hidden') {
          return NodeFilter.FILTER_REJECT;
        }

        // Skip script, style, and other non-content tags
        const tagName = parent.tagName.toLowerCase();
        if (['script', 'style', 'noscript', 'iframe', 'svg'].includes(tagName)) {
          return NodeFilter.FILTER_REJECT;
        }

        return NodeFilter.FILTER_ACCEPT;
      }
    }
  );

  let text = '';
  while (walker.nextNode()) {
    const nodeText = walker.currentNode.textContent.trim();
    if (nodeText) {
      text += nodeText + ' ';
    }
  }

  return cleanText(text);
}

// Try to extract position from text content
function extractPositionFromText(text) {
  // Look for common patterns
  const patterns = [
    /(?:job title|position|role)[:;\s]+([^\n,]+)/i,
    /(?:hiring|looking for|seeking)(?:\s+(?:a|an))?\s+([^\n,]+)/i
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match && match[1].trim().length > 2) {
      return match[1].trim().substring(0, 100);
    }
  }

  // Check page title
  const pageTitle = document.title;
  if (pageTitle && !pageTitle.toLowerCase().includes('job')) {
    const titleParts = pageTitle.split(/[|\-–—]/);
    if (titleParts.length > 0) {
      return titleParts[0].trim().substring(0, 100);
    }
  }

  return '';
}

// Try to extract company from page
function extractCompanyFromPage() {
  // Check meta tags
  const metaCompany = document.querySelector('meta[property="og:site_name"]') ||
    document.querySelector('meta[name="author"]');
  if (metaCompany) {
    const content = metaCompany.getAttribute('content');
    if (content && content.length > 1 && content.length < 100) {
      return content;
    }
  }

  // Check page title
  const pageTitle = document.title;
  const titleParts = pageTitle.split(/[|\-–—]/);
  if (titleParts.length > 1) {
    const lastPart = titleParts[titleParts.length - 1].trim();
    if (lastPart.length > 1 && lastPart.length < 50) {
      return lastPart;
    }
  }

  return '';
}

// Clean extracted text
function cleanText(text) {
  return text
    .replace(/\s+/g, ' ')           // Collapse whitespace
    .replace(/\n\s*\n/g, '\n')      // Remove empty lines
    .replace(/\t/g, ' ')            // Replace tabs with spaces
    .trim()
    .substring(0, 10000);           // Limit length
}
