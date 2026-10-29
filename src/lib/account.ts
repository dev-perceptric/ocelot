// What deleting an account does to the companies someone belongs to. Plain function, so tests can load it.

export type Membership = { orgId: string; name: string; role: "owner" | "admin" | "member"; members: number; owners: number };

export function deletionPlan(memberships: Membership[]) {
  // The only owner of a company that has other people can't leave it ownerless.
  const blockers = memberships.filter((m) => m.role === "owner" && m.owners === 1 && m.members > 1);
  // A company with nobody else in it goes with the account: there's no one left to run it.
  const companiesToDelete = memberships.filter((m) => m.members === 1);
  return { blockers, companiesToDelete };
}
