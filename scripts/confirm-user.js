#!/usr/bin/env node
// Confirm a Supabase user's email using service role key.
// Usage:
//   node scripts/confirm-user.js --email user@example.com
//   node scripts/confirm-user.js --id <user_id>

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment.');
  process.exit(1);
}

const args = process.argv.slice(2);
let userId = null;
let email = null;
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--id') userId = args[i + 1];
  if (args[i] === '--email') email = args[i + 1];
}

if (!userId && !email) {
  console.error('Provide --id <user_id> or --email <email>');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function resolveUserIdViaEmail(email) {
  const { data, error } = await supabase
    .from('employee_profiles')
    .select('id, email')
    .eq('email', email)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error(`No employee_profiles found for email: ${email}`);
  return data.id;
}

async function main() {
  try {
    const id = userId || (await resolveUserIdViaEmail(email));
    const { data, error } = await supabase.auth.admin.updateUserById(id, {
      email_confirmed: true,
    });
    if (error) throw error;
    console.log(`User ${id} marked as email_confirmed.`);
  } catch (err) {
    console.error('Failed to confirm user:', err);
    process.exit(1);
  }
}

main();