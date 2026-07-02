import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth-options";

export function getSession() {
  return getServerSession(authOptions);
}
