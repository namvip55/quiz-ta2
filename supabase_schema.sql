-- =============================================================================
-- SQL SCHEMA TẠO BẢNG TRÊN SUPABASE CHO QUIZFLOW B1
-- =============================================================================
-- Hướng dẫn:
-- 1. Vào Supabase Dashboard -> Chọn dự án của bạn (quiz-ta)
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

-- 2. Bảng lưu trữ và quản lý các đề thi (quiz_exams)
CREATE TABLE IF NOT EXISTS public.quiz_exams (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    duration_minutes INTEGER DEFAULT 60,
    passing_score INTEGER DEFAULT 60,
    randomize BOOLEAN DEFAULT false,
    questions JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Bật Row Level Security (RLS)
ALTER TABLE public.quiz_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quiz_exams ENABLE ROW LEVEL SECURITY;

-- Phân quyền cho quiz_results (Người học lưu kết quả)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'quiz_results' AND policyname = 'Cho phép thêm kết quả') THEN
        CREATE POLICY "Cho phép thêm kết quả" ON public.quiz_results FOR INSERT TO anon WITH CHECK (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'quiz_results' AND policyname = 'Cho phép xem kết quả') THEN
        CREATE POLICY "Cho phép xem kết quả" ON public.quiz_results FOR SELECT TO anon USING (true);
    END IF;
END $$;

-- Phân quyền cho quiz_exams (Đọc & cập nhật đề thi)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'quiz_exams' AND policyname = 'Cho phép tất cả đọc đề thi') THEN
        CREATE POLICY "Cho phép tất cả đọc đề thi" ON public.quiz_exams FOR SELECT TO anon USING (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'quiz_exams' AND policyname = 'Cho phép cập nhật đề thi') THEN
        CREATE POLICY "Cho phép cập nhật đề thi" ON public.quiz_exams FOR ALL TO anon USING (true) WITH CHECK (true);
    END IF;
END $$;
