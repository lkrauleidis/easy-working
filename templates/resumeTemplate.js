// Resume Template - ATS-Friendly Resume Formatting

/**
 * ATS-Friendly Resume Template Configuration
 * This template follows best practices for Applicant Tracking Systems
 */
export const RESUME_TEMPLATE = {
  // Document settings
  document: {
    pageSize: 'letter',
    margins: {
      top: 0.5,    // inches
      bottom: 0.5,
      left: 0.5,
      right: 0.5
    },
    lineSpacing: 1.15
  },

  // Typography
  fonts: {
    primary: 'Calibri',
    alternatives: ['Arial', 'Times New Roman', 'Georgia', 'Helvetica'],
    sizes: {
      name: 22,
      sectionHeader: 12,
      subheader: 11,
      body: 10,
      small: 9
    }
  },

  // Section order (ATS-optimized)
  sectionOrder: [
    'contact',
    'summary',
    'experience',
    'education',
    'skills',
    'certifications',
    'projects'
  ],

  // Section headers
  sectionHeaders: {
    contact: 'CONTACT INFORMATION',
    summary: 'PROFESSIONAL SUMMARY',
    experience: 'WORK EXPERIENCE',
    education: 'EDUCATION',
    skills: 'SKILLS',
    certifications: 'CERTIFICATIONS',
    projects: 'PROJECTS'
  },

  // Formatting rules
  formatting: {
    // Use clear section headers
    sectionHeaderStyle: 'uppercase',
    sectionHeaderBorder: true,

    // Date formatting
    dateFormat: 'MMM YYYY',
    datePosition: 'right',

    // Bullet points
    bulletStyle: '\u2022', // Standard bullet
    bulletIndent: 0.25,    // inches

    // Spacing
    sectionSpacing: 12,    // points
    itemSpacing: 6,        // points
    bulletSpacing: 3       // points
  },

  // Colors (ATS-safe)
  colors: {
    primary: '#000000',    // Black for main text
    secondary: '#333333',  // Dark gray for secondary
    accent: '#0000AA',     // Blue for links
    border: '#CCCCCC'      // Light gray for borders
  }
};

/**
 * Format contact information for ATS
 */
export function formatContact(contact) {
  const parts = [];

  if (contact.name) {
    parts.push({ type: 'name', value: contact.name });
  }

  const contactLine = [];
  if (contact.email) contactLine.push(contact.email);
  if (contact.phone) contactLine.push(contact.phone);
  if (contact.location) contactLine.push(contact.location);

  if (contactLine.length > 0) {
    parts.push({ type: 'contact', value: contactLine.join(' | ') });
  }

  const links = [];
  if (contact.linkedin) links.push(contact.linkedin);
  if (contact.website) links.push(contact.website);

  if (links.length > 0) {
    parts.push({ type: 'links', value: links.join(' | ') });
  }

  return parts;
}

/**
 * Format experience entry for ATS
 */
export function formatExperience(exp) {
  return {
    title: exp.title || 'Position',
    company: exp.company || 'Company',
    dates: exp.dates || '',
    location: exp.location || '',
    bullets: (exp.bullets || []).map(bullet => formatBullet(bullet))
  };
}

/**
 * Format a bullet point with action verbs and metrics
 */
export function formatBullet(bullet) {
  // Ensure bullet starts with an action verb (capitalize first letter)
  let formatted = bullet.trim();

  // Capitalize first letter
  formatted = formatted.charAt(0).toUpperCase() + formatted.slice(1);

  // Remove trailing period if present
  formatted = formatted.replace(/\.+$/, '');

  return formatted;
}

/**
 * Format education entry for ATS
 */
export function formatEducation(edu) {
  return {
    degree: edu.degree || 'Degree',
    school: edu.school || 'Institution',
    dates: edu.dates || '',
    gpa: edu.gpa ? `GPA: ${edu.gpa}` : '',
    honors: edu.honors || ''
  };
}

/**
 * Format skills for ATS (comma-separated list)
 */
export function formatSkills(skills) {
  if (!skills) return '';

  if (typeof skills === 'object' && !Array.isArray(skills)) {
    const parts = [];
    if (skills.technical && skills.technical.length > 0) {
      parts.push(`Technical: ${skills.technical.join(', ')}`);
    }
    if (skills.soft && skills.soft.length > 0) {
      parts.push(`Soft Skills: ${skills.soft.join(', ')}`);
    }
    return parts.join('\n');
  }

  if (Array.isArray(skills)) {
    return skills.join(', ');
  }

  return String(skills);
}

/**
 * Generate ATS-optimized keywords section
 */
export function generateKeywordsSection(keywords) {
  if (!keywords || keywords.length === 0) return '';

  return keywords.join(' | ');
}

/**
 * Validate resume content for ATS compatibility
 */
export function validateATSCompatibility(resume) {
  const issues = [];

  // Check for required sections
  if (!resume.contact?.name) {
    issues.push('Missing name in contact section');
  }
  if (!resume.contact?.email) {
    issues.push('Missing email in contact section');
  }
  if (!resume.experience || resume.experience.length === 0) {
    issues.push('No experience entries found');
  }

  // Check for problematic characters
  const problematicChars = /[^\x00-\x7F]/g;
  const textContent = JSON.stringify(resume);
  const nonAscii = textContent.match(problematicChars);
  if (nonAscii && nonAscii.length > 10) {
    issues.push('Contains many non-ASCII characters which may cause ATS issues');
  }

  // Check bullet points
  if (resume.experience) {
    for (const exp of resume.experience) {
      if (exp.bullets) {
        for (const bullet of exp.bullets) {
          if (bullet.length > 200) {
            issues.push(`Bullet point too long in ${exp.title}: "${bullet.substring(0, 50)}..."`);
          }
        }
      }
    }
  }

  return {
    isValid: issues.length === 0,
    issues: issues
  };
}

/**
 * Action verbs recommended for resume bullets
 */
export const ACTION_VERBS = {
  leadership: [
    'Led', 'Directed', 'Managed', 'Oversaw', 'Supervised', 'Coordinated',
    'Spearheaded', 'Orchestrated', 'Pioneered', 'Championed'
  ],
  achievement: [
    'Achieved', 'Exceeded', 'Surpassed', 'Delivered', 'Accomplished',
    'Attained', 'Completed', 'Earned', 'Secured', 'Won'
  ],
  improvement: [
    'Improved', 'Enhanced', 'Optimized', 'Streamlined', 'Increased',
    'Reduced', 'Accelerated', 'Strengthened', 'Elevated', 'Upgraded'
  ],
  creation: [
    'Created', 'Developed', 'Designed', 'Built', 'Implemented',
    'Established', 'Launched', 'Initiated', 'Introduced', 'Founded'
  ],
  analysis: [
    'Analyzed', 'Assessed', 'Evaluated', 'Researched', 'Investigated',
    'Identified', 'Discovered', 'Examined', 'Measured', 'Tracked'
  ],
  communication: [
    'Presented', 'Communicated', 'Collaborated', 'Negotiated', 'Advocated',
    'Facilitated', 'Trained', 'Mentored', 'Advised', 'Consulted'
  ]
};

/**
 * Get suggested action verbs for a bullet point
 */
export function suggestActionVerbs(bulletContent, category = null) {
  if (category && ACTION_VERBS[category]) {
    return ACTION_VERBS[category];
  }

  // Analyze content to suggest appropriate verbs
  const lowerContent = bulletContent.toLowerCase();

  if (lowerContent.includes('team') || lowerContent.includes('manage')) {
    return ACTION_VERBS.leadership;
  }
  if (lowerContent.includes('increase') || lowerContent.includes('reduce')) {
    return ACTION_VERBS.improvement;
  }
  if (lowerContent.includes('create') || lowerContent.includes('develop')) {
    return ACTION_VERBS.creation;
  }
  if (lowerContent.includes('data') || lowerContent.includes('report')) {
    return ACTION_VERBS.analysis;
  }

  // Default to achievement verbs
  return ACTION_VERBS.achievement;
}
