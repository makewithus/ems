import { jsPDF } from "jspdf";

export interface PayslipData {
  companyName?: string;
  companyAddress?: string;
  employeeName: string;
  employeeId: string;
  department: string;
  designation?: string;
  month: string;
  year?: string | number;
  basic: number;
  allowances: number;
  bonus?: number;
  gross?: number;
  pf: number;
  tax: number;
  deductions: number;
  net: number;
  paymentDate?: string;
  generatedDate?: string;
  status?: string;
}

export function formatINR(val: number): string {
  return "INR " + Number(val || 0).toLocaleString("en-IN", {
    maximumFractionDigits: 2,
    minimumFractionDigits: 0,
  });
}

export function generatePayslipPdf(data: PayslipData) {
  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 20;
  const contentWidth = pageWidth - margin * 2;

  // Colors
  const primaryColor = [220, 38, 38]; // MakeWithUs Brand Red
  const darkColor = [24, 24, 27];     // Zinc 900
  const grayColor = [113, 113, 122];  // Zinc 500
  const lightBg = [244, 244, 245];    // Zinc 100
  const greenColor = [22, 163, 74];   // Emerald 600

  // 1. Header & Company Brand
  doc.setFillColor(darkColor[0], darkColor[1], darkColor[2]);
  doc.rect(margin, 18, contentWidth, 24, "F");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.setTextColor(255, 255, 255);
  doc.text(data.companyName || "MAKEWITHUS PVT LTD", margin + 8, 28);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(212, 212, 216);
  doc.text("ENTERPRISE RESOURCE MANAGEMENT SYSTEM · OFFICIAL SALARY STATEMENT", margin + 8, 35);

  // 2. Document Title & Period
  let y = 50;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.setTextColor(darkColor[0], darkColor[1], darkColor[2]);
  doc.text(`PAYSLIP FOR ${String(data.month).toUpperCase()}`, margin, y);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(grayColor[0], grayColor[1], grayColor[2]);
  const genDate = data.generatedDate || new Date().toISOString().split("T")[0];
  doc.text(`Generated: ${genDate}  |  Status: Verified & Confirmed`, pageWidth - margin - 75, y);

  y += 6;
  doc.setDrawColor(228, 228, 231);
  doc.setLineWidth(0.5);
  doc.line(margin, y, pageWidth - margin, y);

  // 3. Employee Information Grid
  y += 8;
  doc.setFillColor(lightBg[0], lightBg[1], lightBg[2]);
  doc.rect(margin, y, contentWidth, 26, "F");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(grayColor[0], grayColor[1], grayColor[2]);

  doc.text("EMPLOYEE NAME", margin + 6, y + 8);
  doc.text("EMPLOYEE ID", margin + 60, y + 8);
  doc.text("DEPARTMENT", margin + 105, y + 8);
  doc.text("DESIGNATION", margin + 145, y + 8);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(darkColor[0], darkColor[1], darkColor[2]);

  doc.text(data.employeeName || "Employee", margin + 6, y + 16);
  doc.text(data.employeeId || "—", margin + 60, y + 16);
  doc.text(data.department || "General", margin + 105, y + 16);
  doc.text(data.designation || "Staff", margin + 145, y + 16);

  // 4. Earnings & Deductions Tables
  y += 36;
  const colWidth = (contentWidth - 6) / 2;

  // Earnings Header
  doc.setFillColor(darkColor[0], darkColor[1], darkColor[2]);
  doc.rect(margin, y, colWidth, 8, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(255, 255, 255);
  doc.text("EARNINGS", margin + 4, y + 5.5);
  doc.text("AMOUNT", margin + colWidth - 24, y + 5.5);

  // Deductions Header
  doc.setFillColor(darkColor[0], darkColor[1], darkColor[2]);
  doc.rect(margin + colWidth + 6, y, colWidth, 8, "F");
  doc.text("DEDUCTIONS", margin + colWidth + 10, y + 5.5);
  doc.text("AMOUNT", margin + contentWidth - 24, y + 5.5);

  // Table Rows
  y += 8;
  const earnings = [
    { label: "Basic Salary", amount: data.basic || 0 },
    { label: "Special Allowances", amount: data.allowances || 0 },
    { label: "Performance Bonus", amount: data.bonus || 0 },
  ];

  const deductions = [
    { label: "Provident Fund (PF)", amount: data.pf || 0 },
    { label: "Income Tax (TDS)", amount: data.tax || 0 },
    { label: "Other Deductions", amount: Math.max(0, (data.deductions || 0) - (data.pf || 0) - (data.tax || 0)) },
  ];

  const maxRows = Math.max(earnings.length, deductions.length);
  const rowHeight = 8;

  for (let i = 0; i < maxRows; i++) {
    const rowY = y + i * rowHeight;
    const isEven = i % 2 === 0;

    if (isEven) {
      doc.setFillColor(lightBg[0], lightBg[1], lightBg[2]);
      doc.rect(margin, rowY, colWidth, rowHeight, "F");
      doc.rect(margin + colWidth + 6, rowY, colWidth, rowHeight, "F");
    }

    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(darkColor[0], darkColor[1], darkColor[2]);

    const earn = earnings[i];
    if (earn) {
      doc.text(earn.label, margin + 4, rowY + 5.5);
      doc.text(formatINR(earn.amount), margin + colWidth - 4, rowY + 5.5, { align: "right" });
    }

    const ded = deductions[i];
    if (ded) {
      doc.text(ded.label, margin + colWidth + 10, rowY + 5.5);
      doc.text(formatINR(ded.amount), margin + contentWidth - 4, rowY + 5.5, { align: "right" });
    }
  }

  y += maxRows * rowHeight;

  // Subtotals
  const grossPay = (data.basic || 0) + (data.allowances || 0) + (data.bonus || 0);
  const totalDed = data.deductions || (data.pf || 0) + (data.tax || 0);

  doc.setFillColor(228, 228, 231);
  doc.rect(margin, y, colWidth, 9, "F");
  doc.rect(margin + colWidth + 6, y, colWidth, 9, "F");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(9.5);
  doc.setTextColor(darkColor[0], darkColor[1], darkColor[2]);

  doc.text("TOTAL GROSS PAY", margin + 4, y + 6);
  doc.text(formatINR(grossPay), margin + colWidth - 4, y + 6, { align: "right" });

  doc.text("TOTAL DEDUCTIONS", margin + colWidth + 10, y + 6);
  doc.text(formatINR(totalDed), margin + contentWidth - 4, y + 6, { align: "right" });

  // 5. Net Salary Highlight Banner
  y += 18;
  doc.setFillColor(240, 253, 244); // Green 50
  doc.setDrawColor(greenColor[0], greenColor[1], greenColor[2]);
  doc.setLineWidth(0.75);
  doc.roundedRect(margin, y, contentWidth, 22, 2, 2, "FD");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(greenColor[0], greenColor[1], greenColor[2]);
  doc.text("NET SALARY PAYABLE", margin + 8, y + 13.5);

  doc.setFontSize(16);
  const netPay = data.net !== undefined ? data.net : grossPay - totalDed;
  doc.text(formatINR(netPay), pageWidth - margin - 8, y + 14.5, { align: "right" });

  // 6. Security & Audit Footer
  const footerY = 270;
  doc.setDrawColor(228, 228, 231);
  doc.setLineWidth(0.5);
  doc.line(margin, footerY - 5, pageWidth - margin, footerY - 5);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(grayColor[0], grayColor[1], grayColor[2]);
  doc.text("CONFIDENTIAL · MakeWithUs Enterprise Resource Management System", margin, footerY);
  doc.text("This is an authoritative computer-generated statement and does not require a physical signature.", margin, footerY + 4.5);
  doc.text(`Ref: MWU-PAY-${data.employeeId}-${String(data.month).replace(/\s+/g, "")}`, pageWidth - margin, footerY, { align: "right" });

  // Outputs
  const cleanEmpName = (data.employeeName || "Employee").replace(/[^a-zA-Z0-9]/g, "_");
  const cleanMonth = String(data.month).replace(/[^a-zA-Z0-9]/g, "_");
  const filename = `Payslip_${cleanEmpName}_${cleanMonth}.pdf`;

  const blob = doc.output("blob");
  const arrayBuffer = doc.output("arraybuffer");
  const dataUrl = doc.output("dataurlstring");

  return {
    doc,
    blob,
    arrayBuffer,
    dataUrl,
    size: blob.size,
    filename,
    save: () => doc.save(filename),
  };
}

export function downloadPayslipPdf(data: PayslipData) {
  const result = generatePayslipPdf(data);
  result.save();
  return result;
}
