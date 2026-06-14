import { useRef } from "react";
import { Loader, ErrMsg, Card, Badge, CLAIM_STATUS, CLAIM_TYPE, fmtDate } from "../shared";
import Icon from "@/components/ui/icon";
import { COMP_TYPES, COMP_LABELS } from "./MgrClaimsTypes";

interface Props {
  detail: Record<string, unknown>;
  detailLoading: boolean;
  err: string;
  decision: string;
  compAmount: string;
  compType: string;
  saving: boolean;
  uploadLoading: boolean;
  onBack: () => void;
  onDecisionChange: (v: string) => void;
  onCompAmountChange: (v: string) => void;
  onCompTypeChange: (v: string) => void;
  onSendDecision: () => void;
  onAction: (action: string) => void;
  onFileUpload: (files: FileList | null) => void;
}

export default function MgrClaimDetail({
  detail, detailLoading, err,
  decision, compAmount, compType, saving, uploadLoading,
  onBack, onDecisionChange, onCompAmountChange, onCompTypeChange,
  onSendDecision, onAction, onFileUpload,
}: Props) {
  const fileRef = useRef<HTMLInputElement>(null);

  const history    = (detail.history as { date: string; status: string; comment: string }[]) || [];
  const photos     = (detail.photos  as string[]) || [];
  const canSend    = !["closed", "agreed"].includes(detail.status as string);
  const isDisputed = detail.status === "disputed";

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center gap-3">
        <button onClick={onBack}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground">
          <Icon name="ArrowLeft" size={13} /> К списку
        </button>
        <span className="text-muted-foreground">/</span>
        <span className="text-sm font-medium text-foreground">{detail.claim_number as string}</span>
        <Badge map={CLAIM_STATUS} k={detail.status as string} />
      </div>

      {err && <ErrMsg msg={err} />}

      {detailLoading ? <Loader /> : (
        <div className="grid grid-cols-3 gap-4">
          <div className="col-span-2 space-y-4">

            {/* Данные рекламации */}
            <Card className="p-5">
              <div className="text-sm font-medium text-foreground mb-4">Данные рекламации</div>
              <div className="grid grid-cols-2 gap-x-6 gap-y-2 mb-4">
                {([
                  ["Клиент",   detail.company_name],
                  ["Заказ",    detail.order_number],
                  ["Товар",    detail.product_name],
                  ["Тип",      CLAIM_TYPE[detail.type as string] || detail.type],
                  ["Источник", detail.source],
                  ["Создана",  fmtDate(detail.created_at as string)],
                ] as [string, unknown][]).map(([l, v]) => (
                  <div key={l} className="flex gap-2">
                    <span className="text-xs text-muted-foreground w-20 flex-shrink-0">{l}:</span>
                    <span className="text-xs text-foreground">{(v as string) || "—"}</span>
                  </div>
                ))}
              </div>
              {detail.description && (
                <p className="text-xs text-foreground bg-secondary rounded-lg p-3 leading-relaxed">
                  {detail.description as string}
                </p>
              )}
              {/* Комментарий клиента при споре */}
              {isDisputed && detail.client_comment && (
                <div className="mt-3 flex items-start gap-2 text-xs text-rose-400 bg-rose-400/10 border border-rose-400/20 rounded-lg p-3">
                  <Icon name="MessageSquare" size={13} className="flex-shrink-0 mt-0.5" />
                  <div>
                    <div className="font-medium mb-0.5">Комментарий клиента к спору:</div>
                    <div>{detail.client_comment as string}</div>
                  </div>
                </div>
              )}
            </Card>

            {/* Фотоматериалы */}
            <Card className="p-5">
              <div className="flex items-center justify-between mb-3">
                <div className="text-sm font-medium text-foreground">Фотоматериалы</div>
                <button
                  onClick={() => fileRef.current?.click()}
                  disabled={uploadLoading}
                  className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground border border-border hover:border-ring px-2.5 py-1 rounded-lg transition-all disabled:opacity-40"
                >
                  {uploadLoading
                    ? <Icon name="Loader2" size={12} className="animate-spin" />
                    : <Icon name="ImagePlus" size={12} />}
                  Добавить фото
                </button>
              </div>
              <input ref={fileRef} type="file" accept="image/*" multiple className="hidden"
                onChange={e => onFileUpload(e.target.files)} />
              {photos.length > 0 ? (
                <div className="grid grid-cols-4 gap-2">
                  {photos.map((u, i) => (
                    <a key={i} href={u} target="_blank" rel="noreferrer">
                      <img src={u} alt="" className="w-full h-20 object-cover rounded-lg border border-border hover:opacity-80 transition-opacity" />
                    </a>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">Нет фото</p>
              )}
            </Card>

            {/* Решение */}
            {canSend && (
              <Card className="p-5">
                <div className="text-sm font-medium text-foreground mb-4">Решение менеджера</div>

                {/* Кнопка "Принять в работу" */}
                {detail.status === "new" && (
                  <button onClick={() => onAction("reviewing")}
                    className="mb-4 flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium border border-blue-400/30 text-blue-400 hover:bg-blue-400/10 transition-all">
                    <Icon name="Play" size={13} /> Принять в работу
                  </button>
                )}

                <div className="space-y-3">
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Текст решения *</label>
                    <textarea value={decision} onChange={e => onDecisionChange(e.target.value)} rows={4}
                      className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-secondary text-foreground focus:outline-none resize-none" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block">Сумма компенсации (₽)</label>
                      <input type="number" value={compAmount} onChange={e => onCompAmountChange(e.target.value)}
                        className="w-full px-3 py-2 text-xs rounded-lg border border-border bg-secondary text-foreground focus:outline-none font-mono" />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block">Тип компенсации</label>
                      <select value={compType} onChange={e => onCompTypeChange(e.target.value)}
                        className="w-full px-3 py-2 text-xs rounded-lg border border-border bg-secondary text-muted-foreground focus:outline-none">
                        {COMP_TYPES.map(t => <option key={t} value={t}>{COMP_LABELS[t]}</option>)}
                      </select>
                    </div>
                  </div>
                  <div className="flex gap-2 pt-1 flex-wrap">
                    <button onClick={onSendDecision} disabled={!decision.trim() || saving}
                      className="flex items-center gap-2 px-4 py-2 text-xs rounded-lg font-medium disabled:opacity-40"
                      style={{ background: "hsl(var(--cyan))", color: "hsl(var(--primary-foreground))" }}>
                      {saving ? <Icon name="Loader2" size={13} className="animate-spin" /> : <Icon name="Send" size={13} />}
                      Отправить решение клиенту
                    </button>
                    {isDisputed && (
                      <button onClick={() => onAction("procedural")}
                        className="px-4 py-2 text-xs rounded-lg border border-violet-400/30 text-violet-400 hover:bg-violet-400/10 font-medium">
                        Процессуальная
                      </button>
                    )}
                    <button onClick={() => onAction("close")}
                      className="px-4 py-2 text-xs rounded-lg border border-border text-muted-foreground hover:text-foreground">
                      Закрыть
                    </button>
                  </div>
                </div>
              </Card>
            )}
          </div>

          {/* Правая колонка: история */}
          <div className="space-y-4">
            <Card className="p-5">
              <div className="text-sm font-medium text-foreground mb-4">История</div>
              {history.length === 0 ? (
                <p className="text-xs text-muted-foreground">Нет записей</p>
              ) : (
                <div className="space-y-3">
                  {[...history].reverse().map((h, i) => (
                    <div key={i} className="flex gap-3">
                      <div className="flex flex-col items-center">
                        <div className="w-2 h-2 rounded-full mt-1 flex-shrink-0"
                          style={{ background: "hsl(var(--cyan))" }} />
                        {i < history.length - 1 && <div className="w-0.5 flex-1 mt-1" style={{ background: "hsl(var(--border))" }} />}
                      </div>
                      <div className="pb-3 min-w-0">
                        <div className="text-[10px] text-muted-foreground">{fmtDate(h.date)}</div>
                        <div className="text-xs text-foreground font-medium mt-0.5">
                          {CLAIM_STATUS[h.status]?.l || h.status}
                        </div>
                        {h.comment && <p className="text-[10px] text-muted-foreground mt-0.5">{h.comment}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
