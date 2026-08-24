import { createClient, SupabaseClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

function getRequiredEnvVar(name: string, value: string | undefined): string | null {
  if (!value || value.trim() === '') {
    return `Missing required environment variable: ${name}. Copy .env.example to .env and set ${name} to your Supabase project value.`
  }
  return null
}

const urlError = getRequiredEnvVar('VITE_SUPABASE_URL', supabaseUrl)
const keyError = getRequiredEnvVar('VITE_SUPABASE_ANON_KEY', supabaseAnonKey)

export const supabaseConfigError: string | null = urlError ?? keyError

export const supabase: SupabaseClient | null =
  urlError === null && keyError === null && supabaseUrl && supabaseAnonKey
    ? createClient(supabaseUrl.trim(), supabaseAnonKey.trim())
    : null