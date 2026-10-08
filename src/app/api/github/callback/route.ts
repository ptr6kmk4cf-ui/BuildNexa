import { connection } from "next/server";
import { NextResponse } from "next/server";
import { appOrigin, completeGithubConnection } from "@/server/github";

export async function GET(request: Request) {
  await connection();
  const url = new URL(request.url);
  const result = await completeGithubConnection(url.searchParams);
  const location = new URL("/github", appOrigin(request));
  if (result !== "ok") location.searchParams.set("error", result);
  return NextResponse.redirect(location);
}
