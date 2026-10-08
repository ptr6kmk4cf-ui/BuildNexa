import { connection } from "next/server";
import { NextResponse } from "next/server";
import { appOrigin, startGithubConnection } from "@/server/github";

export async function GET(request: Request) {
  await connection();
  const result = await startGithubConnection();
  if (result.type === "error") {
    const location = new URL("/github", appOrigin(request));
    location.searchParams.set("error", result.error);
    return NextResponse.redirect(location);
  }
  return NextResponse.redirect(result.url);
}
