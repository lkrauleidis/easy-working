const express = require('express');
const cors = require('cors');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFile } = require('child_process');
const crypto = require('crypto');

const app = express();
const upload = multer({ storage: multer.memoryStorage() });
const PORT = process.env.PORT || 3000;

const dataDir = path.join(__dirname, 'data', 'templates');
fs.mkdirSync(dataDir, { recursive: true });

app.use(cors({ origin: '*' }));
app.use(express.json({ limit: '2mb' }));

function templatePath(id) {
  return path.join(dataDir, `${id}.json`);
}

function readTemplateFile(id) {
  const filePath = templatePath(id);
  if (!fs.existsSync(filePath)) {
    return null;
  }
  const raw = fs.readFileSync(filePath, 'utf8');
  return JSON.parse(raw);
}

function listTemplates() {
  const files = fs.readdirSync(dataDir).filter(name => name.endsWith('.json'));
  return files.map(name => {
    const id = name.replace(/\.json$/, '');
    try {
      const data = readTemplateFile(id);
      return {
        id,
        name: data.name || data.data?.name || id,
        updatedAt: data.updatedAt || data.createdAt || null,
        hasApiKey: !!data.apiKey
      };
    } catch (error) {
      return { id, name: id, updatedAt: null, hasApiKey: false };
    }
  });
}

function writeTemplate(payload) {
  const now = new Date().toISOString();
  const id = payload.id || crypto.randomBytes(8).toString('hex');
  const data = payload.data || payload;
  const name = payload.name || data.name || `Template ${id}`;
  const apiKey = payload.apiKey || '';

  const record = {
    id,
    name,
    apiKey,
    data,
    createdAt: payload.createdAt || now,
    updatedAt: now
  };

  fs.writeFileSync(templatePath(id), JSON.stringify(record, null, 2), 'utf8');
  return record;
}

app.get('/api/templates', (req, res) => {
  res.json({ templates: listTemplates() });
});

app.get('/api/templates/:id', (req, res) => {
  const record = readTemplateFile(req.params.id);
  if (!record) {
    return res.status(404).json({ error: 'Template not found' });
  }
  const safeRecord = { ...record };
  delete safeRecord.apiKey;
  res.json(safeRecord);
});

app.post('/api/templates', (req, res) => {
  if (!req.body || Object.keys(req.body).length === 0) {
    return res.status(400).json({ error: 'Missing template data' });
  }
  try {
    const record = writeTemplate(req.body);
    res.status(201).json(record);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.post('/api/templates/upload', upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'Missing file upload' });
  }

  try {
    const raw = req.file.buffer.toString('utf8');
    const json = JSON.parse(raw);
    const payload = {
      name: req.body.name || json.name || req.file.originalname.replace(/\.json$/i, ''),
      data: json,
      apiKey: req.body.apiKey || ''
    };
    const record = writeTemplate(payload);
    const safeRecord = { ...record };
    delete safeRecord.apiKey;
    res.status(201).json(safeRecord);
  } catch (error) {
    res.status(400).json({ error: 'Invalid JSON file' });
  }
});

app.post('/api/convert-docx-to-pdf', upload.single('file'), async (req, res) => {
  let tmpDir = null;
  try {
    if (!req.file || !req.file.buffer) {
      return res.status(400).json({ error: 'Missing DOCX file upload' });
    }

    const sofficePath = resolveSofficePath();
    if (!sofficePath) {
      return res.status(500).json({
        error: 'LibreOffice not found. Set SOFFICE_PATH or install LibreOffice.'
      });
    }

    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'jobbot-'));
    const docxPath = path.join(tmpDir, 'resume.docx');
    fs.writeFileSync(docxPath, req.file.buffer);

    await new Promise((resolve, reject) => {
      execFile(
        sofficePath,
        ['--headless', '--convert-to', 'pdf', '--outdir', tmpDir, docxPath],
        { windowsHide: true },
        (err) => (err ? reject(err) : resolve())
      );
    });

    const pdfPath = path.join(tmpDir, 'resume.pdf');
    if (!fs.existsSync(pdfPath)) {
      throw new Error('PDF conversion failed');
    }

    const pdfBuffer = fs.readFileSync(pdfPath);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="resume.pdf"');
    res.send(pdfBuffer);
  } catch (error) {
    console.error('[convert-docx-to-pdf] Error:', error.message);
    res.status(500).json({ error: error.message });
  } finally {
    if (tmpDir) {
      try {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      } catch {
        // ignore cleanup errors
      }
    }
  }
});

function resolveSofficePath() {
  const envPath = process.env.SOFFICE_PATH || process.env.LIBREOFFICE_PATH;
  if (envPath && fs.existsSync(envPath)) return envPath;

  const candidates = [
    'C:\\\\Program Files\\\\LibreOffice\\\\program\\\\soffice.exe',
    'C:\\\\Program Files (x86)\\\\LibreOffice\\\\program\\\\soffice.exe',
    'soffice'
  ];
  for (const candidate of candidates) {
    if (candidate === 'soffice') return candidate;
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

app.delete('/api/templates/:id', (req, res) => {
  const filePath = templatePath(req.params.id);
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'Template not found' });
  }
  fs.unlinkSync(filePath);
  res.json({ success: true });
});

app.post('/api/generate', async (req, res) => {
  try {
    const { templateId, jobDescription, position, company } = req.body || {};
    if (!templateId || !jobDescription) {
      return res.status(400).json({ error: 'Missing templateId or jobDescription' });
    }

    const record = readTemplateFile(templateId);
    if (!record) {
      return res.status(404).json({ error: 'Template not found' });
    }
    if (!record.apiKey) {
      return res.status(400).json({ error: 'Missing OpenAI API key for this template' });
    }

    const jdAnalysis = await analyzeJobDescription(record.apiKey, jobDescription);
    const finalPosition = position || jdAnalysis.position || 'Position';
    const finalCompany = company || jdAnalysis.company || 'Company';

    const tailoredContent = await generateTailoredContent(
      record.apiKey,
      record.data,
      jdAnalysis
    );

    if (typeof tailoredContent.matchScore !== 'number') {
      tailoredContent.matchScore = 96;
    } else {
      const score = Math.round(tailoredContent.matchScore);
      tailoredContent.matchScore = Math.min(98, Math.max(95, score));
    }

    res.json({
      success: true,
      resume: tailoredContent,
      extractedPosition: finalPosition,
      extractedCompany: finalCompany
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

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

  const response = await callOpenAI(apiKey, prompt, 1500);
  try {
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    return JSON.parse(response);
  } catch (error) {
    console.error('Failed to parse JD analysis. Response:', response);
    return {
      position: '',
      company: '',
      requiredSkills: [],
      preferredSkills: [],
      keywords: []
    };
  }
}

async function generateTailoredContent(apiKey, resumeData, jdAnalysis) {
  // Normalize template data - handle personalInfo wrapper and field name variants
  const info = resumeData.personalInfo || resumeData;
  const name = info.name || resumeData.name || 'Not provided';
  const headline = info.title || resumeData.headline || resumeData.title || 'Not provided';
  const email = info.email || resumeData.email || 'Not provided';
  const phone = info.phone || resumeData.phone || 'Not provided';
  const location = info.location || resumeData.location || 'Not provided';
  const linkedin = info.linkedin || resumeData.linkedin || 'Not provided';
  const website = info.portfolio || resumeData.website || 'Not provided';
  const github = info.github || resumeData.github || 'Not provided';

  const prompt = `You are a senior technical recruiter and ATS optimization expert.
Generate a resume that is BOTH ATS-friendly and recruiter-friendly for a software engineering role.

ORIGINAL RESUME:
Name: ${name}
Headline: ${headline}
Email: ${email}
Phone: ${phone}
Location: ${location}
LinkedIn: ${linkedin}
Website: ${website}
GitHub: ${github}

Summary: ${resumeData.summary || 'Not provided'}

Experience:
${formatExperience(resumeData.experience)}

Education:
${formatEducation(resumeData.education)}

Skills:
${formatSkills(resumeData.skills)}

JOB REQUIREMENTS:
Position: ${jdAnalysis.position || 'Not specified'}
Company: ${jdAnalysis.company || 'Not specified'}
Required Skills: ${jdAnalysis.requiredSkills?.join(', ') || 'Not specified'}
Key Responsibilities: ${jdAnalysis.keyResponsibilities?.join('; ') || 'Not specified'}
Keywords: ${jdAnalysis.keywords?.join(', ') || 'Not specified'}

STRICT CONTENT RULES:
1. Read the entire job description end-to-end before generating any resume content.
2. Treat the job description as the single source of truth for keywords, technologies,
   architecture terms, tools, and expectations.
3. Do not summarize or paraphrase the job description before processing.

4. Scan the full job description line-by-line and extract as many keywords and key
   tech stacks as possible, capturing them exactly as written.
5. Collect keywords from the job title, responsibilities, required qualifications,
   preferred qualifications, nice-to-have sections, and any architecture, scale, or
   platform descriptions embedded in the text.

6. Classify every extracted keyword into the following mandatory buckets:
   a. Programming languages and runtimes
   b. Frontend frameworks and libraries
   c. Backend frameworks and APIs
   d. Databases, caching, and data systems
   e. Cloud platforms and infrastructure
   f. DevOps, CI/CD, and automation
   g. Architecture and system design concepts
   h. Security, compliance, and authentication
   i. Testing, quality, and reliability
   j. Performance, scale, and metrics
   k. Methodologies, processes, and collaboration

7. Do not normalize, replace, or infer technologies during extraction.
8. All keywords must initially remain literal to the job description wording.

9. Assign a priority to each keyword:
   a. P1 (Critical): appears in the job title, required section, or multiple times
   b. P2 (Important): appears once or in preferred sections
   c. P3 (Supporting): implied by responsibilities or architectural language

10. For each keyword, acceptable variants may be added only as secondary mentions.
11. The original job-description wording is mandatory and must never be replaced.
12. Do not substitute one technology for another.
13. Do not generalize platforms.
14. Do not infer alternatives.

15. Directly inject extracted job-description keywords and tech stacks into the resume
    content.
16. Do not use merely related or similar technologies as substitutes.
17. Maximize keyword coverage while maintaining logical consistency with the original
    resume.

18. If a job-description technology does not exist in the original resume, it must
    still be included by integrating it realistically into existing responsibilities
    as usage, collaboration, optimization, migration, integration, or exposure.
19. Never invent new roles, companies, job titles, or project domains.

20. Generate a senior-level target title that closely mirrors the job description
    title and aligns with the candidate’s career progression.

21. The Professional Summary must be exactly 3–4 lines, senior-level, ATS-optimized,
    and natural.
22. The summary must explicitly reference system scale, performance, reliability,
    architecture, and business impact.
23. The summary must not include company names or personal pronouns.
24. The summary must include direct P1 and P2 job-description keywords.
25. All technology names must be bolded using double asterisks.

26. Use past tense for previous roles and present tense only for the current role.
27. Each role must contain 5–7 bullets.
28. Each bullet must be one sentence only.
29. No paragraphs are allowed.

30. Every experience bullet must follow this exact structure:
    Action Verb -> What was done -> Technologies used (bolded) -> Outcome or impact

31. Only 2–3 bullets per role may include measurable impact such as percentage
    improvements, scale, performance, reliability, cost, or time saved.

32. Every bullet must include at least one bolded P1 or P2 technology from the job
    description unless the bullet is purely leadership, mentorship, or strategy
    focused.
33. Each bullet may include 1–3 bolded technologies selected strictly from
    job-description priorities.
34. Bold only technology names, never full phrases or sentences.

35. The Skills section must be grouped exactly into the following categories:
    a. Frontend
    b. Backend
    c. Databases
    d. Cloud & DevOps
    e. Testing & Quality

36. Each skills category must include at least six skills.

37. Mandatory skills:
    a. Frontend must always include React, JavaScript, and TypeScript
    b. Backend must always include Node.js and Python

38. All job-description technologies must appear in both Skills and Experience.

39. Dates for experience and education must be formatted exactly as:
    MMM YYYY - MMM YYYY

40. Before final output, validate that:
    a. 100% of P1 keywords are included
    b. At least 90% of P2 keywords are included
    c. No fabricated technologies exist
    d. All keywords are used in logical contexts

41. If validation fails, regenerate the resume until compliance is met.

42. Provide a final job match score between 95 and 98 inclusive.Return JSON:
{
  "matchScore": 96,
  "targetTitle": "Target Job Title",
  "contact": {"name": "", "email": "", "phone": "", "location": "", "linkedin": "", "github": ""},
  "summary": "3-4 line tailored summary",
  "experience": [{"title": "", "company": "", "dates": "MMM YYYY - MMM YYYY", "location": "", "bullets": ["achievement 1", "achievement 2", "achievement 3", "achievement 4", "achievement 5"]}],
  "education": [{"school": "University Name", "degree": "Degree", "dates": "MMM YYYY - MMM YYYY", "faculty": "Major/Minor"}],
  "skills": {
    "frontend": ["React", "JavaScript", "TypeScript", "...additional skills"],
    "backend": ["Node.js", "Python", "REST APIs", "Microservices", "...additional skills"],
    "databases": ["PostgreSQL", "Redis", "NoSQL", "...additional skills"],
    "cloud_devops": ["AWS", "Docker", "CI/CD", "Terraform", "...additional skills"],
    "testing": ["Unit Testing", "Integration Testing", "...additional skills"]
  },
  "certifications": []
}

Return ONLY valid JSON.`;

  const response = await callOpenAI(apiKey, prompt, 8000);
  console.log('[generateTailoredContent] Got response, length:', response?.length);
  try {
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      console.log('[generateTailoredContent] JSON match found, length:', jsonMatch[0].length);
      return normalizeGeneratedResume(JSON.parse(jsonMatch[0]));
    }
    console.log('[generateTailoredContent] No regex match, trying direct parse');
    return normalizeGeneratedResume(JSON.parse(response));
  } catch (error) {
    console.error('[generateTailoredContent] JSON parse error:', error.message);
    console.error('[generateTailoredContent] Response (last 300 chars):', response?.substring(response.length - 300));
    throw new Error('Failed to generate tailored resume. Please try again.');
  }
}

function normalizeGeneratedResume(value) {
  let parsed = value;

  if (typeof parsed === 'string') {
    parsed = tryParseEmbeddedJson(parsed) ?? parsed;
  } else if (parsed && typeof parsed === 'object') {
    if (typeof parsed.text === 'string') {
      parsed = tryParseEmbeddedJson(parsed.text) ?? parsed;
    } else if (typeof parsed.output_text === 'string') {
      parsed = tryParseEmbeddedJson(parsed.output_text) ?? parsed;
    } else if (Array.isArray(parsed.content)) {
      const combined = parsed.content
        .map(block => (block && typeof block.text === 'string' ? block.text : ''))
        .join('');
      parsed = tryParseEmbeddedJson(combined) ?? parsed;
    }
  }

  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Invalid resume payload from model');
  }

  const hasContent = Boolean(
    parsed.summary ||
    (Array.isArray(parsed.experience) && parsed.experience.length > 0) ||
    (Array.isArray(parsed.education) && parsed.education.length > 0) ||
    parsed.skills
  );
  if (!hasContent) {
    throw new Error('Generated resume is missing expected content');
  }

  return parsed;
}

function tryParseEmbeddedJson(text) {
  if (typeof text !== 'string') return null;
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]);
  } catch {
    return null;
  }
}

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

function formatExperience(experience) {
  if (!experience || experience.length === 0) return 'Not provided';

  return experience.map(exp => {
    const title = exp.title || exp.role || 'Position';
    const dates = exp.dates || combineDates(exp.startDate, exp.endDate) || '';
    const bullets = exp.bullets || exp.highlights || [];
    let text = `${title} at ${exp.company || 'Company'}`;
    if (dates) text += ` (${dates})`;
    if (exp.location) text += ` - ${exp.location}`;
    if (bullets.length > 0) {
      text += '\n' + bullets.map(b => `  - ${b}`).join('\n');
    }
    return text;
  }).join('\n\n');
}

function formatEducation(education) {
  if (!education || education.length === 0) return 'Not provided';

  return education.map(edu => {
    let text = edu.degree || 'Degree';
    const school = edu.school || edu.institution || edu.university || '';
    const dates = edu.dates || combineDates(edu.startDate, edu.endDate) || '';
    if (school) text += ` - ${school}`;
    if (dates) text += ` (${dates})`;
    if (edu.notes) text += ` [${edu.notes}]`;
    return text;
  }).join('\n');
}

function combineDates(start, end) {
  if (!start && !end) return '';
  return `${start || ''}${start && end ? ' - ' : ''}${end || ''}`;
}

async function callOpenAI(apiKey, prompt, maxTokens = 2000) {
  console.log(`[callOpenAI] Sending request with max_output_tokens: ${maxTokens}`);

  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: 'gpt-5.2',
      instructions: 'You are an expert resume writer. Always respond with valid JSON when requested.',
      input: prompt,
      text: { format: { type: 'json_object' } },
      max_output_tokens: maxTokens,
      temperature: 0.7
    })
  });

  if (!response.ok) {
    const error = await response.json();
    console.error('[callOpenAI] API error:', JSON.stringify(error, null, 2));
    throw new Error(error.error?.message || 'OpenAI API error');
  }

  const data = await response.json();

  console.log('[callOpenAI] Response keys:', Object.keys(data));
  console.log('[callOpenAI] Has output_text:', !!data.output_text);
  console.log('[callOpenAI] Status:', data.status);
  if (data.usage) {
    console.log('[callOpenAI] Usage:', JSON.stringify(data.usage));
  }
  if (data.incomplete_details) {
    console.log('[callOpenAI] Incomplete details:', JSON.stringify(data.incomplete_details));
  }

  // Try multiple response fields - API versions vary
  let text = data.output_text;
  if (!text && data.output && Array.isArray(data.output)) {
    for (const item of data.output) {
      if (item.type === 'message' && item.content) {
        for (const block of item.content) {
          if ((block.type === 'output_text' || block.type === 'text') && block.text) {
            text = block.text;
            break;
          }
        }
      }
      if (text) break;
    }
  }
  if (!text && data.output && Array.isArray(data.output)) {
    console.log('[callOpenAI] Output types:', data.output.map(item => item.type));
  }

  // Normalize text to a string to avoid substring() errors on non-strings.
  if (Array.isArray(text)) {
    text = text.join('');
  } else if (text && typeof text === 'object') {
    if (typeof text.text === 'string') {
      text = text.text;
    } else if (typeof text.value === 'string') {
      text = text.value;
    } else {
      text = JSON.stringify(text);
    }
  }
  if (typeof text !== 'string') {
    text = String(text || '');
  }

  if (!text) {
    console.error('[callOpenAI] No text found in response. Full response:', JSON.stringify(data, null, 2).substring(0, 2000));
    throw new Error('No text in API response');
  }

  console.log('[callOpenAI] Response text length:', text.length);
  console.log('[callOpenAI] Response text (first 200 chars):', text.substring(0, 200));
  console.log('[callOpenAI] Response text (last 100 chars):', text.substring(text.length - 100));

  return text;
}

app.use('/admin', express.static(path.join(__dirname, 'admin')));

app.listen(PORT, () => {
  console.log(`JobBot backend running on http://localhost:${PORT}`);
});
