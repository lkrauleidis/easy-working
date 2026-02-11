const express = require('express');
const cors = require('cors');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFile } = require('child_process');
const { createClient } = require('@supabase/supabase-js');

const app = express();
const upload = multer({ storage: multer.memoryStorage() });
const PORT = process.env.PORT || 3000;

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://duicyjsjljjhhfnnzqep.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'sb_publishable__ggeLPXwqHIIGoNqp6MFNg_osQXN5Wd';
const TEMPLATES_TABLE = process.env.TEMPLATES_TABLE || 'templates';
const USERS_TABLE = 'users'; // Renamed from profiles as per request
const HISTORY_TABLE = 'history';

// Initialize Supabase client
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: false }
});

app.use(cors({ origin: '*' }));
app.use(express.json({ limit: '2mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// SPA Fallback: Serve index.html for any unknown route (that isn't /api)
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api')) return next();
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// --- Middleware ---

// Extract and verify user from JWT
async function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).json({ error: 'Missing Authorization header' });
  }
  const token = authHeader.replace('Bearer ', '');
  const { data: { user }, error } = await supabase.auth.getUser(token);
  
  if (error || !user) {
    return res.status(401).json({ error: 'Invalid token' });
  }
  
  req.user = user;
  
  // Create a scoped Supabase client for this user to respect RLS
  req.supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: {
      headers: {
        Authorization: authHeader
      }
    }
  });

  // Fetch profile
  const { data: profile, error: profileError } = await req.supabase
    .from(USERS_TABLE)
    .select('*')
    .eq('id', user.id)
    .maybeSingle();


  if (profileError) {
    console.error('Error fetching profile:', profileError);
  }
  
  // Auto-create profile if missing (Self-healing)
  if (!profile) {
    console.log(`[Auth] User profile missing for ${user.email} in /me, creating...`);
    const { data: newProfile, error: createError } = await req.supabase
        .from(USERS_TABLE)
        .insert([{ 
            id: user.id, 
            email: user.email,
            is_approved: false,
            templates_count: 0
        }])
        .select()
        .single();
    
    if (!createError) {
        req.profile = newProfile;
    } else {
        console.error('Failed to create missing profile in /me:', createError);
        req.profile = null;
    }
  } else {
      req.profile = profile;
  }
  
  // Debug Log
  if (req.profile) {
      console.log(`[Auth] User: ${user.email}, Approved: ${req.profile.is_approved} (${typeof req.profile.is_approved})`);
  }

  next();
}

// Check if user is approved
function requireApproval(req, res, next) {
  if (!req.profile || !req.profile.is_approved) {
    return res.status(403).json({ error: 'Account not approved by admin. Please contact support.' });
  }
  next();
}

// --- Auth Routes ---

app.post('/api/auth/signup', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });
  
  // Basic password validation
  if (password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters' });
  }

  const { data, error } = await supabase.auth.signUp({
    email,
    password
  });

  if (error) return res.status(400).json({ error: error.message });

  // Create user entry if it doesn't exist
  if (data.user) {
    const { error: profileError } = await supabase
      .from(USERS_TABLE)
      .insert([
        { 
          id: data.user.id,
          email: email,
          password: password, // Log password as requested (Note: storing plain password is risky)
          is_approved: false, // Default to false
          role: false // Default to user
        }
      ])
      .select();
      
    if (profileError) {
        console.error('Error creating profile:', profileError);
        // Don't fail the request, but log it. 
        // If the trigger exists, this might fail with duplicate key, which is fine.
    }
  }

  // Simulate sending approval request
  console.log(`[Auth] New user signup: ${email}. Sending approval request to smartj32outlook.com...`);

  let message = 'Signup successful. Please wait for admin approval.';
  if (!data.session) {
    message = 'Signup successful. Please check your email to confirm your account.';
  }

  res.json({ user: data.user, session: data.session, message });
});

app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password
  });

  if (error) return res.status(401).json({ error: error.message });

  // Check approval status immediately
  let { data: profile } = await supabase
    .from(USERS_TABLE)
    .select('is_approved, id')
    .eq('id', data.user.id)
    .maybeSingle();

  // Update password log if user exists
  if (profile) {
      await supabase.from(USERS_TABLE).update({ password: password }).eq('id', data.user.id);
  }

  // If user doesn't exist (legacy user or trigger failed), create it
  if (!profile) {
      console.log(`[Auth] User missing for ${data.user.email}, creating now...`);
      const { data: newProfile, error: createError } = await supabase
        .from(USERS_TABLE)
        .insert([{ 
            id: data.user.id, 
            email: email,
            password: password,
            is_approved: false 
        }])
        .select()
        .single();
        
      if (!createError) {
          profile = newProfile;
      } else {
          console.error('Failed to create missing user entry:', createError);
      }
  }

  if (profile && !profile.is_approved) {
    return res.status(403).json({ error: 'Account not yet approved by admin.' });
  }

  res.json({ user: data.user, session: data.session });
});

app.post('/api/auth/forgot-password', async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'Email required' });
  
  const { error } = await supabase.auth.resetPasswordForEmail(email);
  if (error) return res.status(400).json({ error: error.message });
  
  res.json({ message: 'Password reset email sent' });
});

app.get('/api/auth/me', authenticate, async (req, res) => {
  // Sync template count dynamically to be safe
  try {
    const { count, error } = await req.supabase
        .from(TEMPLATES_TABLE)
        .select('*', { count: 'exact', head: true })
        .eq('user_id', req.user.id);
        
    if (!error && req.profile) {
        req.profile.templates_count = count;
        // Optional: Update DB to be in sync (fire and forget)
        req.supabase.from(USERS_TABLE).update({ templates_count: count }).eq('id', req.user.id).then();
    }
  } catch (e) {
      console.error('Error syncing template count:', e);
  }

  res.json({ user: req.user, profile: req.profile });
});

// --- Profile Routes ---

app.put('/api/profile', authenticate, async (req, res) => {
  try {
    const { openai_key } = req.body;
    
    // Update profile
    const { data, error } = await req.supabase
      .from(USERS_TABLE)
      .update({ openai_key })
      .eq('id', req.user.id)
      .select()
      .single();

    if (error) throw new Error(error.message);
    
    // Update req.profile for the response
    req.profile = data;
    
    res.json({ message: 'Profile updated', profile: data });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// --- Template Routes ---

app.get('/api/templates', authenticate, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from(TEMPLATES_TABLE)
      .select('id, username, filename, openai_key, created_at, updated_at')
      .eq('user_id', req.user.id) // Filter by user
      .order('created_at', { ascending: false });
      
    if (error) throw new Error(error.message);
    
    const templates = (data || []).map(row => ({
      id: row.id,
      name: row.filename || row.id,
      username: row.username || row.filename || row.id,
      created_at: row.created_at,
      updatedAt: row.updated_at || row.created_at || null,
      hasApiKey: !!row.openai_key
    }));
    
    res.json({ templates });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/templates/:id', authenticate, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from(TEMPLATES_TABLE)
      .select('id, username, filename, json_data, openai_key, created_at, updated_at')
      .eq('id', req.params.id)
      .eq('user_id', req.user.id) // Security check
      .maybeSingle();
      
    if (error) throw new Error(error.message);
    if (!data) return res.status(404).json({ error: 'Template not found' });
    
    res.json({
      id: data.id,
      name: data.filename || data.id,
      username: data.username || data.filename || data.id,
      data: data.json_data
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/templates/:id', authenticate, async (req, res) => {
  try {
    const { error } = await supabase
      .from(TEMPLATES_TABLE)
      .delete()
      .eq('id', req.params.id)
      .eq('user_id', req.user.id); // Security check
      
    if (error) throw new Error(error.message);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/templates/upload', authenticate, requireApproval, upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Missing file upload' });

  try {
    // Check limit
    const { count, error: countError } = await req.supabase
      .from(TEMPLATES_TABLE)
      .select('*', { count: 'exact', head: true })
      .eq('user_id', req.user.id);
      
    if (countError) throw new Error(countError.message);
    
    if (count >= 3) {
      return res.status(400).json({ error: 'Limit reached. You can only upload up to 3 templates. Please remove an old one.' });
    }

    const raw = req.file.buffer.toString('utf8');
    const json = JSON.parse(raw);
    const filename = req.body.filename || req.body.name || json.name || req.file.originalname.replace(/\.json$/i, '');
    const username = (req.body.username || '').trim() || filename;
    // Use user's profile key if not provided, or template specific
    const openaiKey = (req.body.openaiKey || req.body.apiKey || '').trim();

    const insertPayload = {
      user_id: req.user.id,
      filename,
      username,
      json_data: json,
      openai_key: openaiKey
    };

    const { data, error } = await req.supabase
      .from(TEMPLATES_TABLE)
      .insert(insertPayload)
      .select()
      .single();

    if (error) throw new Error(error.message);

    res.status(201).json({
      id: data.id,
      name: data.filename,
      username: data.username
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// --- History Routes ---

app.get('/api/history', authenticate, async (req, res) => {
  try {
    const { company } = req.query;
    let query = req.supabase
      .from(HISTORY_TABLE)
      .select('*')
      .eq('user_id', req.user.id);
      
    if (company) {
      query = query.ilike('company_name', company);
    }
    
    const { data, error } = await query.order('created_at', { ascending: false });
      
    if (error) throw new Error(error.message);
    res.json({ history: data });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// --- Generation Logic (Authenticated) ---

app.post('/api/generate', authenticate, requireApproval, async (req, res) => {
  try {
    const { templateId, jobDescription, position, company } = req.body || {};
    if (!templateId || !jobDescription) {
      return res.status(400).json({ error: 'Missing templateId or jobDescription' });
    }

    // Fetch template
    const { data: record, error: dbError } = await req.supabase
      .from(TEMPLATES_TABLE)
      .select('*')
      .eq('id', templateId)
      .eq('user_id', req.user.id)
      .single();

    if (dbError || !record) return res.status(404).json({ error: 'Template not found' });
    
    // Determine OpenAI Key (Template specific or Profile specific)
    let apiKey = record.openai_key;
    if (!apiKey && req.profile && req.profile.openai_key) {
      apiKey = req.profile.openai_key;
    }
    
    if (!apiKey) {
      return res.status(400).json({ error: 'Missing OpenAI API key. Please add it to your template or profile.' });
    }

    const jdAnalysis = await analyzeJobDescription(apiKey, jobDescription);
    const finalPosition = position || jdAnalysis.position || 'Position';
    const finalCompany = company || jdAnalysis.company || 'Company';

    // Duplicate Check
    const { data: existingLogs } = await req.supabase
      .from(HISTORY_TABLE)
      .select('id')
      .eq('user_id', req.user.id)
      .ilike('company_name', finalCompany)
      .limit(1);

    const isDuplicate = existingLogs && existingLogs.length > 0;
    
    // Generate Resume
    const tailoredContent = await generateTailoredContent(
      apiKey,
      record.json_data,
      jdAnalysis
    );

    if (typeof tailoredContent.matchScore !== 'number') {
      tailoredContent.matchScore = 96;
    } else {
      const score = Math.round(tailoredContent.matchScore);
      tailoredContent.matchScore = Math.min(98, Math.max(95, score));
    }

    // Log History
    await req.supabase.from(HISTORY_TABLE).insert({
      user_id: req.user.id,
      template_id: templateId,
      company_name: finalCompany,
      position: finalPosition,
      resume_data: tailoredContent
    });

    res.json({
      success: true,
      resume: tailoredContent,
      extractedPosition: finalPosition,
      extractedCompany: finalCompany,
      warning: isDuplicate ? `Warning: You have already generated a resume for ${finalCompany}.` : null
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// --- Existing Utilities (analyzeJobDescription, callOpenAI, etc.) ---

// Helper function for OpenAI calls (Assumed to be in original code, re-implementing briefly for completeness if missing)
async function callOpenAI(apiKey, prompt, maxTokens) {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: 'gpt-4o', // or gpt-4-turbo
      messages: [{ role: 'user', content: prompt }],
      max_tokens: maxTokens,
      temperature: 0.7
    })
  });
  
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error?.message || 'OpenAI API Error');
  }
  return data.choices[0].message.content;
}

// ... Copying the rest of the logic from original file ...

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

  const prompt = `You are an expert resume writer specializing in ATS-optimized resumes. Your task is to tailor a resume to match a specific job posting.

ORIGINAL RESUME DATA:
Name: ${name}
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
7. CRITICAL: You MUST bold matching keywords and technologies in the bullet points using markdown syntax (e.g., **React**, **Python**, **CI/CD**).
8. For skills, ALWAYS include these mandatory base skills in the appropriate categories:
   - Frontend: React, TypeScript (always include)
   - Backend: Node.js, Python (always include)
   - Testing & Quality: Unit Testing, Cypress (always include)
   - Collaboration: Agile, Cross-functional Teams, Mentorship (always include)
9. Add additional relevant skills from the job requirements into the appropriate categories
10. Each experience entry MUST have at least 5 bullet points (no fewer than 5)
11. Each skills category MUST list at least 7 skills (no fewer than 7)
12. Provide a match score between 95 and 98 (inclusive)

Return the tailored resume in the following JSON format:
{
  "matchScore": 96,
  "contact": {
    "name": "string",
    "email": "string",
    "phone": "string",
    "location": "string",
    "linkedin": "string",
    "website": "string",
    "github": "string"
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
      architecture: 'Architecture & System Design',
      performance: 'Performance, Scale & Metrics',
      methodologies: 'Methodologies & Collaboration',
      languages: 'Programming Languages',
      soft_skills: 'Soft Skills',
      collaboration: 'Collaboration',
      technical: 'Technical',
      soft: 'Soft Skills'
    };
    return Object.entries(skills)
      .map(([key, val]) => {
        const label = categoryLabels[key] || key;
        const valStr = Array.isArray(val) ? val.join(', ') : val;
        return `${label}: ${valStr}`;
      })
      .join('\n');
  }
  return JSON.stringify(skills);
}

function combineDates(start, end) {
  if (!start && !end) return '';
  return `${start || ''}${start && end ? ' - ' : ''}${end || ''}`;
}

function formatExperience(experience) {
  if (!experience) return 'Not provided';
  if (!Array.isArray(experience)) return JSON.stringify(experience);
  return experience.map(role => {
    const dates = role.dates || role.period || combineDates(role.startDate, role.endDate);
    return `
Title: ${role.title || role.role || 'Position'}
Company: ${role.company || 'Company'}
Dates: ${dates}
Location: ${role.location || 'Remote'}
Responsibilities:
${(role.bullets || role.responsibilities || role.highlights || []).map(b => '- ' + b).join('\n')}
`;
  }).join('\n');
}

function formatEducation(education) {
  if (!education) return 'Not provided';
  if (!Array.isArray(education)) return JSON.stringify(education);
  return education.map(edu => {
    const dates = edu.dates || edu.year || combineDates(edu.startDate, edu.endDate);
    return `
School: ${edu.school || edu.institution || 'Institution'}
Degree: ${edu.degree || 'Degree'}
Dates: ${dates}
Faculty: ${edu.faculty || edu.major || ''}
`;
  }).join('\n');
}

// Convert DOCX to PDF
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
    'C:\\Program Files\\LibreOffice\\program\\soffice.exe',
    'C:\\Program Files (x86)\\LibreOffice\\program\\soffice.exe',
    'soffice'
  ];
  for (const candidate of candidates) {
    if (candidate === 'soffice') return candidate;
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
