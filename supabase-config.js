// =============================================================================
// CẤU HÌNH SUPABASE CHO QUIZFLOW B1 DASHBOARD
// =============================================================================
// Sau khi bạn tạo dự án trên Supabase (https://supabase.com):
// 1. Vào Project Settings -> API
// 2. Sao chép Project URL và anon/public API Key dán vào dưới đây
// 3. Đổi enabled thành true
// =============================================================================

const SUPABASE_CONFIG = {
  url: 'https://jqhyvnbvtdfhuyetuddy.supabase.co',      // Ví dụ: 'https://xxxxxxxxxxxx.supabase.co'
  anonKey: 'sb_publishable_tsurb6gbRz5dNNa2uqGyzQ_STEOSBgi',  // Ví dụ: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...'
  enabled: false
};

let supabaseClient = null;

function initSupabase() {
  if (SUPABASE_CONFIG.enabled && SUPABASE_CONFIG.url && SUPABASE_CONFIG.anonKey) {
    if (typeof window.supabase !== 'undefined' && window.supabase.createClient) {
      try {
        supabaseClient = window.supabase.createClient(SUPABASE_CONFIG.url, SUPABASE_CONFIG.anonKey);
        console.log('✓ Đã kết nối Supabase thành công.');
      } catch (e) {
        console.warn('Lỗi kết nối Supabase:', e);
      }
    }
  }
}

// Đồng bộ kết quả làm bài lên Supabase
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

if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', initSupabase);
}
