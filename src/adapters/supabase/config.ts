export type SupabasePublicConfig = {
  url: string;
  publishableKey: string;
};

const productionProjectRef = "nxikkhtaercmbuyrlyio";

export function isBackendAllowedForDeployment(
  url: string | undefined,
  environment: string | undefined,
  previewProjectRef: string | undefined,
): boolean {
  if (environment !== "preview") return true;
  if (
    !url ||
    !previewProjectRef ||
    previewProjectRef === productionProjectRef
  ) {
    return false;
  }
  try {
    const parsed = new URL(url);
    return (
      /^[a-z]{20}$/.test(previewProjectRef) &&
      parsed.protocol === "https:" &&
      parsed.hostname === `${previewProjectRef}.supabase.co` &&
      !parsed.port &&
      !parsed.username &&
      !parsed.password
    );
  } catch {
    return false;
  }
}

function deploymentAllowsBackend(): boolean {
  return isBackendAllowedForDeployment(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_DEPLOYMENT_ENV,
    process.env.NEXT_PUBLIC_PREVIEW_SUPABASE_REF,
  );
}

export function getSupabasePublicConfig(): SupabasePublicConfig {
  if (!deploymentAllowsBackend()) {
    throw new Error(
      "This Preview requires a separately configured test database.",
    );
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !publishableKey) {
    throw new Error(
      "Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.",
    );
  }

  return { url, publishableKey };
}

export function isSupabaseConfigured(): boolean {
  return Boolean(
    deploymentAllowsBackend() &&
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  );
}
