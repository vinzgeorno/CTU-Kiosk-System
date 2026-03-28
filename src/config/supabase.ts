import { createClient } from "@supabase/supabase-js";
import { env } from "./env";

const envWithSupabase = env as typeof env & {
	SUPABASE_URL?: string;
	SUPABASE_KEY?: string;
};

const SUPABASE_URL = process.env.SUPABASE_URL ?? envWithSupabase.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY ?? envWithSupabase.SUPABASE_KEY;

export const supabase =
	SUPABASE_URL && SUPABASE_KEY
		? createClient(SUPABASE_URL, SUPABASE_KEY, {
				auth: {
					autoRefreshToken: false,
					persistSession: false,
					detectSessionInUrl: false,
				},
		  })
		: null;
