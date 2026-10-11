"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { saveNotificationPrefs } from "@/app/actions/notifications";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "@/components/ui/sonner";
import {
  NOTIFICATION_TYPES,
  resolvePrefs,
  type NotificationChannels,
  type NotificationPrefs,
  type NotificationType,
} from "@/lib/notifications";

/** Where each event type goes for the signed-in person: in the app, by email, both or neither. */
export function NotificationSettings({
  open,
  onOpenChange,
  saved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  saved: NotificationPrefs | undefined;
}) {
  const t = useTranslations("notifications.settings");
  const common = useTranslations("common");
  const router = useRouter();
  const [prefs, setPrefs] = useState(() => resolvePrefs(saved));
  const [pending, startTransition] = useTransition();

  function set(type: NotificationType, channel: keyof NotificationChannels, value: boolean) {
    setPrefs((current) => ({ ...current, [type]: { ...current[type], [channel]: value } }));
  }

  function save() {
    if (pending) return;
    startTransition(async () => {
      const { ok } = await saveNotificationPrefs(prefs);
      if (!ok) {
        toast.error(t("failed"));
        return;
      }
      toast.success(t("saved"));
      onOpenChange(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-muted-foreground">
              <th className="py-2 font-medium">{t("event")}</th>
              <th className="w-20 py-2 text-center font-medium">{t("inApp")}</th>
              <th className="w-20 py-2 text-center font-medium">{t("email")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {NOTIFICATION_TYPES.map((type) => (
              <tr key={type}>
                <td className="py-2.5 pr-2 text-foreground">{t(`types.${type}`)}</td>
                {(["inApp", "email"] as const).map((channel) => (
                  <td key={channel} className="py-2.5 text-center">
                    <Checkbox
                      checked={prefs[type][channel]}
                      onCheckedChange={(value) => set(type, channel, value === true)}
                      disabled={pending}
                      aria-label={`${t(`types.${type}`)}: ${t(channel)}`}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        <p className="text-xs text-muted-foreground">{t("digestNote")}</p>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            {common("cancel")}
          </Button>
          <Button onClick={save} disabled={pending}>
            {pending ? common("saving") : t("save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
