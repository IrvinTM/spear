const fs = require('fs');
const html = fs.readFileSync('course_dump.html', 'utf8');
const regex = /<a[^>]*href="[^"]*?\/mod\/([^/]+)\/view\.php\?id=(\d+)"[^>]*>([\s\S]*?)<\/a>/g;
let match;
while ((match = regex.exec(html)) !== null) {
  const type = match[1];
  const id = match[2];
  const innerHtml = match[3];
  const nameMatch = /<span\s+class="instancename"[^>]*>([^<]+)/.exec(innerHtml);
  if (nameMatch) {
    console.log(`Type: ${type}, ID: ${id}, Name: ${nameMatch[1].trim()}`);
  }
}
