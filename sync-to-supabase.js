// Script đồng bộ tất cả đề thi từ database.js lên Supabase
const fs = require('fs');

global.window = {};
eval(fs.readFileSync('database.js', 'utf8'));
const defaultExams = window.DEFAULT_DATA?.exams || [];

const url = 'https://jqhyvnbvtdfhuyetuddy.supabase.co/rest/v1/quiz_exams';
const key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpxaHl2bmJ2dGRmaHV5ZXR1ZGR5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTUxMDczNTAsImV4cCI6MjExMDY4MzM1MH0.1hkj_SINOwVQh1VsMOqEHO9qrCBR1NT1pqO0pPC9vqs';

async function syncAll() {
  console.log(`Đang đồng bộ ${defaultExams.length} đề thi lên Supabase...`);

  for (const exam of defaultExams) {
    const payload = {
      id: exam.id,
      title: exam.title,
      duration_minutes: exam.durationMinutes || 60,
      passing_score: exam.passingScore || 60,
      randomize: Boolean(exam.randomize),
      questions: exam.questions || [],
      updated_at: new Date().toISOString()
    };

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'apikey': key,
          'Authorization': 'Bearer ' + key,
          'Content-Type': 'application/json',
          'Prefer': 'resolution=merge-duplicates'
        },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        console.log(`✓ Đã tải lên thành công: "${exam.title}" (${exam.questions.length} câu)`);
      } else {
        const text = await res.text();
        console.error(`✕ Lỗi khi tải "${exam.title}":`, res.status, text);
      }
    } catch (err) {
      console.error(`✕ Lỗi kết nối khi tải "${exam.title}":`, err.message);
    }
  }

  console.log('Hoàn tất đồng bộ đề thi lên Supabase!');
}

syncAll();
