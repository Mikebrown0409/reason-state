import type { Patch } from "../engine/types.js";

type BookingInput = {
  id?: string;
  destination?: string;
  budget?: number;
  currency?: string;
  startDate?: string; // ISO
  endDate?: string; // ISO
  unknowns?: string[];
};

const calendarHolds: Array<{ startDate: string; endDate: string; destination?: string }> = [
  { startDate: "2025-12-20", endDate: "2025-12-23", destination: "Tokyo" },
  { startDate: "2025-12-24", endDate: "2025-12-27", destination: "Amsterdam" }
];

function overlaps(aStart?: string, aEnd?: string, bStart?: string, bEnd?: string): boolean {
  if (!aStart || !aEnd || !bStart || !bEnd) return false;
  const aS = new Date(aStart).getTime();
  const aE = new Date(aEnd).getTime();
  const bS = new Date(bStart).getTime();
  const bE = new Date(bEnd).getTime();
  if (Number.isNaN(aS) || Number.isNaN(aE) || Number.isNaN(bS) || Number.isNaN(bE)) return false;
  return aS <= bE && bS <= aE;
}

function fakeStripePayment(
  budget?: number,
  currency = "USD"
): { ok: boolean; id: string; status: string; currency?: string } {
  if (budget === undefined || budget <= 0) return { ok: false, id: "", status: "failed" };
  return { ok: true, id: `pi_test_${Date.now()}`, status: "succeeded", currency } as const;
}

// Real-ish demo booking: governance gate, calendar clash, stripe-test simulation.
export async function mockBooking(input: BookingInput): Promise<Patch[]> {
  const bookingId = `booking-${input.id ?? Date.now()}`;

  if (input.unknowns && input.unknowns.length > 0) {
    return [
      {
        op: "add",
        path: `/raw/${bookingId}`,
        value: {
          id: bookingId,
          type: "action",
          status: "blocked",
          summary: "Booking blocked by unknowns",
          details: { unknowns: input.unknowns },
          sourceType: "booking",
          sourceId: bookingId
        }
      }
    ];
  }

  if (!input.destination || !input.budget) {
    return [
      {
        op: "add",
        path: `/raw/${bookingId}`,
        value: {
          id: bookingId,
          type: "action",
          status: "blocked",
          summary: "Booking missing destination or budget",
          details: { destination: input.destination, budget: input.budget },
          sourceType: "booking",
          sourceId: bookingId
        }
      }
    ];
  }

  const clash = calendarHolds.find((hold) =>
    overlaps(input.startDate, input.endDate, hold.startDate, hold.endDate)
  );
  if (clash) {
    return [
      {
        op: "add",
        path: `/raw/${bookingId}`,
        value: {
          id: bookingId,
          type: "action",
          status: "blocked",
          summary: "Booking blocked: dates clash with existing hold",
          details: {
            destination: input.destination,
            budget: input.budget,
            startDate: input.startDate,
            endDate: input.endDate,
            conflict: clash
          },
          sourceType: "booking",
          sourceId: bookingId
        }
      }
    ];
  }

  const payment = fakeStripePayment(input.budget, input.currency);
  if (!payment.ok) {
    return [
      {
        op: "add",
        path: `/raw/${bookingId}`,
        value: {
          id: bookingId,
          type: "action",
          status: "blocked",
          summary: "Payment failed (stripe-test)",
          details: {
            destination: input.destination,
            budget: input.budget,
            startDate: input.startDate,
            endDate: input.endDate,
            paymentStatus: payment.status
          },
          sourceType: "booking",
          sourceId: bookingId
        }
      }
    ];
  }

  calendarHolds.push({
    startDate: input.startDate ?? "",
    endDate: input.endDate ?? "",
    destination: input.destination
  });

  return [
    {
      op: "add",
      path: `/raw/${bookingId}`,
      value: {
        id: bookingId,
        type: "action",
        status: "resolved",
        summary: `Booked for ${input.destination} within budget`,
        details: {
          destination: input.destination,
          budget: input.budget,
          currency: input.currency ?? "USD",
          startDate: input.startDate,
          endDate: input.endDate,
          paymentIntentId: payment.id,
          paymentStatus: payment.status
        },
        sourceType: "booking",
        sourceId: bookingId
      }
    }
  ];
}

