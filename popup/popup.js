
// Popup UI Logic with template selection and resume generation

class PopupController {
  constructor() {
    this.currentTab = 'profile';
    this.templates = [];
    this.selectedTemplateId = null;
    this.backendUrl = 'https://easy-working.onrender.com/';
    this.resumeData = null;
    this.jdData = null;
    this.generatedResume = null;
    this.matchScore = null;
    this.init();
  }

  async init() {
    this.bindElements();
    this.bindEvents();
    await this.loadStoredData();
    await this.loadTemplates();
    this.updateGenerateButton();
  }

  bindElements() {
    // Tabs
    this.tabs = document.querySelectorAll('.tab');
    this.tabContents = document.querySelectorAll('.tab-content');

    // Template elements
    this.profileSelector = document.getElementById('profile-selector');
    this.templateSelect = document.getElementById('template-select');
    this.refreshTemplatesBtn = document.getElementById('refresh-templates');

    // Generate elements
    this.extractJdBtn = document.getElementById('extract-jd');
    this.positionInput = document.getElementById('position-title');
    this.companyInput = document.getElementById('company-name');
    this.jdText = document.getElementById('jd-text');
    this.generateBtn = document.getElementById('generate-btn');
    this.generateStatus = document.getElementById('generate-status');
    this.downloadSection = document.getElementById('download-section');
    this.downloadPdfBtn = document.getElementById('download-pdf');
    this.downloadDocxBtn = document.getElementById('download-docx');
    this.matchScoreEl = document.getElementById('match-score');
    this.matchScoreValue = document.getElementById('match-score-value');
  }

  bindEvents() {
    // Tab switching
    this.tabs.forEach(tab => {
      tab.addEventListener('click', () => this.switchTab(tab.dataset.tab));
    });

    // Template events
    this.templateSelect.addEventListener('change', () => this.handleTemplateSelect());
    this.refreshTemplatesBtn.addEventListener('click', () => this.loadTemplates());

    // Generate events
    this.extractJdBtn.addEventListener('click', () => this.extractJobDescription());
    this.jdText.addEventListener('input', () => this.updateGenerateButton());
    this.positionInput.addEventListener('input', () => this.updateGenerateButton());
    this.companyInput.addEventListener('input', () => this.updateGenerateButton());
    this.generateBtn.addEventListener('click', () => this.generateResume());
    this.downloadPdfBtn.addEventListener('click', () => this.downloadResume('pdf'));
    this.downloadDocxBtn.addEventListener('click', () => this.downloadResume('docx'));
  }

  async loadStoredData() {
    try {
      const result = await chrome.storage.local.get(['selectedTemplateId']);
      if (result.selectedTemplateId) {
        this.selectedTemplateId = result.selectedTemplateId;
      }
    } catch (error) {
      console.error('Error loading stored data:', error);
    }
  }

/**
 * Switches the active tab to the specified tab name
 * @param {string} tabName - Name of the tab to switch to
 * @example
 * switchTab('profile');
 */
  switchTab(tabName) {
    this.currentTab = tabName;
    this.tabs.forEach(tab => {
      tab.classList.toggle('active', tab.dataset.tab === tabName);
    });
    this.tabContents.forEach(content => {
      content.classList.toggle('active', content.id === `${tabName}-tab`);
    });
  }

  // ========== Template Management ==========

  async loadTemplates() {
    try {
      this.refreshTemplatesBtn.disabled = true;
      const templates = await this.fetchTemplates();
      this.templates = templates;
      this.populateTemplateDropdown();

      if (this.selectedTemplateId) {
        const exists = this.templates.some(t => t.id === this.selectedTemplateId);
        if (exists) {
          this.templateSelect.value = this.selectedTemplateId;
          await this.selectTemplate(this.selectedTemplateId);
          return;
        }
      }

      if (this.templates.length > 0) {
        this.templateSelect.value = this.templates[0].id;
        await this.selectTemplate(this.templates[0].id);
      } else {
        this.resumeData = null;
        this.updateGenerateButton();
      }
    } catch (error) {
      console.error('Error loading templates:', error);
      this.resumeData = null;
      this.updateGenerateButton();
      alert('Failed to load templates. Check that the backend is running.');
    } finally {
      this.refreshTemplatesBtn.disabled = false;
    }
  }

  async fetchTemplates() {
    const baseUrl = this.getBackendBaseUrl();
    const response = await fetch(`${baseUrl}/api/templates`);
    if (!response.ok) {
      throw new Error(`Backend error (${response.status})`);
    }
    const data = await response.json();
    if (Array.isArray(data)) {
      return data;
    }
    return data.templates || [];
  }

  populateTemplateDropdown() {
    this.templateSelect.innerHTML = '';

    if (!this.templates.length) {
      const option = document.createElement('option');
      option.value = '';
      option.textContent = 'No templates found';
      this.templateSelect.appendChild(option);
      this.templateSelect.disabled = true;
      return;
    }

    this.templateSelect.disabled = false;
    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = 'Select a template';
    this.templateSelect.appendChild(placeholder);

    for (const template of this.templates) {
      const option = document.createElement('option');
      option.value = template.id;
      option.textContent = template.name || template.id;
      this.templateSelect.appendChild(option);
    }
  }

  async handleTemplateSelect() {
    const selectedId = this.templateSelect.value;
    if (!selectedId) {
      this.resumeData = null;
      this.updateGenerateButton();
      return;
    }
    await this.selectTemplate(selectedId);
  }

  async selectTemplate(id) {
    try {
      const template = await this.fetchTemplateData(id);
      const normalized = this.normalizeProfileData(template.data || template);
      this.selectedTemplateId = id;
      this.resumeData = normalized;
      await chrome.storage.local.set({ selectedTemplateId: id });
      this.downloadSection.classList.add('hidden');
      this.matchScore = null;
      this.matchScoreEl.classList.add('hidden');
      this.updateGenerateButton();
    } catch (error) {
      console.error('Error selecting template:', error);
      alert('Failed to load template.');
    }
  }

  async fetchTemplateData(id) {
    const baseUrl = this.getBackendBaseUrl();
    const response = await fetch(`${baseUrl}/api/templates/${id}`);
    if (!response.ok) {
      throw new Error(`Template not found (${response.status})`);
    }
    return await response.json();
  }

  getBackendBaseUrl() {
    const url = (this.backendUrl || 'https://easy-working.onrender.com').trim();
    return url.replace(/\/+$/, '');
  }

  /**
   * Normalize any profile JSON format into a consistent internal structure.
   * Handles: personalInfo wrapper, role/title, highlights/bullets,
   * startDate+endDate/dates, institution/school, skill category name variants.
   */
  normalizeProfileData(raw) {
    const info = raw.personalInfo || raw;

    const normalized = {
      name: info.name || raw.name || '',
      headline: info.title || raw.headline || raw.title || '',
      email: info.email || raw.email || '',
      phone: info.phone || raw.phone || '',
      location: info.location || raw.location || raw.address || '',
      linkedin: info.linkedin || raw.linkedin || '',
      website: info.portfolio || info.github || raw.website || '',
      github: info.github || raw.github || '',
      summary: raw.summary || ''
    };

    // Experience
    normalized.experience = (raw.experience || []).map(exp => ({
      title: exp.role || exp.title || '',
      company: exp.company || '',
      dates: exp.dates || combineDates(exp.startDate, exp.endDate) || exp.duration || '',
      location: exp.location || '',
      bullets: exp.highlights || exp.bullets || [],
      technologies: exp.technologies || []
    }));

    // Education
    normalized.education = (raw.education || []).map(edu => ({
      school: edu.institution || edu.school || edu.university || '',
      faculty: edu.faculty || edu.major || '',
      degree: edu.degree || '',
      dates: edu.dates || combineDates(edu.startDate, edu.endDate) || edu.duration || '',
      gpa: edu.gpa || '',
      honors: edu.honors || edu.notes || ''
    }));

    // Skills - flatten all categories into a single array for the AI prompt
    if (raw.skills) {
      if (Array.isArray(raw.skills)) {
        normalized.skills = raw.skills;
      } else if (typeof raw.skills === 'object') {
        normalized.skills = [];
        for (const values of Object.values(raw.skills)) {
          if (Array.isArray(values)) {
            normalized.skills.push(...values);
          }
        }
      }
    } else {
      normalized.skills = [];
    }

    // Certifications
    normalized.certifications = raw.certifications || [];

    return normalized;

    function combineDates(start, end) {
      if (!start && !end) return '';
      return `${start || ''}${start && end ? ' - ' : ''}${end || ''}`;
    }
  }

  // ========== Job Description Extraction ==========

  async extractJobDescription() {
    try {
      this.extractJdBtn.textContent = 'Extracting...';
      this.extractJdBtn.disabled = true;

      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

      if (!tab || !tab.url || tab.url.startsWith('chrome://') || tab.url.startsWith('about:')) {
        alert('Cannot extract from this page. Please navigate to a job posting and try again.');
        return;
      }

      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: extractJDFromPage
      });

      if (results && results[0] && results[0].result) {
        const response = results[0].result;
        if (response.success) {
          this.jdText.value = response.jobDescription;
          this.positionInput.value = response.position || '';
          this.companyInput.value = response.company || '';
          this.updateGenerateButton();
        } else {
          alert('Could not extract job description. Please paste it manually.');
        }
      } else {
        alert('Could not extract job description. Please paste it manually.');
      }
    } catch (error) {
      console.error('Error extracting JD:', error);
      alert('Error extracting job description. Please paste it manually.');
    } finally {
      this.extractJdBtn.textContent = 'Extract from Page';
      this.extractJdBtn.disabled = false;
    }
  }
  // ========== Resume Generation ==========

  updateGenerateButton() {
    const hasResume = this.resumeData !== null;
    const hasJd = this.jdText.value.trim().length > 50;
    this.generateBtn.disabled = !hasResume || !hasJd;

    if (!hasResume) {
      this.generateBtn.querySelector('.btn-text').textContent = 'Select Template First';
    } else if (!hasJd) {
      this.generateBtn.querySelector('.btn-text').textContent = 'Enter Job Description';
    } else {
      this.generateBtn.querySelector('.btn-text').textContent = 'Generate Tailored Resume';
    }
  }

  async generateResume() {
    try {
      const selectedId = this.selectedTemplateId;
      if (!selectedId) {
        throw new Error('No template selected. Please select a template first.');
      }
      if (!this.templates?.some(t => t.id === selectedId)) {
        await this.loadTemplates();
        throw new Error('Selected template no longer exists on the backend. Please select a template again.');
      }

      this.generateBtn.querySelector('.btn-text').classList.add('hidden');
      this.generateBtn.querySelector('.btn-loading').classList.remove('hidden');
      this.generateBtn.disabled = true;
      this.generateStatus.classList.remove('hidden');
      this.downloadSection.classList.add('hidden');
      this.matchScore = null;
      this.matchScoreEl.classList.add('hidden');

      this.updateProgress(10, 'Analyzing job description...');

      const response = await this.callGenerateApi();

      if (response && response.resume) {
        this.updateProgress(100, 'Resume generated successfully!');
        this.generatedResume = this.normalizeGeneratedResume(response.resume);
        if (!this.generatedResume.targetTitle) {
          this.generatedResume.targetTitle = this.positionInput.value || response.extractedPosition || '';
        }
        this.matchScore = response.resume?.matchScore ?? null;
        this.jdData = {
          position: this.positionInput.value || response.extractedPosition,
          company: this.companyInput.value || response.extractedCompany
        };

        if (!this.positionInput.value && response.extractedPosition) {
          this.positionInput.value = response.extractedPosition;
        }
        if (!this.companyInput.value && response.extractedCompany) {
          this.companyInput.value = response.extractedCompany;
        }

        setTimeout(() => {
          this.showDownloadSection();
        }, 500);
      } else {
        throw new Error(response?.error || 'Failed to generate resume');
      }
    } catch (error) {
      console.error('Error generating resume:', error);
      this.updateProgress(0, 'Error: ' + error.message);
      alert('Error generating resume: ' + error.message);
    } finally {
      this.generateBtn.querySelector('.btn-text').classList.remove('hidden');
      this.generateBtn.querySelector('.btn-loading').classList.add('hidden');
      this.generateBtn.disabled = false;
    }
  }

  normalizeGeneratedResume(value) {
    let parsed = value;
    if (typeof parsed === 'string') {
      parsed = this.tryParseEmbeddedJson(parsed) || parsed;
    } else if (parsed && typeof parsed === 'object') {
      if (typeof parsed.text === 'string') {
        parsed = this.tryParseEmbeddedJson(parsed.text) || parsed;
      } else if (typeof parsed.output_text === 'string') {
        parsed = this.tryParseEmbeddedJson(parsed.output_text) || parsed;
      } else if (Array.isArray(parsed.content)) {
        const combined = parsed.content
          .map(block => (block && typeof block.text === 'string' ? block.text : ''))
          .join('');
        parsed = this.tryParseEmbeddedJson(combined) || parsed;
      }
    }
    if (!parsed || typeof parsed !== 'object') {
      throw new Error('Resume payload is not valid JSON.');
    }
    if (parsed.skills && typeof parsed.skills === 'object' && !Array.isArray(parsed.skills)) {
      if (parsed.skills.database && !parsed.skills.databases) {
        parsed.skills.databases = parsed.skills.database;
      }
      if (parsed.skills.cloudDevOps && !parsed.skills.cloud_devops) {
        parsed.skills.cloud_devops = parsed.skills.cloudDevOps;
      }
    }
    return parsed;
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
    const text = value.trim();
    if (!text) return '';

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

    let m = text.match(/^(\d{4})[\/\-.](\d{1,2})$/);
    if (m) {
      const year = m[1];
      const monthNum = Math.max(1, Math.min(12, parseInt(m[2], 10)));
      const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
      return `${monthNames[monthNum - 1]} ${year}`;
    }

    m = text.match(/^(\d{4})[\/\-.]([A-Za-z]{3})$/);
    if (m) {
      const year = m[1];
      const mon = m[2].toLowerCase();
      return `${monthMap[mon] || m[2]} ${year}`;
    }

    m = text.match(/^([A-Za-z]+)\s+(\d{4})$/);
    if (m) {
      const mon = m[1].toLowerCase();
      const year = m[2];
      if (monthMap[mon]) return `${monthMap[mon]} ${year}`;
    }

    m = text.match(/^(\d{4})\s+([A-Za-z]+)$/);
    if (m) {
      const year = m[1];
      const mon = m[2].toLowerCase();
      if (monthMap[mon]) return `${monthMap[mon]} ${year}`;
    }

    if (/^\d{4}$/.test(text)) return text;
    if (/^[A-Za-z]{3}\s+\d{4}$/.test(text)) return text;
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

  stripBoldMarkers(text) {
    if (!text) return text;
    return text.replace(/\*\*(.*?)\*\*/g, '$1');
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

  renderSegmentsPdf(doc, segments, x, y, maxWidth, fontSize, lineHeight) {
    const runs = [];
    for (const seg of segments) {
      if (!seg || !seg.text) continue;
      runs.push({ text: seg.text, bold: !!seg.bold });
    }
    if (!runs.length) return { lines: 0, height: 0 };

    const tokens = [];
    for (const run of runs) {
      const parts = run.text.replace(/\r\n/g, '\n').split('\n');
      for (let s = 0; s < parts.length; s++) {
        const chunks = parts[s].split(/(\s+)/);
        for (const chunk of chunks) {
          if (chunk === '') continue;
          tokens.push({ text: chunk, bold: run.bold });
        }
        if (s < parts.length - 1) tokens.push({ newline: true });
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

    return { lines: lines.length, height: lines.length * lineHeight };
  }

  tryParseEmbeddedJson(text) {
    if (typeof text !== 'string') return null;
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]);
    } catch {
      return null;
    }
  }

  async callGenerateApi() {
    const baseUrl = this.getBackendBaseUrl();
    const payload = {
      templateId: this.selectedTemplateId,
      jobDescription: this.jdText.value,
      position: this.positionInput.value,
      company: this.companyInput.value
    };

    const res = await fetch(`${baseUrl}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      if (res.status === 404 && (err.error || '').includes('Template not found')) {
        await this.loadTemplates();
        throw new Error('Template not found on backend. Refresh templates or upload it in the admin page.');
      }
      throw new Error(err.error || `Backend error (${res.status})`);
    }

    return await res.json();
  }

  updateProgress(percent, text) {
    const progressFill = this.generateStatus.querySelector('.progress-fill');
    const progressText = this.generateStatus.querySelector('.progress-text');
    progressFill.style.width = `${percent}%`;
    progressText.textContent = text;
  }

  showDownloadSection() {
    this.downloadSection.classList.remove('hidden');
    const filename = this.generateFilename();
    this.downloadSection.querySelector('.download-filename').textContent = filename;
    if (this.matchScore) {
      this.matchScoreValue.textContent = `${this.matchScore}%`;
      this.matchScoreEl.classList.remove('hidden');
    } else {
      this.matchScoreEl.classList.add('hidden');
    }
  }

  generateFilename() {
    const name = this.sanitizeFilename(this.generatedResume?.contact?.name || this.resumeData?.name || 'User');
    const company = this.sanitizeFilename(this.jdData?.company || 'Company');
    const position = this.sanitizeFilename(this.jdData?.position || 'Position');
    const date = new Date().toISOString().split('T')[0];
    return `${name}-${position}-${company}-${date}`;
  }

  sanitizeFilename(str) {
    return str.replace(/[^a-zA-Z0-9]/g, '-').replace(/-+/g, '-').substring(0, 30);
  }

  async downloadResume(format) {
    try {
      const filename = this.generateFilename();
      const font = 'Calibri';

      let blob;

      if (format === 'pdf') {
        try {
          const docxBlob = await this.generateDOCX(this.generatedResume, font);
          blob = await this.convertDocxToPdf(docxBlob);
        } catch (error) {
          const message = String(error?.message || error);
          console.warn('DOCX->PDF conversion failed:', error);
          if (message.includes('LibreOffice not found')) {
            throw new Error('LibreOffice is not installed. Install it to enable DOCX-to-PDF conversion.');
          }
          // Fallback only for non-install-related errors
          blob = await this.generatePDF(this.generatedResume, font);
        }
      } else {
        blob = await this.generateDOCX(this.generatedResume, font);
      }

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${filename}.${format}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

    } catch (error) {
      console.error('Error downloading resume:', error);
      alert('Error downloading resume: ' + error.message);
    }
  }


  async convertDocxToPdf(docxBlob) {
    const baseUrl = this.getBackendBaseUrl();
    const formData = new FormData();
    formData.append('file', docxBlob, 'resume.docx');

    const res = await fetch(`${baseUrl}/api/convert-docx-to-pdf`, {
      method: 'POST',
      body: formData
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `PDF conversion failed (${res.status})`);
    }

    return await res.blob();
  }

  // ========== PDF Generation ==========

  async generatePDF(resumeData, font) {
    if (!window.jspdf) {
      throw new Error('jsPDF library not loaded');
    }

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'letter'
    });

    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 19.05; // 0.75 inch
    const contentWidth = pageWidth - (margin * 2);
    let yPos = margin;

    const lineHeight = (pt) => (pt * 0.3528) * 1.15;
    const spacing = (pt) => pt * 0.3528;
    const afterPara = spacing(6);
    const afterHeading = spacing(3);
    const afterBullet = spacing(3);

    doc.setFont('helvetica');

    const checkPageBreak = (neededSpace) => {
      if (yPos + neededSpace > pageHeight - margin) {
        doc.addPage();
        yPos = margin;
      }
    };

    const addSectionHeading = (title) => {
      // Keep heading + separator + at least one body line together
      const headingBlock = lineHeight(13) + afterHeading;
      const minBodyBlock = lineHeight(11) + afterHeading;
      const minBlock = headingBlock + minBodyBlock;
      checkPageBreak(minBlock);
      doc.setFontSize(13);
      doc.setFont('helvetica', 'bold');
      doc.text(title, margin, yPos);
      yPos += lineHeight(13);
      // Section separator line (heading above, content below)
      yPos += 0.5;
      doc.setDrawColor(150, 150, 150);
      doc.setLineWidth(0.25);
      doc.line(margin, yPos, pageWidth - margin, yPos);
      yPos += afterHeading;
    };

    const contact = resumeData.contact || {};

    doc.setFontSize(17);
    doc.setFont('helvetica', 'bold');
    doc.text(contact.name || 'Name', margin, yPos);
    yPos += lineHeight(17) + afterPara;

    const targetTitle = resumeData.targetTitle || resumeData.headline || '';
    if (targetTitle) {
      doc.setFontSize(11.5);
      doc.setFont('helvetica', 'bold');
      doc.text(targetTitle, margin, yPos);
      yPos += lineHeight(11.5) + afterPara;
    }

    const contactParts = [];
    if (contact.location) contactParts.push(contact.location);
    if (contact.phone) contactParts.push(contact.phone);
    if (contact.email) contactParts.push(contact.email);
    if (contact.linkedin) contactParts.push(contact.linkedin);
    const github = contact.github || contact.website;
    if (github) contactParts.push(github);

    if (contactParts.length > 0) {
      doc.setFontSize(11);
      doc.setFont('helvetica', 'normal');
      const contactLine = contactParts.join(' | ');
      const contactLines = doc.splitTextToSize(contactLine, contentWidth);
      doc.text(contactLines, margin, yPos);
      yPos += contactLines.length * lineHeight(11) + afterPara;
    }

    if (resumeData.summary) {
      addSectionHeading('PROFESSIONAL SUMMARY');
            doc.setFontSize(11);
      doc.setFont('helvetica', 'normal');
      const summaryRender = this.renderRichTextPdf(doc, resumeData.summary, margin, yPos, contentWidth, 11, lineHeight(11));
      yPos += summaryRender.height + afterPara;
    }

    if (resumeData.experience && resumeData.experience.length > 0) {
      addSectionHeading('EXPERIENCE');

      for (const exp of resumeData.experience) {
        const company = exp.company || '';
        const title = exp.title || 'Job Title';

        // Keep company/title + dates + at least one bullet together
        const minRoleBlock = lineHeight(11.5) + lineHeight(11) + lineHeight(11) + afterPara;
        checkPageBreak(minRoleBlock);
        doc.setFont('helvetica', 'bold');

        if (company) {
          doc.setFontSize(11);
          const companyText = `${company} | `;
          doc.text(companyText, margin, yPos);
          const companyWidth = doc.getTextWidth(companyText);
          doc.setFontSize(11.5);
          doc.text(title, margin + companyWidth, yPos);
        } else {
          doc.setFontSize(11.5);
          doc.text(title, margin, yPos);
        }
        yPos += lineHeight(11.5);

        const expDates = exp.dates ? this.formatDateRange(exp.dates) : '';
        if (expDates) {
          doc.setFontSize(11);
          doc.setFont('helvetica', 'normal');
          doc.text(expDates, margin, yPos);
          yPos += lineHeight(11) + afterPara;
        } else {
          yPos += afterPara;
        }

        if (exp.bullets && exp.bullets.length > 0) {
          doc.setFontSize(11);
          doc.setFont('helvetica', 'normal');
          for (const bullet of exp.bullets) {
            const bulletMeasure = this.renderBulletPdf(doc, bullet, margin, yPos, contentWidth, 11, lineHeight(11), false);
            checkPageBreak(bulletMeasure.height + afterBullet);
            const bulletRender = this.renderBulletPdf(doc, bullet, margin, yPos, contentWidth, 11, lineHeight(11), true);
            yPos += bulletRender.height + afterBullet;
          }
        }

        yPos += afterPara;
      }
    }

    if (resumeData.education && resumeData.education.length > 0) {
      addSectionHeading('EDUCATION');

      for (const edu of resumeData.education) {
        const school = edu.school || edu.institution || 'University';
        const degree = edu.degree || '';
        const faculty = edu.faculty || '';
        const line1 = degree ? `${school}, ${degree}` : `${school}`;

        // Keep school line + dates together
        checkPageBreak(lineHeight(11) * 2 + afterPara);
        doc.setFontSize(11);
        const eduSegments = [
          { text: school, bold: true },
          { text: degree ? `, ${degree}` : '', bold: false }
        ];
        const eduLineRender = this.renderSegmentsPdf(doc, eduSegments, margin, yPos, contentWidth, 11, lineHeight(11));
        yPos += eduLineRender.height;

        const eduDates = edu.dates ? this.formatDateRange(edu.dates) : '';
        if (eduDates) {
          doc.text(eduDates, margin, yPos);
          yPos += lineHeight(11);
        }

        if (faculty) {
          doc.text(faculty, margin, yPos);
          yPos += lineHeight(11);
        }

        yPos += afterPara;
      }
    }

    if (resumeData.skills) {
      addSectionHeading('SKILLS');

      const labels = {
        frontend: 'Frontend',
        backend: 'Backend',
        databases: 'Databases',
        cloud_devops: 'Cloud & DevOps',
        testing: 'Testing & Quality'
      };
      const order = ['frontend', 'backend', 'databases', 'cloud_devops', 'testing'];

      if (typeof resumeData.skills === 'object' && !Array.isArray(resumeData.skills)) {
        for (const key of order) {
          const skills = resumeData.skills[key];
          if (skills && skills.length > 0) {
            checkPageBreak(lineHeight(11) + afterHeading);
            doc.setFontSize(11);
            doc.setFont('helvetica', 'bold');
            const label = `${labels[key]}: `;
            doc.text(label, margin, yPos);
            const labelWidth = doc.getTextWidth(label);
            doc.setFont('helvetica', 'normal');
            const skillsStr = skills.map(skill => this.stripBoldMarkers(skill)).join(', ');
            const skillLines = doc.splitTextToSize(skillsStr, contentWidth - labelWidth);
            doc.text(skillLines[0], margin + labelWidth, yPos);
            yPos += lineHeight(11);
            if (skillLines.length > 1) {
              for (let i = 1; i < skillLines.length; i++) {
                doc.text(skillLines[i], margin, yPos);
                yPos += lineHeight(11);
              }
            }
            yPos += afterHeading;
          }
        }
      } else if (Array.isArray(resumeData.skills)) {
        doc.setFontSize(11);
        doc.setFont('helvetica', 'normal');
        const skillsStr = resumeData.skills.map(skill => this.stripBoldMarkers(skill)).join(', ');
        const skillLines = doc.splitTextToSize(skillsStr, contentWidth);
        doc.text(skillLines, margin, yPos);
        yPos += skillLines.length * lineHeight(11) + afterHeading;
      }
    }

    return doc.output('blob');
  }
  // ========== DOCX Generation ==========

  async generateDOCX(resumeData, font) {
    if (!window.docx) {
      throw new Error('docx library not loaded');
    }

    const { Document, Paragraph, TextRun, Packer } = window.docx;

    const children = [];
    const contact = resumeData.contact || {};

    const SIZE_NAME = 34;    // 17pt
    const SIZE_SECTION = 26; // 13pt
    const SIZE_COMPANY = 22; // 11pt
    const SIZE_TITLE = 23;   // 11.5pt
    const SIZE_BODY = 22;    // 11pt

    const LINE = 276;        // 1.15 line spacing (240 * 1.15)
    const AFTER_PARA = 120;  // 6pt
    const AFTER_HEADING = 60; // 3pt
    const AFTER_BULLET = 60; // 3pt

    const addSectionHeader = (title) => {
      children.push(new Paragraph({
        children: [new TextRun({ text: title, bold: true, size: SIZE_SECTION, font: font })],
        border: { bottom: { color: '999999', style: window.docx.BorderStyle.SINGLE, size: 6 } },
        spacing: { before: 0, after: AFTER_HEADING, line: LINE },
        keepNext: true,
        keepLines: true
      }));
    };

    children.push(new Paragraph({
      children: [new TextRun({ text: contact.name || 'Name', bold: true, size: SIZE_NAME, font: font })],
      spacing: { before: 0, after: AFTER_PARA, line: LINE }
    }));

    const targetTitle = resumeData.targetTitle || resumeData.headline || '';
    if (targetTitle) {
      children.push(new Paragraph({
        children: [new TextRun({ text: targetTitle, bold: true, size: SIZE_TITLE, font: font })],
        spacing: { before: 0, after: AFTER_PARA, line: LINE }
      }));
    }

    const contactParts = [];
    if (contact.location) contactParts.push(contact.location);
    if (contact.phone) contactParts.push(contact.phone);
    if (contact.email) contactParts.push(contact.email);
    if (contact.linkedin) contactParts.push(contact.linkedin);
    const github = contact.github || contact.website;
    if (github) contactParts.push(github);

    if (contactParts.length > 0) {
      children.push(new Paragraph({
        children: [new TextRun({ text: contactParts.join(' | '), size: SIZE_BODY, font: font })],
        spacing: { before: 0, after: AFTER_PARA, line: LINE }
      }));
    }

    if (resumeData.summary) {
      addSectionHeader('PROFESSIONAL SUMMARY');
      children.push(new Paragraph({
        children: this.buildDocxRuns(resumeData.summary, font, SIZE_BODY),
        spacing: { before: 0, after: AFTER_PARA, line: LINE }
      }));
    }

    if (resumeData.experience?.length > 0) {
      addSectionHeader('EXPERIENCE');

      for (const exp of resumeData.experience) {
        const company = exp.company || '';
        const title = exp.title || 'Job Title';
        const companyText = company ? `${company} | ` : '';

        children.push(new Paragraph({
          children: [
            new TextRun({ text: companyText, bold: true, size: SIZE_COMPANY, font: font }),
            new TextRun({ text: title, bold: true, size: SIZE_TITLE, font: font })
          ],
          spacing: { before: 0, after: 0, line: LINE },
          keepNext: true,
          keepLines: true
        }));

        const expDates = exp.dates ? this.formatDateRange(exp.dates) : '';
        if (expDates) {
          children.push(new Paragraph({
            children: [new TextRun({ text: expDates, size: SIZE_BODY, font: font })],
            spacing: { before: 0, after: AFTER_PARA, line: LINE }
          }));
        }

        if (exp.bullets?.length > 0) {
          for (const bullet of exp.bullets) {
            children.push(new Paragraph({
              children: this.buildDocxRuns(bullet, font, SIZE_BODY),
              bullet: { level: 0 },
              spacing: { before: 0, after: AFTER_BULLET, line: LINE }
            }));
          }
        }
      }
    }

    if (resumeData.education?.length > 0) {
      addSectionHeader('EDUCATION');

      for (const edu of resumeData.education) {
        const school = edu.school || edu.institution || 'University';
        const degree = edu.degree || '';
        const faculty = edu.faculty || '';
        const line1 = degree ? `${school}, ${degree}` : school;

        const eduDates = edu.dates ? this.formatDateRange(edu.dates) : '';
        const line1After = (!eduDates && !faculty) ? AFTER_PARA : 0;
        const eduRuns = [
          new TextRun({ text: school, bold: true, size: SIZE_BODY, font: font })
        ];
        if (degree) {
          eduRuns.push(new TextRun({ text: `, ${degree}`, size: SIZE_BODY, font: font }));
        }
        children.push(new Paragraph({
          children: eduRuns,
          spacing: { before: 0, after: line1After, line: LINE },
          keepNext: true,
          keepLines: true
        }));

        if (eduDates) {
          const datesAfter = !faculty ? AFTER_PARA : 0;
          children.push(new Paragraph({
            children: [new TextRun({ text: eduDates, size: SIZE_BODY, font: font })],
            spacing: { before: 0, after: datesAfter, line: LINE }
          }));
        }

        if (faculty) {
          children.push(new Paragraph({
            children: [new TextRun({ text: faculty, size: SIZE_BODY, font: font })],
            spacing: { before: 0, after: AFTER_PARA, line: LINE }
          }));
        }
      }
    }

    if (resumeData.skills) {
      addSectionHeader('SKILLS');

      const labels = {
        frontend: 'Frontend',
        backend: 'Backend',
        databases: 'Databases',
        cloud_devops: 'Cloud & DevOps',
        testing: 'Testing & Quality'
      };
      const order = ['frontend', 'backend', 'databases', 'cloud_devops', 'testing'];

      if (typeof resumeData.skills === 'object' && !Array.isArray(resumeData.skills)) {
        for (const key of order) {
          const skills = resumeData.skills[key];
          if (skills && skills.length > 0) {
            children.push(new Paragraph({
              children: [
                new TextRun({ text: `${labels[key]}: `, bold: true, size: SIZE_BODY, font: font }),
                new TextRun({ text: skills.map(skill => this.stripBoldMarkers(skill)).join(', '), size: SIZE_BODY, font: font })
              ],
              spacing: { before: 0, after: AFTER_HEADING, line: LINE }
            }));
          }
        }
      } else if (Array.isArray(resumeData.skills)) {
        children.push(new Paragraph({
          children: [new TextRun({ text: resumeData.skills.map(skill => this.stripBoldMarkers(skill)).join(', '), size: SIZE_BODY, font: font })],
          spacing: { before: 0, after: AFTER_HEADING, line: LINE }
        }));
      }
    }

    const doc = new Document({
      sections: [{
        properties: {
          page: {
            margin: {
              top: 1080,
              bottom: 1080,
              right: 1080,
              left: 1080
            }
          }
        },
        children: children
      }]
    });

    return await Packer.toBlob(doc);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  new PopupController();
});

// ========== Injected Functions (run in page context) ==========

// Function to extract JD from job posting page
function extractJDFromPage() {
  try {
    let jobDescription = '';
    let position = '';
    let company = '';

    // LinkedIn
    if (window.location.hostname.includes('linkedin.com')) {
      const titleEl = document.querySelector('.job-details-jobs-unified-top-card__job-title h1') ||
        document.querySelector('.jobs-unified-top-card__job-title') ||
        document.querySelector('.t-24.t-bold');
      if (titleEl) position = titleEl.textContent.trim();

      const companyEl = document.querySelector('.job-details-jobs-unified-top-card__company-name') ||
        document.querySelector('.jobs-unified-top-card__company-name a');
      if (companyEl) company = companyEl.textContent.trim();

      const descEl = document.querySelector('.jobs-description__content') ||
        document.querySelector('.jobs-box__html-content');
      if (descEl) jobDescription = descEl.textContent.trim();
    }
    // Indeed
    else if (window.location.hostname.includes('indeed.com')) {
      const titleEl = document.querySelector('.jobsearch-JobInfoHeader-title') ||
        document.querySelector('[data-testid="jobsearch-JobInfoHeader-title"]');
      if (titleEl) position = titleEl.textContent.trim();

      const companyEl = document.querySelector('[data-testid="inlineHeader-companyName"]') ||
        document.querySelector('.jobsearch-InlineCompanyRating-companyHeader');
      if (companyEl) company = companyEl.textContent.trim();

      const descEl = document.querySelector('#jobDescriptionText') ||
        document.querySelector('.jobsearch-jobDescriptionText');
      if (descEl) jobDescription = descEl.textContent.trim();
    }
    // Glassdoor
    else if (window.location.hostname.includes('glassdoor.com')) {
      const titleEl = document.querySelector('[data-test="job-title"]');
      if (titleEl) position = titleEl.textContent.trim();

      const companyEl = document.querySelector('[data-test="employerName"]');
      if (companyEl) company = companyEl.textContent.trim();

      const descEl = document.querySelector('.jobDescriptionContent') ||
        document.querySelector('[data-test="description"]');
      if (descEl) jobDescription = descEl.textContent.trim();
    }
    // Generic extraction
    else {
      const titleSelectors = ['h1.job-title', '.job-title h1', '[class*="job-title"]', 'h1[class*="title"]'];
      for (const sel of titleSelectors) {
        const el = document.querySelector(sel);
        if (el && el.textContent.trim().length > 2) {
          position = el.textContent.trim();
          break;
        }
      }

      const companySelectors = ['.company-name', '[class*="company-name"]', '[class*="employer"]'];
      for (const sel of companySelectors) {
        const el = document.querySelector(sel);
        if (el && el.textContent.trim().length > 1) {
          company = el.textContent.trim();
          break;
        }
      }

      const descSelectors = [
        '.job-description',
        '[class*="job-description"]',
        '[class*="jobDescription"]',
        '[class*="career-detail"]',
        '.job-details',
        '[class*="job-details"]',
        '#job-description',
        '#jobDescriptionText',
        '[id*="job-description"]',
        '[data-testid*="job-description"]',
        '[data-test*="job-description"]',
        '[class*="description"]',
        '[id*="description"]',
        'article',
        'main'
      ];
      for (const sel of descSelectors) {
        const el = document.querySelector(sel);
        if (el && el.textContent.trim().length > 200) {
          jobDescription = el.textContent.trim();
          break;
        }
      }
      if (!jobDescription || jobDescription.length < 200) {
        jobDescription = extractBestDescriptionFromDom();
      }
    }

    // Fallback
    if (!jobDescription || jobDescription.length < 100) {
      const mainContent = document.querySelector('main') || document.querySelector('article') || document.body;
      jobDescription = mainContent.innerText.substring(0, 10000);
    }

    if (!position) {
      const titleParts = document.title.split(/[|\-\u2013\u2014]/);
      if (titleParts.length > 0) {
        position = titleParts[0].trim().substring(0, 100);
      }
    }

    // Normalize "Position at Company" patterns
    if (position) {
      // Strip leading "Job application for ..." or similar wrappers
      const appMatch = position.match(/^(?:job\s+)?application\s+for\s+(.+)$/i);
      if (appMatch) {
        position = appMatch[1].trim();
      }
      const atMatch = position.match(/^(.*?)\s+at\s+(.+)$/i);
      if (atMatch) {
        position = atMatch[1].trim();
        if (!company) {
          company = atMatch[2].trim();
        }
      }
    }

    jobDescription = jobDescription.replace(/\s+/g, ' ').trim().substring(0, 10000);

    return {
      success: jobDescription.length > 50,
      jobDescription: jobDescription,
      position: position,
      company: company
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

function extractBestDescriptionFromDom() {
  const candidates = [];
  const nodes = document.querySelectorAll('section, article, main, div');
  const keywordRe = /(responsibilit|requirement|qualification|about the role|what you will|what you'll|you will|you'll|job description|role overview)/i;

  for (const node of nodes) {
    if (!(node instanceof HTMLElement)) continue;
    const text = node.innerText ? node.innerText.trim() : '';
    if (text.length < 200) continue;

    const lower = text.toLowerCase();
    if (lower.includes('cookie') || lower.includes('privacy') || lower.includes('subscribe')) continue;
    if (node.querySelector('nav, footer, header, aside')) continue;

    let score = text.length;
    if (keywordRe.test(text)) score += 2000;
    if (node.id && /(desc|description|job|role)/i.test(node.id)) score += 1500;
    if (node.className && /(desc|description|job|role)/i.test(node.className)) score += 1500;

    candidates.push({ text, score });
  }

  if (!candidates.length) return '';
  candidates.sort((a, b) => b.score - a.score);
  return candidates[0].text;
}
