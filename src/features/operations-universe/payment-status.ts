export function computePaymentStatus(
  paymentDate: string | null,
  receivedDate: string | null,
): "Received" | "Not Yet Due" | "Due" | "Overdue" {
  if (receivedDate) return "Received";
  if (!paymentDate) return "Not Yet Due";
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(paymentDate);
  target.setHours(0, 0, 0, 0);
  const diffDays = Math.round((today.getTime() - target.getTime()) / 86400000);
  if (diffDays <= 0) return "Not Yet Due";
  if (diffDays <= 15) return "Due";
  return "Overdue";
}
