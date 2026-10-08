"use client";

import { addSupplier, saveSupplierRegions } from "@/app/actions/admin";
import { ActionForm } from "@/components/forms";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { Supplier } from "@/lib/types";
import { REGION_OPTIONS } from "@/lib/util";

/** The chip a region checkbox sits in, shared by both forms on this page. */
const REGION_CHIP =
  "flex cursor-pointer items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs font-normal hover:bg-muted has-[:checked]:border-primary has-[:checked]:bg-primary/5";

export function SupplierRegionsForm({ supplier }: { supplier: Supplier }) {
  return (
    <ActionForm
      action={saveSupplierRegions}
      submitLabel="Save regions"
      submitVariant="outline"
      submitSize="sm"
      hidden={{ supplierId: supplier.id }}
    >
      {(state) => (
        <>
          <fieldset>
            <legend className="text-xs leading-none font-medium text-foreground select-none">
              Fulfilment regions
            </legend>
            <div className="mt-2 flex flex-wrap gap-2">
              {REGION_OPTIONS.map((region) => (
                <Label key={region} className={REGION_CHIP}>
                  <Checkbox
                    name="regions"
                    value={region}
                    defaultChecked={supplier.regions.includes(region)}
                    className="size-3.5"
                  />
                  {region}
                </Label>
              ))}
            </div>
            {state.field === "regions" ? (
              <p className="mt-1.5 text-xs text-destructive">At least one region is required.</p>
            ) : null}
          </fieldset>
          <div className="mt-3 grid content-start gap-1.5">
            <Label htmlFor={`notes-${supplier.id}`} className="text-xs">
              Operational notes
            </Label>
            <Textarea id={`notes-${supplier.id}`} name="notes" rows={2} defaultValue={supplier.notes} />
          </div>
        </>
      )}
    </ActionForm>
  );
}

export function AddSupplierForm() {
  return (
    <Card asChild>
      <ActionForm
        action={addSupplier}
        submitLabel="Add for review"
        actionsClassName="px-(--card-spacing)"
      >
        {(state) => (
          <>
            <CardHeader>
              <CardTitle asChild>
                <h2>Add a supplier</h2>
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                New suppliers land in review. Stores cannot source from them until they are approved.
              </p>
            </CardHeader>

            <CardContent>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="grid content-start gap-1.5">
                  <Label htmlFor="supplier-name">Name</Label>
                  <Input
                    id="supplier-name"
                    name="name"
                    required
                    aria-invalid={state.field === "name" ? true : undefined}
                  />
                </div>
                <div className="grid content-start gap-1.5">
                  <Label htmlFor="supplier-website">Website</Label>
                  <Input
                    id="supplier-website"
                    name="website"
                    placeholder="https://"
                    required
                    aria-invalid={state.field === "website" ? true : undefined}
                  />
                </div>
                <div className="grid content-start gap-1.5">
                  <Label htmlFor="supplier-kind">Type</Label>
                  <Select name="kind" defaultValue="print_on_demand">
                    <SelectTrigger id="supplier-kind" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="print_on_demand">Print on demand</SelectItem>
                      <SelectItem value="manufacturer">Manufacturer</SelectItem>
                      <SelectItem value="sourcing_marketplace">Sourcing marketplace</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid content-start gap-1.5">
                  <Label htmlFor="supplier-integration">Integration</Label>
                  <Select name="integration" defaultValue="api">
                    <SelectTrigger id="supplier-integration" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="api">Order API</SelectItem>
                      <SelectItem value="manual">Manual purchase orders</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Manual suppliers flag every order for a human.
                  </p>
                </div>
                <div className="grid content-start gap-1.5 sm:col-span-2">
                  <Label htmlFor="supplier-summary">What is this supplier for?</Label>
                  <Textarea
                    id="supplier-summary"
                    name="summary"
                    rows={3}
                    required
                    minLength={20}
                    aria-invalid={state.field === "summary" ? true : undefined}
                  />
                </div>
                <fieldset className="sm:col-span-2">
                  <legend className="text-sm leading-none font-medium text-foreground select-none">
                    Fulfilment regions
                  </legend>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {REGION_OPTIONS.map((region) => (
                      <Label key={region} className={REGION_CHIP}>
                        <Checkbox name="regions" value={region} className="size-3.5" />
                        {region}
                      </Label>
                    ))}
                  </div>
                </fieldset>
              </div>
            </CardContent>
          </>
        )}
    </ActionForm>
    </Card>
  );
}
