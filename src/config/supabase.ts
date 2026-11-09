import { createClient, SupabaseClient } from "@supabase/supabase-js"

let client: SupabaseClient | null = null

// Supabase is optional: only needed for vehicle photo uploads.
export const isStorageConfigured = () =>
  !!process.env.SUPABASE_URL && !!process.env.SUPABASE_KEY

export const getSupabase = (): SupabaseClient => {
  if (!isStorageConfigured()) {
    throw new Error("Image upload is not configured (set SUPABASE_URL and SUPABASE_KEY)")
  }
  if (!client) {
    client = createClient(process.env.SUPABASE_URL as string, process.env.SUPABASE_KEY as string)
  }
  return client
}