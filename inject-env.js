// Script injects environment variables into frontend configs during Vercel build
const fs = require('fs');
const path = require('path');

const url = process.env.SUPABASE_URL || '';
const anonKey = process.env.SUPABASE_ANON_KEY || '';
const accessCode = process.env.ACCESS_CODE || '';

// 1. Inject Supabase Config if env vars exist
if (url && anonKey) {
  const configPath = path.join(__dirname, 'supabase-config.js');
  let content = fs.readFileSync(configPath, 'utf8');
  content = content.replace(/url:\s*'.*?'/, `url: '${url}'`);
  content = content.replace(/anonKey:\s*'.*?'/, `anonKey: '${anonKey}'`);
  content = content.replace(/enabled:\s*(true|false)/, 'enabled: true');
  fs.writeFileSync(configPath, content, 'utf8');
  console.log('✓ [Vercel Build] Đã tự động chèn SUPABASE_URL và SUPABASE_ANON_KEY từ Environment Variables.');
}

// 2. Inject Access Code if set in env
if (accessCode) {
  const appPath = path.join(__dirname, 'app.js');
  let appContent = fs.readFileSync(appPath, 'utf8');
  appContent = appContent.replace(/const ACCESS_CODE = '.*?';/, `const ACCESS_CODE = '${accessCode}';`);
  fs.writeFileSync(appPath, appContent, 'utf8');
  console.log('✓ [Vercel Build] Đã tự động cập nhật ACCESS_CODE từ Environment Variables.');
}
