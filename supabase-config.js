// =============================================================================
// CẤU HÌNH SUPABASE CHO QUIZFLOW B1 DASHBOARD
// =============================================================================

const SUPABASE_CONFIG = {
  url: 'https://jqhyvnbvtdfhuyetuddy.supabase.co',
  anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpxaHl2bmJ2dGRmaHV5ZXR1ZGR5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTUxMDczNTAsImV4cCI6MjExMDY4MzM1MH0.1hkj_SINOwVQh1VsMOqEHO9qrCBR1NT1pqO0pPC9vqs',
  enabled: true
};

let supabaseClient = null;

function initSupabase() {
  if (SUPABASE_CONFIG.enabled && SUPABASE_CONFIG.url && SUPABASE_CONFIG.anonKey) {
    if (typeof window.supabase !== 'undefined' && window.supabase.createClient) {
      try {
        supabaseClient = window.supabase.createClient(SUPABASE_CONFIG.url, SUPABASE_CONFIG.anonKey);
        console.log('✓ Đã kết nối Supabase Cloud thành công.');
      } catch (e) {
        console.warn('Lỗi kết nối Supabase:', e);
      }
    }
  }
}

// 1. Tải toàn bộ đề thi từ Supabase (bảng quiz_exams)
async function loadExamsFromSupabase() {
  if (!supabaseClient) return null;
  try {
    const { data, error } = await supabaseClient
      .from('quiz_exams')
      .select('*')
      .order('updated_at', { ascending: false });
    if (error) {
      console.warn('Lỗi lấy đề thi từ Supabase:', error.message);
      return null;
    }
    if (data && data.length) {
      console.log(`✓ Đã tải ${data.length} đề thi từ Supabase Cloud.`);
      return data.map(row => ({
        id: row.id,
        title: row.title,
        durationMinutes: row.duration_minutes || 60,
        passingScore: row.passing_score || 60,
        randomize: Boolean(row.randomize),
        questions: Array.isArray(row.questions) ? row.questions : [],
        createdAt: row.created_at,
        updatedAt: row.updated_at
      }));
    }
  } catch (err) {
    console.warn('Không thể kết nối Supabase tải đề:', err);
  }
  return null;
}

// 2. Đồng bộ kết quả làm bài lên Supabase (bảng quiz_results)
async function saveResultToSupabase(resultData) {
  if (!supabaseClient) return;
  try {
    const { data, error } = await supabaseClient
      .from('quiz_results')
      .insert([
        {
          exam_id: resultData.examId,
          percent: resultData.percent,
          correct_count: resultData.correct,
          total_questions: resultData.total,
          completed_at: resultData.completedAt || new Date().toISOString(),
          details: resultData.questions
        }
      ]);
    if (error) {
      console.warn('Lỗi lưu kết quả lên Supabase:', error.message);
    } else {
      console.log('✓ Đã lưu kết quả thi lên Supabase');
    }
  } catch (err) {
    console.warn('Không thể gửi kết quả lên Supabase:', err);
  }
}

// 3. Đẩy / cập nhật một đề thi lên Supabase (bảng quiz_exams)
async function saveExamToSupabase(exam) {
  if (!supabaseClient || !exam) return;
  try {
    const { error } = await supabaseClient
      .from('quiz_exams')
      .upsert({
        id: exam.id,
        title: exam.title,
        duration_minutes: exam.durationMinutes || 60,
        passing_score: exam.passingScore || 60,
        randomize: Boolean(exam.randomize),
        questions: exam.questions || [],
        updated_at: new Date().toISOString()
      }, { onConflict: 'id' });
    if (error) {
      console.warn('Lỗi đồng bộ đề thi lên Supabase:', error.message);
    } else {
      console.log(`✓ Đã đồng bộ đề thi "${exam.title}" lên Supabase.`);
    }
  } catch (err) {
    console.warn('Không thể đồng bộ đề thi lên Supabase:', err);
  }
}

if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', initSupabase);
}
