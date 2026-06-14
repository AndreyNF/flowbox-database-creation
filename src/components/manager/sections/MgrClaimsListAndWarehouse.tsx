import { Loader, Card, Th, Td, EmptyRow, Badge, CLAIM_STATUS, CLAIM_TYPE, fmt, fmtDate, Select } from "../shared";
import Icon from "@/components/ui/icon";
import { CLAIM_TYPES_CREATE, WAREHOUSE_STATUS } from "./MgrClaimsTypes";

// ── Create form ─────────────────────────────────────────────────────────────

interface CreateFormProps {
  companies: { id: string; name: string }[];
  createCompany: string;
  createType: string;
  createDesc: string;
  createLoading: boolean;
  onCompanyChange: (v: string) => void;
  onTypeChange: (v: string) => void;
  onDescChange: (v: string) => void;
  onSubmit: () => void;
  onCancel: () => void;
}

export function MgrClaimCreateForm({
  companies, createCompany, createType, createDesc, createLoading,
  onCompanyChange, onTypeChange, onDescChange, onSubmit, onCancel,
}: CreateFormProps) {
  return (
    <Card className="p-5 animate-fade-in">
      <div className="flex items-center justify-between mb-4">
        <div className="text-sm font-medium text-foreground">Создать рекламацию</div>
        <button onClick={onCancel} className="text-muted-foreground hover:text-foreground">
          <Icon name="X" size={15} />
        </button>
      </div>
      <div className="grid grid-cols-2 gap-3 mb-3">
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">Клиент *</label>
          <select value={createCompany} onChange={e => onCompanyChange(e.target.value)}
            className="w-full px-3 py-2 text-xs rounded-lg border border-border bg-secondary text-foreground focus:outline-none">
            <option value="">— Выберите —</option>
            {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">Тип</label>
          <select value={createType} onChange={e => onTypeChange(e.target.value)}
            className="w-full px-3 py-2 text-xs rounded-lg border border-border bg-secondary text-foreground focus:outline-none">
            {CLAIM_TYPES_CREATE.map(t => <option key={t} value={t}>{CLAIM_TYPE[t] || t}</option>)}
          </select>
        </div>
      </div>
      <div className="mb-3">
        <label className="text-xs text-muted-foreground mb-1 block">Описание *</label>
        <textarea value={createDesc} onChange={e => onDescChange(e.target.value)} rows={3}
          className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-secondary text-foreground focus:outline-none resize-none" />
      </div>
      <div className="flex gap-2">
        <button onClick={onSubmit} disabled={createLoading || !createCompany || !createDesc.trim()}
          className="flex items-center gap-2 px-4 py-2 text-xs rounded-lg font-medium disabled:opacity-40"
          style={{ background: "hsl(var(--cyan))", color: "hsl(var(--primary-foreground))" }}>
          {createLoading ? <Icon name="Loader2" size={13} className="animate-spin" /> : <Icon name="Plus" size={13} />}
          Создать
        </button>
        <button onClick={onCancel}
          className="px-4 py-2 text-xs rounded-lg border border-border text-muted-foreground hover:text-foreground">
          Отмена
        </button>
      </div>
    </Card>
  );
}

// ── Claims list ──────────────────────────────────────────────────────────────

interface ClaimsListProps {
  claims: Record<string, unknown>[];
  companies: { id: string; name: string }[];
  loading: boolean;
  stFilter: string;
  typeFilter: string;
  cFilter: string;
  onStFilterChange: (v: string) => void;
  onTypeFilterChange: (v: string) => void;
  onCFilterChange: (v: string) => void;
  onRowClick: (id: string) => void;
}

export function MgrClaimsList({
  claims, companies, loading,
  stFilter, typeFilter, cFilter,
  onStFilterChange, onTypeFilterChange, onCFilterChange,
  onRowClick,
}: ClaimsListProps) {
  return (
    <>
      {/* Фильтры */}
      <div className="flex gap-2 flex-wrap">
        <Select value={stFilter} onChange={onStFilterChange} className="text-xs">
          <option value="">Все статусы</option>
          {Object.entries(CLAIM_STATUS).map(([v, s]) => <option key={v} value={v}>{s.l}</option>)}
        </Select>
        <Select value={typeFilter} onChange={onTypeFilterChange} className="text-xs">
          <option value="">Все типы</option>
          {Object.entries(CLAIM_TYPE).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </Select>
        <Select value={cFilter} onChange={onCFilterChange} className="text-xs">
          <option value="">Все клиенты</option>
          {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </Select>
      </div>

      {loading ? <Loader /> : (
        <Card>
          <table className="w-full">
            <thead>
              <tr className="border-b border-border">
                <Th c="Номер" /><Th c="Клиент" /><Th c="Тип" /><Th c="Статус" /><Th c="Дата" /><Th c="Компенсация" />
              </tr>
            </thead>
            <tbody>
              {claims.length === 0 && <EmptyRow cols={6} text="Рекламаций нет" />}
              {claims.map(c => (
                <tr key={c.id as string} onClick={() => onRowClick(c.id as string)}
                  className="border-b border-border last:border-0 hover:bg-secondary/40 cursor-pointer transition-colors">
                  <Td c={<span className="font-mono text-[11px]">{c.claim_number as string}</span>} />
                  <Td c={c.company_name as string} />
                  <Td c={CLAIM_TYPE[c.type as string] || c.type as string} />
                  <Td c={<Badge map={CLAIM_STATUS} k={c.status as string} />} />
                  <Td c={fmtDate(c.created_at as string)} />
                  <Td c={
                    (c.compensation_amount as number) > 0
                      ? <span className="text-green-400 font-mono">{fmt(c.compensation_amount as number)}</span>
                      : <span className="text-muted-foreground">—</span>
                  } />
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </>
  );
}

// ── Warehouse tab ────────────────────────────────────────────────────────────

interface WarehouseProps {
  warehouseItems: Record<string, unknown>[];
  companies: { id: string; name: string }[];
  whLoading: boolean;
  whFilter: string;
  cFilter: string;
  whActionLoading: boolean;
  onWhFilterChange: (v: string) => void;
  onCFilterChange: (v: string) => void;
  onWarehouseAction: (itemId: string, action: string) => void;
}

export function MgrClaimsWarehouse({
  warehouseItems, companies, whLoading,
  whFilter, cFilter, whActionLoading,
  onWhFilterChange, onCFilterChange, onWarehouseAction,
}: WarehouseProps) {
  return (
    <>
      <div className="flex gap-2 flex-wrap">
        <Select value={whFilter} onChange={onWhFilterChange} className="text-xs">
          <option value="all">Все статусы</option>
          {Object.entries(WAREHOUSE_STATUS).map(([v, s]) => <option key={v} value={v}>{s.l}</option>)}
        </Select>
        <Select value={cFilter} onChange={onCFilterChange} className="text-xs">
          <option value="">Все клиенты</option>
          {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </Select>
      </div>

      {whLoading ? <Loader /> : (
        <Card>
          <table className="w-full">
            <thead>
              <tr className="border-b border-border">
                <Th c="Товар" /><Th c="Клиент" /><Th c="Рекламация" /><Th c="Состояние" /><Th c="Статус" /><Th c="Действия" />
              </tr>
            </thead>
            <tbody>
              {warehouseItems.length === 0 && <EmptyRow cols={6} text="Нет товаров на складе" />}
              {warehouseItems.map(item => {
                const st = WAREHOUSE_STATUS[item.stock_status as string] || { l: item.stock_status as string, c: "text-muted-foreground" };
                const isActionable = (item.stock_status as string) === "in_warehouse";
                return (
                  <tr key={item.id as string} className="border-b border-border last:border-0">
                    <Td c={
                      <div>
                        <div className="font-medium">{item.trade_name as string}</div>
                        <div className="text-[10px] text-muted-foreground font-mono">{item.supplier_article as string}</div>
                      </div>
                    } />
                    <Td c={item.company_name as string || "—"} />
                    <Td c={<span className="font-mono text-[11px]">{item.claim_number as string || "—"}</span>} />
                    <Td c={
                      <span className={`text-xs ${(item.condition as string) === "damaged" ? "text-rose-400" : "text-green-400"}`}>
                        {(item.condition as string) === "whole" ? "Целый" :
                         (item.condition as string) === "damaged" ? "Повреждён" : "Неизвестно"}
                      </span>
                    } />
                    <Td c={<span className={`text-xs font-medium ${st.c}`}>{st.l}</span>} />
                    <Td c={
                      isActionable ? (
                        <div className="flex gap-1.5">
                          <button
                            onClick={() => onWarehouseAction(item.id as string, "return_to_sale")}
                            disabled={whActionLoading}
                            className="px-2.5 py-1 text-[11px] rounded border border-green-400/30 text-green-400 hover:bg-green-400/10 transition-all disabled:opacity-40"
                          >
                            В продажу
                          </button>
                          <button
                            onClick={() => onWarehouseAction(item.id as string, "return_to_supplier")}
                            disabled={whActionLoading}
                            className="px-2.5 py-1 text-[11px] rounded border border-violet-400/30 text-violet-400 hover:bg-violet-400/10 transition-all disabled:opacity-40"
                          >
                            Поставщику
                          </button>
                          <button
                            onClick={() => onWarehouseAction(item.id as string, "write_off")}
                            disabled={whActionLoading}
                            className="px-2.5 py-1 text-[11px] rounded border border-border text-muted-foreground hover:text-foreground transition-all disabled:opacity-40"
                          >
                            Списать
                          </button>
                        </div>
                      ) : <span className="text-xs text-muted-foreground">—</span>
                    } />
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}
    </>
  );
}
