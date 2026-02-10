// Background Service Worker
// Note: Service workers have limitations - we use offscreen documents or popup for heavy processing

// Message handler
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  handleMessage(request, sender)
    .then(sendResponse)
    .catch(error => {
      console.error('Error handling message:', error);
      sendResponse({ success: false, error: error.message });
    });

  return true; // Keep channel open for async response
});

async function handleMessage(request, sender) {
  switch (request.action) {
    case 'parseResume':
      return await handleParseResume(request);

    case 'validateApiKey':
      return await handleValidateApiKey(request);

    case 'generateTailoredResume':
      return await handleGenerateTailoredResume(request);

    case 'generateQuestionAnswers':
      return await handleGenerateQuestionAnswers(request);

    case 'downloadResume':
      return await handleDownloadResume(request);

    default:
      throw new Error('Unknown action: ' + request.action);
  }
}

async function handleParseResume(request) {
  try {
    const { fileData, fileType, fileName } = request;

    // For PDF/DOCX parsing, we'll extract text on the client side
    // and send it here for structured extraction
    // The popup handles the actual file parsing with libraries loaded there

    // If we receive already parsed text
    if (request.rawText) {
      const structured = extractStructuredData(request.rawText);
      return {
        success: true,
        data: structured,
        rawContent: request.rawText
      };
    }

    // Otherwise, signal that popup should handle parsing
    return {
      success: false,
      error: 'PARSE_IN_POPUP',
      message: 'File parsing should be handled in popup context'
    };
  } catch (error) {
    console.error('Error parsing resume:', error);
    return { success: false, error: error.message };
  }
}

async function handleValidateApiKey(request) {
  try {
    const { apiKey } = request;

    // Try to list models to validate API key without using tokens
    const response = await fetch('https://api.openai.com/v1/models', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`
      }
    });

    if (response.ok) {
      const data = await response.json();
      // Get available models for the user
      const availableModels = data.data
        .map(m => m.id)
        .filter(id => id.includes('gpt'))
        .sort();
      return { valid: true, availableModels };
    }

    const error = await response.json();
    return {
      valid: false,
      error: error.error?.message || 'Invalid API key'
    };
  } catch (error) {
    return { valid: false, error: error.message };
  }
}

async function handleGenerateTailoredResume(request) {
  try {
    const { resumeData, jobDescription, position, company } = request;

    const storage = await chrome.storage.local.get(['apiKey', 'preferences']);
    if (!storage.apiKey) {
      throw new Error('API key not configured');
    }

    // Step 1: Analyze job description
    const jdAnalysis = await analyzeJobDescription(storage.apiKey, jobDescription);

    const finalPosition = position || jdAnalysis.position || 'Position';
    const finalCompany = company || jdAnalysis.company || 'Company';

    // Step 2: Generate tailored resume
    const tailoredContent = await generateTailoredContent(
      storage.apiKey,
      resumeData,
      null,
      jdAnalysis
    );

    if (typeof tailoredContent.matchScore !== 'number') {
      tailoredContent.matchScore = 96;
    } else {
      const score = Math.round(tailoredContent.matchScore);
      tailoredContent.matchScore = Math.min(98, Math.max(95, score));
    }

    return {
      success: true,
      resume: tailoredContent,
      extractedPosition: finalPosition,
      extractedCompany: finalCompany
    };
  } catch (error) {
    console.error('Error generating tailored resume:', error);
    return { success: false, error: error.message };
  }
}

async function analyzeJobDescription(apiKey, jobDescription) {
  const prompt = `Analyze this job description and extract the following in JSON format:

{
  "position": "exact job title",
  "company": "company name",
  "requiredSkills": ["skill1", "skill2"],
  "preferredSkills": ["skill1", "skill2"],
  "yearsExperience": "number or range",
  "keyResponsibilities": ["responsibility1", "responsibility2"],
  "keywords": ["keyword1", "keyword2"]
}

Job Description:
${jobDescription.substring(0, 4000)}

Return ONLY valid JSON.`;

  const response = await callOpenAI(apiKey, prompt, 1000);

  try {
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    return JSON.parse(response);
  } catch (error) {
    console.error('Error parsing JD analysis:', error);
    return {
      position: '',
      company: '',
      requiredSkills: [],
      preferredSkills: [],
      keywords: []
    };
  }
}

async function generateTailoredContent(apiKey, resumeData, rawResumeContent, jdAnalysis) {
  const prompt = `You are an expert resume writer. Tailor this resume for the job posting.

ORIGINAL RESUME:
Name: ${resumeData.name || 'Not provided'}
Headline: ${resumeData.headline || 'Not provided'}
Email: ${resumeData.email || 'Not provided'}
Phone: ${resumeData.phone || 'Not provided'}
Location: ${resumeData.location || 'Not provided'}
LinkedIn: ${resumeData.linkedin || 'Not provided'}
Website: ${resumeData.website || 'Not provided'}

Summary: ${resumeData.summary || 'Not provided'}

Experience:
${formatExperience(resumeData.experience)}

Education:
${formatEducation(resumeData.education)}

Skills: ${resumeData.skills?.flat().join(', ') || 'Not provided'}

JOB REQUIREMENTS:
Position: ${jdAnalysis.position || 'Not specified'}
Company: ${jdAnalysis.company || 'Not specified'}
Required Skills: ${jdAnalysis.requiredSkills?.join(', ') || 'Not specified'}
Key Responsibilities: ${jdAnalysis.keyResponsibilities?.join('; ') || 'Not specified'}
Keywords: ${jdAnalysis.keywords?.join(', ') || 'Not specified'}

INSTRUCTIONS:
1. Rewrite to emphasize relevant experience
2. Incorporate keywords naturally
3. Write compelling summary for this role
4. ONLY reframe existing experience - never fabricate
5. Optimize for ATS
6. For the skills section, you MUST always include these mandatory base skills in the appropriate categories:
   - Frontend: React, TypeScript (always include these)
   - Backend: Node.js, Python (always include these)
   - Testing & Quality: Unit Testing, Cypress (always include these)
   - Collaboration: Agile, Cross-functional Teams, Mentorship (always include these)
7. Add additional relevant skills from the job requirements into the appropriate categories
8. Each experience entry MUST have at least 5 bullet points describing achievements (no fewer than 5)
9. Each skills category MUST list at least 7 skills (no fewer than 7)
10. Provide a match score between 95 and 98 (inclusive)

Return JSON:
{
  "matchScore": 96,
  "contact": {"name": "", "email": "", "phone": "", "location": "", "linkedin": "", "website": ""},
  "summary": "2-3 sentence tailored summary",
  "experience": [{"title": "", "company": "", "dates": "", "location": "", "bullets": ["achievement 1", "achievement 2", "achievement 3"]}],
  "education": [{"school": "University Name", "faculty": "Field of Study/Major", "degree": "Degree", "dates": "Start - End", "gpa": "", "honors": ""}],
  "skills": {
    "frontend": ["React", "TypeScript", "...additional from job requirements"],
    "backend": ["Node.js", "Python", "...additional from job requirements"],
    "database": ["...relevant database skills"],
    "security": ["...relevant security skills"],
    "ai_llm": ["...relevant AI & LLM skills"],
    "cloud_devops": ["...relevant cloud/devops skills"],
    "testing": ["Unit Testing", "Cypress", "...additional from job requirements"],
    "collaboration": ["Agile", "Cross-functional Teams", "Mentorship", "...additional"],
    "technical": ["...relevant technical skills"],
    "soft": ["...relevant soft skills"]
  },
  "certifications": []
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

function formatExperience(experience) {
  if (!experience || experience.length === 0) return 'Not provided';

  return experience.map(exp => {
    let text = `${exp.title || 'Position'} at ${exp.company || 'Company'}`;
    if (exp.dates) text += ` (${exp.dates})`;
    if (exp.bullets && exp.bullets.length > 0) {
      text += '\n' + exp.bullets.map(b => `  - ${b}`).join('\n');
    }
    return text;
  }).join('\n\n');
}

function formatEducation(education) {
  if (!education || education.length === 0) return 'Not provided';

  return education.map(edu => {
    let text = edu.degree || 'Degree';
    if (edu.school) text += ` - ${edu.school}`;
    if (edu.dates) text += ` (${edu.dates})`;
    return text;
  }).join('\n');
}

async function callOpenAI(apiKey, prompt, maxTokens = 2000, model = null) {
  // Get model from storage if not provided
  if (!model) {
    const storage = await chrome.storage.local.get(['preferences']);
    model = storage.preferences?.model || 'gpt-5.2';
  }

  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: model,
      instructions: 'You are an expert resume writer. Always respond with valid JSON when requested.',
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

async function handleGenerateQuestionAnswers(request) {
  try {
    const { questions, resumeData, jobDescription, position, company } = request;

    const storage = await chrome.storage.local.get(['apiKey']);
    if (!storage.apiKey) {
      throw new Error('API key not configured');
    }

    const resumeSummary = resumeData ? `
Name: ${resumeData.name || 'Not provided'}
Experience: ${resumeData.experience ? resumeData.experience.map(e => `${e.title || e.role || ''} at ${e.company || ''}`).join('; ') : 'Not provided'}
Skills: ${Array.isArray(resumeData.skills) ? resumeData.skills.join(', ') : (typeof resumeData.skills === 'object' ? Object.values(resumeData.skills).flat().join(', ') : 'Not provided')}
Education: ${resumeData.education ? resumeData.education.map(e => `${e.degree || ''} - ${e.school || e.university || ''}`).join('; ') : 'Not provided'}
` : 'No resume data provided';

    const questionsFormatted = questions.map((q, i) => `${i + 1}. ${q}`).join('\n');

    const prompt = `You are helping a job applicant answer application form questions.

CANDIDATE PROFILE:
${resumeSummary}

JOB DETAILS:
Position: ${position || 'Not specified'}
Company: ${company || 'Not specified'}
Job Description: ${jobDescription ? jobDescription.substring(0, 2000) : 'Not provided'}

APPLICATION QUESTIONS:
${questionsFormatted}

INSTRUCTIONS:
- Answer each question professionally and concisely (2-4 sentences each)
- Tailor answers to the specific job and company
- Reference relevant experience and skills from the candidate's profile
- Be honest and authentic - don't fabricate experience
- Show enthusiasm and cultural fit
- For "Why interested in this company" type questions, focus on the company's mission, products, or industry

Return a JSON array of answers in the same order as the questions:
["answer1", "answer2", ...]

Return ONLY valid JSON.`;

    const response = await callOpenAI(storage.apiKey, prompt, 2000);

    try {
      const jsonMatch = response.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        const answers = JSON.parse(jsonMatch[0]);
        return { success: true, answers };
      }
      return { success: true, answers: JSON.parse(response) };
    } catch (parseError) {
      console.error('Error parsing question answers:', parseError);
      return { success: false, error: 'Failed to parse AI response' };
    }
  } catch (error) {
    console.error('Error generating question answers:', error);
    return { success: false, error: error.message };
  }
}

async function handleDownloadResume(request) {
  try {
    const { dataUrl, filename, mimeType } = request;

    // Use Chrome downloads API
    const downloadId = await chrome.downloads.download({
      url: dataUrl,
      filename: filename,
      saveAs: true
    });

    return { success: true, downloadId };
  } catch (error) {
    console.error('Error downloading:', error);
    return { success: false, error: error.message };
  }
}

// Extract structured data from raw text
function extractStructuredData(text) {
  const data = {
    name: '',
    headline: '',
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

  const lines = text.split('\n').map(l => l.trim()).filter(l => l);

  // Contact info
  const emailMatch = text.match(/[\w.+-]+@[\w-]+\.[\w.-]+/);
  if (emailMatch) data.email = emailMatch[0].toLowerCase();

  const phonePatterns = [
    /\+?1?[-.\s]?\(?[0-9]{3}\)?[-.\s]?[0-9]{3}[-.\s]?[0-9]{4}/,
    /\+?[0-9]{1,3}[-.\s]?[0-9]{2,4}[-.\s]?[0-9]{2,4}[-.\s]?[0-9]{2,4}/
  ];
  for (const pattern of phonePatterns) {
    const match = text.match(pattern);
    if (match) { data.phone = match[0]; break; }
  }

  const linkedinMatch = text.match(/linkedin\.com\/in\/[\w-]+/i);
  if (linkedinMatch) data.linkedin = 'https://' + linkedinMatch[0];

  const websiteMatches = text.match(/(?:https?:\/\/)?(?:www\.)?[\w-]+\.[\w.-]+(?:\/[\w\-./?%&=]*)?/gi);
  if (websiteMatches) {
    for (const url of websiteMatches) {
      if (!url.includes('linkedin.com') && !url.includes('@') &&
          !url.match(/gmail|yahoo|outlook|hotmail/i)) {
        data.website = url;
        break;
      }
    }
  }

  const locationPatterns = [
    /([A-Z][a-z]+(?:\s[A-Z][a-z]+)*),\s*([A-Z]{2})\b/,
    /([A-Z][a-z]+(?:\s[A-Z][a-z]+)*),\s*([A-Z][a-z]+)\b/
  ];
  for (const pattern of locationPatterns) {
    const match = text.match(pattern);
    if (match) { data.location = match[0]; break; }
  }

  const isContactLine = (line) => {
    return line.includes('@') || line.match(/^\+?[\d\s()\-.]+$/) ||
      line.match(/linkedin\.com/i) || line.match(/github\.com/i) ||
      line.match(/^https?:\/\//i) || line.match(/^www\./i);
  };

  const sectionHeaderPattern = /^(?:summary|objective|profile|professional\s*summary|career\s*summary|about\s*me|experience|work\s*history|employment|professional\s*experience|work\s*experience|career\s*history|education|academic|qualifications?|academic\s*background|degrees?|skills|technical\s*skills|core\s*competencies|expertise|competencies|technologies|tools|certifications?|licenses?|credentials|professional\s*certifications?|projects?|portfolio|key\s*projects?|awards?|honors?|publications?|volunteer|interests|references)\s*:?\s*$/i;
  const isSectionHeader = (line) => sectionHeaderPattern.test(line.replace(/[^a-zA-Z\s]/g, '').trim());

  // Name
  for (const line of lines.slice(0, 8)) {
    if (isContactLine(line) || isSectionHeader(line)) continue;
    if (line.length < 3 || line.length > 60) continue;
    if (data.location && line === data.location) continue;
    const cleaned = line.replace(/[,|•·]/g, ' ').trim();
    if (/^[A-Za-z\s.\-']+$/.test(cleaned) && cleaned.split(/\s+/).length >= 2) {
      data.name = cleaned;
      break;
    }
  }

  // Headline
  const nameIdx = data.name ? lines.findIndex(l => l.includes(data.name)) : -1;
  if (nameIdx >= 0) {
    for (let i = nameIdx + 1; i < Math.min(nameIdx + 5, lines.length); i++) {
      const line = lines[i];
      if (isContactLine(line) || isSectionHeader(line)) continue;
      if (data.location && line.includes(data.location)) continue;
      if (line === data.phone || line === data.email) continue;
      if (line.length > 5 && line.length < 100) {
        if (/\b(engineer|developer|manager|analyst|designer|architect|consultant|director|lead|senior|junior|specialist|coordinator|administrator|scientist|officer|vp|president|devops|sre|qa|tester)\b/i.test(line) ||
            /\b(software|full.?stack|front.?end|back.?end|data|product|project|program|marketing|sales|operations|cloud|mobile|web|ui|ux)\b/i.test(line)) {
          data.headline = line;
          break;
        }
      }
    }
  }

  // Identify sections
  const sectionHeaders = {
    summary: /^(?:summary|objective|profile|professional\s*summary|career\s*summary|about\s*me)\s*:?\s*$/i,
    experience: /^(?:experience|work\s*history|employment|professional\s*experience|work\s*experience|career\s*history)\s*:?\s*$/i,
    education: /^(?:education|academic|qualifications?|academic\s*background|degrees?)\s*:?\s*$/i,
    skills: /^(?:skills|technical\s*skills|core\s*competencies|expertise|competencies|technologies|tools)\s*:?\s*$/i,
    certifications: /^(?:certifications?|licenses?|credentials|professional\s*certifications?)\s*:?\s*$/i
  };

  const sections = {};
  let currentSection = null;
  let currentContent = [];

  for (const line of lines) {
    let foundSection = null;
    const cleanedLine = line.replace(/[^a-zA-Z\s]/g, '').trim();
    for (const [section, pattern] of Object.entries(sectionHeaders)) {
      if ((pattern.test(line) || pattern.test(cleanedLine)) && line.length < 60) {
        foundSection = section;
        break;
      }
    }
    if (foundSection) {
      if (currentSection && currentContent.length > 0) {
        sections[currentSection] = currentContent.join('\n');
      }
      currentSection = foundSection;
      currentContent = [];
    } else if (currentSection) {
      currentContent.push(line);
    }
  }
  if (currentSection && currentContent.length > 0) {
    sections[currentSection] = currentContent.join('\n');
  }

  if (sections.summary) data.summary = sections.summary.trim().substring(0, 500);

  if (sections.experience) data.experience = bgParseExperience(sections.experience);
  if (sections.education) data.education = bgParseEducation(sections.education);

  if (sections.skills) {
    const skillLines = sections.skills.split('\n');
    for (const sl of skillLines) {
      const content = sl.trim().replace(/^[^:]+:\s*/, '');
      const parts = content.split(/[,;|•·]/);
      for (const part of parts) {
        const skill = part.trim();
        if (skill && skill.length > 1 && skill.length < 50 && !data.skills.includes(skill)) {
          data.skills.push(skill);
        }
      }
    }
  }
  if (data.skills.length === 0) {
    const commonSkills = [
      'JavaScript', 'Python', 'Java', 'C++', 'C#', 'React', 'Node.js', 'AWS', 'Docker',
      'SQL', 'Git', 'TypeScript', 'Angular', 'Vue', 'MongoDB', 'PostgreSQL', 'Kubernetes',
      'Azure', 'GCP', 'Machine Learning', 'Agile', 'Scrum', 'CI/CD'
    ];
    const textLower = text.toLowerCase();
    for (const skill of commonSkills) {
      if (textLower.includes(skill.toLowerCase())) data.skills.push(skill);
    }
  }

  if (sections.certifications) {
    const certLines = sections.certifications.split('\n').map(l => l.trim()).filter(l => l);
    data.certifications = certLines.map(l => l.replace(/^[•\-*►▪▸]\s*/, ''));
  }

  return data;
}

function bgParseExperience(text) {
  const experiences = [];
  const lines = text.split('\n');
  let currentExp = null;
  let bullets = [];

  const datePattern = /(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s*\.?\s*\d{2,4}\s*[-–—to]+\s*(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?|Present|Current)\s*\.?\s*\d{0,4}/i;
  const yearPattern = /\d{4}\s*[-–—to]+\s*(?:\d{4}|Present|Current)/i;
  const hasDate = (line) => datePattern.test(line) || yearPattern.test(line);
  const extractDate = (line) => (line.match(datePattern) || line.match(yearPattern) || [''])[0];
  const isBullet = (line) => /^[•\-*►▪▸]\s/.test(line) || /^\d+[.)]\s/.test(line);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    if (hasDate(line)) {
      if (currentExp) { currentExp.bullets = bullets; experiences.push(currentExp); }
      const dates = extractDate(line);
      const remaining = line.replace(datePattern, '').replace(yearPattern, '').replace(/[|,]\s*$/, '').trim();
      currentExp = { title: '', company: '', dates, location: '', bullets: [] };
      bullets = [];
      if (remaining) {
        const parts = remaining.split(/\s*[|–—]\s*/);
        currentExp.title = parts[0]?.trim() || '';
        if (parts.length >= 2) currentExp.company = parts[1].trim();
        if (parts.length >= 3) currentExp.location = parts[2].trim();
      }
    } else if (currentExp) {
      if (isBullet(line)) {
        bullets.push(line.replace(/^[•\-*►▪▸]\s*/, '').replace(/^\d+[.)]\s*/, ''));
      } else if (!currentExp.title) { currentExp.title = line; }
      else if (!currentExp.company) { currentExp.company = line; }
      else if (/([A-Z][a-z]+,\s*[A-Z]{2})/.test(line) && !currentExp.location) { currentExp.location = line; }
      else if (line.length > 20) { bullets.push(line); }
    } else if (!isBullet(line) && line.length > 3) {
      currentExp = { title: line, company: '', dates: '', location: '', bullets: [] };
      bullets = [];
    }
  }
  if (currentExp) { currentExp.bullets = bullets; experiences.push(currentExp); }
  return experiences;
}

function bgParseEducation(text) {
  const education = [];
  const lines = text.split('\n');
  let currentEdu = null;
  const degreePattern = /(?:Bachelor|Master|Ph\.?D|MBA|B\.?S\.?|M\.?S\.?|B\.?A\.?|M\.?A\.?|Associate|Doctor|Diploma|Certificate)/i;
  const universityPattern = /(?:University|College|Institute|School|Academy|Polytechnic)\b/i;
  const dateRangePattern = /(?:\d{4}\s*[-–—to]+\s*(?:\d{4}|Present|Current))|(?:(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s*\d{2,4}\s*[-–—to]+\s*(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec|Present|Current)[a-z]*\.?\s*\d{0,4})/i;
  const facultyPattern = /(?:Faculty|Department|School|College)\s+of\s+/i;
  const majorPattern = /(?:in|of|:)\s+([A-Z][A-Za-z\s&,]+)/;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    if (universityPattern.test(trimmed) && !degreePattern.test(trimmed)) {
      if (currentEdu) education.push(currentEdu);
      currentEdu = { school: trimmed, faculty: '', degree: '', dates: '', gpa: '', honors: '' };
      const dateMatch = trimmed.match(dateRangePattern);
      if (dateMatch) {
        currentEdu.dates = dateMatch[0];
        currentEdu.school = trimmed.replace(dateRangePattern, '').replace(/[,|]\s*$/, '').trim();
      }
      continue;
    }

    if (degreePattern.test(trimmed)) {
      if (!currentEdu) currentEdu = { school: '', faculty: '', degree: '', dates: '', gpa: '', honors: '' };
      currentEdu.degree = trimmed;
      const mMatch = trimmed.match(majorPattern);
      if (mMatch && !currentEdu.faculty) currentEdu.faculty = mMatch[1].trim();
      const dateMatch = trimmed.match(dateRangePattern);
      if (dateMatch) {
        currentEdu.dates = dateMatch[0];
        currentEdu.degree = trimmed.replace(dateRangePattern, '').replace(/[,|]\s*$/, '').trim();
      }
      continue;
    }

    if (currentEdu) {
      const gpaMatch = trimmed.match(/GPA[:\s]*(\d+\.?\d*)/i);
      if (gpaMatch) { currentEdu.gpa = gpaMatch[1]; continue; }
      if (/cum laude|magna|summa|honor|distinction|dean/i.test(trimmed)) { currentEdu.honors = trimmed; continue; }
      if (facultyPattern.test(trimmed)) { currentEdu.faculty = trimmed; continue; }
      const dateMatch = trimmed.match(dateRangePattern);
      if (dateMatch && !currentEdu.dates) { currentEdu.dates = trimmed; continue; }
      if (!currentEdu.school && trimmed.length > 3 && universityPattern.test(trimmed)) { currentEdu.school = trimmed; continue; }
      if (currentEdu.degree && !currentEdu.faculty && trimmed.length > 3 && !trimmed.match(/^\d/) && !dateRangePattern.test(trimmed)) {
        currentEdu.faculty = trimmed;
      }
    }
  }
  if (currentEdu) education.push(currentEdu);
  return education;
}

// Extension installation handler
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    console.log('JobBot extension installed');
    chrome.storage.local.set({
      preferences: {
        atsOptimize: true,
        keywordHighlight: true,
        resumeFont: 'Calibri',
        model: 'gpt-5.2'
      }
    });
  }

  if (chrome.sidePanel && chrome.sidePanel.setPanelBehavior) {
    chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(error => {
      console.error('Error setting side panel behavior:', error);
    });
  }
});
