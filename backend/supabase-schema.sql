-- ====================================================================
-- AI-Based Quiz Generation and Management System
-- Supabase PostgreSQL Schema & Security Policies
-- ====================================================================

-- Enable UUID extension (usually default in Supabase)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ====================================================================
-- 1. PROFILES TABLE (Roles: 'teacher', 'student')
-- ====================================================================
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('teacher', 'student')),
    full_name TEXT,
    email TEXT,
    created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Automatic Profile Creation Trigger on Supabase Auth Signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (id, role, full_name, email)
    VALUES (
        NEW.id,
        COALESCE(NEW.raw_user_meta_data->>'role', 'student'),
        COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
        NEW.email
    )
    ON CONFLICT (id) DO NOTHING;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ====================================================================
-- 2. STUDY MATERIALS TABLE (Uploaded PDFs)
-- ====================================================================
CREATE TABLE IF NOT EXISTS public.study_materials (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    teacher_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    file_name TEXT NOT NULL,
    file_url TEXT NOT NULL,
    storage_path TEXT NOT NULL,
    file_size BIGINT,
    created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- ====================================================================
-- 3. QUESTIONS TABLE (AI-Generated & Managed Question Bank)
-- ====================================================================
CREATE TABLE IF NOT EXISTS public.questions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    material_id UUID REFERENCES public.study_materials(id) ON DELETE SET NULL,
    teacher_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    question_text TEXT NOT NULL,
    options JSONB NOT NULL, -- Array of 4 strings e.g. ["A", "B", "C", "D"]
    correct_answer TEXT NOT NULL,
    difficulty TEXT NOT NULL CHECK (difficulty IN ('Easy', 'Medium', 'Hard')),
    explanation TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- ====================================================================
-- 4. QUIZZES TABLE
-- ====================================================================
CREATE TABLE IF NOT EXISTS public.quizzes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    teacher_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    duration_minutes INTEGER NOT NULL DEFAULT 15 CHECK (duration_minutes > 0),
    total_questions INTEGER NOT NULL DEFAULT 10 CHECK (total_questions > 0),
    easy_count INTEGER NOT NULL DEFAULT 0 CHECK (easy_count >= 0),
    medium_count INTEGER NOT NULL DEFAULT 0 CHECK (medium_count >= 0),
    hard_count INTEGER NOT NULL DEFAULT 0 CHECK (hard_count >= 0),
    is_published BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- ====================================================================
-- 5. QUIZ_QUESTIONS TABLE (Question Pool linked to Quiz)
-- ====================================================================
CREATE TABLE IF NOT EXISTS public.quiz_questions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    quiz_id UUID NOT NULL REFERENCES public.quizzes(id) ON DELETE CASCADE,
    question_id UUID NOT NULL REFERENCES public.questions(id) ON DELETE CASCADE,
    UNIQUE(quiz_id, question_id)
);

-- ====================================================================
-- 6. QUIZ_ATTEMPTS TABLE (Tracks student quiz sessions & assigned randomized set)
-- ====================================================================
CREATE TABLE IF NOT EXISTS public.quiz_attempts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    quiz_id UUID NOT NULL REFERENCES public.quizzes(id) ON DELETE CASCADE,
    student_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    assigned_question_ids JSONB NOT NULL, -- Array of Question UUIDs in assigned order
    started_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    completed_at TIMESTAMPTZ,
    score INTEGER DEFAULT 0,
    total_questions INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'completed', 'abandoned'))
);

-- ====================================================================
-- 7. STUDENT_ANSWERS TABLE (Individual question responses)
-- ====================================================================
CREATE TABLE IF NOT EXISTS public.student_answers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    attempt_id UUID NOT NULL REFERENCES public.quiz_attempts(id) ON DELETE CASCADE,
    question_id UUID NOT NULL REFERENCES public.questions(id) ON DELETE CASCADE,
    selected_option TEXT,
    is_correct BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    UNIQUE(attempt_id, question_id)
);

-- ====================================================================
-- INDEXES FOR FAST QUERIES
-- ====================================================================
CREATE INDEX IF NOT EXISTS idx_materials_teacher ON public.study_materials(teacher_id);
CREATE INDEX IF NOT EXISTS idx_questions_teacher ON public.questions(teacher_id);
CREATE INDEX IF NOT EXISTS idx_questions_material ON public.questions(material_id);
CREATE INDEX IF NOT EXISTS idx_questions_status ON public.questions(status);
CREATE INDEX IF NOT EXISTS idx_quizzes_teacher ON public.quizzes(teacher_id);
CREATE INDEX IF NOT EXISTS idx_quizzes_published ON public.quizzes(is_published);
CREATE INDEX IF NOT EXISTS idx_attempts_student ON public.quiz_attempts(student_id);
CREATE INDEX IF NOT EXISTS idx_attempts_quiz ON public.quiz_attempts(quiz_id);
CREATE INDEX IF NOT EXISTS idx_student_answers_attempt ON public.student_answers(attempt_id);

-- ====================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ====================================================================
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.study_materials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quizzes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quiz_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quiz_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_answers ENABLE ROW LEVEL SECURITY;

-- PROFILES POLICIES
CREATE POLICY "Public profiles are viewable by authenticated users"
    ON public.profiles FOR SELECT
    TO authenticated
    USING (true);

CREATE POLICY "Users can update their own profile"
    ON public.profiles FOR UPDATE
    TO authenticated
    USING (auth.uid() = id);

-- STUDY MATERIALS POLICIES
CREATE POLICY "Teachers can view own study materials"
    ON public.study_materials FOR SELECT
    TO authenticated
    USING (auth.uid() = teacher_id);

CREATE POLICY "Teachers can insert own study materials"
    ON public.study_materials FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid() = teacher_id);

CREATE POLICY "Teachers can delete own study materials"
    ON public.study_materials FOR DELETE
    TO authenticated
    USING (auth.uid() = teacher_id);

-- QUESTIONS POLICIES
CREATE POLICY "Teachers can manage own questions"
    ON public.questions FOR ALL
    TO authenticated
    USING (auth.uid() = teacher_id)
    WITH CHECK (auth.uid() = teacher_id);

-- QUIZZES POLICIES
CREATE POLICY "Teachers can manage own quizzes"
    ON public.quizzes FOR ALL
    TO authenticated
    USING (auth.uid() = teacher_id)
    WITH CHECK (auth.uid() = teacher_id);

CREATE POLICY "Students can view published quizzes"
    ON public.quizzes FOR SELECT
    TO authenticated
    USING (is_published = true);

-- QUIZ_QUESTIONS POLICIES
CREATE POLICY "Teachers can manage quiz questions"
    ON public.quiz_questions FOR ALL
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.quizzes
            WHERE quizzes.id = quiz_questions.quiz_id
            AND quizzes.teacher_id = auth.uid()
        )
    );

-- QUIZ_ATTEMPTS POLICIES
CREATE POLICY "Students can view and create their own quiz attempts"
    ON public.quiz_attempts FOR ALL
    TO authenticated
    USING (auth.uid() = student_id)
    WITH CHECK (auth.uid() = student_id);

CREATE POLICY "Teachers can view attempts for their quizzes"
    ON public.quiz_attempts FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.quizzes
            WHERE quizzes.id = quiz_attempts.quiz_id
            AND quizzes.teacher_id = auth.uid()
        )
    );

-- STUDENT_ANSWERS POLICIES
CREATE POLICY "Students can manage their own answers"
    ON public.student_answers FOR ALL
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.quiz_attempts
            WHERE quiz_attempts.id = student_answers.attempt_id
            AND quiz_attempts.student_id = auth.uid()
        )
    );

-- ====================================================================
-- SUPABASE STORAGE BUCKET CONFIGURATION
-- ====================================================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('study-materials', 'study-materials', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- Storage policies for 'study-materials' bucket
CREATE POLICY "Authenticated users can upload study materials"
    ON storage.objects FOR INSERT
    TO authenticated
    WITH CHECK (bucket_id = 'study-materials');

CREATE POLICY "Authenticated users can view study materials"
    ON storage.objects FOR SELECT
    TO authenticated
    USING (bucket_id = 'study-materials');

CREATE POLICY "Authenticated users can delete their uploaded files"
    ON storage.objects FOR DELETE
    TO authenticated
    USING (bucket_id = 'study-materials' AND (auth.uid() = owner OR auth.uid()::text = (storage.foldername(name))[1]));
