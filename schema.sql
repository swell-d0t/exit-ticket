-- ─────────────────────────────────────────────────────────
-- EXIT TICKET — Supabase SQL Schema
-- Run this entire file in the Supabase SQL Editor.
-- See README.md for step-by-step instructions.
-- ─────────────────────────────────────────────────────────

-- TEACHERS TABLE
-- One row per teacher account.
-- Questions are stored as a JSON array inside this row.
-- class_code is the 6-char code teachers share with students.
CREATE TABLE IF NOT EXISTS public.teachers (
  id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email       TEXT NOT NULL,
  name        TEXT NOT NULL,
  class_code  TEXT NOT NULL UNIQUE,
  questions   JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- RESPONSES TABLE
-- One row per student submission.
-- answers is a JSON object: { questionId: answerString }
CREATE TABLE IF NOT EXISTS public.responses (
  id            BIGSERIAL PRIMARY KEY,
  teacher_id    UUID NOT NULL REFERENCES public.teachers(id) ON DELETE CASCADE,
  student_name  TEXT NOT NULL,
  tab_warnings  INTEGER NOT NULL DEFAULT 0,
  answers       JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────
-- ROW LEVEL SECURITY (RLS)
-- This is what keeps each teacher's data private.
-- A teacher can only read/write their own rows.
-- Students can insert responses and look up teachers by code.
-- ─────────────────────────────────────────────────────────

ALTER TABLE public.teachers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.responses ENABLE ROW LEVEL SECURITY;

-- Teachers: can read and update their own row only
CREATE POLICY "Teachers can read own row"
  ON public.teachers FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Teachers can update own row"
  ON public.teachers FOR UPDATE
  USING (auth.uid() = id);

-- Teachers: insert own row on registration (called from app)
CREATE POLICY "Teachers can insert own row"
  ON public.teachers FOR INSERT
  WITH CHECK (auth.uid() = id);

-- Students (unauthenticated): can look up a teacher by class_code only
-- This allows the join screen to work without a login
CREATE POLICY "Anyone can look up teacher by class_code"
  ON public.teachers FOR SELECT
  USING (true);

-- Students: can insert a response (no auth required)
CREATE POLICY "Anyone can submit a response"
  ON public.responses FOR INSERT
  WITH CHECK (true);

-- Teachers: can read and delete their own responses only
CREATE POLICY "Teachers can read own responses"
  ON public.responses FOR SELECT
  USING (auth.uid() = teacher_id);

CREATE POLICY "Teachers can delete own responses"
  ON public.responses FOR DELETE
  USING (auth.uid() = teacher_id);
