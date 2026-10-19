"use client";

import { useState } from "react";
import { requestLeaveAction } from "@/actions/team";
import { ActionForm } from "@/components/action-form";
import { Button } from "@/components/ui/button";
import { Field, NativeSelect, Textarea } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { useI18n } from "@/lib/i18n/client";

const TYPES = ["PAID_LEAVE", "SICK", "UNPAID", "AUTHORIZATION", "ABSENCE", "OTHER"] as const;

/** Leave request (employee) or absence record (manager, with `employees`). */
export function LeaveRequestForm({ employees, defaultDay }: { employees?: { id: string; name: string }[]; defaultDay: string }) {
  const { t } = useI18n();
  const l = t.v7.leave;
  const [type, setType] = useState<(typeof TYPES)[number]>(employees ? "ABSENCE" : "PAID_LEAVE");
  const hours = type === "AUTHORIZATION";
  return (
    <ActionForm action={requestLeaveAction} className="grid gap-3 sm:grid-cols-2">
      {employees && (
        <Field label={l.employee} className="sm:col-span-2">
          <NativeSelect name="userId" required defaultValue="">
            <option value="" disabled>
              —
            </option>
            {employees.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </NativeSelect>
        </Field>
      )}
      <Field label={t.v7.leave.title} className="sm:col-span-2">
        <NativeSelect name="type" value={type} onChange={(e) => setType(e.target.value as (typeof TYPES)[number])}>
          {TYPES.map((k) => (
            <option key={k} value={k}>
              {l.type[k]}
            </option>
          ))}
        </NativeSelect>
      </Field>
      {hours ? (
        <>
          <Field label={l.date} className="sm:col-span-2">
            <Input type="date" name="date" required defaultValue={defaultDay} />
          </Field>
          <Field label={l.from}>
            <Input type="time" name="from" required defaultValue="09:00" />
          </Field>
          <Field label={l.to}>
            <Input type="time" name="to" required defaultValue="11:00" />
          </Field>
        </>
      ) : (
        <>
          <Field label={l.firstDay}>
            <Input type="date" name="firstDay" required defaultValue={defaultDay} />
          </Field>
          <Field label={l.lastDay}>
            <Input type="date" name="lastDay" required defaultValue={defaultDay} />
          </Field>
        </>
      )}
      <Field label={l.reason} className="sm:col-span-2">
        <Textarea name="reason" rows={2} maxLength={500} />
      </Field>
      <div className="sm:col-span-2">
        <Button type="submit">{employees ? t.common.save : l.send}</Button>
      </div>
    </ActionForm>
  );
}
