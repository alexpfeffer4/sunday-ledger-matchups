import { createClient } from "@supabase/supabase-js";

const url = process.env.TEST_SUPABASE_URL;
const publishableKey = process.env.TEST_SUPABASE_PUBLISHABLE_KEY;
const serviceRoleKey = process.env.TEST_SUPABASE_SERVICE_ROLE_KEY;
const email = process.env.OWNER_REHEARSAL_TEST_EMAIL;
const password = process.env.OWNER_REHEARSAL_TEST_PASSWORD;

if (!url || !publishableKey || !serviceRoleKey || !email || !password) {
  throw new Error(
    "Disposable owner-rehearsal acceptance settings are missing.",
  );
}

const admin = createClient(url, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const created = await admin.auth.admin.createUser({
  email,
  email_confirm: true,
  password,
});
if (created.error || !created.data.user) {
  throw new Error(
    created.error?.message ?? "Acceptance owner was not created.",
  );
}

const owner = createClient(url, publishableKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const signedIn = await owner.auth.signInWithPassword({ email, password });
if (signedIn.error) throw new Error(signedIn.error.message);
const profile = await owner
  .schema("api")
  .rpc("ensure_profile", { p_display_name: "Rehearsal Owner" });
if (profile.error) throw new Error(profile.error.message);

process.stdout.write(created.data.user.id);
