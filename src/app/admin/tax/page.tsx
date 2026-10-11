import { getTranslations } from "next-intl/server";
import { deleteTaxBracket } from "@/app/actions/admin";
import { Badge, PageHeader } from "@/components/ui";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { COLLECTIONS, listTaxBrackets } from "@/lib/data";
import { db } from "@/lib/mongo";
import { EditBracketForm, NewBracketForm } from "./TaxForms";

export default async function AdminTaxPage() {
  const brackets = await listTaxBrackets();
  const usage = await Promise.all(
    brackets.map(async (bracket) => ({
      id: bracket.id,
      count: await db.count(COLLECTIONS.storeProducts, { taxBracketId: bracket.id }),
    })),
  );
  const usageById = new Map(usage.map((u) => [u.id, u.count]));

  const pages = await getTranslations("pages.admin");
  return (
    <div className="space-y-6">
      <PageHeader
        title={pages("taxTitle")}
        description={pages("taxDescription")}
      />


      <ul className="space-y-4">
        {brackets.map((bracket) => {
          const inUse = usageById.get(bracket.id) ?? 0;
          return (
            <Card asChild key={bracket.id}>
            <li>
              <CardHeader className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <CardTitle asChild>
                      <h2>{bracket.name}</h2>
                    </CardTitle>
                    <Badge tone="brand">{bracket.rate}%</Badge>
                    <Badge tone="neutral">{bracket.code}</Badge>
                  </div>
                  <p className="mt-1.5 max-w-2xl text-sm text-muted-foreground">{bracket.description}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Used by {inUse} product{inUse === 1 ? "" : "s"} · {bracket.regions.join(", ")}
                  </p>
                </div>
                {inUse === 0 ? (
                  <form action={deleteTaxBracket}>
                    <input type="hidden" name="bracketId" value={bracket.id} />
                    <Button type="submit" variant="destructive" size="sm">
                      Delete
                    </Button>
                  </form>
                ) : (
                  <Badge tone="amber">In use</Badge>
                )}
              </CardHeader>
              <CardContent>
                <Separator className="mb-4" />
                <EditBracketForm bracket={bracket} />
              </CardContent>
            </li>
            </Card>
          );
        })}
      </ul>

      <NewBracketForm />
    </div>
  );
}
