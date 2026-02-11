import { CONFIG } from './config.js';

class PopupController {
  constructor() {
    this.token = null;
    this.user = null;
    this.profile = null;
    this.templates = [];
    this.history = [];
    
    // UI Elements
    this.authSection = document.getElementById('auth-section');
    this.appContent = document.getElementById('app-content');
    this.userInfo = document.getElementById('user-info');
    this.userEmailSpan = document.getElementById('user-email');
    this.logoutBtn = document.getElementById('logout-btn');
    
    this.authTabs = document.querySelectorAll('.auth-tab');
    this.authForms = document.querySelectorAll('.auth-form');
    this.authMessage = document.getElementById('auth-message');
    
    this.tabs = document.querySelectorAll('.tab');
    this.tabContents = document.querySelectorAll('.tab-content');
    
    this.templateList = document.getElementById('template-list');
    this.templateCount = document.getElementById('template-count');
    this.templateSelect = document.getElementById('generate-template-select');
    
    this.historyList = document.getElementById('history-list');
    
    // Bind methods
    this.init = this.init.bind(this);
    this.handleAuth = this.handleAuth.bind(this);
    this.handleUpload = this.handleUpload.bind(this);
    this.handleGenerate = this.handleGenerate.bind(this);
    this.extractJD = this.extractJD.bind(this);
    
    this.init();
  }

  async init() {
    this.setupEventListeners();
    
    // Check for stored token
    const stored = await chrome.storage.local.get(['authToken']);
    if (stored.authToken) {
      this.token = stored.authToken;
      await this.validateSession();
    } else {
      this.showAuth();
    }
  }

  setupEventListeners() {
    // Login Form
    document.getElementById('login-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = document.getElementById('login-email').value;
      const password = document.getElementById('login-password').value;
      await this.login(email, password);
    });

    // Signup Link (Redirect to Web)
    const signupLink = document.getElementById('signup-link');
    if (signupLink) {
        signupLink.href = `${CONFIG.DASHBOARD_URL}/#type=signup`;
        signupLink.addEventListener('click', (e) => {
            // Let the default behavior happen if it has target="_blank", 
            // BUT Chrome extensions often block direct navigation in popups.
            // So we explicitly use tabs.create to be 100% sure it opens a new tab.
            e.preventDefault();
            chrome.tabs.create({ url: `${CONFIG.DASHBOARD_URL}/#type=signup` });
        });
    }

    // Forgot Password Link (Switch to Tab)
    document.getElementById('forgot-password-link').addEventListener('click', (e) => {
      e.preventDefault();
      this.authForms.forEach(f => f.classList.add('hidden'));
      document.getElementById('forgot-password-form').classList.remove('hidden');
    });

    // Recovery Button (Redirect to Web)
    const recoveryBtn = document.getElementById('recovery-btn');
    if (recoveryBtn) {
        recoveryBtn.addEventListener('click', (e) => {
            e.preventDefault();
            chrome.tabs.create({ url: `${CONFIG.DASHBOARD_URL}/#type=recovery` });
        });
    }
    
    // Back to Login (from Recovery)
    document.getElementById('back-to-login').addEventListener('click', () => {
      document.getElementById('forgot-password-form').classList.add('hidden');
      document.getElementById('login-form').classList.remove('hidden');
      document.getElementById('login-form').classList.add('active');
    });

    // Logout
    this.logoutBtn.addEventListener('click', () => this.logout());

    // Main Tabs
    this.tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        this.tabs.forEach(t => t.classList.remove('active'));
        this.tabContents.forEach(c => c.classList.remove('active'));
        
        tab.classList.add('active');
        const targetId = `${tab.dataset.tab}-tab`;
        document.getElementById(targetId).classList.add('active');
        
        if (tab.dataset.tab === 'history') {
          this.fetchHistory();
        }
      });
    });

    // Template Upload
    document.getElementById('upload-form').addEventListener('submit', this.handleUpload);

    // Profile Settings (Restored)
    const saveKeyBtn = document.getElementById('save-profile-key');
    if (saveKeyBtn) {
        saveKeyBtn.addEventListener('click', async () => {
            const key = document.getElementById('profile-openai-key').value;
            await this.updateProfile({ openai_key: key });
        });
    }

    // Generate Section
    document.getElementById('extract-jd').addEventListener('click', this.extractJD);
    document.getElementById('generate-btn').addEventListener('click', this.handleGenerate);
    
    // Download Buttons
    document.getElementById('download-pdf').addEventListener('click', () => this.downloadResume('pdf'));
    document.getElementById('download-docx').addEventListener('click', () => this.downloadResume('docx'));
  }

  async login(email, password) {
    try {
      const res = await fetch(`${CONFIG.API_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });
      
      const data = await res.json();
      
      if (!res.ok) {
        throw new Error(data.error || 'Login failed');
      }

      this.token = data.session.access_token;
      this.user = data.user;
      
      // Save token
      await chrome.storage.local.set({ 
        authToken: this.token,
        refreshToken: data.session.refresh_token 
      });

      await this.validateSession();
      
    } catch (err) {
      if (err.message && err.message.includes('not yet approved')) {
        this.showAuthMessage('Your account is pending admin approval. Please wait for confirmation.', 'error');
      } else {
        this.showAuthMessage(err.message, 'error');
      }
    }
  }

  async signup(email, password) {
    try {
      const res = await fetch(`${CONFIG.API_URL}/auth/signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });
      
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      
      this.showAuthMessage(data.message || 'Signup successful! Redirecting...', 'success');
      document.getElementById('signup-form').reset();
      
      if (data.session) {
          this.token = data.session.access_token;
          await chrome.storage.local.set({ authToken: this.token });
          const dashboardUrl = `${CONFIG.DASHBOARD_URL}/#access_token=${this.token}&refresh_token=${data.session.refresh_token}&type=recovery`;
          chrome.tabs.create({ url: dashboardUrl });
      } else {
          // No session (email confirmation needed)
          const dashboardUrl = `${CONFIG.DASHBOARD_URL}/#type=signup`;
          chrome.tabs.create({ url: dashboardUrl });
      }
      
    } catch (err) {
      console.error(err);
      this.showAuthMessage(err.message, 'error');
    }
  }

  async forgotPassword(email) {
    try {
      const res = await fetch(`${CONFIG.API_URL}/auth/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      });
      
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      
      this.showAuthMessage('Reset link sent. Redirecting to dashboard...', 'success');
      
      // Redirect to dashboard
      chrome.tabs.create({ url: `${CONFIG.DASHBOARD_URL}/#type=recovery` });
      
    } catch (err) {
      this.showAuthMessage(err.message, 'error');
    }
  }

  async validateSession() {
    try {
      const res = await fetch(`${CONFIG.API_URL}/auth/me`, {
        headers: { 'Authorization': `Bearer ${this.token}` }
      });
      
      if (!res.ok) throw new Error('Session invalid');
      
      const data = await res.json();
      this.user = data.user;
      
      // Ensure profile exists, if null, we treat as pending/unapproved
      this.profile = data.profile || { is_approved: false }; 
      
      this.showApp();
    } catch (err) {
      console.error(err);
      this.logout();
    }
  }

  logout() {
    this.token = null;
    this.user = null;
    this.profile = null;
    chrome.storage.local.remove('authToken');
    this.showAuth();
  }

  showAuth() {
    this.authSection.classList.remove('hidden');
    this.appContent.classList.add('hidden');
    this.userInfo.classList.add('hidden');
  }

  showApp() {
    this.authSection.classList.add('hidden');
    this.appContent.classList.remove('hidden');
    this.userInfo.classList.remove('hidden');
    this.userEmailSpan.textContent = this.user.email;
    
    this.updateStatusBadge();

    if (this.profile && this.profile.openai_key) {
        document.getElementById('profile-openai-key').value = this.profile.openai_key;
    }
    
    if (this.profile && this.profile.is_approved) {
      this.fetchTemplates();
      // Enable features
      document.querySelectorAll('.upload-section button, #extract-jd, #generate-btn').forEach(b => b.disabled = false);
    } else {
      // Disable features
      document.querySelectorAll('.upload-section button, #extract-jd, #generate-btn').forEach(b => b.disabled = true);
      this.templateList.innerHTML = '<div style="padding:10px;color:orange">Account pending approval. Features disabled.</div>';
    }
  }

  updateStatusBadge() {
    const badge = document.getElementById('user-status');
    badge.classList.remove('hidden', 'status-approved', 'status-pending');
    
    console.log('[Popup] Updating badge. Profile:', this.profile);

    if (this.profile && this.profile.is_approved) {
      badge.textContent = 'Approved';
      badge.classList.add('status-approved');
      badge.classList.remove('hidden'); // Ensure visible
    } else {
      badge.textContent = 'Processing';
      badge.classList.add('status-pending');
      badge.classList.remove('hidden'); // Ensure visible
    }
  }

  showAuthMessage(msg, type) {
    this.authMessage.textContent = msg;
    this.authMessage.className = `message ${type === 'error' ? 'error-message' : 'success-message'}`;
    this.authMessage.style.display = 'block';
  }

  // --- Templates ---

  async fetchTemplates() {
    try {
      console.log('[Popup] Fetching templates...');
      this.templateList.innerHTML = '<div class="loading">Loading templates...</div>';
      
      const res = await fetch(`${CONFIG.API_URL}/templates`, {
        headers: { 'Authorization': `Bearer ${this.token}` }
      });
      
      let data;
      try {
        data = await res.json();
      } catch (e) {
        throw new Error(`Server error (${res.status}): Invalid JSON response`);
      }

      console.log('[Popup] Templates response:', data);
      
      if (!res.ok) throw new Error(data.error || `Error ${res.status}`);
      
      this.templates = Array.isArray(data.templates) ? data.templates : [];
      this.renderTemplates();
      this.updateTemplateSelect();
    } catch (err) {
      console.error('Failed to fetch templates:', err);
      this.templateList.innerHTML = `<div class="error-message">Failed to load templates: ${err.message}</div>`;
      this.templateCount.textContent = '0';
    }
  }

  renderTemplates() {
    this.templateList.innerHTML = '';
    this.templateCount.textContent = this.templates.length;
    
    if (this.templates.length === 0) {
      this.templateList.innerHTML = '<div class="empty-state">No templates found. Upload one to get started.</div>';
      return;
    }
    
    this.templates.forEach(t => {
      const div = document.createElement('div');
      div.className = 'template-item';
      div.innerHTML = `
        <div class="template-info">
          <div class="template-name">${t.username || t.filename}</div>
          <div class="template-date">${new Date(t.created_at).toLocaleDateString()}</div>
        </div>
        <div class="template-actions">
          <button class="btn-icon delete" data-id="${t.id}" title="Delete">🗑️</button>
        </div>
      `;
      
      div.querySelector('.delete').addEventListener('click', () => this.deleteTemplate(t.id));
      this.templateList.appendChild(div);
    });

    const uploadBtn = document.querySelector('#upload-form button');
    if (this.templates.length >= 3) {
      uploadBtn.disabled = true;
      uploadBtn.textContent = 'Limit Reached (Max 3)';
    } else {
      uploadBtn.disabled = false;
      uploadBtn.textContent = 'Upload Template';
    }
  }

  updateTemplateSelect() {
    this.templateSelect.innerHTML = '';
    this.templates.forEach(t => {
      const option = document.createElement('option');
      option.value = t.id;
      option.textContent = t.username || t.filename;
      this.templateSelect.appendChild(option);
    });
  }

  async handleUpload(e) {
    e.preventDefault();
    if (this.templates.length >= 3) {
      alert('You can only upload up to 3 templates.');
      return;
    }

    const fileInput = document.getElementById('resume-file');
    const nameInput = document.getElementById('template-name');
    const keyInput = document.getElementById('openai-key');
    
    if (!fileInput.files[0]) return;

    const formData = new FormData();
    formData.append('file', fileInput.files[0]);
    formData.append('username', nameInput.value);
    formData.append('openaiKey', keyInput.value);

    try {
      const res = await fetch(`${CONFIG.API_URL}/templates/upload`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${this.token}` },
        body: formData
      });
      
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      
      // Reset form
      e.target.reset();
      this.fetchTemplates();
      alert('Template uploaded successfully!');
    } catch (err) {
      alert('Upload failed: ' + err.message);
    }
  }

  async deleteTemplate(id) {
    if (!confirm('Are you sure you want to delete this template?')) return;
    
    try {
      const res = await fetch(`${CONFIG.API_URL}/templates/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${this.token}` }
      });
      
      if (!res.ok) throw new Error('Failed to delete');
      
      this.fetchTemplates();
    } catch (err) {
      alert(err.message);
    }
  }

  async updateProfile(updates) {
    try {
      const res = await fetch(`${CONFIG.API_URL}/profile`, {
        method: 'PUT',
        headers: { 
          'Authorization': `Bearer ${this.token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(updates)
      });
      
      if (!res.ok) throw new Error('Update failed');
      
      const data = await res.json();
      this.profile = data.profile;
      alert('Profile updated!');
    } catch (err) {
      alert(err.message);
    }
  }

  // --- Generate ---

  async extractJD() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) return;

    try {
      // Execute content script if not already injected (simplified assumption: already injected or declared in manifest)
      const response = await chrome.tabs.sendMessage(tab.id, { action: 'extractJD' });
      
      if (response && response.success) {
        document.getElementById('position-title').value = response.position || '';
        document.getElementById('company-name').value = response.company || '';
        document.getElementById('jd-text').value = response.jobDescription || '';
        
        // Check for duplicates
        if (response.company) {
          this.checkDuplicate(response.company);
        }
      } else {
        alert('Could not extract job description. Please paste manually.');
      }
    } catch (err) {
      console.error(err);
      // Fallback: try executing script
      alert('Error communicating with page. Try reloading the page.');
    }
  }

  async checkDuplicate(company) {
    const warningBox = document.getElementById('duplicate-warning');
    warningBox.classList.add('hidden');
    
    try {
      const res = await fetch(`${CONFIG.API_URL}/history?company=${encodeURIComponent(company)}`, {
        headers: { 'Authorization': `Bearer ${this.token}` }
      });
      const data = await res.json();
      
      if (data.history && data.history.length > 0) {
        const lastUsed = data.history[0];
        let suggestionHtml = '';
        
        if (lastUsed.template_id) {
            const tmpl = this.templates.find(t => t.id === lastUsed.template_id);
            if (tmpl) {
                suggestionHtml = `<div class="mt-2">💡 <strong>Suggestion:</strong> You previously used template "<strong>${tmpl.username || tmpl.filename}</strong>".</div>`;
            }
        }

        warningBox.innerHTML = `
          <div style="display: flex; gap: 8px; align-items: flex-start;">
            <span class="warning-icon">⚠️</span>
            <div>
              <strong>Warning:</strong> You have already generated a resume for 
              "${company}" on ${new Date(lastUsed.created_at).toLocaleDateString()}.
              ${suggestionHtml}
            </div>
          </div>
        `;
        warningBox.classList.remove('hidden');
      }
    } catch (err) {
      console.error('Check duplicate failed', err);
    }
  }

  async handleGenerate() {
    const templateId = this.templateSelect.value;
    const position = document.getElementById('position-title').value;
    const company = document.getElementById('company-name').value;
    const jdText = document.getElementById('jd-text').value;
    
    if (!templateId) {
      alert('Please select a template');
      return;
    }
    if (!jdText) {
      alert('Please provide a job description');
      return;
    }

    const btn = document.getElementById('generate-btn');
    const status = document.getElementById('generate-status');
    const downloadSec = document.getElementById('download-section');
    
    btn.disabled = true;
    status.classList.remove('hidden');
    downloadSec.classList.add('hidden');
    
    try {
      const res = await fetch(`${CONFIG.API_URL}/generate`, {
        method: 'POST',
        headers: { 
          'Authorization': `Bearer ${this.token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          templateId,
          jobDescription: jdText,
          position,
          company
        })
      });
      
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      
      this.currentResume = data.resume; // Store for download
      
      // Update UI
      document.getElementById('match-score-value').textContent = `${data.resume.matchScore}%`;
      downloadSec.classList.remove('hidden');
      
      // Refresh history
      this.fetchHistory();
      
    } catch (err) {
      alert('Generation failed: ' + err.message);
    } finally {
      btn.disabled = false;
      status.classList.add('hidden');
    }
  }

  // --- History ---

  async fetchHistory() {
    try {
      const res = await fetch(`${CONFIG.API_URL}/history`, {
        headers: { 'Authorization': `Bearer ${this.token}` }
      });
      const data = await res.json();
      this.history = data.history || [];
      this.renderHistory();
    } catch (err) {
      console.error(err);
    }
  }

  renderHistory() {
    this.historyList.innerHTML = '';
    this.history.forEach(h => {
      const div = document.createElement('div');
      div.className = 'history-item';
      div.innerHTML = `
        <div class="history-company">${h.company_name}</div>
        <div class="history-role">${h.position_title}</div>
        <div class="history-meta">
          <span>${new Date(h.created_at).toLocaleDateString()}</span>
          <span>Score: ${h.match_score || '?'}%</span>
        </div>
      `;
      // Could add download logic here if we stored the full result
      this.historyList.appendChild(div);
    });
  }

  // --- Helpers from V1 ---

  normalizeProfileData(raw) {
    // Handle various structures:
    // 1. v2 structure with personalInfo wrapper
    // 2. v1 structure (flat)
    // 3. Generated structure (contact wrapper)
    const info = raw.personalInfo || raw.contact || raw;
    
    const normalized = {
      contact: {
        name: info.name || raw.name || '',
        title: info.title || raw.headline || raw.title || '',
        email: info.email || raw.email || '',
        phone: info.phone || raw.phone || '',
        location: info.location || raw.location || raw.address || '',
        linkedin: info.linkedin || raw.linkedin || '',
        website: info.portfolio || info.github || raw.website || '',
        github: info.github || raw.github || ''
      },
      summary: raw.summary || info.summary || ''
    };

    // Experience
    normalized.experience = (raw.experience || []).map(exp => ({
      title: exp.role || exp.title || exp.position || '',
      company: exp.company || '',
      dates: exp.dates || this.combineDates(exp.startDate, exp.endDate) || exp.duration || '',
      location: exp.location || '',
      bullets: exp.highlights || exp.bullets || (exp.description ? [exp.description] : []),
      technologies: exp.technologies || []
    }));

    // Education
    normalized.education = (raw.education || []).map(edu => ({
      school: edu.institution || edu.school || edu.university || '',
      faculty: edu.faculty || edu.major || '',
      degree: edu.degree || '',
      dates: edu.dates || this.combineDates(edu.startDate, edu.endDate) || edu.duration || '',
      gpa: edu.gpa || '',
      honors: edu.honors || edu.notes || ''
    }));

    // Skills - flatten all categories into a single array for the AI prompt or display if needed
    // But keep structure if possible. For generation, we might prefer the object structure if available.
    if (raw.skills) {
      if (Array.isArray(raw.skills)) {
        normalized.skills = raw.skills;
      } else if (typeof raw.skills === 'object') {
        // v2 structure often has categorized skills. Keep them as is, but also support flattening if needed.
        normalized.skills = raw.skills;
      }
    } else {
      normalized.skills = [];
    }

    return normalized;
  }

  combineDates(start, end) {
    if (!start && !end) return '';
    return `${start || ''}${start && end ? ' - ' : ''}${end || ''}`;
  }

  formatDateRange(value) {
    if (!value || typeof value !== 'string') return value;
    const normalized = value.replace(/\s+/g, ' ').trim();
    const parts = normalized.split(/\s*[-\u2013\u2014]\s*/);
    if (parts.length >= 2) {
      const start = this.formatDatePart(parts[0]);
      const end = this.formatDatePart(parts.slice(1).join(' - '));
      if (start && end) return `${start} - ${end}`;
    }
    return this.formatDatePart(normalized) || normalized;
  }

  formatDatePart(value) {
    const text = (value || '').trim();
    if (!text) return '';

    const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const monthMap = {
      jan: 'Jan', january: 'Jan',
      feb: 'Feb', february: 'Feb',
      mar: 'Mar', march: 'Mar',
      apr: 'Apr', april: 'Apr',
      may: 'May',
      jun: 'Jun', june: 'Jun',
      jul: 'Jul', july: 'Jul',
      aug: 'Aug', august: 'Aug',
      sep: 'Sep', sept: 'Sep', september: 'Sep',
      oct: 'Oct', october: 'Oct',
      nov: 'Nov', november: 'Nov',
      dec: 'Dec', december: 'Dec'
    };

    // YYYY-MM-DD or YYYY-MM
    let m = text.match(/^(\d{4})[-\/.](\d{1,2})(?:[-\/.]\d{1,2})?$/);
    if (m) {
      const year = m[1];
      const monthNum = parseInt(m[2], 10);
      if (monthNum >= 1 && monthNum <= 12) {
        return `${monthNames[monthNum - 1]} ${year}`;
      }
    }

    // MM/YYYY
    m = text.match(/^(\d{1,2})[-\/.](\d{4})$/);
    if (m) {
       const monthNum = parseInt(m[1], 10);
       const year = m[2];
       if (monthNum >= 1 && monthNum <= 12) {
        return `${monthNames[monthNum - 1]} ${year}`;
      }
    }

    // Month YYYY (Jan 2023 or January 2023)
    m = text.match(/^([A-Za-z]+)[,\s]+(\d{4})$/);
    if (m) {
      const mon = m[1].toLowerCase();
      const year = m[2];
      if (monthMap[mon]) return `${monthMap[mon]} ${year}`;
    }

    // YYYY Month
    m = text.match(/^(\d{4})[,\s]+([A-Za-z]+)$/);
    if (m) {
      const year = m[1];
      const mon = m[2].toLowerCase();
      if (monthMap[mon]) return `${monthMap[mon]} ${year}`;
    }

    if (/^\d{4}$/.test(text)) return text;
    
    return text;
  }

  parseBoldRuns(text) {
    const runs = [];
    if (!text) return runs;
    const parts = text.split(/\*\*(.*?)\*\*/g);
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      if (!part) continue;
      const bold = i % 2 === 1;
      runs.push({ text: part, bold });
    }
    return runs;
  }

  buildDocxRuns(text, font, size) {
    const runs = [];
    for (const run of this.parseBoldRuns(text)) {
      runs.push(new window.docx.TextRun({ text: run.text, bold: !!run.bold, size: size, font: font }));
    }
    return runs.length ? runs : [new window.docx.TextRun({ text: text || '', size: size, font: font })];
  }

  renderRichTextPdf(doc, text, x, y, maxWidth, fontSize, lineHeight, render = true) {
    const runs = this.parseBoldRuns(text);
    if (!runs.length) return { lines: 0, height: 0 };

    const tokens = [];
    for (const run of runs) {
      const segments = run.text.replace(/\r\n/g, '\n').split('\n');
      for (let s = 0; s < segments.length; s++) {
        const parts = segments[s].split(/(\s+)/);
        for (const part of parts) {
          if (part === '') continue;
          tokens.push({ text: part, bold: run.bold });
        }
        if (s < segments.length - 1) {
          tokens.push({ newline: true });
        }
      }
    }

    const lines = [];
    let current = [];
    let width = 0;

    const measure = (token) => {
      doc.setFont('helvetica', token.bold ? 'bold' : 'normal');
      doc.setFontSize(fontSize);
      return doc.getTextWidth(token.text);
    };

    for (const token of tokens) {
      if (token.newline) {
        lines.push(current);
        current = [];
        width = 0;
        continue;
      }
      if (current.length === 0 && /^\s+$/.test(token.text)) {
        continue;
      }
      const w = measure(token);
      if (width + w > maxWidth && current.length > 0) {
        lines.push(current);
        current = [];
        width = 0;
        if (/^\s+$/.test(token.text)) continue;
      }
      current.push(token);
      width += w;
    }
    if (current.length) lines.push(current);

    if (render) {
      let yPos = y;
      for (const line of lines) {
        let xPos = x;
        for (const token of line) {
          doc.setFont('helvetica', token.bold ? 'bold' : 'normal');
          doc.setFontSize(fontSize);
          doc.text(token.text, xPos, yPos);
          xPos += doc.getTextWidth(token.text);
        }
        yPos += lineHeight;
      }
    }

    return { lines: lines.length, height: lines.length * lineHeight };
  }

  renderBulletPdf(doc, text, x, y, maxWidth, fontSize, lineHeight, render = true) {
    const prefix = '\u2022 ';
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(fontSize);
    const prefixWidth = doc.getTextWidth(prefix);
    const textResult = this.renderRichTextPdf(
      doc,
      text,
      x + prefixWidth,
      y,
      maxWidth - prefixWidth,
      fontSize,
      lineHeight,
      render
    );
    if (render) {
      doc.text(prefix, x, y);
    }
    return { lines: textResult.lines, height: textResult.height };
  }

  // --- Download ---
  
  async downloadResume(format) {
    if (!this.currentResume) return;
    
    if (format === 'pdf') {
       this.generatePDF(this.currentResume);
    } else if (format === 'docx') {
       this.generateDOCX(this.currentResume);
    }
  }
  
  generatePDF(rawResumeData) {
    try {
        const resumeData = this.normalizeProfileData(rawResumeData);
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF({
          orientation: 'portrait',
          unit: 'mm',
          format: 'letter'
        });

        const pageWidth = doc.internal.pageSize.getWidth();
        const pageHeight = doc.internal.pageSize.getHeight();
        const marginSide = 19.05;   // 0.75 inch
        const marginTop = 25.4;     // 1 inch
        const marginBottom = 25.4;  // 1 inch
        const contentWidth = pageWidth - (marginSide * 2);
        let yPos = marginTop;
        const afterPara = 1.5;

        // Use helvetica (standard ATS-safe font available in jsPDF)
        doc.setFont('helvetica');

        const checkPageBreak = (neededSpace) => {
          if (yPos + neededSpace > pageHeight - marginBottom) {
            doc.addPage();
            yPos = marginTop;
            return true;
          }
          return false;
        };

        const ensureSectionStart = (minBodyHeight = 4.2) => {
          // Keep section header + at least one body line together
          const headerHeight = 5 + afterPara;
          checkPageBreak(headerHeight + minBodyHeight);
        };

        const drawSectionLine = () => {
          yPos += 3;
          doc.setDrawColor(150, 150, 150);
          doc.setLineWidth(0.3);
          doc.line(marginSide, yPos, pageWidth - marginSide, yPos);
          yPos += 3;
        };

        const skillCategoryLabels = {
          frontend: 'Frontend',
          backend: 'Backend',
          database: 'Database',
          security: 'Security',
          ai_llm: 'AI & LLM Systems',
          cloud_devops: 'Cloud & DevOps',
          testing: 'Testing & Quality',
          collaboration: 'Collaboration',
          technical: 'Technical',
          soft: 'Soft Skills'
        };

        // --- Contact Section (centered header) ---
        const info = resumeData.contact;
        const name = info.name || 'Name';
        const email = info.email;
        const phone = info.phone;
        const location = info.location;
        const linkedin = info.linkedin;
        const website = info.website;

        // Name: 22pt bold
        doc.setFontSize(22);
        doc.setFont('helvetica', 'bold');
        doc.text(name, pageWidth / 2, yPos, { align: 'center' });
        yPos += 8 + afterPara;

        // Contact info: 10pt
        const contactParts = [];
        if (email) contactParts.push(email);
        if (phone) contactParts.push(phone);
        if (location) contactParts.push(location);

        if (contactParts.length > 0) {
          doc.setFontSize(10);
          doc.setFont('helvetica', 'normal');
          doc.text(contactParts.join('  |  '), pageWidth / 2, yPos, { align: 'center' });
          yPos += 4.5 + afterPara;
        }

        // LinkedIn/Website: 10pt blue
        const webParts = [];
        if (linkedin) webParts.push(linkedin);
        if (website) webParts.push(website);
        if (webParts.length > 0) {
          doc.setFontSize(10);
          doc.setTextColor(0, 0, 150);
          doc.text(webParts.join('  |  '), pageWidth / 2, yPos, { align: 'center' });
          doc.setTextColor(0, 0, 0);
          yPos += 4.5 + afterPara;
        }

        drawSectionLine();

        // --- Professional Summary ---
        if (resumeData.summary) {
          ensureSectionStart(4.2);
          doc.setFontSize(12);
          doc.setFont('helvetica', 'bold');
          doc.text('PROFESSIONAL SUMMARY', marginSide, yPos);
          
          drawSectionLine();

          // Use renderRichTextPdf for bold support
          const result = this.renderRichTextPdf(
            doc,
            resumeData.summary,
            marginSide,
            yPos,
            contentWidth,
            10,
            4.2,
            true
          );
          yPos += result.height + afterPara;
        }

        // --- Work Experience ---
        if (resumeData.experience && resumeData.experience.length > 0) {
          ensureSectionStart(4.2);
          doc.setFontSize(12);
          doc.setFont('helvetica', 'bold');
          doc.text('WORK EXPERIENCE', marginSide, yPos);
          
          drawSectionLine();

          for (const exp of resumeData.experience) {
            checkPageBreak(20);

            // Title: 11pt bold
            doc.setFontSize(11);
            doc.setFont('helvetica', 'bold');
            doc.text(exp.title || 'Position', marginSide, yPos);

            // Dates right-aligned: 10pt
            const dates = this.formatDateRange(exp.dates);
            if (dates) {
              doc.setFontSize(10);
              doc.setFont('helvetica', 'normal');
              doc.text(dates, pageWidth - marginSide, yPos, { align: 'right' });
            }
            yPos += 4.5;

            // Company and location: 10pt italic
            doc.setFontSize(10);
            doc.setFont('helvetica', 'italic');
            let companyLine = exp.company || '';
            if (exp.location) companyLine += ` | ${exp.location}`;
            doc.text(companyLine, marginSide, yPos);
            doc.setFont('helvetica', 'normal');
            yPos += 4 + afterPara;

            // Bullets: 10pt with standard bullet character
            const bullets = exp.bullets;
            if (bullets && bullets.length > 0) {
              for (const bullet of bullets) {
                // Pre-calculate height
                const heightCheck = this.renderBulletPdf(
                    doc, bullet, marginSide + 3, yPos, contentWidth - 5, 10, 4.0, false
                );
                
                checkPageBreak(heightCheck.height);
                
                const result = this.renderBulletPdf(
                    doc, bullet, marginSide + 3, yPos, contentWidth - 5, 10, 4.0, true
                );
                yPos += result.height + afterPara;
              }
            }

            yPos += afterPara;
          }
        }

        // --- Education ---
        if (resumeData.education && resumeData.education.length > 0) {
          ensureSectionStart(4.2);
          doc.setFontSize(12);
          doc.setFont('helvetica', 'bold');
          doc.text('EDUCATION', marginSide, yPos);
          
          drawSectionLine();

          for (const edu of resumeData.education) {
            checkPageBreak(10);

            // School: 11pt bold
            const school = edu.school;
            if (school) {
              doc.setFontSize(11);
              doc.setFont('helvetica', 'bold');
              doc.text(school, marginSide, yPos);
            }
            // Dates right-aligned: 10pt
            const dates = this.formatDateRange(edu.dates);
            if (dates) {
              doc.setFontSize(10);
              doc.setFont('helvetica', 'normal');
              doc.text(dates, pageWidth - marginSide, yPos, { align: 'right' });
            }
            yPos += 4.5;

            // Degree line: 10pt
            let degreeLine = edu.degree || '';
            const faculty = edu.faculty;
            if (faculty && !degreeLine.toLowerCase().includes(faculty.toLowerCase())) {
              degreeLine += degreeLine ? `, ${faculty}` : faculty;
            }
            if (degreeLine) {
              doc.setFontSize(10);
              doc.setFont('helvetica', 'normal');
              doc.text(degreeLine, marginSide, yPos);
              yPos += 4;
            }

            // GPA and honors: 10pt
            const extras = [];
            if (edu.gpa) extras.push(`GPA: ${edu.gpa}`);
            if (edu.honors) extras.push(edu.honors);
            if (extras.length > 0) {
              doc.setFontSize(10);
              doc.setFont('helvetica', 'normal');
              doc.text(extras.join(' | '), marginSide, yPos);
              yPos += 4;
            }

            yPos += afterPara;
          }
        }

        // --- Skills (categorized) ---
        if (resumeData.skills) {
          ensureSectionStart(4.0);
          doc.setFontSize(12);
          doc.setFont('helvetica', 'bold');
          doc.text('SKILLS', marginSide, yPos);
          
          drawSectionLine();

          if (typeof resumeData.skills === 'object' && !Array.isArray(resumeData.skills)) {
            const categoryOrder = ['frontend', 'backend', 'database', 'security', 'ai_llm', 'cloud_devops', 'testing', 'collaboration', 'technical', 'soft'];
            for (const key of categoryOrder) {
              const skills = resumeData.skills[key];
              if (skills && skills.length > 0) {
                checkPageBreak(6);
                const label = skillCategoryLabels[key] || key;
                doc.setFontSize(10);
                doc.setFont('helvetica', 'bold');
                doc.text(`${label}: `, marginSide, yPos);
                const labelWidth = doc.getTextWidth(`${label}: `);
                doc.setFont('helvetica', 'normal');
                
                const skillsStr = Array.isArray(skills) ? skills.join(', ') : skills;
                const skillLines = doc.splitTextToSize(skillsStr, contentWidth - labelWidth);
                doc.text(skillLines[0], marginSide + labelWidth, yPos);
                if (skillLines.length > 1) {
                  for (let sl = 1; sl < skillLines.length; sl++) {
                    yPos += 4.0;
                    doc.text(skillLines[sl], marginSide + labelWidth, yPos);
                  }
                }
                yPos += 4.0 + afterPara;
              }
            }
          } else if (Array.isArray(resumeData.skills)) {
            doc.setFontSize(10);
            doc.setFont('helvetica', 'normal');
            
            // Handle if skills is array of strings or objects (v2 structure sometimes has objects)
            const skillsStr = resumeData.skills.map(s => typeof s === 'string' ? s : s.name).join(', ');
            
            const skillLines = doc.splitTextToSize(skillsStr, contentWidth);
            doc.text(skillLines, marginSide, yPos);
            yPos += skillLines.length * 4.0 + afterPara;
          }
        }

        doc.save('resume.pdf');
    } catch (err) {
        console.error('PDF generation failed', err);
        alert('PDF generation failed. Check console.');
    }
  }
  
  generateDOCX(rawResumeData) {
      try {
          const resumeData = this.normalizeProfileData(rawResumeData);
          const { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType, BorderStyle, TabStopPosition, TabStopType } = window.docx;
          
          const children = [];
          const spAfter = 120; // 6pt = 120 twips
          const fontFamily = 'Calibri';

          // Handle personalInfo wrapper from v2 or root properties from v1
          const info = resumeData.contact;
          const name = info.name || 'Resume';
          const email = info.email;
          const phone = info.phone;
          const location = info.location;
          const linkedin = info.linkedin;
          const website = info.website;

          const skillCategoryLabels = {
            frontend: 'Frontend',
            backend: 'Backend',
            database: 'Database',
            security: 'Security',
            ai_llm: 'AI & LLM Systems',
            cloud_devops: 'Cloud & DevOps',
            testing: 'Testing & Quality',
            collaboration: 'Collaboration',
            technical: 'Technical',
            soft: 'Soft Skills'
          };

          // --- Name (22pt = 44 half-pts) ---
          children.push(new Paragraph({
            children: [
              new TextRun({
                text: name,
                bold: true,
                size: 44,
                font: fontFamily
              })
            ],
            alignment: AlignmentType.CENTER,
            spacing: { before: 0, after: spAfter }
          }));

          // --- Contact info (10pt = 20 half-pts) ---
          const contactParts = [];
          if (email) contactParts.push(email);
          if (phone) contactParts.push(phone);
          if (location) contactParts.push(location);

          if (contactParts.length > 0) {
            children.push(new Paragraph({
              children: [
                new TextRun({
                  text: contactParts.join('  |  '),
                  size: 20,
                  font: fontFamily
                })
              ],
              alignment: AlignmentType.CENTER,
              spacing: { before: 0, after: spAfter }
            }));
          }

          // --- LinkedIn/Website (10pt = 20 half-pts, blue) ---
          const webParts = [];
          if (linkedin) webParts.push(linkedin);
          if (website) webParts.push(website);

          if (webParts.length > 0) {
            children.push(new Paragraph({
              children: [
                new TextRun({
                  text: webParts.join('  |  '),
                  size: 20,
                  color: '0000AA',
                  font: fontFamily
                })
              ],
              alignment: AlignmentType.CENTER,
              spacing: { before: 0, after: spAfter }
            }));
          }

          // --- Section header helper (12pt = 24 half-pts, bold, bottom border) ---
          const addSectionHeader = (title) => {
            children.push(new Paragraph({
              children: [
                new TextRun({
                  text: title,
                  bold: true,
                  size: 24,
                  font: fontFamily
                })
              ],
              border: {
                bottom: {
                  color: '999999',
                  style: BorderStyle.SINGLE,
                  size: 6
                }
              },
              spacing: { before: 200, after: spAfter },
              keepNext: true,
              keepLines: true
            }));
          };

          // --- Professional Summary (10pt = 20 half-pts) ---
          if (resumeData.summary) {
            addSectionHeader('PROFESSIONAL SUMMARY');
            children.push(new Paragraph({
              children: this.buildDocxRuns(resumeData.summary, fontFamily, 20),
              spacing: { before: 0, after: spAfter }
            }));
          }

          // --- Work Experience ---
          if (resumeData.experience && resumeData.experience.length > 0) {
            addSectionHeader('WORK EXPERIENCE');

            for (const exp of resumeData.experience) {
              // Title (11pt = 22 half-pts bold) with dates right-aligned (10pt = 20)
              const dates = this.formatDateRange(exp.dates);
              
              children.push(new Paragraph({
                children: [
                  new TextRun({
                    text: exp.title || 'Position',
                    bold: true,
                    size: 22,
                    font: fontFamily
                  }),
                  new TextRun({
                    text: `\t${dates ? dates : ''}`,
                    size: 20,
                    font: fontFamily
                  })
                ],
                tabStops: [
                  {
                    type: TabStopType.RIGHT,
                    position: TabStopPosition.MAX
                  }
                ],
                spacing: { before: 80, after: 0 }
              }));

              // Company and location (10pt = 20 half-pts, italic)
              let companyLine = exp.company || '';
              if (exp.location) companyLine += ` | ${exp.location}`;

              children.push(new Paragraph({
                children: [
                  new TextRun({
                    text: companyLine,
                    italics: true,
                    size: 20,
                    font: fontFamily
                  })
                ],
                spacing: { before: 0, after: spAfter }
              }));

              // Bullets (10pt = 20 half-pts, standard bullet)
              const bullets = exp.bullets;
              if (bullets && bullets.length > 0) {
                for (const bullet of bullets) {
                  children.push(new Paragraph({
                    children: this.buildDocxRuns(bullet, fontFamily, 20),
                    bullet: {
                      level: 0
                    },
                    spacing: { before: 0, after: spAfter }
                  }));
                }
              }
            }
          }

          // --- Education ---
          if (resumeData.education && resumeData.education.length > 0) {
            addSectionHeader('EDUCATION');

            for (const edu of resumeData.education) {
              // School (11pt = 22 half-pts bold) with dates right-aligned
              const dates = this.formatDateRange(edu.dates);
              
              children.push(new Paragraph({
                children: [
                  new TextRun({
                    text: edu.school || 'Institution',
                    bold: true,
                    size: 22,
                    font: fontFamily
                  }),
                  new TextRun({
                    text: `\t${dates ? dates : ''}`,
                    size: 20,
                    font: fontFamily
                  })
                ],
                tabStops: [
                  {
                    type: TabStopType.RIGHT,
                    position: TabStopPosition.MAX
                  }
                ],
                spacing: { before: 80, after: 0 }
              }));

              // Degree line
              let degreeLine = edu.degree || '';
              const faculty = edu.faculty;
              if (faculty && !degreeLine.toLowerCase().includes(faculty.toLowerCase())) {
                degreeLine += degreeLine ? `, ${faculty}` : faculty;
              }
              if (degreeLine) {
                children.push(new Paragraph({
                  children: [
                    new TextRun({
                      text: degreeLine,
                      size: 20,
                      font: fontFamily
                    })
                  ],
                  spacing: { before: 0, after: 0 }
                }));
              }

              // GPA and honors
              const extras = [];
              if (edu.gpa) extras.push(`GPA: ${edu.gpa}`);
              if (edu.honors) extras.push(edu.honors);
              if (extras.length > 0) {
                children.push(new Paragraph({
                  children: [
                    new TextRun({
                      text: extras.join(' | '),
                      size: 20,
                      font: fontFamily
                    })
                  ],
                  spacing: { before: 0, after: spAfter }
                }));
              }
            }
          }

          // --- Skills (categorized) ---
          if (resumeData.skills) {
            addSectionHeader('SKILLS');

            if (typeof resumeData.skills === 'object' && !Array.isArray(resumeData.skills)) {
              const categoryOrder = ['frontend', 'backend', 'database', 'security', 'ai_llm', 'cloud_devops', 'testing', 'collaboration', 'technical', 'soft'];
              for (const key of categoryOrder) {
                const skills = resumeData.skills[key];
                if (skills && skills.length > 0) {
                  const label = skillCategoryLabels[key] || key;
                  const skillsStr = Array.isArray(skills) ? skills.join(', ') : skills;
                  
                  children.push(new Paragraph({
                    children: [
                      new TextRun({
                        text: `${label}: `,
                        bold: true,
                        size: 20,
                        font: fontFamily
                      }),
                      new TextRun({
                        text: skillsStr,
                        size: 20,
                        font: fontFamily
                      })
                    ],
                    spacing: { before: 0, after: spAfter }
                  }));
                }
              }
            } else if (Array.isArray(resumeData.skills)) {
               const skillsStr = resumeData.skills.map(s => typeof s === 'string' ? s : s.name).join(', ');
               children.push(new Paragraph({
                children: [
                  new TextRun({
                    text: skillsStr,
                    size: 20,
                    font: fontFamily
                  })
                ],
                spacing: { before: 0, after: spAfter }
              }));
            }
          }

          const doc = new Document({
              sections: [{
                  properties: {
                    page: {
                      margin: {
                        top: 1440,    // 1 inch
                        bottom: 1440, // 1 inch
                        right: 1080,  // 0.75 inch
                        left: 1080    // 0.75 inch
                      }
                    }
                  },
                  children: children,
              }],
          });

          Packer.toBlob(doc).then((blob) => {
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url;
              a.download = "resume.docx";
              document.body.appendChild(a);
              a.click();
              document.body.removeChild(a);
          });
      } catch (err) {
          console.error('DOCX generation failed', err);
          alert('DOCX generation failed. Check console.');
      }
  }
  
  handleAuth(e) {
      // Stub if needed
  }
}

new PopupController();
