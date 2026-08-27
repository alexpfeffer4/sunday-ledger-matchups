type DemoSeasonEnvironment = {
  NODE_ENV?: string;
  VERCEL_ENV?: string;
};

export function isPreviewDemoEnabled(
  environment: DemoSeasonEnvironment = process.env,
): boolean {
  if (environment.VERCEL_ENV) {
    return environment.VERCEL_ENV !== "production";
  }

  return environment.NODE_ENV !== "production";
}

export const isDemoSeasonEnabled = isPreviewDemoEnabled;
