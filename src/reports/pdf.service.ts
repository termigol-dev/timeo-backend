import PDFDocument from 'pdfkit';
import { Injectable } from '@nestjs/common';

@Injectable()
export class PdfService {
  generateEmployeeReport(data: {
    company: string;
    employee: string;
    from?: string;
    to?: string;
    records: { type: string; timestamp: Date }[];
    totalHours: number;
  }) {
    const doc = new PDFDocument({ margin: 40 });

    doc.fontSize(20).text('Timeshift', { align: 'center' });
    doc.moveDown();

    doc.fontSize(12).text(`Empresa: ${data.company}`);
    doc.text(`Empleado: ${data.employee}`);

    if (data.from || data.to) {
      doc.text(`Periodo: ${data.from || '—'} → ${data.to || '—'}`);
    }

    doc.moveDown();
    doc.fontSize(14).text('Registros');
    doc.moveDown(0.5);

    data.records.forEach(r => {
      doc
        .fontSize(11)
        .text(
          `${new Date(r.timestamp).toLocaleString()}  —  ${r.type}`,
        );
    });

    doc.moveDown();
    doc.fontSize(14).text(`Total horas: ${data.totalHours} h`);

    return doc;
  }
}