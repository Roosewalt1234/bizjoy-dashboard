import type { OperationalException } from "./exceptions";

const EXCEPTION_TITLE_PHRASES: Record<string, { singular: string; plural: string }> = {
  "Overdue Work Order": { singular: "overdue work order", plural: "overdue work orders" },
  "Overdue PPM": { singular: "overdue PPM visit", plural: "overdue PPM visits" },
  "No Attendance Recorded": {
    singular: "staff attendance issue",
    plural: "staff attendance issues",
  },
  "Overdue Payment": {
    singular: "contract with an overdue payment",
    plural: "contracts with overdue payments",
  },
  "Expiring Contract": { singular: "expiring contract", plural: "expiring contracts" },
  "Payment Schedule Mismatch": {
    singular: "payment schedule requiring reconciliation",
    plural: "payment schedules requiring reconciliation",
  },
};

// Data quality is deliberately reported in its own trailing sentence, never merged into the
// operational summary - a schedule/value mismatch isn't a business emergency by itself
// (see exceptions.ts's detectReconciliationIssues).
const DATA_QUALITY_TITLE = "Payment Schedule Mismatch";

function countByTitle(exceptions: OperationalException[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const exception of exceptions) {
    counts.set(exception.title, (counts.get(exception.title) ?? 0) + 1);
  }
  return counts;
}

function phraseFor(title: string, count: number): string {
  const phrase = EXCEPTION_TITLE_PHRASES[title];
  if (!phrase) return `${count} ${title.toLowerCase()}${count === 1 ? "" : "s"}`;
  return `${count} ${count === 1 ? phrase.singular : phrase.plural}`;
}

function joinPhrases(phrases: string[]): string {
  if (phrases.length === 0) return "";
  if (phrases.length === 1) return phrases[0];
  return `${phrases.slice(0, -1).join(", ")} and ${phrases[phrases.length - 1]}`;
}

export function buildMorningSummary(exceptions: OperationalException[]): {
  operational: string;
  dataQuality?: string;
} {
  const counts = countByTitle(exceptions);
  const dataQualityCount = counts.get(DATA_QUALITY_TITLE) ?? 0;

  const operationalPhrases: string[] = [];
  for (const [title, count] of counts) {
    if (title === DATA_QUALITY_TITLE || count === 0) continue;
    operationalPhrases.push(phraseFor(title, count));
  }

  const operational =
    operationalPhrases.length === 0
      ? "Nothing requires your attention today."
      : `Today requires attention: ${joinPhrases(operationalPhrases)}.`;

  const dataQuality =
    dataQualityCount > 0
      ? `Data quality: ${phraseFor(DATA_QUALITY_TITLE, dataQualityCount)}.`
      : undefined;

  return { operational, dataQuality };
}

export function buildAttentionRelationshipReason(
  entityLabel: string,
  exceptions: OperationalException[],
): string {
  if (exceptions.length === 0) {
    return `${entityLabel} has no active exceptions.`;
  }
  const counts = countByTitle(exceptions);
  const phrases = [...counts.entries()].map(([title, count]) => phraseFor(title, count));
  return `${entityLabel} is connected to Attention because it has ${exceptions.length} active exception${exceptions.length === 1 ? "" : "s"}: ${joinPhrases(phrases)}.`;
}
