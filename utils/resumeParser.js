// Resume Parser - Extracts structured data from PDF and DOCX files

/**
 * Parse a resume file and extract structured data
 * @param {ArrayBuffer} arrayBuffer - The file content
 * @param {string} fileType - MIME type of the file
 * @returns {Object} Parsed resume data
 */
export async function parseResume(arrayBuffer, fileType) {
  let rawText = '';

  if (fileType === 'application/pdf') {
    rawText = await parsePDF(arrayBuffer);
  } else if (fileType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
    rawText = await parseDOCX(arrayBuffer);
  } else {
    throw new Error('Unsupported file type');
  }

  // Extract structured data from the raw text
  const structured = extractStructuredData(rawText);

  return {
    rawText,
    structured
  };
}

/**
 * Parse PDF file using pdf.js
 */
async function parsePDF(arrayBuffer) {
  // Load pdf.js library dynamically
  const pdfjsLib = await loadPdfJs();

  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  let fullText = '';

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();
    const pageText = textContent.items
      .map(item => item.str)
      .join(' ');
    fullText += pageText + '\n';
  }

  return fullText;
}

/**
 * Parse DOCX file using mammoth
 */
async function parseDOCX(arrayBuffer) {
  const mammoth = await loadMammoth();

  const result = await mammoth.extractRawText({ arrayBuffer });
  return result.value;
}

/**
 * Load pdf.js library
 */
async function loadPdfJs() {
  if (typeof pdfjsLib !== 'undefined') {
    return pdfjsLib;
  }

  // Import from CDN
  await import('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.mjs');

  const pdfjsLib = window.pdfjsLib;
  pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.mjs';

  return pdfjsLib;
}

/**
 * Load mammoth library
 */
async function loadMammoth() {
  if (typeof mammoth !== 'undefined') {
    return mammoth;
  }

  // Import mammoth
  const module = await import('https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.6.0/mammoth.browser.min.js');
  return window.mammoth || module.default;
}

/**
 * Extract structured data from raw resume text
 */
function extractStructuredData(text) {
  const data = {
    name: '',
    email: '',
    phone: '',
    location: '',
    linkedin: '',
    website: '',
    summary: '',
    experience: [],
    education: [],
    skills: [],
    certifications: [],
    rawText: text
  };

  const lines = text.split('\n').map(line => line.trim()).filter(line => line);

  // Extract contact information
  data.email = extractEmail(text);
  data.phone = extractPhone(text);
  data.linkedin = extractLinkedIn(text);
  data.website = extractWebsite(text);

  // Name is usually the first line that's not an email/phone
  for (const line of lines.slice(0, 5)) {
    if (!line.includes('@') && !line.match(/^\+?[\d\s()-]+$/) && line.length > 2 && line.length < 50) {
      // Check if it looks like a name (contains mostly letters)
      if (/^[A-Za-z\s.'-]+$/.test(line)) {
        data.name = line;
        break;
      }
    }
  }

  // Extract location
  data.location = extractLocation(text);

  // Extract sections
  const sections = identifySections(text);

  // Extract summary/objective
  if (sections.summary) {
    data.summary = sections.summary.substring(0, 500);
  }

  // Extract experience
  if (sections.experience) {
    data.experience = parseExperience(sections.experience);
  }

  // Extract education
  if (sections.education) {
    data.education = parseEducation(sections.education);
  }

  // Extract skills
  if (sections.skills) {
    data.skills = parseSkills(sections.skills);
  } else {
    // Try to extract skills from the whole text
    data.skills = extractSkillsFromText(text);
  }

  // Extract certifications
  if (sections.certifications) {
    data.certifications = parseCertifications(sections.certifications);
  }

  return data;
}

function extractEmail(text) {
  const match = text.match(/[\w.+-]+@[\w-]+\.[\w.-]+/);
  return match ? match[0].toLowerCase() : '';
}

function extractPhone(text) {
  const patterns = [
    /\+?1?[-.\s]?\(?[0-9]{3}\)?[-.\s]?[0-9]{3}[-.\s]?[0-9]{4}/,
    /\+?[0-9]{1,3}[-.\s]?[0-9]{2,4}[-.\s]?[0-9]{2,4}[-.\s]?[0-9]{2,4}/
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) return match[0];
  }
  return '';
}

function extractLinkedIn(text) {
  const match = text.match(/linkedin\.com\/in\/[\w-]+/i);
  return match ? 'https://' + match[0] : '';
}

function extractWebsite(text) {
  const match = text.match(/(?:https?:\/\/)?(?:www\.)?[\w-]+\.[\w.-]+(?:\/[\w-./?%&=]*)?/gi);
  if (match) {
    for (const url of match) {
      if (!url.includes('linkedin.com') && !url.includes('@')) {
        return url;
      }
    }
  }
  return '';
}

function extractLocation(text) {
  // Look for city, state patterns
  const patterns = [
    /([A-Z][a-z]+(?:\s[A-Z][a-z]+)*),\s*([A-Z]{2})\b/,
    /([A-Z][a-z]+(?:\s[A-Z][a-z]+)*),\s*([A-Z][a-z]+)\b/
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) return match[0];
  }
  return '';
}

function identifySections(text) {
  const sections = {};
  const sectionHeaders = {
    summary: /(?:summary|objective|profile|about\s*me)/i,
    experience: /(?:experience|work\s*history|employment|professional\s*experience)/i,
    education: /(?:education|academic|qualifications|degree)/i,
    skills: /(?:skills|technical\s*skills|core\s*competencies|expertise)/i,
    certifications: /(?:certifications?|licenses?|credentials)/i,
    projects: /(?:projects|portfolio)/i
  };

  const lines = text.split('\n');
  let currentSection = null;
  let currentContent = [];

  for (const line of lines) {
    const trimmedLine = line.trim();
    if (!trimmedLine) continue;

    // Check if this line is a section header
    let foundSection = null;
    for (const [section, pattern] of Object.entries(sectionHeaders)) {
      if (pattern.test(trimmedLine) && trimmedLine.length < 50) {
        foundSection = section;
        break;
      }
    }

    if (foundSection) {
      // Save previous section
      if (currentSection && currentContent.length > 0) {
        sections[currentSection] = currentContent.join('\n');
      }
      currentSection = foundSection;
      currentContent = [];
    } else if (currentSection) {
      currentContent.push(trimmedLine);
    }
  }

  // Save last section
  if (currentSection && currentContent.length > 0) {
    sections[currentSection] = currentContent.join('\n');
  }

  return sections;
}

function parseExperience(text) {
  const experiences = [];
  const lines = text.split('\n');

  let currentExp = null;
  let bullets = [];

  for (const line of lines) {
    const trimmedLine = line.trim();
    if (!trimmedLine) continue;

    // Check for date patterns (indicates new role)
    const datePattern = /(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s*\d{2,4}\s*[-–—to]+\s*(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec|Present|Current)[a-z]*\.?\s*\d{0,4}/i;
    const yearPattern = /\d{4}\s*[-–—to]+\s*(?:\d{4}|Present|Current)/i;

    if (datePattern.test(trimmedLine) || yearPattern.test(trimmedLine)) {
      // Save previous experience
      if (currentExp) {
        currentExp.bullets = bullets;
        experiences.push(currentExp);
      }

      currentExp = {
        title: '',
        company: '',
        dates: trimmedLine.match(datePattern)?.[0] || trimmedLine.match(yearPattern)?.[0] || '',
        location: '',
        bullets: []
      };
      bullets = [];

      // Try to extract title and company from the line
      const remaining = trimmedLine.replace(datePattern, '').replace(yearPattern, '').trim();
      if (remaining) {
        const parts = remaining.split(/[|,–—-]/);
        if (parts.length >= 2) {
          currentExp.title = parts[0].trim();
          currentExp.company = parts[1].trim();
        } else {
          currentExp.title = remaining;
        }
      }
    } else if (currentExp) {
      // Check if it's a bullet point
      if (trimmedLine.startsWith('•') || trimmedLine.startsWith('-') || trimmedLine.startsWith('*') || trimmedLine.match(/^\d+\./)) {
        bullets.push(trimmedLine.replace(/^[•\-*]\s*/, '').replace(/^\d+\.\s*/, ''));
      } else if (!currentExp.title) {
        currentExp.title = trimmedLine;
      } else if (!currentExp.company) {
        currentExp.company = trimmedLine;
      } else {
        // Append to last bullet or create new one
        if (bullets.length > 0) {
          bullets[bullets.length - 1] += ' ' + trimmedLine;
        } else {
          bullets.push(trimmedLine);
        }
      }
    }
  }

  // Save last experience
  if (currentExp) {
    currentExp.bullets = bullets;
    experiences.push(currentExp);
  }

  return experiences;
}

function parseEducation(text) {
  const education = [];
  const lines = text.split('\n');

  let currentEdu = null;

  for (const line of lines) {
    const trimmedLine = line.trim();
    if (!trimmedLine) continue;

    // Check for degree patterns
    const degreePattern = /(?:Bachelor|Master|Ph\.?D|MBA|B\.?S\.?|M\.?S\.?|B\.?A\.?|M\.?A\.?|Associate)/i;

    if (degreePattern.test(trimmedLine)) {
      if (currentEdu) {
        education.push(currentEdu);
      }

      currentEdu = {
        degree: trimmedLine,
        school: '',
        dates: '',
        gpa: ''
      };
    } else if (currentEdu) {
      // Look for year
      const yearMatch = trimmedLine.match(/\d{4}/);
      if (yearMatch && !currentEdu.dates) {
        currentEdu.dates = trimmedLine;
      } else if (!currentEdu.school) {
        currentEdu.school = trimmedLine;
      }

      // Look for GPA
      const gpaMatch = trimmedLine.match(/GPA[:\s]*(\d+\.?\d*)/i);
      if (gpaMatch) {
        currentEdu.gpa = gpaMatch[1];
      }
    }
  }

  if (currentEdu) {
    education.push(currentEdu);
  }

  return education;
}

function parseSkills(text) {
  const skills = [];
  const lines = text.split('\n');

  for (const line of lines) {
    const trimmedLine = line.trim();
    if (!trimmedLine) continue;

    // Split by common delimiters
    const parts = trimmedLine.split(/[,;|•\-]/);
    for (const part of parts) {
      const skill = part.trim();
      if (skill && skill.length > 1 && skill.length < 50 && !skills.includes(skill)) {
        skills.push(skill);
      }
    }
  }

  return skills;
}

function parseCertifications(text) {
  const certifications = [];
  const lines = text.split('\n');

  for (const line of lines) {
    const trimmedLine = line.trim();
    if (trimmedLine && trimmedLine.length > 3) {
      certifications.push(trimmedLine.replace(/^[•\-*]\s*/, ''));
    }
  }

  return certifications;
}

function extractSkillsFromText(text) {
  // Common technical skills to look for
  const commonSkills = [
    'JavaScript', 'Python', 'Java', 'C++', 'C#', 'Ruby', 'Go', 'Rust', 'Swift', 'Kotlin',
    'TypeScript', 'PHP', 'SQL', 'HTML', 'CSS', 'React', 'Angular', 'Vue', 'Node.js',
    'Express', 'Django', 'Flask', 'Spring', 'AWS', 'Azure', 'GCP', 'Docker', 'Kubernetes',
    'Git', 'Linux', 'MongoDB', 'PostgreSQL', 'MySQL', 'Redis', 'GraphQL', 'REST API',
    'Agile', 'Scrum', 'CI/CD', 'Jenkins', 'Terraform', 'Machine Learning', 'TensorFlow',
    'PyTorch', 'Data Analysis', 'Excel', 'Tableau', 'Power BI', 'Salesforce', 'SAP',
    'Project Management', 'Leadership', 'Communication', 'Problem Solving'
  ];

  const foundSkills = [];
  const textLower = text.toLowerCase();

  for (const skill of commonSkills) {
    if (textLower.includes(skill.toLowerCase())) {
      foundSkills.push(skill);
    }
  }

  return foundSkills;
}
