const pdfParse = require('pdf-parse');
import { readFile } from 'fs/promises';

/**
 * Extracts text from a PDF file.
 */
export async function extractTextFromPDF(pdfPath: string): Promise<string> {
  try {
    const dataBuffer = await readFile(pdfPath);
    const uint8 = new Uint8Array(dataBuffer);

    // Handle different export structures of pdf-parse across versions
    const pdfFunc = typeof pdfParse === 'function' ? pdfParse : (pdfParse.default || pdfParse);

    if (typeof pdfFunc === 'function') {
      const data = await pdfFunc(dataBuffer);
      return data.text;
    } else if (pdfParse.PDFParse) {
      const p = new pdfParse.PDFParse(uint8);
      const data = await p.getText();
      return data.text;
    }

    throw new Error('Unsupported pdf-parse version');
  } catch (error) {
    console.error('PDF Parse Error:', error);
    throw new Error('Failed to extract text from PDF.');
  }
}
