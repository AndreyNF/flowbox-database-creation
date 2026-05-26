import { useEffect, useState, useCallback } from "react";
import { adminGet, adminPost } from "@/lib/adminApi";
import {
  Loader, ErrMsg, SectionHdr, Card, Th, Td, EmptyRow,
  PriBtn, SecBtn, fmt, fmtDate,
} from "./shared";
import Icon from "@/components/ui/icon";

type TabType = "orders" | "transactions";

interface Row { [key: string]: unknown; }

export default function AdminArchive() {
  const [tab, setTab]         = useState<TabType>("orders");
  const [rows, setRows]       = useState<Row[]>([]);
  const [companies, setCompanies] = useState<{id:string;name:string}[]>([]);
  const [oldClaims, setOldClaims] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr]         = useState("");
  const [cFilter, setCFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo]   = useState("");
  const [deleting, setDeleting] = useState("");

  const load = useCallback(() => {
    setLoading(true);
    const ex: Record<string,string> = { what: tab };
    if (cFilter)  ex.company_id = cFilter;
    if (dateFrom) ex.date_from  = dateFrom;
    if (dateTo)   ex.date_to    = dateTo;
    adminGet("archive", ex)
      .then(d => {
        setRows(d.rows || []);
        setCompanies(d.companies || []);
        setOldClaims(d.old_claims_with_photos || []);
      })
      .catch((e: Error) => setErr(e.message))
      .finally(() => setLoading(false));
  }, [tab, cFilter, dateFrom, dateTo]);

  useEffect(() => { load(); }, [load]);

  async function deletePhotos(claimId: string) {
    setDeleting(claimId);
    try {
      await adminPost("delete_claim_photos", { claim_id: claimId });
      setOldClaims(v => v.filter(c => c.id !== claimId));
    } catch(e:unknown) { setErr((e as Error).message); }
    finally { setDeleting(""); }
  }

  function downloadCsv() {
    if (rows.length === 0) return;
    const keys = Object.keys(rows[0]);
    const lines = [
      keys.join(";"),
      ...rows.map(r => keys.map(k => String(r[k] ?? "").replace(/;/g, ",")))
            .map(r => r.join(";")),
    ];
    const blob = new Blob(["\ufeff" + lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href     = url;
    a.download = `archive_${tab}_${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const ORDER_COLS  = ["order_number","company_name","product_name","quantity","total_amount","order_status","created_at"] as const;
  const TX_COLS     = ["company_name","type","amount","status","created_at"] as const;
  const cols = tab === "orders" ? ORDER_COLS : TX_COLS;

  const COL_LABELS: Record<string,string> = {
    order_number:"Номер", company_name:"Компания", product_name:"Товар",
    quantity:"Кол-во", total_amount:"Сумма", order_status:"Статус",
    created_at:"Дата", type:"Тип", amount:"Сумма", status:"Статус",
  };

  return (
    <div className="space-y-5 animate-fade-in">
      <SectionHdr
        title="Архив"
        sub="Данные старше 6 месяцев"
        action={
          <PriBtn onClick={downloadCsv} label="Скачать CSV" icon="Download" disabled={rows.length === 0} />
        }
      />
      {err && <ErrMsg msg={err} />}

      {/* Табы */}
      <div className="flex gap-1 border-b border-border">
        {(["orders","transactions"] as TabType[]).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2 text-xs font-medium transition-colors border-b-2 -mb-px ${
              tab === t ? "border-ring text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
            }`}>
            {t === "orders" ? "Заказы" : "Транзакции"}
          </button>
        ))}
      </div>

      {/* Фильтры */}
      <div className="flex gap-2 flex-wrap">
        <select value={cFilter} onChange={e => setCFilter(e.target.value)}
          className="px-3 py-1.5 text-xs rounded-lg border border-border bg-secondary text-foreground focus:outline-none">
          <option value="">Все клиенты</option>
          {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
          className="px-3 py-1.5 text-xs rounded-lg border border-border bg-secondary text-foreground focus:outline-none" />
        <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
          className="px-3 py-1.5 text-xs rounded-lg border border-border bg-secondary text-foreground focus:outline-none" />
        <SecBtn onClick={load} label="Применить" icon="Filter" />
      </div>

      {/* Таблица */}
      {loading ? <Loader /> : (
        <Card>
          <table className="w-full">
            <thead>
              <tr className="border-b border-border">
                {cols.map(c => <Th key={c} c={COL_LABELS[c] || c} />)}
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && <EmptyRow cols={cols.length} text="Нет архивных данных" />}
              {rows.map((r, i) => (
                <tr key={i} className="border-b border-border last:border-0 hover:bg-secondary/30">
                  {cols.map(c => (
                    <Td key={c}
                      mono={["total_amount","amount","quantity"].includes(c)}
                      c={
                        c === "total_amount" || c === "amount" ? fmt(r[c] as number) :
                        c === "created_at" ? fmtDate(r[c] as string) :
                        String(r[c] ?? "—")
                      }
                    />
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {/* Фотоотчёты рекламаций */}
      {oldClaims.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Icon name="Image" size={15} className="text-muted-foreground" />
            <span className="text-sm font-medium text-foreground">Фотоотчёты старых рекламаций</span>
            <span className="text-xs text-muted-foreground">({oldClaims.length} рекл. с фото &gt;1 года)</span>
          </div>
          <Card>
            <table className="w-full">
              <thead>
                <tr className="border-b border-border">
                  <Th c="Номер" /><Th c="Клиент" /><Th c="Закрыта" /><Th c="Фото" /><Th c="" />
                </tr>
              </thead>
              <tbody>
                {oldClaims.map(c => (
                  <tr key={c.id as string} className="border-b border-border last:border-0 hover:bg-secondary/30">
                    <Td mono c={c.claim_number as string} />
                    <Td c={c.company_name as string} />
                    <Td c={fmtDate(c.closed_at as string)} />
                    <Td c={<span className="text-amber-400">{c.photos_count as number} шт.</span>} />
                    <Td c={
                      <button
                        onClick={() => { if (confirm("Удалить фотоотчёты по рекламации?")) deletePhotos(c.id as string); }}
                        disabled={deleting === c.id}
                        className="flex items-center gap-1.5 px-2.5 py-1 text-[11px] rounded border border-rose-400/30 text-rose-400 hover:bg-rose-400/10 transition-all disabled:opacity-40"
                      >
                        {deleting === c.id
                          ? <Icon name="Loader2" size={11} className="animate-spin" />
                          : <Icon name="Trash2" size={11} />}
                        Удалить фото
                      </button>
                    } />
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </div>
      )}
    </div>
  );
}
