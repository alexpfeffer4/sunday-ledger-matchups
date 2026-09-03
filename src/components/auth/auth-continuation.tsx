"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export function AuthContinuation({ next }: { next: string }) {
  const router = useRouter();

  useEffect(() => {
    router.replace(next);
  }, [next, router]);

  return (
    <main className="bg-canvas grid min-h-screen place-items-center px-5">
      <p className="text-graphite text-sm font-semibold" role="status">
        Finishing sign-in…
      </p>
    </main>
  );
}
