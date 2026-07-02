import { NextRequest, NextResponse } from "next/server";

import { getDashboardSnapshot } from "@/lib/access-control";
import { getSession } from "@/lib/session";

export async function GET(_request: NextRequest) {
  const session = await getSession();

  if (!session?.user?.id) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  try {
    const companySlug = session.user.companySlug ?? "";
    const snapshot = await getDashboardSnapshot(session.user.id, companySlug);
    return NextResponse.json(snapshot);
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Failed to load dashboard" },
      { status: 500 }
    );
  }
}
