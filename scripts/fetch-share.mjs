import fs from 'fs';

async function main() {
  try {
    const res = await fetch('https://share.gemini.google/nTd2QjlyNXOB', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8'
      }
    });
    const html = await res.text();
    console.log('HTTP Status:', res.status, 'HTML Length:', html.length);
    fs.writeFileSync('e:/Learn/share_dump.html', html, 'utf-8');

    // Search for conversational text in the html
    // Gemini shares embed data in WIZ_global_data or AF_initDataCallback
    const callbackMatches = html.match(/AF_initDataCallback\(\{[\s\S]*?\}\);/g);
    console.log('AF_initDataCallback count:', callbackMatches ? callbackMatches.length : 0);

    if (callbackMatches) {
      callbackMatches.forEach((cb, idx) => {
        fs.writeFileSync(`e:/Learn/cb_${idx}.txt`, cb, 'utf-8');
      });
    }
  } catch (e) {
    console.error('Fetch error:', e);
  }
}

main();
