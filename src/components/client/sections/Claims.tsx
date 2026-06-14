import { useEffect, useState } from "react";
import { claimsFetch, claimsPost } from "@/lib/clientApi";
import Icon from "@/components/ui/icon";
import {
  CLAIM_STATUS_MAP, StatusBadge, TableCard, Th, Td, EmptyRow,
  Loader, ErrorMsg, SectionHeader, fmt, fmtDate,
} from "../shared";
import { CLAIM_TYPE_LABELS, Claim } from "./ClaimsTypes";
import ClaimDetail from "./ClaimDetail";
import ClaimCreateForm from "./ClaimCreateForm";

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

  // Загрузка фото к существующей рекламации
  const [uploadLoading, setUploadLoading] = useState(false);

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
    return (
      <ClaimDetail
        detail={detail}
        detailLoading={detailLoading}
        error={error}
        uploadLoading={uploadLoading}
        actionLoading={actionLoading}
        disputeMode={disputeMode}
        disputeComment={disputeComment}
        onBack={() => { setDetail(null); setDisputeMode(false); }}
        onFileUpload={handleFileUpload}
        onDisputeCommentChange={setDisputeComment}
        onAction={doAction}
        onDisputeOpen={() => setDisputeMode(true)}
        onDisputeCancel={() => { setDisputeMode(false); setDisputeComment(""); }}
      />
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
        <ClaimCreateForm
          createType={createType}
          createDesc={createDesc}
          createLoading={createLoading}
          createPhotos={createPhotos}
          onTypeChange={setCreateType}
          onDescChange={setCreateDesc}
          onPhotoSelect={handleCreatePhotoSelect}
          onPhotoRemove={removeCreatePhoto}
          onSubmit={createClaim}
          onCancel={() => { setCreateMode(false); setCreateDesc(""); setCreatePhotos([]); }}
        />
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
