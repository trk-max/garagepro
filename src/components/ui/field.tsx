import * as React from "react";
import { cn } from "@/lib/utils";

const control =
  "w-full min-w-0 rounded-md border border-input bg-background px-3 text-sm shadow-xs outline-none transition-[color,box-shadow] placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50";

export function Field({ label, hint, className, children }: { label: string; hint?: string; className?: string; children: React.ReactNode }) {
  return (
    <label className={cn("flex flex-col gap-1.5 text-sm", className)}>
      <span className="font-medium">{label}</span>
      {children}
      {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
    </label>
  );
}

export function NativeSelect({ className, ...props }: React.ComponentProps<"select">) {
  return <select className={cn(control, "h-9 py-1", className)} {...props} />;
}

export function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return <textarea className={cn(control, "min-h-20 py-2", className)} {...props} />;
}

export function Card({ className, ...props }: React.ComponentProps<"section">) {
  return <section className={cn("rounded-lg border bg-card p-4 sm:p-5", className)} {...props} />;
}

export function CardTitle({ className, ...props }: React.ComponentProps<"h2">) {
  return <h2 className={cn("label-tech mb-4", className)} {...props} />;
}

export function PageHeader({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <header className="mb-6 flex flex-wrap items-center gap-3 border-b pb-4">
      <h1 className="f-display text-xl sm:text-2xl">{title}</h1>
      <div className="ms-auto flex flex-wrap items-center gap-2">{children}</div>
    </header>
  );
}

export function Table({ className, ...props }: React.ComponentProps<"table">) {
  return (
    <div className="overflow-x-auto rounded-lg border bg-card">
      <table className={cn("w-full text-sm [&_tbody_tr]:transition-colors [&_tbody_tr:hover]:bg-accent/50", className)} {...props} />
    </div>
  );
}

export function Th({ className, ...props }: React.ComponentProps<"th">) {
  return <th className={cn("label-tech border-b bg-muted/40 px-3 py-2.5 text-start", className)} {...props} />;
}

export function Td({ className, ...props }: React.ComponentProps<"td">) {
  return <td className={cn("border-b px-3 py-2.5 align-middle", className)} {...props} />;
}
