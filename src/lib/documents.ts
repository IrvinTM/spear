import Tesseract from 'tesseract.js';
import pdfParse from 'pdf-parse';
import { readFile } from 'fs/promises';

/**
 * Extracts text from an image using OCR.
 */
export async function extractTextFromImage(imagePath: string): Promise<string> {
  try {
    const result = await Tesseract.recognize(imagePath, 'eng+spa', {
      logger: (m) => console.log(m),
    });
    return result.data.text;
  } catch (error) {
    console.error('OCR Error:', error);
    throw new Error('Failed to extract text from image.');
  }
}

/**
 * Extracts text from a PDF file.
 */
export async function extractTextFromPDF(pdfPath: string): Promise<string> {
  try {
    const dataBuffer = await readFile(pdfPath);
    const data = await pdfParse(dataBuffer);
    return data.text;
  } catch (error) {
    console.error('PDF Parse Error:', error);
    throw new Error('Failed to extract text from PDF.');
  }
}
