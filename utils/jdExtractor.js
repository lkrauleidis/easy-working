// JD Extractor Utility - Helper functions for job description extraction

/**
 * Extract job description from page content
 * This module provides utilities used by the content script
 */

/**
 * Common job board configurations
 */
export const JOB_BOARDS = {
  linkedin: {
    domain: 'linkedin.com',
    selectors: {
      title: [
        '.job-details-jobs-unified-top-card__job-title h1',
        '.jobs-unified-top-card__job-title',
        '.t-24.t-bold'
      ],
      company: [
        '.job-details-jobs-unified-top-card__company-name',
        '.jobs-unified-top-card__company-name'
      ],
      description: [
        '.jobs-description__content',
        '.jobs-box__html-content'
      ]
    }
  },
  indeed: {
    domain: 'indeed.com',
    selectors: {
      title: [
        '.jobsearch-JobInfoHeader-title',
        '[data-testid="jobsearch-JobInfoHeader-title"]'
      ],
      company: [
        '[data-testid="inlineHeader-companyName"]',
        '.jobsearch-InlineCompanyRating-companyHeader'
      ],
      description: [
        '#jobDescriptionText',
        '.jobsearch-jobDescriptionText'
      ]
    }
  },
  glassdoor: {
    domain: 'glassdoor.com',
    selectors: {
      title: [
        '[data-test="job-title"]'
      ],
      company: [
        '[data-test="employerName"]'
      ],
      description: [
        '.jobDescriptionContent',
        '[data-test="description"]'
      ]
    }
  }
};

/**
 * Generic selectors for unknown job sites
 */
export const GENERIC_SELECTORS = {
  title: [
    'h1.job-title',
    '.job-title h1',
    '[class*="job-title"]',
    'h1[class*="title"]',
    '.posting-headline h2'
  ],
  company: [
    '.company-name',
    '[class*="company-name"]',
    '[class*="employer"]',
    '.job-company'
  ],
  description: [
    '.job-description',
    '[class*="job-description"]',
    '.job-details',
    '#job-description',
    '[data-automation="jobDescription"]',
    'article'
  ]
};

/**
 * Common keywords that indicate job-related content
 */
export const JOB_KEYWORDS = [
  'responsibilities',
  'requirements',
  'qualifications',
  'experience',
  'skills',
  'about the role',
  'what you\'ll do',
  'who you are',
  'must have',
  'nice to have',
  'benefits',
  'compensation',
  'salary',
  'apply now'
];

/**
 * Check if text content likely contains a job description
 * @param {string} text - The text to check
 * @returns {boolean} Whether the text appears to be a job description
 */
export function isLikelyJobDescription(text) {
  if (!text || text.length < 200) return false;

  const lowerText = text.toLowerCase();
  let keywordCount = 0;

  for (const keyword of JOB_KEYWORDS) {
    if (lowerText.includes(keyword)) {
      keywordCount++;
    }
  }

  // If at least 3 job-related keywords are found, it's likely a JD
  return keywordCount >= 3;
}

/**
 * Extract structured information from job description text
 * @param {string} text - The job description text
 * @returns {Object} Extracted information
 */
export function extractJobInfo(text) {
  return {
    requirements: extractSection(text, /requirements?|qualifications?/i),
    responsibilities: extractSection(text, /responsibilities|duties|what you('ll| will) do/i),
    skills: extractSkills(text),
    experience: extractExperience(text),
    education: extractEducation(text),
    salary: extractSalary(text)
  };
}

/**
 * Extract a section from text based on header pattern
 */
function extractSection(text, headerPattern) {
  const lines = text.split('\n');
  let inSection = false;
  const sectionLines = [];

  for (const line of lines) {
    if (headerPattern.test(line)) {
      inSection = true;
      continue;
    }

    if (inSection) {
      // Check if we've hit another section header
      if (/^[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*:?\s*$/.test(line.trim()) && line.length < 50) {
        break;
      }
      if (line.trim()) {
        sectionLines.push(line.trim());
      }
    }
  }

  return sectionLines;
}

/**
 * Extract skills mentioned in the text
 */
function extractSkills(text) {
  const commonSkills = [
    'JavaScript', 'Python', 'Java', 'C++', 'C#', 'Ruby', 'Go', 'Rust', 'Swift', 'Kotlin',
    'TypeScript', 'PHP', 'SQL', 'HTML', 'CSS', 'React', 'Angular', 'Vue', 'Node.js',
    'AWS', 'Azure', 'GCP', 'Docker', 'Kubernetes', 'Git', 'Linux', 'MongoDB',
    'PostgreSQL', 'MySQL', 'Redis', 'GraphQL', 'REST', 'Agile', 'Scrum'
  ];

  const foundSkills = [];
  const lowerText = text.toLowerCase();

  for (const skill of commonSkills) {
    if (lowerText.includes(skill.toLowerCase())) {
      foundSkills.push(skill);
    }
  }

  return foundSkills;
}

/**
 * Extract experience requirements
 */
function extractExperience(text) {
  const patterns = [
    /(\d+)\+?\s*(?:years?|yrs?)(?:\s+of)?\s+(?:experience|exp)/gi,
    /(?:experience|exp)(?:\s+of)?\s*[:;]?\s*(\d+)\+?\s*(?:years?|yrs?)/gi,
    /minimum\s+(\d+)\s*(?:years?|yrs?)/gi
  ];

  const matches = [];
  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      matches.push(match[1] + '+ years');
    }
  }

  return [...new Set(matches)];
}

/**
 * Extract education requirements
 */
function extractEducation(text) {
  const patterns = [
    /(?:bachelor'?s?|master'?s?|ph\.?d\.?|mba|associate'?s?)\s*(?:degree)?(?:\s+in\s+[\w\s]+)?/gi,
    /(?:b\.?s\.?|m\.?s\.?|b\.?a\.?|m\.?a\.?)(?:\s+in\s+[\w\s]+)?/gi
  ];

  const matches = [];
  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      matches.push(match[0].trim());
    }
  }

  return [...new Set(matches)];
}

/**
 * Extract salary information
 */
function extractSalary(text) {
  const patterns = [
    /\$[\d,]+(?:\s*[-–—to]+\s*\$[\d,]+)?(?:\s*(?:per|\/)\s*(?:year|yr|hour|hr|month|mo))?/gi,
    /(?:salary|compensation|pay)(?:\s+range)?[:\s]+\$?[\d,]+(?:\s*[-–—to]+\s*\$?[\d,]+)?/gi
  ];

  const matches = [];
  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      matches.push(match[0].trim());
    }
  }

  return [...new Set(matches)];
}

/**
 * Clean and normalize job description text
 */
export function cleanJobDescription(text) {
  return text
    .replace(/\s+/g, ' ')
    .replace(/\n\s*\n/g, '\n')
    .replace(/\t/g, ' ')
    .replace(/[^\S\n]+/g, ' ')
    .trim();
}

/**
 * Detect which job board the current page is from
 */
export function detectJobBoard(hostname) {
  for (const [name, config] of Object.entries(JOB_BOARDS)) {
    if (hostname.includes(config.domain)) {
      return name;
    }
  }
  return null;
}
