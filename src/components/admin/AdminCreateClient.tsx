import { useState } from "react";
import { mgrPost } from "@/lib/managerApi";
import { adminPost } from "@/lib/adminApi";
import { ErrMsg, SectionHdr } from "./shared";
import Icon from "@/components/ui/icon";

interface Props { onCreated: () => void; }

const MARKETPLACE_OPTIONS = [
  { v: "ozon", l: "Ozon" },
  { v: "yandex_market", l: "Яндекс Маркет" },
  { v: "both", l: "Ozon + Яндекс Маркет" },
];
const DELIVERY_OPTIONS = [
  { v: "own", l: "Наша служба доставки" },
  { v: "partner_ozon", l: "Партнёры Ozon" },
  { v: "client", l: "Клиент самостоятельно" },
];
const EDO_OPTIONS = [
  { v: "", l: "Не указан" },
  { v: "diadoc", l: "Диадок" },
  { v: "sbis", l: "СБИС" },
  { v: "taxcom", l: "Такском" },
  { v: "other", l: "Другой" },
];

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-xs text-muted-foreground mb-1.5 block">
        {label}{required && <span className="text-rose-400 ml-0.5">*</span>}
      </label>
      {children}
    </div>
  );
}

function Input({ value, onChange, placeholder, type = "text" }: {
  value: string; onChange: (v: string) => void; placeholder?: string; type?: string;
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full px-3 py-2.5 text-sm rounded-lg border border-border bg-secondary text-foreground focus:outline-none focus:ring-1 focus:ring-ring placeholder:text-muted-foreground"
    />
  );
}

function Sel({ value, onChange, options }: {
  value: string; onChange: (v: string) => void;
  options: { v: string; l: string }[];
}) {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      className="w-full px-3 py-2.5 text-sm rounded-lg border border-border bg-secondary text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
    >
      {options.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
    </select>
  );
}

export default function AdminCreateClient({ onCreated }: Props) {
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const [ok, setOk] = useState(false);
  const [createdInfo, setCreatedInfo] = useState<{ company_name: string; email: string; temp_password: string } | null>(null);

  // Компания
  const [name, setName] = useState("");
  const [inn, setInn] = useState("");
  const [kpp, setKpp] = useState("");
  const [legalAddress, setLegalAddress] = useState("");
  const [directorName, setDirectorName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [contactPerson, setContactPerson] = useState("");
  const [marketplace, setMarketplace] = useState("ozon");
  const [ozonClientId, setOzonClientId] = useState("");
  const [ozonApiKey, setOzonApiKey] = useState("");
  const [ozonWarehouseId, setOzonWarehouseId] = useState("");
  const [edoOperator, setEdoOperator] = useState("");
  const [deliveryMethod, setDeliveryMethod] = useState("own");
  const [purchaseLimit, setPurchaseLimit] = useState("0");

  // Пользователь-клиент
  const [userName, setUserName] = useState("");
  const [userEmail, setUserEmail] = useState("");
  const [userPhone, setUserPhone] = useState("");

  async function handleCreate() {
    if (!name.trim()) { setErr("Введите название компании"); return; }
    if (!inn.trim())  { setErr("Введите ИНН"); return; }
    if (!userEmail.trim()) { setErr("Введите email пользователя"); return; }
    if (!userName.trim())  { setErr("Введите имя пользователя"); return; }

    setSaving(true); setErr(""); setOk(false);
    try {
      const res = await adminPost("create_client", {
        company: {
          name: name.trim(),
          inn: inn.trim(),
          kpp: kpp.trim() || null,
          legal_address: legalAddress.trim() || null,
          director_name: directorName.trim() || null,
          phone: phone.trim() || null,
          email: email.trim() || null,
          contact_person: contactPerson.trim() || null,
          marketplace,
          ozon_client_id: ozonClientId.trim() || null,
          ozon_api_key: ozonApiKey.trim() || null,
          ozon_warehouse_id: ozonWarehouseId.trim() || null,
          edo_operator: edoOperator || null,
          delivery_method: deliveryMethod,
          purchase_limit: parseFloat(purchaseLimit) || 0,
        },
        user: {
          name: userName.trim(),
          email: userEmail.trim(),
          phone: userPhone.trim() || null,
        },
      });

      setCreatedInfo({
        company_name: name.trim(),
        email: userEmail.trim(),
        temp_password: res.temp_password || "—",
      });
      setOk(true);
    } catch (e: unknown) {
      setErr((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  if (ok && createdInfo) {
    return (
      <div className="max-w-lg mx-auto space-y-4 animate-fade-in">
        <div className="rounded-xl border border-green-400/30 bg-green-400/5 p-6 text-center space-y-3">
          <div className="w-12 h-12 rounded-full bg-green-400/15 flex items-center justify-center mx-auto">
            <Icon name="CheckCircle" size={24} style={{ color: "hsl(var(--green, 142 71% 45%))" }} />
          </div>
          <div className="text-sm font-semibold text-foreground">Клиент создан</div>
          <div className="text-xs text-muted-foreground">Компания: <strong className="text-foreground">{createdInfo.company_name}</strong></div>
          <div className="rounded-lg border border-border bg-secondary p-4 text-left space-y-2 mt-3">
            <div className="text-xs text-muted-foreground">Данные для входа клиента:</div>
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">Email</span>
              <span className="font-mono text-foreground">{createdInfo.email}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">Временный пароль</span>
              <span className="font-mono font-bold text-foreground">{createdInfo.temp_password}</span>
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground">Передайте пароль клиенту — при первом входе он сможет его сменить.</p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => { setOk(false); setCreatedInfo(null); setName(""); setInn(""); setUserEmail(""); setUserName(""); }}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium border border-border text-foreground hover:bg-secondary transition-all"
          >
            <Icon name="Plus" size={15} /> Создать ещё
          </button>
          <button
            onClick={onCreated}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition-all"
            style={{ background: "hsl(var(--cyan))", color: "hsl(var(--primary-foreground))" }}
          >
            <Icon name="Users" size={15} /> К списку клиентов
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6 animate-fade-in">
      <SectionHdr
        title="Создать клиента"
        sub="Ручная регистрация компании без прохождения онбординга"
      />

      {err && <ErrMsg msg={err} />}

      {/* Компания */}
      <div className="rounded-xl border border-border p-5 space-y-4" style={{ background: "hsl(var(--card))" }}>
        <div className="flex items-center gap-2 mb-1">
          <Icon name="Building2" size={15} style={{ color: "hsl(var(--cyan))" }} />
          <span className="text-sm font-semibold text-foreground">Данные компании</span>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <Field label="Название компании" required>
              <Input value={name} onChange={setName} placeholder='ООО "Ромашка"' />
            </Field>
          </div>
          <Field label="ИНН" required>
            <Input value={inn} onChange={setInn} placeholder="7700000000" />
          </Field>
          <Field label="КПП">
            <Input value={kpp} onChange={setKpp} placeholder="770001001" />
          </Field>
          <div className="col-span-2">
            <Field label="Юридический адрес">
              <Input value={legalAddress} onChange={setLegalAddress} placeholder="г. Москва, ул. Ленина, д. 1" />
            </Field>
          </div>
          <Field label="Директор">
            <Input value={directorName} onChange={setDirectorName} placeholder="Иванов Иван Иванович" />
          </Field>
          <Field label="Контактное лицо">
            <Input value={contactPerson} onChange={setContactPerson} placeholder="Менеджер по закупкам" />
          </Field>
          <Field label="Email компании">
            <Input value={email} onChange={setEmail} type="email" placeholder="info@company.ru" />
          </Field>
          <Field label="Телефон">
            <Input value={phone} onChange={setPhone} placeholder="+7 (900) 000-00-00" />
          </Field>
        </div>
      </div>

      {/* Настройки */}
      <div className="rounded-xl border border-border p-5 space-y-4" style={{ background: "hsl(var(--card))" }}>
        <div className="flex items-center gap-2 mb-1">
          <Icon name="Settings" size={15} style={{ color: "hsl(var(--cyan))" }} />
          <span className="text-sm font-semibold text-foreground">Настройки платформы</span>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Маркетплейс">
            <Sel value={marketplace} onChange={setMarketplace} options={MARKETPLACE_OPTIONS} />
          </Field>
          <Field label="Способ доставки">
            <Sel value={deliveryMethod} onChange={setDeliveryMethod} options={DELIVERY_OPTIONS} />
          </Field>
          <Field label="ЭДО оператор">
            <Sel value={edoOperator} onChange={setEdoOperator} options={EDO_OPTIONS} />
          </Field>
          <Field label="Лимит закупок (₽)">
            <Input value={purchaseLimit} onChange={setPurchaseLimit} type="number" placeholder="0" />
          </Field>
        </div>
      </div>

      {/* Ozon */}
      <div className="rounded-xl border border-border p-5 space-y-4" style={{ background: "hsl(var(--card))" }}>
        <div className="flex items-center gap-2 mb-1">
          <Icon name="ShoppingBag" size={15} style={{ color: "hsl(var(--cyan))" }} />
          <span className="text-sm font-semibold text-foreground">API Ozon (необязательно)</span>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Client ID">
            <Input value={ozonClientId} onChange={setOzonClientId} placeholder="12345678" />
          </Field>
          <Field label="Warehouse ID">
            <Input value={ozonWarehouseId} onChange={setOzonWarehouseId} placeholder="22480000" />
          </Field>
          <div className="col-span-2">
            <Field label="API Key">
              <Input value={ozonApiKey} onChange={setOzonApiKey} placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" type="password" />
            </Field>
          </div>
        </div>
      </div>

      {/* Пользователь */}
      <div className="rounded-xl border border-border p-5 space-y-4" style={{ background: "hsl(var(--card))" }}>
        <div className="flex items-center gap-2 mb-1">
          <Icon name="UserCircle" size={15} style={{ color: "hsl(var(--cyan))" }} />
          <span className="text-sm font-semibold text-foreground">Пользователь клиента</span>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Имя" required>
            <Input value={userName} onChange={setUserName} placeholder="Иван Иванов" />
          </Field>
          <Field label="Телефон">
            <Input value={userPhone} onChange={setUserPhone} placeholder="+7 (900) 000-00-00" />
          </Field>
          <div className="col-span-2">
            <Field label="Email (логин)" required>
              <Input value={userEmail} onChange={setUserEmail} type="email" placeholder="client@company.ru" />
            </Field>
          </div>
        </div>
        <p className="text-[11px] text-muted-foreground">
          Временный пароль будет сгенерирован автоматически и показан после создания.
        </p>
      </div>

      <button
        onClick={handleCreate}
        disabled={saving}
        className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold transition-all disabled:opacity-40"
        style={{ background: "hsl(var(--cyan))", color: "hsl(var(--primary-foreground))" }}
      >
        {saving
          ? <><Icon name="Loader2" size={16} className="animate-spin" />Создаём...</>
          : <><Icon name="UserPlus" size={16} />Создать клиента</>}
      </button>
    </div>
  );
}