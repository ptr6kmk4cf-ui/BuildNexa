"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export function ConfirmSubmit({
  action,
  title,
  description,
  confirmLabel,
  triggerLabel,
  variant = "destructive",
  fields,
  disabled = false,
  onSubmit,
}: {
  action: (formData: FormData) => void | Promise<void>;
  title: string;
  description: string;
  confirmLabel: string;
  triggerLabel: string;
  variant?: "destructive" | "default";
  fields?: Record<string, string>;
  disabled?: boolean;
  onSubmit?: () => void;
}) {
  return (
    <Dialog>
      <DialogTrigger
        render={<Button type="button" variant={variant === "destructive" ? "destructive" : "default"} disabled={disabled}>{triggerLabel}</Button>}
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <form action={action} onSubmit={onSubmit}>
          {Object.entries(fields ?? {}).map(([name, value]) => (
            <input key={name} type="hidden" name={name} value={value} />
          ))}
          <DialogFooter>
            <DialogClose render={<Button type="button" variant="outline">Go back</Button>} />
            <Button type="submit" variant={variant === "destructive" ? "destructive" : "default"} disabled={disabled}>
              {confirmLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
