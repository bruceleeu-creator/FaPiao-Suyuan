import { describe, expect, it } from 'vitest';
import { strFromU8, unzipSync } from 'fflate';
import {
  mockCreateTemplateBlobUrl,
  mockGenerateEvidenceTemplate,
} from './mockEvidenceTemplateService';
import { mockRequiredEvidenceGuidance } from './mockEvidenceMatcher';

// 解包 docx（zip）取正文 XML，用于断言模板内容
function extractDocumentXml(result: { docx: Uint8Array }): string {
  const files = unzipSync(result.docx);
  expect(files['[Content_Types].xml']).toBeDefined();
  expect(files['_rels/.rels']).toBeDefined();
  expect(files['word/styles.xml']).toBeDefined();
  const doc = files['word/document.xml'];
  expect(doc).toBeDefined();
  return strFromU8(doc);
}

describe('mockGenerateEvidenceTemplate - Word 证据模板生成', () => {
  it('生成合法 docx（zip 包含 OOXML 必需部件），文件名为 .docx', () => {
    const result = mockGenerateEvidenceTemplate({
      invoiceCategory: '餐饮',
      evidenceName: '业务招待审批',
    });
    expect(result.fileName).toBe('餐饮-业务招待审批-模板.docx');
    expect(result.mimeType).toBe(
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    );
    expect(result.docx.length).toBeGreaterThan(1000);
    const xml = extractDocumentXml(result);
    expect(xml).toContain('<w:document');
    expect(xml).toContain('</w:body>');
  });

  it('Word 正文包含证据名称、证明目的、缺失影响、填写清单、确认区', () => {
    const result = mockGenerateEvidenceTemplate({
      invoiceCategory: '住宿',
      evidenceName: '出差申请',
    });
    const xml = extractDocumentXml(result);
    expect(xml).toContain('出差申请');
    expect(xml).toContain('证明目的');
    expect(xml).toContain('缺失影响');
    expect(xml).toContain('需填写字段清单');
    expect(xml).toContain('经办人确认');
    expect(xml).toContain('财务复核');
    expect(xml).toContain('附件清单');
    expect(xml).toContain('适用类别');
    // 字段清单以真实 Word 表格呈现
    expect(xml).toContain('<w:tbl>');
    expect(xml).toContain('关联发票号码');
  });

  it('从 mockRequiredEvidenceGuidance 自动取回证明目的和缺失影响', () => {
    const guidance = mockRequiredEvidenceGuidance('咨询服务').find((g) => g.name === '咨询合同');
    expect(guidance).toBeDefined();
    const result = mockGenerateEvidenceTemplate({
      invoiceCategory: '咨询服务',
      evidenceName: '咨询合同',
    });
    const xml = extractDocumentXml(result);
    expect(xml).toContain(guidance!.proofPurpose);
    expect(xml).toContain(guidance!.missingImpact);
    expect(xml).toContain(guidance!.sampleMaterial);
  });

  it('允许调用方覆盖证明目的和缺失影响（XML 转义正常）', () => {
    const result = mockGenerateEvidenceTemplate({
      invoiceCategory: '餐饮',
      evidenceName: '发票',
      proofPurpose: '自定义证明目的<&>测试',
      missingImpact: '自定义缺失影响',
      sampleMaterial: '自定义示例材料',
    });
    const xml = extractDocumentXml(result);
    expect(xml).toContain('自定义证明目的&lt;&amp;&gt;测试');
    expect(xml).toContain('自定义缺失影响');
    expect(xml).toContain('自定义示例材料');
  });

  it('八类发票均能生成对应 Word 证据模板', () => {
    const categories = ['餐饮', '住宿', '交通', '车辆', '办公', '咨询服务', '广告推广', '租赁物业'] as const;
    for (const category of categories) {
      const guidance = mockRequiredEvidenceGuidance(category);
      expect(guidance.length).toBeGreaterThan(0);
      const first = guidance[0];
      const result = mockGenerateEvidenceTemplate({
        invoiceCategory: category,
        evidenceName: first.name,
      });
      const xml = extractDocumentXml(result);
      expect(xml).toContain(first.name);
      expect(xml).toContain(category);
      expect(result.fileName.startsWith(`${category}-`)).toBe(true);
      expect(result.fileName.endsWith('.docx')).toBe(true);
    }
  });

  it('未在指导清单中的证据名也能生成模板（带默认值）', () => {
    const result = mockGenerateEvidenceTemplate({
      invoiceCategory: '办公',
      evidenceName: '其他补充材料',
    });
    const xml = extractDocumentXml(result);
    expect(xml).toContain('其他补充材料');
    expect(xml).toContain('证明业务真实性和金额准确性。');
    expect(result.fileName).toBe('办公-其他补充材料-模板.docx');
  });

  it('mockCreateTemplateBlobUrl 返回可用 URL', () => {
    const result = mockGenerateEvidenceTemplate({
      invoiceCategory: '餐饮',
      evidenceName: '客户拜访记录',
    });
    const url = mockCreateTemplateBlobUrl(result);
    expect(typeof url).toBe('string');
    expect(url.length).toBeGreaterThan(0);
    URL.revokeObjectURL(url);
  });
});
