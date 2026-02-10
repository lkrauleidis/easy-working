// AI Service - OpenAI GPT-5.2 Integration (Responses API)

const OPENAI_API_URL = 'https://api.openai.com/v1/responses';

/**
 * Validate an OpenAI API key
 */
export async function validateApiKey(apiKey) {
  try {
    const response = await fetch(OPENAI_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'gpt-5.2',
        input: 'Hello',
        max_output_tokens: 5
      })
    });

    if (response.ok) {
      return { valid: true };
    }

    const error = await response.json();
    return {
      valid: false,
      error: error.error?.message || 'Invalid API key'
    };
  } catch (error) {
    return {
      valid: false,
      error: 'Failed to validate API key: ' + error.message
    };
  }
}

/**
 * Generate a tailored resume using GPT-5.2
 */
export async function generateTailoredResume(options) {
  const {
    apiKey,
    resumeData,
    rawResumeContent,
    jobDescription,
    position,
    company,
    preferences = {}
  } = options;

  // Step 1: Analyze the job description
  const jdAnalysis = await analyzeJobDescription(apiKey, jobDescription);

  // Use provided position/company or extracted ones
  const finalPosition = position || jdAnalysis.position || 'Position';
  const finalCompany = company || jdAnalysis.company || 'Company';

  // Step 2: Generate tailored resume content
  const tailoredContent = await generateTailoredContent(
    apiKey,
    resumeData,
    rawResumeContent,
    jdAnalysis,
    preferences
  );

  return {
    resume: tailoredContent,
    position: finalPosition,
    company: finalCompany,
    keywords: jdAnalysis.keywords
  };
}

/**
 * Analyze job description to extract key information
 */
async function analyzeJobDescription(apiKey, jobDescription) {
  const prompt = `Analyze this job description and extract the following information in JSON format:

{
  "position": "exact job title",
  "company": "company name",
  "requiredSkills": ["skill1", "skill2", ...],
  "preferredSkills": ["skill1", "skill2", ...],
  "yearsExperience": "number or range",
  "educationRequirements": ["requirement1", ...],
  "keyResponsibilities": ["responsibility1", ...],
  "keywords": ["keyword1", "keyword2", ...],
  "industryTerms": ["term1", "term2", ...]
}

Job Description:
${jobDescription}

Return ONLY valid JSON, no other text.`;

  const response = await callOpenAI(apiKey, prompt, 1000);

  try {
    // Try to extract JSON from the response
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    return JSON.parse(response);
  } catch (error) {
    console.error('Error parsing JD analysis:', error);
    // Return basic structure if parsing fails
    return {
      position: '',
      company: '',
      requiredSkills: [],
      preferredSkills: [],
      keywords: extractKeywordsSimple(jobDescription)
    };
  }
}

/**
 * Generate tailored resume content
 */
async function generateTailoredContent(apiKey, resumeData, rawResumeContent, jdAnalysis, preferences) {
  const prompt = `You are an expert resume writer specializing in ATS-optimized resumes. Your task is to tailor a resume to match a specific job posting.

ORIGINAL RESUME DATA:
Name: ${resumeData.name}
Email: ${resumeData.email}
Phone: ${resumeData.phone}
Location: ${resumeData.location}
LinkedIn: ${resumeData.linkedin}

Summary: ${resumeData.summary || 'Not provided'}

Experience:
${formatExperience(resumeData.experience)}

Education:
${formatEducation(resumeData.education)}

Skills:
${formatSkills(resumeData.skills)}

Certifications: ${resumeData.certifications?.join(', ') || 'Not provided'}

JOB REQUIREMENTS:
Position: ${jdAnalysis.position}
Company: ${jdAnalysis.company}
Required Skills: ${jdAnalysis.requiredSkills?.join(', ')}
Preferred Skills: ${jdAnalysis.preferredSkills?.join(', ')}
Key Responsibilities: ${jdAnalysis.keyResponsibilities?.join('; ')}
Keywords to include: ${jdAnalysis.keywords?.join(', ')}

INSTRUCTIONS:
1. Create a tailored resume that emphasizes relevant experience matching the job requirements
2. Rewrite bullet points to incorporate relevant keywords naturally
3. Write a compelling professional summary targeted to this specific role
4. IMPORTANT: Only reframe existing experience - do not fabricate or add false information
5. Maintain truthfulness while highlighting relevant aspects of the candidate's background
6. Optimize for ATS by using keywords from the job description naturally
7. For skills, ALWAYS include these mandatory base skills in the appropriate categories:
   - Frontend: React, TypeScript (always include)
   - Backend: Node.js, Python (always include)
   - Testing & Quality: Unit Testing, Cypress (always include)
   - Collaboration: Agile, Cross-functional Teams, Mentorship (always include)
8. Add additional relevant skills from the job requirements into the appropriate categories
9. Each experience entry MUST have at least 5 bullet points (no fewer than 5)
10. Each skills category MUST list at least 7 skills (no fewer than 7)
11. Provide a match score between 95 and 98 (inclusive)

Return the tailored resume in the following JSON format:
{
  "matchScore": 96,
  "contact": {
    "name": "string",
    "email": "string",
    "phone": "string",
    "location": "string",
    "linkedin": "string",
    "website": "string"
  },
  "summary": "2-3 sentence professional summary tailored to this role",
  "experience": [
    {
      "title": "Job Title",
      "company": "Company Name",
      "dates": "Start - End",
      "location": "City, State",
      "bullets": ["Achievement 1", "Achievement 2", "Achievement 3"]
    }
  ],
  "education": [
    {
      "school": "University Name",
      "faculty": "Field of Study/Major",
      "degree": "Degree",
      "dates": "Start - End",
      "gpa": "GPA if applicable",
      "honors": "Honors if applicable"
    }
  ],
  "skills": {
    "frontend": ["React", "TypeScript", "...additional"],
    "backend": ["Node.js", "Python", "...additional"],
    "database": ["...relevant database skills"],
    "security": ["...relevant security skills"],
    "ai_llm": ["...relevant AI & LLM skills"],
    "cloud_devops": ["...relevant cloud/devops skills"],
    "testing": ["Unit Testing", "Cypress", "...additional"],
    "collaboration": ["Agile", "Cross-functional Teams", "Mentorship", "...additional"],
    "technical": ["...relevant technical skills"],
    "soft": ["...relevant soft skills"]
  },
  "certifications": ["Certification 1", "Certification 2"]
}

Return ONLY valid JSON.`;

  const response = await callOpenAI(apiKey, prompt, 3000);

  try {
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    return JSON.parse(response);
  } catch (error) {
    console.error('Error parsing tailored resume:', error);
    throw new Error('Failed to generate tailored resume. Please try again.');
  }
}

/**
 * Format skills for the prompt - handles both array and categorized object
 */
function formatSkills(skills) {
  if (!skills) return 'Not provided';
  if (Array.isArray(skills)) return skills.join(', ');
  if (typeof skills === 'object') {
    const categoryLabels = {
      frontend: 'Frontend',
      backend: 'Backend',
      database: 'Database',
      security: 'Security',
      securityCompliance: 'Security & Compliance',
      ai_llm: 'AI & LLM Systems',
      aiSystems: 'AI & LLM Systems',
      cloud_devops: 'Cloud & DevOps',
      cloudDevOps: 'Cloud & DevOps',
      testing: 'Testing & Quality',
      collaboration: 'Collaboration',
      technical: 'Technical',
      soft: 'Soft Skills'
    };
    const parts = [];
    for (const [category, items] of Object.entries(skills)) {
      if (Array.isArray(items) && items.length > 0) {
        const label = categoryLabels[category] || category;
        parts.push(`${label}: ${items.join(', ')}`);
      }
    }
    return parts.length > 0 ? parts.join('\n') : 'Not provided';
  }
  return String(skills);
}

/**
 * Format experience for the prompt
 */
function formatExperience(experience) {
  if (!experience || experience.length === 0) {
    return 'Not provided';
  }

  return experience.map(exp => {
    const title = exp.title || exp.role || 'Unknown Title';
    const dates = exp.dates || combineDates(exp.startDate, exp.endDate) || '';
    const bullets = exp.bullets || exp.highlights || [];
    let text = `${title} at ${exp.company || 'Unknown Company'}`;
    if (dates) text += ` (${dates})`;
    if (exp.location) text += ` - ${exp.location}`;
    if (bullets.length > 0) {
      text += '\n' + bullets.map(b => `  - ${b}`).join('\n');
    }
    return text;
  }).join('\n\n');
}

/**
 * Format education for the prompt
 */
function formatEducation(education) {
  if (!education || education.length === 0) {
    return 'Not provided';
  }

  return education.map(edu => {
    let text = edu.degree || 'Unknown Degree';
    const school = edu.school || edu.institution || edu.university || '';
    const dates = edu.dates || combineDates(edu.startDate, edu.endDate) || '';
    if (school) text += ` - ${school}`;
    if (dates) text += ` (${dates})`;
    if (edu.gpa) text += ` - GPA: ${edu.gpa}`;
    return text;
  }).join('\n');
}

/**
 * Combine startDate and endDate into a single date string
 */
function combineDates(start, end) {
  if (!start && !end) return '';
  return `${start || ''}${start && end ? ' - ' : ''}${end || ''}`;
}

/**
 * Call OpenAI API (Responses API)
 */
async function callOpenAI(apiKey, prompt, maxTokens = 2000) {
  const response = await fetch(OPENAI_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: 'gpt-5.2',
      instructions: 'You are an expert resume writer and ATS optimization specialist. Always respond with valid JSON when requested.',
      input: prompt,
      max_output_tokens: maxTokens,
      temperature: 0.7
    })
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error?.message || 'OpenAI API error');
  }

  const data = await response.json();
  return data.output_text;
}

/**
 * Simple keyword extraction fallback
 */
function extractKeywordsSimple(text) {
  const words = text.toLowerCase().split(/\W+/);
  const stopWords = new Set(['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might', 'must', 'shall', 'can', 'this', 'that', 'these', 'those', 'i', 'you', 'he', 'she', 'it', 'we', 'they', 'what', 'which', 'who', 'whom', 'when', 'where', 'why', 'how', 'all', 'each', 'every', 'both', 'few', 'more', 'most', 'other', 'some', 'such', 'no', 'nor', 'not', 'only', 'own', 'same', 'so', 'than', 'too', 'very', 'just', 'as', 'if', 'about', 'into', 'through', 'during', 'before', 'after', 'above', 'below', 'up', 'down', 'out', 'off', 'over', 'under', 'again', 'further', 'then', 'once', 'here', 'there', 'any', 'our', 'your']);

  const wordCount = {};
  for (const word of words) {
    if (word.length > 3 && !stopWords.has(word)) {
      wordCount[word] = (wordCount[word] || 0) + 1;
    }
  }

  return Object.entries(wordCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([word]) => word);
}
