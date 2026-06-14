import { useState } from "react";
import ClientLayout, { type ClientSection } from "@/components/client/ClientLayout";
import Overview from "@/components/client/sections/Overview";
import Catalog from "@/components/client/sections/Catalog";
import Calculator from "@/components/client/sections/Calculator";
import Orders from "@/components/client/sections/Orders";
import Finance from "@/components/client/sections/Finance";
import Payments from "@/components/client/sections/Payments";
import Claims from "@/components/client/sections/Claims";
import Settings from "@/components/client/sections/Settings";
import Support from "@/components/client/sections/Support";
import { getCurrentUser } from "@/lib/auth";

// company_id берётся из JWT-токена (поле company_id пользователя)
// Менеджер/админ может передать company_id через URL-параметр
const getCompanyId = () => {
  const params = new URLSearchParams(window.location.search);
  if (params.get("company_id")) return params.get("company_id")!;
  const user = getCurrentUser();
  return user?.company_id || "demo";
};

interface CalcProduct { id: string; trade_name: string; our_price: number; }

export default function ClientPortal() {
  const [section, setSection] = useState<ClientSection>("overview");
  const [pendingOrderId, setPendingOrderId] = useState<string | undefined>();
  const [calcProduct, setCalcProduct] = useState<CalcProduct | null>(null);
  const companyId = getCompanyId();
  const user = getCurrentUser();

  function goToOrder(orderId: string) {
    setPendingOrderId(orderId);
    setSection("orders");
  }

  function goToCalc(product: CalcProduct) {
    setCalcProduct(product);
    setSection("calculator");
  }

  function handleSection(s: ClientSection) {
    setSection(s);
    if (s !== "orders") setPendingOrderId(undefined);
    if (s !== "calculator") setCalcProduct(null);
  }

  return (
    <ClientLayout
      section={section}
      onSection={handleSection}
      companyName={user?.name || "Моя компания"}
    >
      {section === "overview" && (
        <Overview companyId={companyId} onOrderClick={goToOrder} />
      )}
      {section === "catalog" && (
        <Catalog companyId={companyId} onCalculator={goToCalc} />
      )}
      {section === "calculator" && (
        <Calculator initialProduct={calcProduct} />
      )}
      {section === "orders" && (
        <Orders companyId={companyId} initialOrderId={pendingOrderId} />
      )}
      {section === "payments" && (
        <Payments companyId={companyId} />
      )}
      {section === "finance" && (
        <Finance companyId={companyId} />
      )}
      {section === "claims" && (
        <Claims companyId={companyId} />
      )}
      {section === "settings" && (
        <Settings companyId={companyId} />
      )}
      {section === "support" && (
        <Support companyId={companyId} />
      )}
    </ClientLayout>
  );
}