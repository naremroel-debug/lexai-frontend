/**
 * Direct Supabase client for LexAI Tauri app.
 * Replaces the Next.js backend for CRUD operations.
 * The anon key is safe to include — RLS protects data.
 */
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://ejijdkkljqfwpedojjpk.supabase.co";
// The anon key is safe to expose in client-side code — RLS protects all data.
// Copy your anon/public key from Supabase Dashboard > Settings > API Keys
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVqaWpka2tsanFmd3BlZG9qanBrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM4ODE0NDQsImV4cCI6MjA4OTQ1NzQ0NH0._BgQrKIsesia83D_xjZxi-Ib9sB7YXY3AAzSXMT-Py4";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    storage: localStorage,
  },
});

export { SUPABASE_URL, SUPABASE_ANON_KEY };
