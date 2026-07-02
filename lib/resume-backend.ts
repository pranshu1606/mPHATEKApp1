const BACKEND_URL = process.env.RESUME_BACKEND_URL ?? "http://127.0.0.1:8000";

export type ParsedProject = {
  title: string;
  tech_stack: string[];
  highlights: string[];
};

export type ParsedResume = {
  name: string;
  email: string;
  phone: string;
  skills: string[];
  education: string[];
  projects: ParsedProject[];
};

export type SearchResult = {
  resume_id: string;
  org_id: string;
  score: number;
  best_chunk: string;
};

function backendUrl(pathname: string) {
  return new URL(pathname, BACKEND_URL).toString();
}

async function fetchJson<T>(pathname: string, init: RequestInit): Promise<T> {
  const response = await fetch(backendUrl(pathname), {
    ...init,
    headers: {
      Accept: "application/json",
      ...(init.headers ?? {})
    }
  });

  const text = await response.text();
  let payload: unknown = {};

  if (text) {
    try {
      payload = JSON.parse(text) as unknown;
    } catch {
      payload = { detail: text };
    }
  }

  if (!response.ok) {
    const message =
      typeof payload === "object" && payload && "detail" in payload
        ? String((payload as { detail?: unknown }).detail ?? "Request failed")
        : "Request failed";
    throw new Error(message);
  }

  return payload as T;
}

function normalizeParsedResume(
  value: Partial<ParsedResume> & Record<string, unknown>
): ParsedResume {
  return {
    name: typeof value.name === "string" ? value.name.trim() : "",
    email: typeof value.email === "string" ? value.email.trim() : "",
    phone: typeof value.phone === "string" ? value.phone.trim() : "",
    skills: Array.isArray(value.skills)
      ? value.skills.map((item) => String(item).trim()).filter(Boolean)
      : [],
    education: Array.isArray(value.education)
      ? value.education.map((item) => String(item).trim()).filter(Boolean)
      : [],
    projects: Array.isArray(value.projects)
      ? value.projects.map((project) => {
          const entry = project as Record<string, unknown>;
          return {
            title: typeof entry.title === "string" ? entry.title.trim() : "",
            tech_stack: Array.isArray(entry.tech_stack)
              ? entry.tech_stack.map((item) => String(item).trim()).filter(Boolean)
              : [],
            highlights: Array.isArray(entry.highlights)
              ? entry.highlights.map((item) => String(item).trim()).filter(Boolean)
              : []
          };
        })
      : []
  };
}

export async function processResumeWithBackend(params: {
  resumeId: string;
  orgId: string;
  userId: string;
  fileName: string;
  mimeType: string | null;
  buffer: Buffer;
}): Promise<{ parsed: ParsedResume; extractedText: string }> {
  const formData = new FormData();
  formData.append("resume_id", params.resumeId);
  formData.append("org_id", params.orgId);
  formData.append("user_id", params.userId);
  formData.append("original_filename", params.fileName);
  formData.append(
    "file",
    new File([new Uint8Array(params.buffer)], params.fileName, {
      type: params.mimeType ?? "application/pdf"
    })
  );

  const payload = await fetchJson<{
    resume_id: string;
    parsed: Record<string, unknown>;
    extracted_text: string;
  }>("/process", {
    method: "POST",
    body: formData
  });

  return {
    parsed: normalizeParsedResume(payload.parsed),
    extractedText: payload.extracted_text ?? ""
  };
}

export async function searchResumesInBackend(params: {
  query: string;
  orgId?: string;
  resumeIds?: string[];
  limit?: number;
}): Promise<SearchResult[]> {
  const payload = await fetchJson<{ results: SearchResult[] }>("/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      query: params.query,
      org_id: params.orgId ?? null,
      resume_ids: params.resumeIds ?? null,
      limit: params.limit ?? 20
    })
  });

  return payload.results ?? [];
}

export async function deleteResumeFromBackend(resumeId: string): Promise<void> {
  await fetchJson<{ deleted: string }>(`/resumes/${resumeId}`, {
    method: "DELETE"
  });
}

export async function checkBackendHealth(): Promise<boolean> {
  try {
    const payload = await fetchJson<{ status: string }>("/health", {
      method: "GET"
    });
    return payload.status === "ok";
  } catch {
    return false;
  }
}
