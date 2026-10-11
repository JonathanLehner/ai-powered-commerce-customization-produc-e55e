"use client";

import { useTranslations } from "next-intl";
import { useFormStatus } from "react-dom";
import { changeMemberRole, removeMember } from "@/app/actions/team";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { StoreRole } from "@/lib/types";

const ROLES: StoreRole[] = ["store_admin", "catalog_manager", "order_manager", "viewer"];

export function MemberRoleForm({
  storeId,
  membershipId,
  name,
  role,
}: {
  storeId: string;
  membershipId: string;
  name: string;
  role: StoreRole;
}) {
  const t = useTranslations("team");
  const roles = useTranslations("roles");
  return (
    <form action={changeMemberRole} className="flex items-center gap-2">
      <input type="hidden" name="storeId" value={storeId} />
      <input type="hidden" name="membershipId" value={membershipId} />
      <Label htmlFor={`role-${membershipId}`} className="sr-only">
        {t("roleFor", { name })}
      </Label>
      <Select name="role" defaultValue={role}>
        <SelectTrigger id={`role-${membershipId}`} size="sm" className="w-48">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {ROLES.map((option) => (
            <SelectItem key={option} value={option}>
              {roles(option)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button type="submit" variant="outline" size="sm">
        {t("update")}
      </Button>
    </form>
  );
}

/**
 * Taking someone off a store cuts their access to it, so it is confirmed in an
 * alert dialog. The dialog's own action submits this form by id, because the
 * dialog is rendered in a portal outside it.
 */
export function RemoveMemberForm({
  storeId,
  membershipId,
  name,
}: {
  storeId: string;
  membershipId: string;
  name: string;
}) {
  const formId = `remove-member-${membershipId}`;

  return (
    <form id={formId} action={removeMember}>
      <input type="hidden" name="storeId" value={storeId} />
      <input type="hidden" name="membershipId" value={membershipId} />
      <RemoveDialog formId={formId} name={name} />
    </form>
  );
}

function RemoveDialog({ formId, name }: { formId: string; name: string }) {
  const { pending } = useFormStatus();
  const t = useTranslations("team");
  const common = useTranslations("common");

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button type="button" variant="destructive" size="sm" disabled={pending}>
          {pending ? common("working") : t("remove")}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("removeTitle")}</AlertDialogTitle>
          <AlertDialogDescription>
            {t("removeBody", { name })}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel />
          <AlertDialogAction type="submit" form={formId} variant="destructive" disabled={pending}>
            {t("remove")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
