# AI-Based Quiz Generation & Management System - Project Status

**Status**: 🚀 Fully Finished & Production Ready  
**Supabase Integration**: Connected & Verified Live Cloud Database  
**Gemini AI**: Verified Google Gemini 3.8 Flash Engine

---

## 🔑 Integrated Supabase Credentials
- **Project ID**: `czwwmqeedfztnxzoqzgq`
- **Project URL**: `https://czwwmqeedfztnxzoqzgq.supabase.co`
- **Database Tables Created & Active**:
  - `public.profiles` (User role management: Teacher vs. Student)
  - `public.study_materials` (PDF uploads metadata)
  - `public.questions` (AI-generated question bank with difficulty tiers)
  - `public.quizzes` (Teacher quizzes with duration & difficulty quotas)
  - `public.quiz_questions` (Question pool relationships)
  - `public.quiz_attempts` (Student session state, deterministic question sequencing)
  - `public.student_answers` (Student submission logs)
- **Supabase Storage Bucket**: `study-materials` (active)
- **Row Level Security (RLS)**: Enabled with verified access policies.

---

## ⚡ Default Accounts Pre-Seeded in Supabase
| Role | Email | Password | Quick Access |
| :--- | :--- | :--- | :--- |
| **Teacher** | `teacher@college.edu` | `Password123!` | Click "Enter as Teacher" |
| **Student** | `student@college.edu` | `Password123!` | Click "Enter as Student" |

*New teachers and students can also register custom accounts directly on the homepage (`index.html`).*

---

## 🏃 How to Run the Application
1. In PowerShell:
   ```powershell
   cd "d:\Desktop\5th\software project\quiz web\backend"
   node src/server.js
   ```
2. Open in your browser:
   **`http://localhost:5000`**
