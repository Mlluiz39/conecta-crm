import { NextResponse } from "next/server";
import { exportReportCsv } from "@/lib/data/reports";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Exporta o relatório em CSV (abre no Excel/Sheets). */
export async function GET() {
  const csv = await exportReportCsv();
  const filename = `conectacrm-relatorio-${new Date().toISOString().slice(0, 10)}.csv`;
  return new NextResponse("﻿" + csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${filename}"`,
    },
  });
}
