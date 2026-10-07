import "server-only";
import { displayPlate, fmt } from "@/lib/format";
import { getI18n } from "@/lib/i18n/server";
import { prisma } from "@/lib/prisma";
import { notifyCustomer } from "@/server/notify";
import { getSettings } from "@/server/settings";

/** SMS / e-mail "your car is ready" — sent only if a channel is configured. Never throws. */
export async function notifyVehicleReady(workOrderId: string): Promise<void> {
  try {
    const [wo, settings, { t }] = await Promise.all([
      prisma.workOrder.findUnique({
        where: { id: workOrderId },
        select: { customer: { select: { phone: true, email: true } }, vehicle: { select: { plate: true } } },
      }),
      getSettings(),
      getI18n(),
    ]);
    if (!wo) return;
    const text = fmt(t.booking.smsReady, { garage: settings.garageName, plate: displayPlate(wo.vehicle.plate) });
    await notifyCustomer(wo.customer, { subject: text, text, brand: settings.garageName });
  } catch (error) {
    console.error("[notify] ready", error);
  }
}
