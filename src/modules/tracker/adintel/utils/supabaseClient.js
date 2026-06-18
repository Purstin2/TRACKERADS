// Shim: o módulo Ad Intelligence usa o client Supabase COMPARTILHADO do purstinlab
// (credenciais via env VITE_SUPABASE_* ou coladas na tela e salvas no localStorage).
// Substitui o supabaseClient.js original (que tinha mock próprio).
import { supabase } from '@/lib/supabase'

export const supabaseClient = supabase()
export const isSupabaseMockActive = false
