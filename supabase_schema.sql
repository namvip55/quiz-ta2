-- =============================================================================
-- SQL SCHEMA TẠO BẢNG TRÊN SUPABASE CHO QUIZFLOW B1
-- =============================================================================
-- Hướng dẫn:
-- 1. Vào Supabase Dashboard -> Chọn dự án của bạn
-- 2. Chọn mục "SQL Editor" ở menu bên trái
-- 3. Bấm "New Query", dán toàn bộ đoạn mã bên dưới vào và bấm "Run"
-- =============================================================================

-- 1. Bảng lưu kết quả thi (quiz_results)
CREATE TABLE IF NOT EXISTS public.quiz_results (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    exam_id TEXT NOT NULL,
    percent INTEGER NOT NULL,
    correct_count INTEGER NOT NULL,
    total_questions INTEGER NOT NULL,
    completed_at TIMESTAMPTZ DEFAULT NOW(),
    details JSONB
);

-- 2. Bật Row Level Security (RLS)
ALTER TABLE public.quiz_results ENABLE ROW LEVEL SECURITY;

-- 3. Cho phép đọc và thêm kết quả công khai qua API Anon Key
CREATE POLICY "Cho phép thêm kết quả" 
ON public.quiz_results 
FOR INSERT 
TO anon 
WITH CHECK (true);

CREATE POLICY "Cho phép xem kết quả" 
ON public.quiz_results 
FOR SELECT 
TO anon 
USING (true);
