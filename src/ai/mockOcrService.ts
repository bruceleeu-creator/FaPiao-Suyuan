import type { IntakeForm, Invoice } from '../domain/types';

// 模拟 OCR 服务：从录入表单生成发票对象，不调用真实 OCR
// 对样例来源做特殊处理（重复/验真失败案例），手工录入默认验真通过
export function mockOcrRecognize(form: IntakeForm): Invoice {
  const baseInvoice: Invoice = {
    id: `INV-${Date.now()}`,
    invoiceType: form.invoiceType,
    invoiceCode: form.invoiceCode,
    invoiceNumber: form.invoiceNumber,
    issueDate: form.issueDate,
    seller: form.seller,
    buyer: form.buyer,
    itemName: form.itemName,
    amount: form.amount,
    taxAmount: form.taxAmount,
    taxRate: form.taxRate,
    verificationStatus: '验真通过',
    duplicateStatus: '未重复',
    redLetterStatus: '正常',
    recognitionConfidence: form.source === '案例' ? 0.94 : 0.9,
    category: form.category,
    anomalies: [],
    sourceFile: form.source === '案例' ? `mock://ocr/sample-${form.sampleCaseId}.pdf` : 'mock://ocr/manual-input.pdf',
    status: '待确认票面',
  };

  // 样例：阻断案例（case-blocked-001）复刻验真失败 + 疑似重复
  if (form.source === '案例' && form.sampleCaseId === 'case-blocked-001') {
    return {
      ...baseInvoice,
      verificationStatus: '验真失败',
      duplicateStatus: '疑似重复',
      recognitionConfidence: 0.72,
      anomalies: ['验真失败', '疑似重复发票', '识别置信度偏低'],
      status: '暂不能判断',
    };
  }

  return baseInvoice;
}
