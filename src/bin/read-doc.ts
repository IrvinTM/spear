import { extractTextFromImage, extractTextFromPDF } from '../lib/documents';

const file = process.argv[2];

if (!file) {
  console.error('Usage: tsx src/bin/read-doc.ts <path-to-file>');
  process.exit(1);
}

async function main() {
  try {
    const ext = file.toLowerCase().split('.').pop();
    let text = '';
    if (['png', 'jpg', 'jpeg', 'webp'].includes(ext!)) {
      text = await extractTextFromImage(file);
    } else if (ext === 'pdf') {
      text = await extractTextFromPDF(file);
    } else {
      console.error('Unsupported file type.');
      process.exit(1);
    }
    console.log(text);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

main();
