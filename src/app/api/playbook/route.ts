import { NextResponse } from "next/server";
import caseStudiesData from "@/lib/data/case-studies.json";
import type { EmailThread } from "@/lib/types/thread";
import type { ThreadHealth } from "@/lib/queries/useScore";
import { aggregatePlaybookData } from "@/lib/playbook/aggregateData";
import { generatePlaybook } from "@/lib/playbook/generatePlaybook";

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

const threads: EmailThread[] = caseStudies.map((cs) => ({
  conversationId: cs.conversationId,
  subject: cs.subject,
  product: cs.product,
  mainContact: cs.mainContact,
  threadTags: cs.threadTags,
  messages: cs.messages,
}));

const healthMap: Record<string, ThreadHealth> = Object.fromEntries(
  caseStudies.map((cs) => [cs.conversationId, cs.health]),
);

export async function GET() {
  try {
    const data = aggregatePlaybookData(threads, healthMap);
    const buffer = await generatePlaybook(data);

    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        "Content-Disposition":
          'attachment; filename="DealTrace_Rep_Playbook.pptx"',
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("[playbook] Generation failed:", error);
    return NextResponse.json(
      { error: "Failed to generate playbook" },
      { status: 500 },
    );
  }
}
