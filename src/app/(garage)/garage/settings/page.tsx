import { KeyRound, Pause, Play, Trash2 } from "lucide-react";
import { Role } from "@prisma/client";
import {
  addPackageLineAction,
  archivePackageAction,
  createPackageAction,
  createStaffAction,
  deleteStaffAction,
  removePackageLineAction,
  setStaffActiveAction,
  setStaffPasswordAction,
  setStaffRoleAction,
  updateSettingsAction,
} from "@/actions/catalog";
import { ActionButton, ActionForm } from "@/components/action-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardTitle, Field, NativeSelect, PageHeader, Textarea } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { fmt, formatMoney, formatQty } from "@/lib/format";
import { getI18n } from "@/lib/i18n/server";
import { requirePageAccess } from "@/lib/session";
import { listPackages, listStaff } from "@/server/admin";
import { partOptions } from "@/server/parts";
import { getSettings } from "@/server/settings";
import { listBookableServices } from "@/server/booking";
import { BookingSettings } from "@/components/garage/booking-settings";
import { EmailSettings } from "@/components/garage/email-settings";

export default async function SettingsPage() {
  const me = await requirePageAccess("manageSettings");

  const [{ t, lang }, settings, packages, parts, staff, bookableServices] = await Promise.all([getI18n(), getSettings(), listPackages(), partOptions(), listStaff(), listBookableServices(true)]);

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6">
      <PageHeader title={t.settings.title} />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardTitle>{t.settings.garage}</CardTitle>
          <ActionForm action={updateSettingsAction} reset={false} className="grid gap-3 sm:grid-cols-2">
            <Field label={t.settings.garageName} className="sm:col-span-2">
              <Input name="garageName" required defaultValue={settings.garageName} />
            </Field>
            <Field label={t.common.address} className="sm:col-span-2">
              <Input name="address" defaultValue={settings.address ?? ""} />
            </Field>
            <Field label={t.common.phone}>
              <Input name="phone" defaultValue={settings.phone ?? ""} dir="ltr" />
            </Field>
            <Field label={t.common.email}>
              <Input name="email" type="email" defaultValue={settings.email ?? ""} dir="ltr" />
            </Field>
            <Field label={t.common.taxId} className="sm:col-span-2">
              <Input name="taxId" defaultValue={settings.taxId ?? ""} dir="ltr" />
            </Field>
            <Field label={`${t.settings.laborRate} (DT)`}>
              <Input name="laborRate" required inputMode="decimal" defaultValue={(settings.laborRate / 1000).toFixed(3)} dir="ltr" />
            </Field>
            <Field label={t.settings.defaultTax}>
              <Input name="defaultTaxPercent" required inputMode="decimal" defaultValue={settings.defaultTaxBp / 100} dir="ltr" />
            </Field>
            <Field label={`${t.settings.stampDuty} (DT)`}>
              <Input name="stampDuty" required inputMode="decimal" defaultValue={(settings.stampDuty / 1000).toFixed(3)} dir="ltr" />
            </Field>
            <Field label={t.settings.paymentTerms}>
              <Input name="paymentTermsDays" required type="number" min={0} max={365} defaultValue={settings.paymentTermsDays} dir="ltr" />
            </Field>
            <Field label={t.settings.footer} className="sm:col-span-2">
              <Textarea name="invoiceFooter" rows={2} defaultValue={settings.invoiceFooter ?? ""} />
            </Field>
            <div className="sm:col-span-2">
              <Button type="submit">{t.common.save}</Button>
            </div>
          </ActionForm>
        </Card>

        <Card>
          <CardTitle>{t.settings.staff}</CardTitle>
          <ul className="mb-4 divide-y text-sm">
            {staff.map((u) => (
              <li key={u.id} className="py-2">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="min-w-0 flex-1">
                    <p className={u.isActive ? "font-medium" : "text-muted-foreground line-through"}>
                      {u.name}
                      {u.id === me.id && <span className="ms-1 text-xs font-normal text-muted-foreground">({t.settings.you})</span>}
                    </p>
                    <p className="text-xs text-muted-foreground" dir="ltr">{u.email}</p>
                  </div>
                  <Badge variant="secondary">{t.roles[u.role]}</Badge>
                  {u.id !== me.id && (
                    <ActionButton size="sm" variant="ghost" action={setStaffActiveAction.bind(null, u.id, !u.isActive)}>
                      {u.isActive ? <Pause aria-hidden /> : <Play aria-hidden />}
                      <span className="max-sm:sr-only">{u.isActive ? t.common.deactivate : t.common.activate}</span>
                    </ActionButton>
                  )}
                </div>
                <details className="mt-1 rounded-md">
                  <summary className="cursor-pointer text-xs font-medium text-muted-foreground hover:text-foreground">
                    <KeyRound className="me-1 inline size-3.5" aria-hidden />
                    {t.settings.manage}
                  </summary>
                  <div className="mt-2 grid gap-3 rounded-md bg-muted/40 p-3 sm:grid-cols-2">
                    {u.id !== me.id && (
                      <ActionForm action={setStaffRoleAction.bind(null, u.id)} reset={false} successMessage={t.settings.roleSaved} className="grid content-start gap-2">
                        <Field label={t.settings.changeRole}>
                          <NativeSelect name="role" defaultValue={u.role}>
                            {Object.values(Role).map((r) => (
                              <option key={r} value={r}>
                                {t.roles[r]}
                              </option>
                            ))}
                          </NativeSelect>
                        </Field>
                        <Button type="submit" size="sm" variant="secondary">
                          {t.settings.saveRole}
                        </Button>
                      </ActionForm>
                    )}
                    <ActionForm action={setStaffPasswordAction.bind(null, u.id)} successMessage={t.settings.passwordSaved} className="grid content-start gap-2">
                      <Field label={t.settings.newPassword}>
                        <Input name="password" type="password" required minLength={8} autoComplete="new-password" dir="ltr" />
                      </Field>
                      <Field label={t.settings.confirmPassword}>
                        <Input name="confirm" type="password" required minLength={8} autoComplete="new-password" dir="ltr" />
                      </Field>
                      <Button type="submit" size="sm" variant="secondary">
                        {t.settings.setPassword}
                      </Button>
                      <p className="text-xs text-muted-foreground">{t.settings.passwordHint}</p>
                    </ActionForm>
                    {u.id !== me.id && (
                      <div className="flex flex-wrap items-center gap-2 border-t pt-3 sm:col-span-2">
                        <p className="flex-1 text-xs text-muted-foreground">{t.settings.deleteStaffHint}</p>
                        <ActionButton
                          size="sm"
                          variant="destructive"
                          action={deleteStaffAction.bind(null, u.id)}
                          confirm={fmt(t.settings.deleteStaffConfirm, { name: u.name })}
                          successMessage={t.settings.staffDeleted}
                        >
                          <Trash2 aria-hidden />
                          {t.settings.deleteStaff}
                        </ActionButton>
                      </div>
                    )}
                  </div>
                </details>
              </li>
            ))}
          </ul>
          <details className="rounded-md border border-dashed p-3">
            <summary className="cursor-pointer text-sm font-medium">{t.settings.newStaff}</summary>
            <ActionForm action={createStaffAction} className="mt-3 grid gap-3 sm:grid-cols-2">
              <Field label={t.common.name}>
                <Input name="name" required />
              </Field>
              <Field label={t.common.phone}>
                <Input name="phone" dir="ltr" />
              </Field>
              <Field label={t.common.email}>
                <Input name="email" type="email" required dir="ltr" />
              </Field>
              <Field label={t.settings.role}>
                <NativeSelect name="role" defaultValue="MECHANIC">
                  {Object.values(Role).map((r) => (
                    <option key={r} value={r}>
                      {t.roles[r]}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
              <Field label={t.settings.password} className="sm:col-span-2">
                <Input name="password" type="password" required minLength={8} autoComplete="new-password" dir="ltr" />
              </Field>
              <div className="sm:col-span-2">
                <Button type="submit">{t.common.create}</Button>
              </div>
            </ActionForm>
          </details>
        </Card>
      </div>

      <Card>
        <CardTitle>{t.settings.packages}</CardTitle>
        {packages.length === 0 && <p className="mb-3 text-sm text-muted-foreground">{t.settings.noPackages}</p>}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {packages.map((pkg) => {
            const estimate = pkg.lines.reduce(
              (sum, l) => sum + Math.round((l.quantityX100 * (l.unitPrice ?? (l.type === "LABOR" ? settings.laborRate : (l.part?.salePrice ?? 0)))) / 100),
              0,
            );
            return (
              <div key={pkg.id} className="rounded-md border p-3">
                <div className="mb-2 flex items-center gap-2">
                  <h3 className="font-medium">{pkg.name}</h3>
                  <span className="text-xs text-muted-foreground" dir="ltr">≈ {formatMoney(estimate, lang)} HT</span>
                  <ActionButton size="icon-sm" variant="ghost" className="ms-auto" aria-label={t.common.delete} action={archivePackageAction.bind(null, pkg.id)}>
                    <Trash2 className="size-4 text-muted-foreground" aria-hidden />
                  </ActionButton>
                </div>
                <ul className="mb-3 space-y-1 text-sm">
                  {pkg.lines.map((l) => (
                    <li key={l.id} className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">{t.lineType[l.type]}</span>
                      <span className="flex-1">
                        {l.description}
                        {l.part && <span className="ms-1 font-mono text-xs text-muted-foreground">{l.part.sku}</span>}
                      </span>
                      <span className="tabular-nums">× {formatQty(l.quantityX100, lang)}</span>
                      <ActionButton size="icon-sm" variant="ghost" aria-label={t.common.delete} action={removePackageLineAction.bind(null, l.id)}>
                        <Trash2 className="size-4 text-muted-foreground" aria-hidden />
                      </ActionButton>
                    </li>
                  ))}
                </ul>
                <ActionForm action={addPackageLineAction.bind(null, pkg.id)} silent className="grid gap-2 sm:grid-cols-[110px_minmax(0,1fr)_70px_90px_auto]">
                  <NativeSelect name="type" defaultValue="PART" aria-label={t.workOrders.type}>
                    <option value="PART">{t.lineType.PART}</option>
                    <option value="LABOR">{t.lineType.LABOR}</option>
                  </NativeSelect>
                  <div className="grid gap-2">
                    <NativeSelect name="partId" defaultValue="" aria-label={t.workOrders.partFromStock}>
                      <option value="">{t.workOrders.choosePart}</option>
                      {parts.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.sku} · {p.name}
                        </option>
                      ))}
                    </NativeSelect>
                    <Input name="description" placeholder={t.workOrders.description} aria-label={t.workOrders.description} />
                  </div>
                  <Input name="quantity" required defaultValue="1" inputMode="decimal" dir="ltr" aria-label={t.common.quantity} />
                  <Input name="unitPrice" inputMode="decimal" dir="ltr" placeholder="DT" aria-label={t.common.unitPrice} />
                  <Button type="submit" size="sm" variant="secondary">
                    {t.settings.addPackageLine}
                  </Button>
                </ActionForm>
                <p className="mt-1 text-xs text-muted-foreground">{t.settings.packageLineHint}</p>
              </div>
            );
          })}
        </div>

        <ActionForm action={createPackageAction} className="mt-4 flex flex-wrap items-end gap-2">
          <Field label={t.settings.packageName} className="min-w-60 flex-1">
            <Input name="name" required placeholder="Vidange 5W30" />
          </Field>
          <Button type="submit">{t.settings.newPackage}</Button>
        </ActionForm>
      </Card>
      <BookingSettings t={t} lang={lang} settings={settings} services={bookableServices} />
      <EmailSettings t={t} defaultTo={me.email} />
    </div>
  );
}
