import { useRef } from "react";
import Icon from "@/components/ui/icon";

interface Props {
  createType: string;
  createDesc: string;
  createLoading: boolean;
  createPhotos: { file: File; preview: string }[];
  onTypeChange: (v: string) => void;
  onDescChange: (v: string) => void;
  onPhotoSelect: (files: FileList | null) => void;
  onPhotoRemove: (idx: number) => void;
  onSubmit: () => void;
  onCancel: () => void;
}

export default function ClaimCreateForm({
  createType, createDesc, createLoading, createPhotos,
  onTypeChange, onDescChange, onPhotoSelect, onPhotoRemove,
  onSubmit, onCancel,
}: Props) {
  const createFileRef = useRef<HTMLInputElement>(null);

  return (
    <div className="rounded-lg border border-border p-5 animate-fade-in" style={{ background: "hsl(var(--card))" }}>
      <div className="flex items-center justify-between mb-4">
        <div className="text-sm font-medium text-foreground">Новая рекламация</div>
        <button onClick={onCancel} className="text-muted-foreground hover:text-foreground">
          <Icon name="X" size={15} />
        </button>
      </div>
      <div className="space-y-3">
        <div>
          <label className="text-xs text-muted-foreground mb-1.5 block">Тип проблемы</label>
          <div className="grid grid-cols-2 gap-2">
            {[
              { v: "defect",           label: "Брак",                icon: "AlertTriangle" },
              { v: "damage",           label: "Повреждение",         icon: "ShieldAlert" },
              { v: "return",           label: "Возврат",             icon: "RotateCcw" },
              { v: "delivery_refusal", label: "Отказ от доставки",  icon: "PackageX" },
            ].map(opt => (
              <button
                key={opt.v}
                onClick={() => onTypeChange(opt.v)}
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
            onChange={e => onDescChange(e.target.value)}
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
            onChange={e => onPhotoSelect(e.target.files)}
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
                    onClick={() => onPhotoRemove(i)}
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
            onClick={onSubmit}
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
            onClick={onCancel}
            className="px-4 py-2 rounded-lg text-xs border border-border text-muted-foreground hover:text-foreground transition-all"
          >
            Отмена
          </button>
        </div>
      </div>
    </div>
  );
}
