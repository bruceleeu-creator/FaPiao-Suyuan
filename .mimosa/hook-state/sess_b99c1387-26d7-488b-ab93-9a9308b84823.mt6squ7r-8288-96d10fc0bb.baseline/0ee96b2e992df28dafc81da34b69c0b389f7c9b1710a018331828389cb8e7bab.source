import type { EvidenceGuidance, InvoiceCategory } from '../domain/types';
import { mockRequiredEvidenceGuidance } from './mockEvidenceMatcher';
import { buildEvidenceTemplateDocx, DOCX_MIME_TYPE } from './evidenceTemplateDocx';

// 证据模板下载服务
// 由发票类别和证据名称派生 Word（.docx）模板，供经办人下载填写
// 模板不替代证据上传，仅作为材料填写指引
//
// 格式说明：早期版本输出 Markdown；应需求改为真正的 Word 文档
// （OOXML zip 包，由 evidenceTemplateDocx 组装），Word/WPS 可直接打开编辑

export interface EvidenceTemplateInput {
  invoiceCategory: InvoiceCategory;
  evidenceName: string;
  proofPurpose?: string;
  missingImpact?: string;
  sampleMaterial?: string;
}

export interface EvidenceTemplateResult {
  fileName: string;        // 下载文件名（发票类别-证据名称-模板.docx）
  docx: Uint8Array;        // Word 文档字节（浏览器直接作为 Blob 下载）
  mimeType: string;        // application/vnd.openxmlformats-officedocument...
}

// 生成单条证据的 Word 模板
export function mockGenerateEvidenceTemplate(input: EvidenceTemplateInput): EvidenceTemplateResult {
  const { invoiceCategory, evidenceName } = input;

  // 从结构化证据指导清单中取回默认信息
  const guidanceList: EvidenceGuidance[] = mockRequiredEvidenceGuidance(invoiceCategory);
  const matched = guidanceList.find((g) => g.name === evidenceName);

  const proofPurpose = input.proofPurpose ?? matched?.proofPurpose ?? '证明业务真实性和金额准确性。';
  const missingImpact = input.missingImpact ?? matched?.missingImpact ?? '缺失将影响业务真实性证明，可能导致不得入账或不得税前扣除。';
  const sampleMaterial = input.sampleMaterial ?? matched?.sampleMaterial ?? '原件或加盖公章的复印件';

  const required = matched?.required ?? true;

  const docx = buildEvidenceTemplateDocx({
    invoiceCategory,
    evidenceName,
    proofPurpose,
    missingImpact,
    sampleMaterial,
    required,
  });

  const fileName = `${invoiceCategory}-${evidenceName}-模板.docx`;

  return {
    fileName,
    docx,
    mimeType: DOCX_MIME_TYPE,
  };
}

// 浏览器端：将 Word 模板生成 Blob URL
// 调用方负责在组件卸载或重新生成时调用 URL.revokeObjectURL(url) 释放内存
export function mockCreateTemplateBlobUrl(result: EvidenceTemplateResult): string {
  const blob = new Blob([result.docx as BlobPart], { type: result.mimeType });
  return URL.createObjectURL(blob);
}
