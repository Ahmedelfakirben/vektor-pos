#!/usr/bin/env node
// Create a Supabase user with email_confirmed = true and insert employee_profile.
// Usage:
//   node scripts/create-user.js --email user@example.com --password <pwd> [--full-name "Nombre"] [--role admin|cashier|barista] [--phone "+123"]

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment.');
  process.exit(1);
}

const args = process.argv.slice(2);
function getArg(flag) {
  const idx = args.indexOf(flag);
  return idx >= 0 ? args[idx + 1] : null;
}

const email = getArg('--email');
const password = getArg('--password');
const fullName = getArg('--full-name') || 'Empleado';
const role = (getArg('--role') || 'cashier');
const phone = getArg('--phone');

if (!email || !password) {
  console.error('Provide --email and --password');
  process.exit(1);
}

if (!['admin', 'cashier', 'barista'].includes(role)) {
  console.error('Invalid --role. Use admin|cashier|barista');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function main() {
  try {
    const { data: created, error: createErr } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirmed: true,
    });
    if (createErr) throw createErr;

    const userId = created.user?.id;
    if (!userId) throw new Error('No user id returned from createUser');

    const { error: profileErr } = await supabase
      .from('employee_profiles')
      .insert({
        id: userId,
        full_name: fullName,
        role,
        phone: phone || null,
        email,
        active: true,
      });
    if (profileErr) throw profileErr;

    console.log(`Created and confirmed user ${email} (id: ${userId}) and inserted employee_profile.`);
  } catch (err) {
    console.error('Failed to create user:', err);
    process.exit(1);
  }
}

main();