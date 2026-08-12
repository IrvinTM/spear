const fs = require('fs');
const html = fs.readFileSync('/home/irvin/spear/moodle_dump.html', 'utf8');
const regex = /<a\s+title="([^"]+)"\s+href="https:\/\/campus\.ues\.edu\.sv\/course\/view\.php\?id=(\d+)"[^>]*>.*?<\/i>\s*([^<]+)<\/a>/g;
let match;
while ((match = regex.exec(html)) !== null) {
  console.log(`ID: ${match[2]}, Short: ${match[1]}, Full: ${match[3].trim()}`);
}
