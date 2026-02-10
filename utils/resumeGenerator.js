// Resume Generator - Creates PDF and DOCX files
// ATS-Friendly formatting: single-column, standard fonts, standard headings,
// simple bullet points, consistent sizing (name 22pt, headers 12pt, body 10pt)

/**
 * Generate a PDF resume
 */
export async function generatePDF(resumeData, fontFamily = 'Calibri') {
  const { jsPDF } = await loadJsPDF();

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
  const contact = resumeData.contact || {};

  // Name: 22pt bold
  doc.setFontSize(22);
  doc.setFont('helvetica', 'bold');
  doc.text(contact.name || 'Name', pageWidth / 2, yPos, { align: 'center' });
  yPos += 8 + afterPara;

  // Contact info: 10pt
  const contactParts = [];
  if (contact.email) contactParts.push(contact.email);
  if (contact.phone) contactParts.push(contact.phone);
  if (contact.location) contactParts.push(contact.location);

  if (contactParts.length > 0) {
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(contactParts.join('  |  '), pageWidth / 2, yPos, { align: 'center' });
    yPos += 4.5 + afterPara;
  }

  // LinkedIn/Website: 10pt blue
  const webParts = [];
  if (contact.linkedin) webParts.push(contact.linkedin);
  if (contact.website) webParts.push(contact.website);
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
    yPos += 5 + afterPara;

    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    const summaryLines = doc.splitTextToSize(resumeData.summary, contentWidth);
    doc.text(summaryLines, marginSide, yPos);
    yPos += summaryLines.length * 4.2 + afterPara;

    drawSectionLine();
  }

  // --- Work Experience ---
  if (resumeData.experience && resumeData.experience.length > 0) {
    ensureSectionStart(4.2);
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('WORK EXPERIENCE', marginSide, yPos);
    yPos += 5 + afterPara;

    for (const exp of resumeData.experience) {
      checkPageBreak(20);

      // Title: 11pt bold
      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
      doc.text(exp.title || 'Position', marginSide, yPos);

      // Dates right-aligned: 10pt
      if (exp.dates) {
        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        doc.text(exp.dates, pageWidth - marginSide, yPos, { align: 'right' });
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
      if (exp.bullets && exp.bullets.length > 0) {
        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        for (const bullet of exp.bullets) {
          checkPageBreak(8);
          const bulletText = `\u2022  ${bullet}`;
          const bulletLines = doc.splitTextToSize(bulletText, contentWidth - 5);
          doc.text(bulletLines, marginSide + 3, yPos);
          yPos += bulletLines.length * 4.0 + afterPara;
        }
      }

      yPos += afterPara;
    }

    drawSectionLine();
  }

  // --- Education ---
  if (resumeData.education && resumeData.education.length > 0) {
    ensureSectionStart(4.2);
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('EDUCATION', marginSide, yPos);
    yPos += 5 + afterPara;

    for (const edu of resumeData.education) {
      checkPageBreak(10);

      // School: 11pt bold
      if (edu.school) {
        doc.setFontSize(11);
        doc.setFont('helvetica', 'bold');
        doc.text(edu.school, marginSide, yPos);
      }
      // Dates right-aligned: 10pt
      if (edu.dates) {
        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        doc.text(edu.dates, pageWidth - marginSide, yPos, { align: 'right' });
      }
      yPos += 4.5;

      // Degree line: 10pt
      let degreeLine = edu.degree || '';
      if (edu.faculty && !degreeLine.toLowerCase().includes(edu.faculty.toLowerCase())) {
        degreeLine += degreeLine ? `, ${edu.faculty}` : edu.faculty;
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

    drawSectionLine();
  }

  // --- Skills (categorized) ---
  if (resumeData.skills) {
    ensureSectionStart(4.0);
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('SKILLS', marginSide, yPos);
    yPos += 5 + afterPara;

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
          const skillsStr = skills.join(', ');
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
      const skillLines = doc.splitTextToSize(resumeData.skills.join(', '), contentWidth);
      doc.text(skillLines, marginSide, yPos);
      yPos += skillLines.length * 4.0 + afterPara;
    }

    drawSectionLine();
  }

  // --- Certifications ---
  if (resumeData.certifications && resumeData.certifications.length > 0) {
    ensureSectionStart(4.0);
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('CERTIFICATIONS', marginSide, yPos);
    yPos += 5 + afterPara;

    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    for (const cert of resumeData.certifications) {
      checkPageBreak(6);
      doc.text(`\u2022  ${cert}`, marginSide + 3, yPos);
      yPos += 4.0 + afterPara;
    }
  }

  const pdfBlob = doc.output('blob');
  return pdfBlob;
}

/**
 * Generate a DOCX resume
 */
export async function generateDOCX(resumeData, fontFamily = 'Calibri') {
  const docx = await loadDocx();

  const { Document, Paragraph, TextRun, AlignmentType, BorderStyle, TabStopPosition, TabStopType } = docx;

  const children = [];
  const contact = resumeData.contact || {};
  const spAfter = 120; // 6pt = 120 twips

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
        text: contact.name || 'Name',
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
  if (contact.email) contactParts.push(contact.email);
  if (contact.phone) contactParts.push(contact.phone);
  if (contact.location) contactParts.push(contact.location);

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
  if (contact.linkedin) webParts.push(contact.linkedin);
  if (contact.website) webParts.push(contact.website);

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
      children: [
        new TextRun({
          text: resumeData.summary,
          size: 20,
          font: fontFamily
        })
      ],
      spacing: { before: 0, after: spAfter }
    }));
  }

  // --- Work Experience ---
  if (resumeData.experience && resumeData.experience.length > 0) {
    addSectionHeader('WORK EXPERIENCE');

    for (const exp of resumeData.experience) {
      // Title (11pt = 22 half-pts bold) with dates right-aligned (10pt = 20)
      children.push(new Paragraph({
        children: [
          new TextRun({
            text: exp.title || 'Position',
            bold: true,
            size: 22,
            font: fontFamily
          }),
          new TextRun({
            text: `\t${exp.dates || ''}`,
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
      if (exp.bullets && exp.bullets.length > 0) {
        for (const bullet of exp.bullets) {
          children.push(new Paragraph({
            children: [
              new TextRun({
                text: bullet,
                size: 20,
                font: fontFamily
              })
            ],
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
      children.push(new Paragraph({
        children: [
          new TextRun({
            text: edu.school || 'Institution',
            bold: true,
            size: 22,
            font: fontFamily
          }),
          new TextRun({
            text: `\t${edu.dates || ''}`,
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
      if (edu.faculty && !degreeLine.toLowerCase().includes(edu.faculty.toLowerCase())) {
        degreeLine += degreeLine ? `, ${edu.faculty}` : edu.faculty;
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
          children.push(new Paragraph({
            children: [
              new TextRun({
                text: `${label}: `,
                bold: true,
                size: 20,
                font: fontFamily
              }),
              new TextRun({
                text: skills.join(', '),
                size: 20,
                font: fontFamily
              })
            ],
            spacing: { before: 0, after: spAfter }
          }));
        }
      }
    } else if (Array.isArray(resumeData.skills)) {
      children.push(new Paragraph({
        children: [
          new TextRun({
            text: resumeData.skills.join(', '),
            size: 20,
            font: fontFamily
          })
        ],
        spacing: { before: 0, after: spAfter }
      }));
    }
  }

  // --- Certifications ---
  if (resumeData.certifications && resumeData.certifications.length > 0) {
    addSectionHeader('CERTIFICATIONS');

    for (const cert of resumeData.certifications) {
      children.push(new Paragraph({
        children: [
          new TextRun({
            text: cert,
            size: 20,
            font: fontFamily
          })
        ],
        bullet: {
          level: 0
        },
        spacing: { before: 0, after: spAfter }
      }));
    }
  }

  // Create document with standard margins
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
      children: children
    }]
  });

  const buffer = await docx.Packer.toBlob(doc);
  return buffer;
}

/**
 * Load jsPDF library
 */
async function loadJsPDF() {
  if (typeof jspdf !== 'undefined') {
    return jspdf;
  }

  await import('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js');
  return window.jspdf;
}

/**
 * Load docx library
 */
async function loadDocx() {
  if (typeof docx !== 'undefined') {
    return docx;
  }

  await import('https://cdnjs.cloudflare.com/ajax/libs/docx/8.2.0/docx.umd.min.js');
  return window.docx;
}
