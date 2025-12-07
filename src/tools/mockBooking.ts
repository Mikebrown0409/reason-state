import type { Patch } from "../engine/types.js";

type BookingInput = {
  id?: string;
  destination?: string;
  budget?: number;
  unknowns?: string[];
};

// Demo-only booking tool. Blocks when unknowns exist; emits action/status patches.
export async function mockBooking(input: BookingInput): Promise<Patch[]> {
  if (input.unknowns && input.unknowns.length > 0) {
    return [
      {
        op: "add",
        path: `/raw/booking-${input.id ?? "pending"}`,
        value: {
          id: `booking-${input.id ?? "pending"}`,
          type: "action",
          status: "blocked",
          summary: "Booking blocked by unknowns",
          details: { unknowns: input.unknowns }
        }
      }
    ];
  }

  const id = `booking-${input.id ?? Date.now()}`;
  return [
    {
      op: "add",
      path: `/raw/${id}`,
      value: {
        id,
        type: "action",
        status: "resolved",
        summary: `Booked for ${input.destination ?? "TBD"} within budget`,
        details: { budget: input.budget, destination: input.destination },
        sourceType: "booking",
        sourceId: id
      }
    }
  ];
}

