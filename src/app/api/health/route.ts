import { unstable_rethrow } from "next/navigation";
import { connection } from "next/server";
import { buildHealthReport, healthHttpStatus } from "@/lib/health";
import { toPublicError } from "@/lib/http";

export async function GET() {
  try {
    await connection();
    const report = await buildHealthReport();
    return Response.json(report, {
      status: healthHttpStatus(report),
      headers: { "cache-control": "no-store" },
    });
  } catch (error) {
    unstable_rethrow(error);
    const publicError = toPublicError(error);
    return Response.json(publicError.body, { status: publicError.status });
  }
}
