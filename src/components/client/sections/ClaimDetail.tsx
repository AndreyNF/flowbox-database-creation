import { useRef } from "react";
import Icon from "@/components/ui/icon";
import { CLAIM_STATUS_MAP, StatusBadge, Loader, ErrorMsg, fmt, fmtDate } from "../shared";
import { CLAIM_TYPE_LABELS, COMP_TYPE_LABELS, Claim } from "./ClaimsTypes";

interface Props {
  detail: Claim;
  detailLoading: boolean;
  error: string;
  uploadLoading: boolean;
  actionLoading: boolean;
  disputeMode: boolean;
  disputeComment: string;
  onBack: () => void;
  onFileUpload: (files: FileList | null) => void;
  onDisputeCommentChange: (v: string) => void;
  onAction: (action: "agree" | "dispute") => void;
  onDisputeOpen: () => void;
  onDisputeCancel: () => void;
}

export default function ClaimDetail({
  detail, detailLoading, error, uploadLoading, actionLoading,
  disputeMode, disputeComment,
  onBack, onFileUpload, onDisputeCommentChange,
  onAction, onDisputeOpen, onDisputeCancel,
}: Props) {
  const fileRef = useRef<HTMLInputElement>(null);

  const history    = detail.history || [];
  const photos     = detail.photos  || [];
  const canRespond = detail.status === "decision_made";
  const isAgreed   = ["agreed", "closed"].includes(detail.status);
  const isDisputed = detail.status === "disputed";

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Хлебные крошки */}
      <div className="flex items-center gap-3">
        <button onClick={onBack}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
          <Icon name="ArrowLeft" size={13} /> К списку
        </button>
        <span className="text-muted-foreground">/</span>
        <span className="text-sm font-medium text-foreground">{detail.claim_number}</span>
        <StatusBadge map={CLAIM_STATUS_MAP} status={detail.status} />
      </div>

      {error && <ErrorMsg message={error} />}

      {detailLoading ? <Loader /> : (
        <div className="grid grid-cols-3 gap-4">
          <div className="col-span-2 space-y-4">

            {/* Основная информация */}
            <div className="rounded-lg border border-border p-5" style={{ background: "hsl(var(--card))" }}>
              <div className="text-sm font-medium text-foreground mb-4">Детали рекламации</div>
              <div className="space-y-2.5">
                {[
                  { label: "Товар",    value: detail.product_name || "—" },
                  { label: "Заказ",    value: detail.order_number || "—" },
                  { label: "Тип",      value: CLAIM_TYPE_LABELS[detail.type] || detail.type },
                  { label: "Создана",  value: fmtDate(detail.created_at) },
                  ...(detail.closed_at ? [{ label: "Закрыта", value: fmtDate(detail.closed_at) }] : []),
                ].map(r => (
                  <div key={r.label} className="flex justify-between border-b border-border last:border-0 pb-2 last:pb-0">
                    <span className="text-xs text-muted-foreground">{r.label}</span>
                    <span className="text-xs font-medium text-foreground">{r.value}</span>
                  </div>
                ))}
              </div>
              {detail.description && (
                <div className="mt-4 p-3 rounded-lg bg-secondary text-xs text-foreground leading-relaxed">
                  {detail.description}
                </div>
              )}
            </div>

            {/* Фото + кнопка добавления */}
            <div className="rounded-lg border border-border p-5" style={{ background: "hsl(var(--card))" }}>
              <div className="flex items-center justify-between mb-3">
                <div className="text-sm font-medium text-foreground">Фотоматериалы</div>
                {!isAgreed && (
                  <button
                    onClick={() => fileRef.current?.click()}
                    disabled={uploadLoading}
                    className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground border border-border hover:border-ring px-2.5 py-1 rounded-lg transition-all disabled:opacity-40"
                  >
                    {uploadLoading
                      ? <Icon name="Loader2" size={12} className="animate-spin" />
                      : <Icon name="Paperclip" size={12} />}
                    Добавить фото
                  </button>
                )}
              </div>
              <input
                ref={fileRef} type="file" accept="image/*" multiple className="hidden"
                onChange={e => onFileUpload(e.target.files)}
              />
              {photos.length > 0 ? (
                <div className="grid grid-cols-3 gap-2">
                  {photos.map((url, i) => (
                    <a key={i} href={url} target="_blank" rel="noreferrer">
                      <img src={url} alt={`Фото ${i + 1}`}
                        className="w-full h-24 object-cover rounded-lg border border-border hover:opacity-80 transition-opacity" />
                    </a>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">Нет фотоматериалов</p>
              )}
            </div>

            {/* Решение менеджера */}
            {detail.decision && (
              <div className="rounded-lg border border-border p-5" style={{ background: "hsl(var(--card))" }}>
                <div className="text-sm font-medium text-foreground mb-3">Решение менеджера</div>
                <p className="text-xs text-foreground leading-relaxed mb-4">{detail.decision}</p>

                {detail.compensation_amount > 0 && (
                  <div className="flex items-center gap-2 text-xs text-green-400 bg-green-400/10 border border-green-400/20 rounded-lg px-3 py-2.5 mb-4">
                    <Icon name="CircleDollarSign" size={13} />
                    <span>Компенсация: <strong>{fmt(detail.compensation_amount)}</strong></span>
                    {detail.compensation_type && (
                      <span className="text-green-400/70">— {COMP_TYPE_LABELS[detail.compensation_type] || detail.compensation_type}</span>
                    )}
                  </div>
                )}

                {/* Кнопки реакции */}
                {canRespond && !disputeMode && (
                  <div className="flex gap-3">
                    <button
                      onClick={() => onAction("agree")}
                      disabled={actionLoading}
                      className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-xs font-medium transition-all disabled:opacity-40"
                      style={{ background: "hsl(var(--green,142 71% 45%))", color: "#fff" }}
                    >
                      {actionLoading
                        ? <Icon name="Loader2" size={13} className="animate-spin" />
                        : <Icon name="ThumbsUp" size={13} />}
                      Согласен с решением
                    </button>
                    <button
                      onClick={onDisputeOpen}
                      className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-xs font-medium border border-rose-400/40 text-rose-400 hover:bg-rose-400/10 transition-all"
                    >
                      <Icon name="ThumbsDown" size={13} />
                      Оспорить
                    </button>
                  </div>
                )}

                {/* Форма спора */}
                {canRespond && disputeMode && (
                  <div className="space-y-3 animate-fade-in">
                    <div>
                      <label className="text-xs text-muted-foreground mb-1.5 block">
                        Опишите, почему вы не согласны с решением *
                      </label>
                      <textarea
                        value={disputeComment}
                        onChange={e => onDisputeCommentChange(e.target.value)}
                        rows={3}
                        placeholder="Укажите причину несогласия..."
                        className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-secondary text-foreground focus:outline-none focus:ring-1 focus:ring-ring resize-none placeholder:text-muted-foreground"
                      />
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => onAction("dispute")}
                        disabled={actionLoading || !disputeComment.trim()}
                        className="flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-medium bg-rose-500 text-white hover:bg-rose-600 transition-all disabled:opacity-40"
                      >
                        {actionLoading
                          ? <Icon name="Loader2" size={13} className="animate-spin" />
                          : <Icon name="Send" size={13} />}
                        Отправить спор
                      </button>
                      <button
                        onClick={onDisputeCancel}
                        className="px-4 py-2 rounded-lg text-xs text-muted-foreground border border-border hover:text-foreground transition-all"
                      >
                        Отмена
                      </button>
                    </div>
                  </div>
                )}

                {/* Статус после согласия */}
                {isAgreed && (
                  <div className="flex items-center gap-2 text-xs text-green-400 bg-green-400/10 border border-green-400/20 rounded-lg px-3 py-2.5">
                    <Icon name="CheckCircle" size={13} />
                    Вы согласились с решением. Рекламация закрыта.
                  </div>
                )}

                {/* Статус спора */}
                {isDisputed && detail.client_comment && (
                  <div className="flex items-start gap-2 text-xs text-rose-400 bg-rose-400/10 border border-rose-400/20 rounded-lg px-3 py-2.5">
                    <Icon name="AlertCircle" size={13} className="flex-shrink-0 mt-0.5" />
                    <div>
                      <div className="font-medium mb-0.5">Спор подан. Менеджер рассматривает.</div>
                      <div className="text-rose-400/70">Ваш комментарий: {detail.client_comment}</div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* История */}
          <div className="rounded-lg border border-border p-5 h-fit" style={{ background: "hsl(var(--card))" }}>
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
                      {i < history.length - 1 && (
                        <div className="w-0.5 flex-1 mt-1" style={{ background: "hsl(var(--border))" }} />
                      )}
                    </div>
                    <div className="pb-3 min-w-0">
                      <div className="text-[10px] text-muted-foreground">{fmtDate(h.date)}</div>
                      <div className="text-xs text-foreground font-medium mt-0.5">
                        {CLAIM_STATUS_MAP[h.status]?.label || h.status}
                      </div>
                      {h.comment && (
                        <p className="text-[10px] text-muted-foreground mt-0.5 leading-relaxed">{h.comment}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
