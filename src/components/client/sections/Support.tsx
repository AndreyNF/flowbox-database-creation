import { useState, useRef, useEffect } from "react";
import Icon from "@/components/ui/icon";
import { SectionHeader } from "../shared";

interface Message {
  id: number; text: string; from: "client" | "manager";
  time: string; read: boolean;
}

const INITIAL_MESSAGES: Message[] = [
  { id: 1, text: "Добро пожаловать в FlowBox! Ваш менеджер готов помочь с любыми вопросами.", from: "manager", time: "10:00", read: true },
  { id: 2, text: "Здравствуйте! Когда ожидать поставку по заказу ORD-4820?", from: "client", time: "10:05", read: true },
  { id: 3, text: "Добрый день! Заказ ORD-4820 уже передан в СДЭК, ориентировочно прибудет 23 мая. Трек-номер: RU-55671234", from: "manager", time: "10:12", read: true },
];

interface Props { companyId: string; }

export default function Support({ companyId: _companyId }: Props) {
  const [messages, setMessages] = useState<Message[]>(INITIAL_MESSAGES);
  const [input, setInput] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [newSubject, setNewSubject] = useState("");
  const [newText, setNewText] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  function sendMessage() {
    if (!input.trim()) return;
    setMessages(prev => [
      ...prev,
      {
        id: Date.now(), text: input.trim(), from: "client",
        time: new Date().toLocaleTimeString("ru", { hour: "2-digit", minute: "2-digit" }),
        read: false,
      },
    ]);
    setInput("");
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  }

  function submitNew() {
    if (!newSubject.trim() || !newText.trim()) return;
    setMessages(prev => [
      ...prev,
      {
        id: Date.now(),
        text: `📋 Новое обращение: ${newSubject}\n\n${newText}`,
        from: "client",
        time: new Date().toLocaleTimeString("ru", { hour: "2-digit", minute: "2-digit" }),
        read: false,
      },
    ]);
    setNewSubject(""); setNewText(""); setShowNew(false);
  }

  return (
    <div className="space-y-4 animate-fade-in h-full">
      <SectionHeader
        title="Поддержка"
        subtitle="Чат с вашим персональным менеджером"
        action={
          <button onClick={() => setShowNew(true)}
            className="flex items-center gap-2 text-xs px-3 py-1.5 rounded-lg font-medium transition-all hover:opacity-90"
            style={{ background: "hsl(var(--cyan))", color: "hsl(var(--primary-foreground))" }}>
            <Icon name="Plus" size={13} />
            Новое обращение
          </button>
        }
      />

      <div className="rounded-xl border border-border overflow-hidden flex flex-col" style={{ background: "hsl(var(--card))", height: "calc(100vh - 260px)" }}>
        {/* Chat header */}
        <div className="px-5 py-3 border-b border-border flex items-center gap-3 flex-shrink-0">
          <div className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center">
            <Icon name="User" size={14} className="text-muted-foreground" />
          </div>
          <div>
            <div className="text-xs font-medium text-foreground">Ваш менеджер</div>
            <div className="flex items-center gap-1 text-[10px] text-green-400">
              <span className="w-1.5 h-1.5 rounded-full bg-green-400 inline-block animate-pulse-dot" />
              Онлайн
            </div>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
          {messages.map(msg => (
            <div key={msg.id} className={`flex ${msg.from === "client" ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-xs rounded-xl px-4 py-2.5 text-xs leading-relaxed ${msg.from === "client" ? "rounded-br-sm" : "rounded-bl-sm"}`}
                style={msg.from === "client"
                  ? { background: "hsl(var(--cyan))", color: "hsl(var(--primary-foreground))" }
                  : { background: "hsl(var(--secondary))", color: "hsl(var(--foreground))" }
                }
              >
                <p className="whitespace-pre-wrap">{msg.text}</p>
                <div className={`text-[10px] mt-1 flex items-center gap-1 ${msg.from === "client" ? "justify-end opacity-80" : "text-muted-foreground"}`}>
                  {msg.time}
                  {msg.from === "client" && <Icon name={msg.read ? "CheckCheck" : "Check"} size={10} />}
                </div>
              </div>
            </div>
          ))}
          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <div className="px-4 py-3 border-t border-border flex items-end gap-3 flex-shrink-0">
          <textarea
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Написать сообщение... (Enter для отправки)"
            rows={1}
            className="flex-1 px-3 py-2 text-sm rounded-lg border border-border bg-secondary text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring resize-none"
            style={{ minHeight: "38px", maxHeight: "120px" }}
          />
          <button
            onClick={sendMessage}
            disabled={!input.trim()}
            className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 transition-all disabled:opacity-40"
            style={{ background: "hsl(var(--cyan))", color: "hsl(var(--primary-foreground))" }}
          >
            <Icon name="Send" size={14} />
          </button>
        </div>
      </div>

      {/* New appeal modal */}
      {showNew && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setShowNew(false)}>
          <div className="rounded-xl border border-border p-6 w-full max-w-md animate-fade-in" style={{ background: "hsl(var(--card))" }}
            onClick={e => e.stopPropagation()}>
            <div className="text-sm font-medium text-foreground mb-4">Новое обращение</div>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Тема *</label>
                <input value={newSubject} onChange={e => setNewSubject(e.target.value)}
                  placeholder="Кратко опишите проблему"
                  className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-secondary text-foreground focus:outline-none focus:ring-1 focus:ring-ring" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Описание *</label>
                <textarea value={newText} onChange={e => setNewText(e.target.value)}
                  placeholder="Подробно опишите вашу ситуацию..."
                  rows={4}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-secondary text-foreground focus:outline-none focus:ring-1 focus:ring-ring resize-none" />
              </div>
            </div>
            <div className="flex gap-2 mt-4">
              <button onClick={submitNew}
                disabled={!newSubject.trim() || !newText.trim()}
                className="flex-1 py-2 rounded-lg text-xs font-medium disabled:opacity-40"
                style={{ background: "hsl(var(--cyan))", color: "hsl(var(--primary-foreground))" }}>
                Отправить
              </button>
              <button onClick={() => setShowNew(false)}
                className="flex-1 py-2 rounded-lg text-xs border border-border text-muted-foreground hover:text-foreground">
                Отмена
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}