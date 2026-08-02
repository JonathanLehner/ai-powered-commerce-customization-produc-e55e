import { changeMemberRole, removeMember, resendInvite } from "@/app/actions/team";
import { Badge, Callout, PageHeader } from "@/components/ui";
import { getAgency, listMemberships, listUsers } from "@/lib/data";
import { requireStoreAccess } from "@/lib/session";
import { STORE_ROLE_DESCRIPTIONS, STORE_ROLE_LABELS, type StoreRole } from "@/lib/types";
import { formatDate } from "@/lib/util";
import { InviteForm } from "./InviteForm";

const ROLES: StoreRole[] = ["store_admin", "catalog_manager", "order_manager", "viewer"];

export default async function TeamPage({ params }: { params: Promise<{ storeId: string }> }) {
  const { storeId } = await params;
  const { store } = await requireStoreAccess(storeId, "store.team");
  const [memberships, users, agency] = await Promise.all([
    listMemberships(storeId),
    listUsers(),
    getAgency(store.agencyId),
  ]);

  const agencyAdmins = users.filter(
    (u) => u.agencyId === store.agencyId && u.platformRole === "agency_admin",
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Who can work on this store"
        description="Roles are per store. Everyone outside the agency needs an explicit invitation."
      />

      <section className="card p-5">
        <h2 className="text-base font-semibold text-ink">Agency administrators</h2>
        <p className="mt-1 text-sm text-muted">
          Inherited from {agency?.name ?? "the agency"} — they hold store administrator rights everywhere in
          this agency and cannot be removed from a single store.
        </p>
        <ul className="mt-4 divide-y divide-line">
          {agencyAdmins.map((admin) => (
            <li key={admin.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-ink">{admin.name}</p>
                <p className="truncate text-xs text-muted">
                  {admin.email} · {admin.title}
                </p>
              </div>
              <Badge tone="brand">Store administrator (agency)</Badge>
            </li>
          ))}
          {agencyAdmins.length === 0 ? (
            <li className="py-3 text-sm text-muted">This agency has no administrator account yet.</li>
          ) : null}
        </ul>
      </section>

      <section className="card p-5">
        <h2 className="text-base font-semibold text-ink">Invited members</h2>
        {memberships.length === 0 ? (
          <p className="mt-2 text-sm text-muted">
            Nobody has been invited to this store yet. Use the form below to add the first person.
          </p>
        ) : (
          <div className="mt-4 relative overflow-x-auto">
            <table className="w-full min-w-[46rem] text-left text-sm">
              <thead className="text-xs font-semibold uppercase tracking-wide text-muted">
                <tr>
                  <th scope="col" className="py-2 pr-3">Person</th>
                  <th scope="col" className="py-2 pr-3">Status</th>
                  <th scope="col" className="py-2 pr-3">Role</th>
                  <th scope="col" className="py-2 pr-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {memberships.map((member) => (
                  <tr key={member.id}>
                    <td className="py-3 pr-3">
                      <p className="font-medium text-ink">{member.name}</p>
                      <p className="text-xs text-muted">{member.email}</p>
                    </td>
                    <td className="py-3 pr-3">
                      <Badge tone={member.status === "active" ? "green" : "amber"}>
                        {member.status === "active" ? "Active" : "Invitation pending"}
                      </Badge>
                      <p className="mt-1 text-xs text-muted">
                        Invited {formatDate(member.invitedAt)} by {member.invitedBy}
                      </p>
                    </td>
                    <td className="py-3 pr-3">
                      <form action={changeMemberRole} className="flex items-center gap-2">
                        <input type="hidden" name="storeId" value={storeId} />
                        <input type="hidden" name="membershipId" value={member.id} />
                        <label htmlFor={`role-${member.id}`} className="sr-only">
                          Role for {member.name}
                        </label>
                        <select
                          id={`role-${member.id}`}
                          name="role"
                          defaultValue={member.role}
                          className="input mt-0 w-48 py-1.5 text-xs"
                        >
                          {ROLES.map((role) => (
                            <option key={role} value={role}>
                              {STORE_ROLE_LABELS[role]}
                            </option>
                          ))}
                        </select>
                        <button type="submit" className="btn-secondary btn-sm">
                          Update
                        </button>
                      </form>
                    </td>
                    <td className="py-3 pr-3">
                      <div className="flex justify-end gap-2">
                        {member.status === "invited" ? (
                          <form action={resendInvite}>
                            <input type="hidden" name="storeId" value={storeId} />
                            <input type="hidden" name="membershipId" value={member.id} />
                            <button type="submit" className="btn-ghost btn-sm">
                              Resend
                            </button>
                          </form>
                        ) : null}
                        <form action={removeMember}>
                          <input type="hidden" name="storeId" value={storeId} />
                          <input type="hidden" name="membershipId" value={member.id} />
                          <button type="submit" className="btn-danger btn-sm">
                            Remove
                          </button>
                        </form>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <InviteForm storeId={storeId} />

      <Callout tone="neutral" title="What each role can do">
        <ul className="mt-2 space-y-1.5">
          {ROLES.map((role) => (
            <li key={role} className="text-sm">
              <span className="font-medium text-ink">{STORE_ROLE_LABELS[role]}</span> —{" "}
              <span className="text-muted">{STORE_ROLE_DESCRIPTIONS[role]}</span>
            </li>
          ))}
        </ul>
      </Callout>
    </div>
  );
}
