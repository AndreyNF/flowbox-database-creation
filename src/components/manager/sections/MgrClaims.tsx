import { useEffect, useState, useCallback } from "react";
import { mgrGet, claimsApiGet, claimsApiPost } from "@/lib/managerApi";
import { ErrMsg, SectionHdr } from "../shared";
import Icon from "@/components/ui/icon";
import MgrClaimDetail from "./MgrClaimDetail";
import { MgrClaimCreateForm, MgrClaimsList, MgrClaimsWarehouse } from "./MgrClaimsListAndWarehouse";

interface Props { initialClaimId?: string; }

export default function MgrClaims({ initialClaimId }: Props) {
  // Список
  const [claims, setClaims]       = useState<Record<string, unknown>[]>([]);
  const [companies, setCompanies] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading]     = useState(true);
  const [err, setErr]             = useState("");
  const [stFilter, setStFilter]   = useState("");
  const [cFilter, setCFilter]     = useState("");
  const [typeFilter, setTypeFilter] = useState("");

  // Детали
  const [detail, setDetail]             = useState<Record<string, unknown> | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // Решение
  const [decision, setDecision]   = useState("");
  const [compAmount, setCompAmount] = useState("0");
  const [compType, setCompType]   = useState("money");
  const [saving, setSaving]       = useState(false);

  // Создание вручную
  const [createMode, setCreateMode] = useState(false);
  const [createCompany, setCreateCompany] = useState("");
  const [createType, setCreateType] = useState("defect");
  const [createDesc, setCreateDesc] = useState("");
  const [createLoading, setCreateLoading] = useState(false);

  // Фото
  const [uploadLoading, setUploadLoading] = useState(false);

  // Склад
  const [tab, setTab] = useState<"claims" | "warehouse">("claims");
  const [warehouseItems, setWarehouseItems] = useState<Record<string, unknown>[]>([]);
  const [whLoading, setWhLoading] = useState(false);
  const [whFilter, setWhFilter]   = useState("in_warehouse");
  const [whActionLoading, setWhActionLoading] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    const extra: Record<string, string> = {};
    if (stFilter) extra.status = stFilter;
    if (cFilter)  extra.company_id = cFilter;
    if (typeFilter) extra.type = typeFilter;
    mgrGet("claims", extra)
      .then(d => { setClaims(d.claims || []); setCompanies(d.companies || []); })
      .catch((e: Error) => setErr(e.message))
      .finally(() => setLoading(false));
  }, [stFilter, cFilter, typeFilter]);

  const loadWarehouse = useCallback(() => {
    setWhLoading(true);
    claimsApiGet("warehouse", { stock_status: whFilter, ...(cFilter ? { company_id: cFilter } : {}) })
      .then(d => setWarehouseItems(d.items || []))
      .catch((e: Error) => setErr(e.message))
      .finally(() => setWhLoading(false));
  }, [whFilter, cFilter]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (tab === "warehouse") loadWarehouse(); }, [tab, loadWarehouse]);
  useEffect(() => { if (initialClaimId) loadDetail(initialClaimId); }, [initialClaimId]);

  async function loadDetail(id: string) {
    setDetailLoading(true);
    try {
      const d = await mgrGet("claim_detail", { claim_id: id });
      setDetail(d.claim);
      setDecision(d.claim.decision || "");
      setCompAmount(String(d.claim.compensation_amount || 0));
      setCompType(d.claim.compensation_type || "money");
    } catch (e: Error) { setErr((e as Error).message); }
    finally { setDetailLoading(false); }
  }

  async function sendDecision() {
    if (!detail) return;
    setSaving(true);
    try {
      await claimsApiPost("mgr_update", {
        action: "send_decision", claim_id: detail.id,
        decision, compensation_amount: parseFloat(compAmount) || 0, compensation_type: compType,
      });
      loadDetail(detail.id as string); load();
    } catch (e: Error) { setErr((e as Error).message); }
    finally { setSaving(false); }
  }

  async function doAction(action: string) {
    if (!detail) return;
    await claimsApiPost("mgr_update", { action, claim_id: detail.id });
    loadDetail(detail.id as string); load();
  }

  async function handleFileUpload(files: FileList | null) {
    if (!files || !detail) return;
    setUploadLoading(true);
    setErr("");
    try {
      const urls: string[] = [];
      for (const file of Array.from(files)) {
        const reader = new FileReader();
        const b64 = await new Promise<string>((res, rej) => {
          reader.onload = () => res((reader.result as string).split(",")[1]);
          reader.onerror = rej;
          reader.readAsDataURL(file);
        });
        urls.push(`data:${file.type};base64,${b64}`);
      }
      await claimsApiPost("mgr_photos", { claim_id: detail.id, photos: urls });
      await loadDetail(detail.id as string);
    } catch (e: Error) { setErr((e as Error).message); }
    finally { setUploadLoading(false); }
  }

  async function createClaim() {
    if (!createCompany || !createDesc.trim()) { setErr("Заполните компанию и описание"); return; }
    setCreateLoading(true);
    try {
      await claimsApiPost("mgr_create", {
        company_id: createCompany, type: createType, description: createDesc,
      });
      setCreateMode(false); setCreateDesc(""); load();
    } catch (e: Error) { setErr((e as Error).message); }
    finally { setCreateLoading(false); }
  }

  async function warehouseAction(itemId: string, action: string) {
    setWhActionLoading(true);
    try {
      await claimsApiPost("warehouse_action", { item_id: itemId, action });
      loadWarehouse();
    } catch (e: Error) { setErr((e as Error).message); }
    finally { setWhActionLoading(false); }
  }

  // ── ДЕТАЛЬНЫЙ ВИД ──────────────────────────────────────────────────────────
  if (detail) {
    return (
      <MgrClaimDetail
        detail={detail}
        detailLoading={detailLoading}
        err={err}
        decision={decision}
        compAmount={compAmount}
        compType={compType}
        saving={saving}
        uploadLoading={uploadLoading}
        onBack={() => setDetail(null)}
        onDecisionChange={setDecision}
        onCompAmountChange={setCompAmount}
        onCompTypeChange={setCompType}
        onSendDecision={sendDecision}
        onAction={doAction}
        onFileUpload={handleFileUpload}
      />
    );
  }

  // ── СПИСОК / СКЛАД ──────────────────────────────────────────────────────────
  return (
    <div className="space-y-4 animate-fade-in">
      <SectionHdr
        title="Рекламации"
        sub={tab === "claims" ? `${claims.length} обращений` : `Физический товар на складе`}
        action={
          <div className="flex items-center gap-2">
            <button
              onClick={() => setCreateMode(v => !v)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
              style={{ background: "hsl(var(--cyan))", color: "hsl(var(--primary-foreground))" }}
            >
              <Icon name="Plus" size={13} />
              Создать
            </button>
          </div>
        }
      />

      {err && <ErrMsg msg={err} />}

      {/* Табы */}
      <div className="flex gap-1 border-b border-border">
        {(["claims", "warehouse"] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2 text-xs font-medium transition-colors border-b-2 -mb-px ${
              tab === t ? "border-ring text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
            }`}>
            {t === "claims" ? "Рекламации" : "Склад"}
          </button>
        ))}
      </div>

      {/* Создание вручную */}
      {createMode && (
        <MgrClaimCreateForm
          companies={companies}
          createCompany={createCompany}
          createType={createType}
          createDesc={createDesc}
          createLoading={createLoading}
          onCompanyChange={setCreateCompany}
          onTypeChange={setCreateType}
          onDescChange={setCreateDesc}
          onSubmit={createClaim}
          onCancel={() => setCreateMode(false)}
        />
      )}

      {/* Рекламации */}
      {tab === "claims" && (
        <MgrClaimsList
          claims={claims}
          companies={companies}
          loading={loading}
          stFilter={stFilter}
          typeFilter={typeFilter}
          cFilter={cFilter}
          onStFilterChange={setStFilter}
          onTypeFilterChange={setTypeFilter}
          onCFilterChange={setCFilter}
          onRowClick={loadDetail}
        />
      )}

      {/* Складские возвраты */}
      {tab === "warehouse" && (
        <MgrClaimsWarehouse
          warehouseItems={warehouseItems}
          companies={companies}
          whLoading={whLoading}
          whFilter={whFilter}
          cFilter={cFilter}
          whActionLoading={whActionLoading}
          onWhFilterChange={setWhFilter}
          onCFilterChange={setCFilter}
          onWarehouseAction={warehouseAction}
        />
      )}
    </div>
  );
}
