import { useEffect, useState, useRef } from "react";
import { claimsFetch, claimsPost } from "@/lib/clientApi";
import Icon from "@/components/ui/icon";
import {
  CLAIM_STATUS_MAP, StatusBadge, TableCard, Th, Td, EmptyRow,
  Loader, ErrorMsg, SectionHeader, fmt, fmtDate,
} from "../shared";

const CLAIM_TYPE_LABELS: Record<string, string> = {
  delivery_refusal: "Отказ от доставки",
  return:           "Возврат",
  defect:           "Брак",
  damage:           "Повреждение",
};

const COMP_TYPE_LABELS: Record<string, string> = {
  money:              "Денежная компенсация",
  part_replacement:   "Замена детали",
  back_to_stock:      "Возврат в продажу",
  write_off:          "Списание",
  return_to_supplier: "Возврат поставщику",
};

interface Claim {
  id: string; claim_number: string; order_number: string; type: string;
  status: string; created_at: string; closed_at: string;
  compensation_amount: number; compensation_type: string;
  product_name: string; description: string;
  photos: string[] | null; decision: string | null;
  history: { date: string; status: string; comment: string }[] | null;
  source: string; client_comment: string | null;
}

interface Props { companyId: string; }

export default function Claims({ companyId }: Props) {
  const [claims, setClaims]           = useState<Claim[]>([]);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState("");
  const [detail, setDetail]           = useState<Claim | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // Agree/dispute
  const [actionLoading, setActionLoading] = useState(false);
  const [disputeMode, setDisputeMode]     = useState(false);
  const [disputeComment, setDisputeComment] = useState("");

  // Создание рекламации
  const [createMode, setCreateMode]   = useState(false);
  const [createType, setCreateType]   = useState("defect");
  const [createDesc, setCreateDesc]   = useState("");
  const [createLoading, setCreateLoading] = useState(false);
  // Фото при создании
  const [createPhotos, setCreatePhotos] = useState<{ file: File; preview: string }[]>([]);
  const createFileRef = useRef<HTMLInputElement>(null);

  // Загрузка фото к существующей рекламации
  const [uploadLoading, setUploadLoading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  function loadList() {
    setLoading(true);
    claimsFetch("list", companyId)
      .then(d => setClaims(d.claims || []))
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }

  useEffect(() => { loadList(); }, [companyId]);

  async function loadDetail(id: string) {
    setDetailLoading(true);
    setDisputeMode(false);
    setDisputeComment("");
    try {
      const d = await claimsFetch("detail", companyId, { claim_id: id });
      setDetail(d.claim);
    } catch (e: unknown) {
      setError((e as Error).message);
    } finally {
      setDetailLoading(false);
    }
  }

  async function doAction(action: "agree" | "dispute") {
    if (!detail) return;
    if (action === "dispute" && !disputeComment.trim()) {
      setError("Введите комментарий к спору");
      return;
    }
    setActionLoading(true);
    setError("");
    try {
      await claimsPost("action", {
        claim_id: detail.id,
        company_id: companyId,
        action,
        comment: disputeComment,
      });
      await loadDetail(detail.id);
      loadList();
      setDisputeMode(false);
    } catch (e: unknown) {
      setError((e as Error).message);
    } finally {
      setActionLoading(false);
    }
  }

  // Загрузка одного файла в S3 через backend
  async function uploadPhotoToS3(file: File, claimId: string): Promise<string> {
    const b64 = await new Promise<string>((res, rej) => {
      const reader = new FileReader();
      reader.onload = () => res((reader.result as string).split(",")[1]);
      reader.onerror = rej;
      reader.readAsDataURL(file);
    });
    const d = await claimsPost("upload_photo", {
      claim_id: claimId,
      data: b64,
      mime_type: file.type || "image/jpeg",
    });
    return d.url as string;
  }

  async function handleFileUpload(files: FileList | null) {
    if (!files || !detail) return;
    setUploadLoading(true);
    setError("");
    try {
      for (const file of Array.from(files).slice(0, 10)) {
        await uploadPhotoToS3(file, detail.id);
      }
      await loadDetail(detail.id);
    } catch (e: unknown) {
      setError((e as Error).message);
    } finally {
      setUploadLoading(false);
    }
  }

  function handleCreatePhotoSelect(files: FileList | null) {
    if (!files) return;
    const newPhotos = Array.from(files).slice(0, 10 - createPhotos.length).map(file => ({
      file,
      preview: URL.createObjectURL(file),
    }));
    setCreatePhotos(prev => [...prev, ...newPhotos].slice(0, 10));
  }

  function removeCreatePhoto(idx: number) {
    setCreatePhotos(prev => {
      URL.revokeObjectURL(prev[idx].preview);
      return prev.filter((_, i) => i !== idx);
    });
  }

  async function createClaim() {
    if (!createDesc.trim()) { setError("Введите описание проблемы"); return; }
    setCreateLoading(true);
    setError("");
    try {
      const res = await claimsPost("create", {
        company_id: companyId,
        type: createType,
        description: createDesc,
      });
      // Загружаем фото в S3 если есть
      if (createPhotos.length > 0 && res.claim_id) {
        for (const { file } of createPhotos) {
          await uploadPhotoToS3(file, res.claim_id as string);
        }
      }
      setCreateMode(false);
      setCreateDesc("");
      setCreatePhotos([]);
      loadList();
    } catch (e: unknown) {
      setError((e as Error).message);
    } finally {
      setCreateLoading(false);
    }
  }

  // ── ДЕТАЛЬНЫЙ ВИД ──────────────────────────────────────────────────────────
  if (detail) {
    const history      = detail.history || [];
    const photos       = detail.photos  || [];
    const canRespond   = detail.status === "decision_made";
    const isAgreed     = ["agreed", "closed"].includes(detail.status);
    const isDisputed   = detail.status === "disputed";

    return (
      <div className="space-y-4 animate-fade-in">
        {/* Хлебные крошки */}
        <div className="flex items-center gap-3">
          <button onClick={() => { setDetail(null); setDisputeMode(false); }}
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
                  onChange={e => handleFileUpload(e.target.files)}
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
                        onClick={() => doAction("agree")}
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
                        onClick={() => setDisputeMode(true)}
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
                          onChange={e => setDisputeComment(e.target.value)}
                          rows={3}
                          placeholder="Укажите причину несогласия..."
                          className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-secondary text-foreground focus:outline-none focus:ring-1 focus:ring-ring resize-none placeholder:text-muted-foreground"
                        />
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => doAction("dispute")}
                          disabled={actionLoading || !disputeComment.trim()}
                          className="flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-medium bg-rose-500 text-white hover:bg-rose-600 transition-all disabled:opacity-40"
                        >
                          {actionLoading
                            ? <Icon name="Loader2" size={13} className="animate-spin" />
                            : <Icon name="Send" size={13} />}
                          Отправить спор
                        </button>
                        <button
                          onClick={() => { setDisputeMode(false); setDisputeComment(""); }}
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

  // ── СПИСОК РЕКЛАМАЦИЙ ──────────────────────────────────────────────────────
  return (
    <div className="space-y-5 animate-fade-in">
      <SectionHeader
        title="Рекламации"
        subtitle={`${claims.length} обращений`}
        action={
          <button
            onClick={() => setCreateMode(true)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-all"
            style={{ background: "hsl(var(--cyan))", color: "hsl(var(--primary-foreground))" }}
          >
            <Icon name="Plus" size={13} />
            Новая рекламация
          </button>
        }
      />

      {error && <ErrorMsg message={error} />}

      {/* Форма создания */}
      {createMode && (
        <div className="rounded-lg border border-border p-5 animate-fade-in" style={{ background: "hsl(var(--card))" }}>
          <div className="flex items-center justify-between mb-4">
            <div className="text-sm font-medium text-foreground">Новая рекламация</div>
            <button onClick={() => setCreateMode(false)} className="text-muted-foreground hover:text-foreground">
              <Icon name="X" size={15} />
            </button>
          </div>
          <div className="space-y-3">
            <div>
              <label className="text-xs text-muted-foreground mb-1.5 block">Тип проблемы</label>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { v: "defect", label: "Брак", icon: "AlertTriangle" },
                  { v: "damage", label: "Повреждение", icon: "ShieldAlert" },
                  { v: "return", label: "Возврат", icon: "RotateCcw" },
                  { v: "delivery_refusal", label: "Отказ от доставки", icon: "PackageX" },
                ].map(opt => (
                  <button
                    key={opt.v}
                    onClick={() => setCreateType(opt.v)}
                    className={`flex items-center gap-2 px-3 py-2.5 rounded-lg border text-xs font-medium transition-all ${
                      createType === opt.v ? "border-ring" : "border-border hover:border-muted-foreground"
                    }`}
                    style={createType === opt.v ? { background: "hsla(195,90%,48%,0.06)" } : { background: "hsl(var(--secondary))" }}
                  >
                    <Icon name={opt.icon} size={13}
                      style={{ color: createType === opt.v ? "hsl(var(--cyan))" : "hsl(var(--muted-foreground))" }} />
                    <span style={{ color: createType === opt.v ? "hsl(var(--foreground))" : "hsl(var(--muted-foreground))" }}>
                      {opt.label}
                    </span>
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1.5 block">Описание проблемы *</label>
              <textarea
                value={createDesc}
                onChange={e => setCreateDesc(e.target.value)}
                rows={3}
                placeholder="Опишите проблему подробно..."
                className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-secondary text-foreground focus:outline-none focus:ring-1 focus:ring-ring resize-none placeholder:text-muted-foreground"
              />
            </div>

            {/* Фото при создании */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs text-muted-foreground">
                  Фото (до 10 файлов, jpg/png/heic)
                </label>
                {createPhotos.length < 10 && (
                  <button
                    type="button"
                    onClick={() => createFileRef.current?.click()}
                    className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground border border-border hover:border-ring px-2 py-1 rounded-lg transition-all"
                  >
                    <Icon name="Paperclip" size={11} /> Прикрепить
                  </button>
                )}
              </div>
              <input
                ref={createFileRef}
                type="file"
                accept="image/jpeg,image/png,image/heic,image/webp"
                multiple
                className="hidden"
                onChange={e => handleCreatePhotoSelect(e.target.files)}
              />
              {createPhotos.length > 0 && (
                <div className="grid grid-cols-5 gap-2 mt-2">
                  {createPhotos.map((p, i) => (
                    <div key={i} className="relative group">
                      <img
                        src={p.preview}
                        alt={`Фото ${i + 1}`}
                        className="w-full h-16 object-cover rounded-lg border border-border"
                      />
                      <button
                        type="button"
                        onClick={() => removeCreatePhoto(i)}
                        className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-rose-500 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <Icon name="X" size={9} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex gap-2 pt-1">
              <button
                onClick={createClaim}
                disabled={createLoading || !createDesc.trim()}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-medium transition-all disabled:opacity-40"
                style={{ background: "hsl(var(--cyan))", color: "hsl(var(--primary-foreground))" }}
              >
                {createLoading
                  ? <><Icon name="Loader2" size={13} className="animate-spin" />
                    {createPhotos.length > 0 ? "Загружаем..." : "Отправляем..."}</>
                  : <><Icon name="Send" size={13} />Отправить</>}
              </button>
              <button
                onClick={() => { setCreateMode(false); setCreateDesc(""); setCreatePhotos([]); }}
                className="px-4 py-2 rounded-lg text-xs border border-border text-muted-foreground hover:text-foreground transition-all"
              >
                Отмена
              </button>
            </div>
          </div>
        </div>
      )}

      {loading ? <Loader /> : (
        <TableCard>
          <table className="w-full">
            <thead>
              <tr className="border-b border-border">
                <Th>Номер</Th>
                <Th>Товар</Th>
                <Th>Тип</Th>
                <Th>Статус</Th>
                <Th>Дата</Th>
                <Th>Компенсация</Th>
              </tr>
            </thead>
            <tbody>
              {claims.length === 0 && <EmptyRow cols={6} text="Рекламаций нет" />}
              {claims.map(c => (
                <tr
                  key={c.id}
                  onClick={() => loadDetail(c.id)}
                  className="border-b border-border last:border-0 hover:bg-secondary/40 cursor-pointer transition-colors"
                >
                  <Td mono>{c.claim_number}</Td>
                  <Td>{c.product_name || "—"}</Td>
                  <Td>{CLAIM_TYPE_LABELS[c.type] || c.type}</Td>
                  <Td><StatusBadge map={CLAIM_STATUS_MAP} status={c.status} /></Td>
                  <Td>{fmtDate(c.created_at)}</Td>
                  <Td>
                    {c.compensation_amount > 0
                      ? <span className="text-green-400 font-mono">{fmt(c.compensation_amount)}</span>
                      : <span className="text-muted-foreground">—</span>}
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableCard>
      )}
    </div>
  );
}