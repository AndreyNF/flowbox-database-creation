import { useState } from "react";
import ManagerLayout, { type MgrSection } from "@/components/manager/ManagerLayout";
import MgrOverview from "@/components/manager/sections/MgrOverview";
import MgrClients from "@/components/manager/sections/MgrClients";
import MgrCatalog from "@/components/manager/sections/MgrCatalog";
import MgrOrders from "@/components/manager/sections/MgrOrders";
import MgrFinance from "@/components/manager/sections/MgrFinance";
import MgrClaims from "@/components/manager/sections/MgrClaims";
import MgrSuppliers from "@/components/manager/sections/MgrSuppliers";
import MgrLogistics from "@/components/manager/sections/MgrLogistics";
import MgrSupport from "@/components/manager/sections/MgrSupport";

export default function ManagerPortal() {
  const [section, setSection] = useState<MgrSection>("overview");
  const [pendingClientId, setPendingClientId] = useState<string | undefined>();
  const [pendingClaimId, setPendingClaimId] = useState<string | undefined>();

  function goClient(id: string) {
    setPendingClientId(id);
    setSection("clients");
  }
  function goClaim(id: string) {
    setPendingClaimId(id);
    setSection("claims");
  }
  function handleSection(s: MgrSection) {
    setSection(s);
    if (s !== "clients") setPendingClientId(undefined);
    if (s !== "claims") setPendingClaimId(undefined);
  }

  return (
    <ManagerLayout section={section} onSection={handleSection}>
      {section === "overview" && <MgrOverview onClientClick={goClient} onClaimClick={goClaim} />}
      {section === "clients" && <MgrClients initialClientId={pendingClientId} />}
      {section === "catalog" && <MgrCatalog />}
      {section === "orders" && <MgrOrders />}
      {section === "finance" && <MgrFinance />}
      {section === "claims" && <MgrClaims initialClaimId={pendingClaimId} />}
      {section === "suppliers" && <MgrSuppliers />}
      {section === "logistics" && <MgrLogistics />}
      {section === "support" && <MgrSupport />}
    </ManagerLayout>
  );
}
