"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.supabase = void 0;
const supabase_js_1 = require("@supabase/supabase-js");
const env_1 = require("./env");
const envWithSupabase = env_1.env;
const SUPABASE_URL = process.env.SUPABASE_URL ?? envWithSupabase.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY ?? envWithSupabase.SUPABASE_KEY;
exports.supabase = SUPABASE_URL && SUPABASE_KEY
    ? (0, supabase_js_1.createClient)(SUPABASE_URL, SUPABASE_KEY, {
        auth: {
            autoRefreshToken: false,
            persistSession: false,
            detectSessionInUrl: false,
        },
    })
    : null;
