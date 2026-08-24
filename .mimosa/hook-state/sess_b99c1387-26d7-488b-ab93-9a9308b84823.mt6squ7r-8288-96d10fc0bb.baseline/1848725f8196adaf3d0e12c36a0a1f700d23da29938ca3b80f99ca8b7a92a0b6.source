// 证据材料模板 Word 文档生成器
//
// 生成真正的 .docx（OOXML zip 包），替代早期的 Markdown 模板：
//   - [Content_Types].xml / _rels / word/document.xml / word/styles.xml
//   - 标题、说明、章节、带边框的字段清单表格、签字确认区
// 使用 fflate 做零依赖友好的 zip 打包（fflate 约 3KB、无原生依赖）
import { zipSync, strToU8 } from 'fflate';

export interface EvidenceTemplateDocxPayload {
  invoiceCategory: string;
  evidenceName: string;
  proofPurpose: string;
  missingImpact: string;
  sampleMaterial: string;
  required: boolean;
}

export const DOCX_MIME_TYPE =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

// XML 文本转义
function esc(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// 段落（支持样式、加粗、颜色、字号[半磅]）
function para(
  text: string,
  opts: { style?: string; bold?: boolean; color?: string; size?: number; spacingBefore?: number } = {},
): string {
  const pPr: string[] = [];
  if (opts.style) pPr.push(`<w:pStyle w:val="${opts.style}"/>`);
  if (opts.spacingBefore) {
    pPr.push(`<w:spacing w:before="${opts.spacingBefore}"/>`);
  }
  const rPr: string[] = [];
  if (opts.bold) rPr.push('<w:b/>');
  if (opts.color) rPr.push(`<w:color w:val="${opts.color}"/>`);
  if (opts.size) rPr.push(`<w:sz w:val="${opts.size}"/><w:szCs w:val="${opts.size}"/>`);
  return `<w:p>${pPr.length ? `<w:pPr>${pPr.join('')}</w:pPr>` : ''}<w:r>${rPr.length ? `<w:rPr>${rPr.join('')}</w:rPr>` : ''}<w:t xml:space="preserve">${esc(text)}</w:t></w:r></w:p>`;
}

// 表格单元格
function cell(text: string, widthDxa: number, opts: { bold?: boolean; fill?: string } = {}): string {
  const tcPr = [
    `<w:tcW w:w="${widthDxa}" w:type="dxa"/>`,
    opts.fill ? `<w:shd w:val="clear" w:color="auto" w:fill="${opts.fill}"/>` : '',
  ].join('');
  return `<w:tc><w:tcPr>${tcPr}</w:tcPr>${para(text, { bold: opts.bold })}</w:tc>`;
}

// 四列表格（字段清单用）
function fieldTable(rows: Array<[string, string, string, string]>): string {
  const widths = [700, 2400, 3800, 1300];
  const border = (tag: string) =>
    `<w:${tag} w:val="single" w:sz="4" w:space="0" w:color="9AA7B8"/>`;
  const tblPr = `<w:tblPr><w:tblW w:w="0" w:type="auto"/><w:tblBorders>${['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map(border).join('')}</w:tblBorders></w:tblPr>`;
  const grid = `<w:tblGrid>${widths.map((w) => `<w:gridCol w:w="${w}"/>`).join('')}</w:tblGrid>`;
  const header = rows[0];
  const headerRow = `<w:tr>${header
    .map((t, i) => cell(t, widths[i], { bold: true, fill: 'EEF2F7' }))
    .join('')}</w:tr>`;
  const bodyRows = rows
    .slice(1)
    .map((r) => `<w:tr>${r.map((t, i) => cell(t, widths[i])).join('')}</w:tr>`)
    .join('');
  return `<w:tbl>${tblPr}${grid}${headerRow}${bodyRows}</w:tbl>`;
}

const STYLES_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:eastAsia="微软雅黑"/><w:sz w:val="21"/><w:szCs w:val="21"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/><w:pPr><w:jc w:val="center"/><w:spacing w:after="240"/></w:pPr><w:rPr><w:b/><w:color w:val="1F3864"/><w:sz w:val="36"/><w:szCs w:val="36"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:before="280" w:after="120"/><w:outlineLvl w:val="1"/></w:pPr><w:rPr><w:b/><w:color w:val="2F5496"/><w:sz w:val="26"/><w:szCs w:val="26"/></w:rPr></w:style>
</w:styles>`;

const CONTENT_TYPES_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
</Types>`;

const ROOT_RELS_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;

const DOC_RELS_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;

const FIELD_ROWS: Array<[string, string, string, string]> = [
  ['序号', '字段名称', '填写示例', '是否必填'],
  ['1', '证据名称', '（由模板预填）', '是'],
  ['2', '关联发票号码', '（填写发票号码）', '是'],
  ['3', '业务发生日期', 'YYYY-MM-DD', '是'],
  ['4', '经办人', '（填写姓名）', '是'],
  ['5', '经办部门', '（填写部门）', '是'],
  ['6', '关联项目/合同编号', '（如适用）', '视情况'],
  ['7', '金额（含税/不含税）', '（如适用）', '视情况'],
  ['8', '对方单位/人员', '（如适用）', '视情况'],
  ['9', '业务事由/说明', '（简要说明业务背景）', '是'],
  ['10', '备注', '（其他需要说明的事项）', '否'],
];

// 组装 document.xml 正文
function buildDocumentXml(payload: EvidenceTemplateDocxPayload): string {
  const body: string[] = [];
  body.push(para(`${payload.evidenceName} 证据材料模板`, { style: 'Title' }));
  body.push(para('本模板由「发票溯源证据链系统」根据发票类别和证据类型自动生成。', { color: '7F8C99', size: 19 }));
  body.push(para('经办人请按模板填写并附原件/扫描件，财务复核通过后归入证据链。', { color: '7F8C99', size: 19 }));

  body.push(para('适用类别', { style: 'Heading2' }));
  body.push(para(`发票类别：${payload.invoiceCategory}`));
  body.push(para(`证据名称：${payload.evidenceName}`));
  body.push(para(`是否必需：${payload.required ? '必需（缺失将阻断入账）' : '建议补充（影响完整度）'}`));

  body.push(para('证明目的', { style: 'Heading2' }));
  body.push(para(payload.proofPurpose));

  body.push(para('缺失影响', { style: 'Heading2' }));
  body.push(para(payload.missingImpact));

  body.push(para('填写说明', { style: 'Heading2' }));
  body.push(para('1. 请按本模板字段顺序逐项填写，不得留空；如不适用请填「不适用」并说明原因。'));
  body.push(para('2. 金额、日期、人员、单据编号等关键字段必须与发票、合同、付款记录保持一致。'));
  body.push(para('3. 涉及外部单位的，需加盖对方公章或业务专用章；内部审批需有审批人签字。'));
  body.push(para('4. 上传电子件时建议 PDF 或扫描件，确保字迹清晰可辨。'));

  body.push(para('需填写字段清单', { style: 'Heading2' }));
  const rows = FIELD_ROWS.map((r, idx) =>
    idx === 0 || r[1] !== '证据名称' ? r : ([r[0], r[1], payload.evidenceName, r[3]] as [string, string, string, string]),
  );
  body.push(fieldTable(rows));

  body.push(para('示例材料', { style: 'Heading2' }));
  body.push(para(payload.sampleMaterial));

  body.push(para('附件清单', { style: 'Heading2' }));
  body.push(para('□ 证据主件（本模板填写后的原件或扫描件）'));
  body.push(para('□ 关联发票复印件'));
  body.push(para('□ 业务审批单/出差申请单/合同等佐证（如适用）'));
  body.push(para('□ 付款记录/银行回单（如适用）'));
  body.push(para('□ 其他配套材料：__________________'));

  body.push(para('经办人确认', { style: 'Heading2' }));
  body.push(para('经办人签字：__________________'));
  body.push(para('经办部门：__________________'));
  body.push(para('填写日期：______ 年 ___ 月 ___ 日'));
  body.push(para('经办人声明：以上填写内容真实、准确，所附材料均与本次业务相关。'));

  body.push(para('财务复核', { style: 'Heading2' }));
  body.push(para('复核人签字：__________________'));
  body.push(para('复核日期：______ 年 ___ 月 ___ 日'));
  body.push(para('复核结论：□ 通过    □ 退回补充    □ 不采纳'));
  body.push(para('复核意见：__________________'));

  body.push(para(`生成时间：${new Date().toISOString()}`, { color: '7F8C99', size: 18, spacingBefore: 360 }));
  body.push(para('生成方：发票溯源证据链系统（AI 模板服务）', { color: '7F8C99', size: 18 }));

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>${body.join('')}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/></w:sectPr></w:body>
</w:document>`;
}

// 生成 .docx 文件字节（zip 包：Content_Types + rels + document + styles）
export function buildEvidenceTemplateDocx(payload: EvidenceTemplateDocxPayload): Uint8Array {
  return zipSync(
    {
      '[Content_Types].xml': strToU8(CONTENT_TYPES_XML),
      '_rels/.rels': strToU8(ROOT_RELS_XML),
      'word/document.xml': strToU8(buildDocumentXml(payload)),
      'word/styles.xml': strToU8(STYLES_XML),
      'word/_rels/document.xml.rels': strToU8(DOC_RELS_XML),
    },
    { level: 6 },
  );
}
