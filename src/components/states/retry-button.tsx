"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

export function RetryButton() {
  const router = useRouter();
  return (
    <Button variant="outline" onClick={() => router.refresh()}>
      Try again
    </Button>
  );
}
