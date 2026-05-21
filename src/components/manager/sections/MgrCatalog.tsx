import { useEffect, useState, useCallback } from "react";
import { mgrGet } from "@/lib/managerApi";
import { Loader, ErrMsg, SectionHdr, Card, Th, Td, EmptyRow, PriBtn, fmt, Input, Select, FieldLabel } from "../shared";
import Icon from "@/components/ui/icon";

const STOCK_STATUS: Record<string,{l:string;c:string}> = {
  active:                { l:"Активен",           c:"text-green-400" },
  suspended:             { l:"Приостановлен",      c:"text-amber-400" },
  in_warehouse:          { l:"На складе",          c:"text-blue-400" },
  ready_for_sale:        { l:"Готов к продаже",    c:"text-cyan-400" },
  ready_for_return:      { l:"К возврату",         c:"text-violet-400" },
  returned_to_supplier:  { l:"Возврат поставщику", c:"text-orange-400" },
  written_off:           { l:"Списан",             c:"text-muted-foreground" },
};
const MOD_STATUS: Record<string,{l:string;c:string}> = {
  draft:    { l:"Черновик", c:"text-muted-foreground" },
  pending:  { l:"На модерации", c:"text-amber-400" },
  approved: { l:"Одобрен", c:"text-green-400" },
  rejected: { l:"Отклонён", c:"text-rose-400" },
};

export default function MgrCatalog() {
  const [products, setProducts] = useState<Record<string,unknown>[]>([]);
  const [suppliers, setSuppliers] = useState<{id:string;name:string}[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [search, setSearch] = useState("");
  const [stFilter, setStFilter] = useState("");
  const [supFilter, setSupFilter] = useState("");
  const [offset, setOffset] = useState(0);
  const [showForm, setShowForm] = useState(false);
  const LIMIT = 20;

  const load = useCallback(() => {
    setLoading(true);
    const extra: Record<string,string> = { limit:String(LIMIT), offset:String(offset) };
    if (search) extra.search = search;
    if (stFilter) extra.stock_status = stFilter;
    if (supFilter) extra.supplier_id = supFilter;
    mgrGet("catalog", extra)
      .then(d=>{setProducts(d.products||[]);setTotal(d.total||0);setSuppliers(d.suppliers||[]);setCategories(d.categories||[]);})
      .catch((e:Error)=>setErr(e.message))
      .finally(()=>setLoading(false));
  }, [search, stFilter, supFilter, offset]);

  useEffect(()=>{load();}, [load]);

  const pages = Math.ceil(total/LIMIT);
  const page = Math.floor(offset/LIMIT);

  if (showForm) {
    return <ProductForm onClose={()=>{setShowForm(false);load();}} suppliers={suppliers} categories={categories} />;
  }

  return (
    <div className="space-y-4 animate-fade-in">
      <SectionHdr title="Каталог" sub={`${total} товаров`}
        action={
          <div className="flex gap-2">
            <button className="flex items-center gap-2 text-xs px-3 py-1.5 rounded-lg border border-border text-muted-foreground hover:text-foreground transition-colors">
              <Icon name="Upload" size={13} /> Загрузить прайс
            </button>
            <PriBtn onClick={()=>setShowForm(true)} label="Добавить товар" icon="Plus" />
          </div>
        } />

      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-48 max-w-xs">
          <Icon name="Search" size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input value={search} onChange={e=>{setSearch(e.target.value);setOffset(0);}} placeholder="Поиск..."
            className="w-full pl-8 pr-3 py-2 text-xs rounded-lg border border-border bg-secondary text-foreground placeholder:text-muted-foreground focus:outline-none" />
        </div>
        <Select value={stFilter} onChange={v=>{setStFilter(v);setOffset(0);}}
          options={[{value:"",label:"Все статусы"},...Object.entries(STOCK_STATUS).map(([k,v])=>({value:k,label:v.l}))]} />
        <Select value={supFilter} onChange={v=>{setSupFilter(v);setOffset(0);}}
          options={[{value:"",label:"Все поставщики"},...suppliers.map(s=>({value:s.id,label:s.name}))]} />
      </div>

      {err && <ErrMsg msg={err} />}
      {loading ? <Loader /> : (
        <>
          <Card>
            <table className="w-full">
              <thead><tr className="border-b border-border">
                <Th c="Название" /><Th c="Артикул" /><Th c="Категория" /><Th c="Поставщик" /><Th c="Цена закупки" /><Th c="Наша цена" /><Th c="Остаток" /><Th c="Склад" /><Th c="Модерация" />
              </tr></thead>
              <tbody>
                {products.length===0 && <EmptyRow cols={9} />}
                {products.map(p => {
                  const free = (p.stock_available as number||0)-(p.stock_reserved as number||0);
                  const ss = STOCK_STATUS[p.stock_status as string]||{l:p.stock_status as string,c:"text-muted-foreground"};
                  const ms = MOD_STATUS[p.moderation_status_ozon as string]||{l:p.moderation_status_ozon as string,c:"text-muted-foreground"};
                  return (
                    <tr key={p.id as string} className="border-b border-border last:border-0 hover:bg-secondary/30 transition-colors">
                      <Td c={<span className="font-medium">{p.trade_name as string}</span>} />
                      <Td c={p.supplier_article as string} mono />
                      <Td c={<span className="text-muted-foreground">{(p.category_ozon as string)||"—"}</span>} />
                      <Td c={<span className="text-muted-foreground">{(p.supplier_name as string)||"—"}</span>} />
                      <Td c={fmt(p.purchase_price_vat as number)} mono />
                      <Td c={<span className="font-semibold">{fmt(p.our_price as number)}</span>} mono />
                      <Td c={<span className={free>0?"text-green-400":"text-rose-400"}>{free}</span>} mono />
                      <Td c={<span className={`text-xs font-medium ${ss.c}`}>{ss.l}</span>} />
                      <Td c={<span className={`text-xs font-medium ${ms.c}`}>{ms.l}</span>} />
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Card>
          {pages>1 && (
            <div className="flex items-center justify-center gap-2">
              <button disabled={page===0} onClick={()=>setOffset(o=>Math.max(0,o-LIMIT))} className="px-3 py-1.5 text-xs rounded border border-border text-muted-foreground hover:text-foreground disabled:opacity-40">← Назад</button>
              <span className="text-xs text-muted-foreground">{page+1} / {pages}</span>
              <button disabled={page>=pages-1} onClick={()=>setOffset(o=>o+LIMIT)} className="px-3 py-1.5 text-xs rounded border border-border text-muted-foreground hover:text-foreground disabled:opacity-40">Вперёд →</button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function ProductForm({ onClose, suppliers, categories }: { onClose:()=>void; suppliers:{id:string;name:string}[]; categories:string[] }) {
  const [f, setF] = useState({ trade_name:"",accounting_name:"",brand:"",description:"",product_type:"standard",category_ozon:"",supplier_id:"",purchase_price_vat:"" });
  const set = (k: string, v: string) => setF(p=>({...p,[k]:v}));

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex items-center gap-3">
        <button onClick={onClose} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"><Icon name="ArrowLeft" size={13} /> Назад</button>
        <span className="text-sm font-medium text-foreground">Новый товар</span>
      </div>

      <div className="grid grid-cols-2 gap-5">
        {/* Block 1 */}
        <Card className="p-5">
          <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-4">1. Основное</div>
          <div className="space-y-3">
            <FieldLabel label="Торговое название *"><Input value={f.trade_name} onChange={v=>set("trade_name",v)} /></FieldLabel>
            <FieldLabel label="Бухгалтерское название *"><Input value={f.accounting_name} onChange={v=>set("accounting_name",v)} /></FieldLabel>
            <FieldLabel label="Бренд"><Input value={f.brand} onChange={v=>set("brand",v)} /></FieldLabel>
            <FieldLabel label="Тип товара">
              <Select value={f.product_type} onChange={v=>set("product_type",v)} options={[{value:"standard",label:"Стандартный"},{value:"oversized",label:"Крупногабаритный"}]} className="w-full" />
            </FieldLabel>
            <FieldLabel label="Описание">
              <textarea value={f.description} onChange={e=>set("description",e.target.value)} rows={3}
                className="w-full px-3 py-2 text-xs rounded-lg border border-border bg-secondary text-foreground focus:outline-none resize-none" />
            </FieldLabel>
            <div className="border-2 border-dashed border-border rounded-lg p-6 text-center cursor-pointer hover:border-ring transition-colors">
              <Icon name="ImagePlus" size={20} className="mx-auto mb-2 text-muted-foreground" />
              <p className="text-xs text-muted-foreground">Загрузить фото (минимум 3)</p>
            </div>
          </div>
        </Card>

        {/* Block 2 */}
        <Card className="p-5">
          <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-4">2. Маркетплейс</div>
          <div className="space-y-3">
            <FieldLabel label="Категория Ozon">
              <Select value={f.category_ozon} onChange={v=>set("category_ozon",v)} options={[{value:"",label:"Выберите категорию"},...categories.map(c=>({value:c,label:c}))]} className="w-full" />
            </FieldLabel>
            {f.category_ozon && (
              <div className="text-xs text-green-400 flex items-center gap-1.5 bg-green-400/10 rounded-lg px-3 py-2">
                <Icon name="Percent" size={11} /> Комиссия подтянута из MarketplaceTariff
              </div>
            )}
          </div>

          <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-4 mt-6">3. Габариты</div>
          <div className="space-y-3">
            {[["Товар в сборе (Д×Ш×В, см)","dim_a"],["Вес в сборе (кг)","w_a"],["Упаковка (Д×Ш×В, см)","dim_p"],["Вес в упаковке (кг)","w_p"]].map(([l])=>(
              <FieldLabel key={l} label={l}><Input value="" onChange={()=>{}} placeholder="0" type="number" /></FieldLabel>
            ))}
          </div>
        </Card>

        {/* Block 4 */}
        <Card className="p-5 col-span-2">
          <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-4">4. Внутреннее</div>
          <div className="grid grid-cols-4 gap-4">
            <FieldLabel label="Поставщик *">
              <Select value={f.supplier_id} onChange={v=>set("supplier_id",v)} options={[{value:"",label:"Выберите"},...suppliers.map(s=>({value:s.id,label:s.name}))]} className="w-full" />
            </FieldLabel>
            <FieldLabel label="Цена закупки с НДС (₽) *">
              <Input value={f.purchase_price_vat} onChange={v=>set("purchase_price_vat",v)} type="number" placeholder="0" />
            </FieldLabel>
            <FieldLabel label="Цена без НДС (авто)">
              <div className="px-3 py-2 text-xs rounded-lg border border-border bg-secondary/50 text-muted-foreground font-mono">
                {f.purchase_price_vat ? fmt(parseFloat(f.purchase_price_vat)/1.22) : "—"}
              </div>
            </FieldLabel>
            <FieldLabel label="Наша цена (авто)">
              <div className="px-3 py-2 text-xs rounded-lg border border-border bg-secondary/50 font-mono"
                style={{color:"hsl(var(--cyan))"}}>
                {f.purchase_price_vat ? fmt((parseFloat(f.purchase_price_vat)/1.22)*1.08) : "—"}
              </div>
            </FieldLabel>
          </div>
        </Card>
      </div>

      <div className="flex gap-3">
        <button className="flex items-center gap-2 px-6 py-2.5 text-sm rounded-lg font-medium"
          style={{background:"hsl(var(--cyan))",color:"hsl(var(--primary-foreground))"}}>
          <Icon name="Save" size={14} /> Сохранить как черновик
        </button>
        <button className="flex items-center gap-2 px-6 py-2.5 text-sm rounded-lg font-medium border border-border text-muted-foreground hover:text-foreground">
          <Icon name="Send" size={14} /> Отправить на Ozon
        </button>
        <button onClick={onClose} className="px-6 py-2.5 text-sm rounded-lg border border-border text-muted-foreground hover:text-foreground ml-auto">Отмена</button>
      </div>
    </div>
  );
}
