import { NextResponse, type NextRequest } from "next/server";
import caseStudiesData from "@/lib/data/case-studies.json";
import type { EmailThread } from "@/lib/types/thread";
import type { ThreadHealth } from "@/lib/queries/useScore";
import { generateCaseStudy } from "@/lib/playbook/generateCaseStudy";

interface CaseStudyEntry {
  conversationId: string;
  subject: string;
  product?: string;
  mainContact?: string;
  threadTags: EmailThread["threadTags"];
  messages: EmailThread["messages"];
  health: ThreadHealth;
}

const caseStudies = caseStudiesData as unknown as CaseStudyEntry[];

export async function GET(request: NextRequest) {
  const id = request.nextUrl.searchParams.get("id");
  if (!id) {
    return NextResponse.json(
      { error: "Missing ?id=conversationId parameter" },
      { status: 400 },
    );
  }

  const entry = caseStudies.find((cs) => cs.conversationId === id);
  if (!entry) {
    return NextResponse.json(
      { error: "Thread not found" },
      { status: 404 },
    );
  }

  const thread: EmailThread = {
    conversationId: entry.conversationId,
    subject: entry.subject,
    product: entry.product,
    mainContact: entry.mainContact,
    threadTags: entry.threadTags,
    messages: entry.messages,
  };

  try {
    const buffer = await generateCaseStudy(thread, entry.health);
    const outcome = entry.health.outcome === "won" ? "Won" : "Lost";
    const safeName = entry.subject.replace(/[^a-zA-Z0-9 ]/g, "").slice(0, 40);

    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        "Content-Disposition": `attachment; filename="CaseStudy_${outcome}_${safeName}.pptx"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("[casestudy] Generation failed:", error);
    return NextResponse.json(
      { error: "Failed to generate case study" },
      { status: 500 },
    );
  }
}
