import { useState, useCallback } from "react";
import Icon from "@/components/ui/icon";
import { CompanyData, INITIAL, ProgressBar } from "@/components/onboarding/OnboardingUI";
import { Step1Consents, Step2INN, Step3Contacts, Step4Marketplace } from "@/components/onboarding/OnboardingSteps1to4";
import { Step5EDO, Step6Delivery, Step7Finance, Step8Activation, Step9Success } from "@/components/onboarding/OnboardingSteps5to9";

const API_SAVE     = "https://functions.poehali.dev/daec4c15-d79a-4154-a716-8690c622dd46";
const API_DADATA   = "https://functions.poehali.dev/0a0add78-6b3a-48c1-8984-0e1180e72ad3";
const API_ACTIVATE = "https://functions.poehali.dev/9c14a054-f07d-49fd-a318-b881deb30d70";
const API_OZON_VALIDATE = "https://functions.poehali.dev/45eda92a-8064-497b-8e6e-73242579a867";

export default function Onboarding() {
  const [step, setStep] = useState(1);
  const [data, setData] = useState<CompanyData>(INITIAL);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [innLoading, setInnLoading] = useState(false);
  const [innFound, setInnFound] = useState(false);
  const [ozonValidating, setOzonValidating] = useState(false);
  const [ozonValid, setOzonValid] = useState(false);
  const [ozonWarehouses, setOzonWarehouses] = useState<{id: string; name: string}[]>([]);
  // отслеживаем какие необязательные шаги пропущены
  const [skipped, setSkipped] = useState<Set<number>>(new Set());

  const set = useCallback((key: keyof CompanyData, val: string | boolean) => {
    setData(prev => ({ ...prev, [key]: val }));
    setError("");
  }, []);

  async function saveStep(stepNum: number, payload: Record<string, unknown>) {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(API_SAVE, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ step: stepNum, company_id: data.company_id, ...payload }),
      });
      const json = JSON.parse(await res.text());
      if (!res.ok) throw new Error(json.error || "Ошибка сервера");
      if (json.company_id) setData(prev => ({ ...prev, company_id: json.company_id }));
      // убираем из пропущенных если шаг заполнен
      setSkipped(prev => { const s = new Set(prev); s.delete(stepNum); return s; });
      setStep(stepNum + 1);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setLoading(false);
    }
  }

  function skipStep(stepNum: number) {
    setSkipped(prev => new Set(prev).add(stepNum));
    setStep(stepNum + 1);
    setError("");
  }

  async function lookupINN(inn: string) {
    if (inn.length < 10) return;
    setInnLoading(true);
    setInnFound(false);
    setError("");
    try {
      const res = await fetch(`${API_DADATA}?inn=${inn}`);
      const json = JSON.parse(await res.text());
      if (!res.ok) throw new Error(json.error || "Компания не найдена");
      setData(prev => ({
        ...prev,
        full_name: json.full_name || "",
        short_name: json.short_name || "",
        kpp: json.kpp || "",
        ogrn: json.ogrn || "",
        legal_address: json.legal_address || "",
        director_name: json.director_name || "",
        entity_type: json.entity_type || "legal",
      }));
      setInnFound(true);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Ошибка поиска");
    } finally {
      setInnLoading(false);
    }
  }

  async function validateOzon() {
    if (!data.ozon_client_id || !data.ozon_api_key) return;
    setOzonValidating(true);
    setOzonValid(false);
    setOzonWarehouses([]);
    setError("");
    try {
      const res = await fetch(API_OZON_VALIDATE, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ client_id: data.ozon_client_id, api_key: data.ozon_api_key }),
      });
      const json = JSON.parse(await res.text());
      if (!res.ok) throw new Error(json.error || "Ошибка проверки ключа");
      setOzonValid(true);
      setOzonWarehouses(json.warehouses || []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Ошибка валидации Ozon");
    } finally {
      setOzonValidating(false);
    }
  }

  async function activate() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(API_ACTIVATE, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ company_id: data.company_id }),
      });
      const json = JSON.parse(await res.text());
      if (!res.ok) throw new Error(json.error || "Ошибка активации");
      setStep(9);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setLoading(false);
    }
  }

  const sharedProps = { data, error, loading, set, saveStep };

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: "hsl(var(--background))" }}>
      <div className="w-full max-w-lg">
        <div className="flex items-center gap-2 mb-8">
          <div className="w-8 h-8 rounded flex items-center justify-center" style={{ background: "hsl(var(--cyan))" }}>
            <span className="text-sm font-mono font-semibold" style={{ color: "hsl(var(--primary-foreground))" }}>F</span>
          </div>
          <span className="font-semibold text-foreground">FlowBox</span>
        </div>

        {step < 9 && (
          <div className="mb-8">
            <ProgressBar step={step} total={8} />
          </div>
        )}

        {step === 1 && <Step1Consents {...sharedProps} />}

        {step === 2 && (
          <Step2INN
            {...sharedProps}
            innLoading={innLoading}
            innFound={innFound}
            lookupINN={lookupINN}
            setInnFound={setInnFound}
          />
        )}

        {step === 3 && <Step3Contacts {...sharedProps} />}

        {step === 4 && (
          <Step4Marketplace
            {...sharedProps}
            ozonValidating={ozonValidating}
            ozonValid={ozonValid}
            ozonWarehouses={ozonWarehouses}
            validateOzon={validateOzon}
            setOzonValid={setOzonValid}
            setOzonWarehouses={setOzonWarehouses}
            onSkip={() => skipStep(4)}
          />
        )}

        {step === 5 && (
          <Step5EDO {...sharedProps} onSkip={() => skipStep(5)} />
        )}

        {step === 6 && (
          <Step6Delivery {...sharedProps} onSkip={() => skipStep(6)} />
        )}

        {step === 7 && (
          <Step7Finance {...sharedProps} onSkip={() => skipStep(7)} />
        )}

        {step === 8 && (
          <Step8Activation
            data={data}
            error={error}
            loading={loading}
            activate={activate}
            setStep={setStep}
            skipped={skipped}
          />
        )}

        {step === 9 && <Step9Success companyName={data.short_name || data.inn} />}

        {step > 1 && step < 9 && (
          <button
            onClick={() => { setStep(step - 1); setError(""); }}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground mt-4 mx-auto transition-colors"
          >
            <Icon name="ArrowLeft" size={12} /> Назад
          </button>
        )}
      </div>
    </div>
  );
}
