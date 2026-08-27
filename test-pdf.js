const fs = require('fs');
const pdf = require('pdf-parse');
const path = '/home/codespace/.ues-agent/data/materials/course-1/section-0/module-5152244/ORIENTACIONES_ACADE_MICAS.pdf';
const buf = fs.readFileSync(path);
const uint8 = new Uint8Array(buf);
const p = new pdf.PDFParse(uint8);
p.getText().then(data => console.log("getText returned:", data)).catch(e => console.log(e));
