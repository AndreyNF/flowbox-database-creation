import { useEffect, useState, useRef } from "react";
import { mgrGet, mgrPost } from "@/lib/managerApi";
import { Loader, ErrMsg, SectionHdr } from "../shared";
import Icon from "@/components/ui/icon";

interface Chat { company_id:string; company_name:string; unread:number; last_msg:string|null; }
interface Msg { id:string; from_role:string; text:string; is_read:boolean; created_at:string; }

export default function MgrSupport() {
  const [chats, setChats] = useState<Chat[]>([]);
  const [activeChat, setActiveChat] = useState<string|null>(null);
  const [activeName, setActiveName] = useState("");
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [msgLoading, setMsgLoading] = useState(false);
  const [err, setErr] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    mgrGet("support").then(d=>setChats(d.chats||[])).catch((e:Error)=>setErr(e.message)).finally(()=>setLoading(false));
  }, []);

  useEffect(() => { bottomRef.current?.scrollIntoView({behavior:"smooth"}); }, [messages]);

  async function openChat(cid: string, name: string) {
    setActiveChat(cid); setActiveName(name); setMsgLoading(true);
    try {
      const d = await mgrGet("support_messages", { company_id:cid });
      setMessages(d.messages||[]);
      setChats(prev => prev.map(c => c.company_id===cid ? {...c,unread:0} : c));
    } catch(e:Error){ setErr((e as Error).message); }
    finally { setMsgLoading(false); }
  }

  async function send() {
    if (!input.trim()||!activeChat) return;
    const text = input.trim(); setInput("");
    await mgrPost("support_send", { company_id:activeChat, text });
    setMessages(prev=>[...prev,{id:Date.now().toString(),from_role:"manager",text,is_read:false,created_at:new Date().toISOString()}]);
  }

  const totalUnread = chats.reduce((s,c)=>s+c.unread,0);

  return (
    <div className="space-y-4 animate-fade-in">
      <SectionHdr title="Поддержка" sub={totalUnread>0?`${totalUnread} непрочитанных`:undefined} />
      {err && <ErrMsg msg={err} />}
      <div className="flex gap-4 h-[calc(100vh-220px)]">
        {/* Chat list */}
        <div className="w-64 flex-shrink-0 rounded-xl border border-border overflow-hidden flex flex-col" style={{background:"hsl(var(--card))"}}>
          <div className="px-4 py-3 border-b border-border text-xs font-medium text-muted-foreground uppercase tracking-wider">Клиенты</div>
          <div className="flex-1 overflow-y-auto">
            {loading ? <Loader /> : chats.length === 0 ? <p className="px-4 py-8 text-xs text-muted-foreground text-center">Нет чатов</p> :
              chats.map(c => (
                <button key={c.company_id} onClick={()=>openChat(c.company_id,c.company_name)}
                  className={`w-full text-left px-4 py-3 border-b border-border transition-all ${activeChat===c.company_id?"":"hover:bg-secondary/50"}`}
                  style={activeChat===c.company_id?{background:"hsl(var(--sidebar-accent))"}:{}}>
                  <div className="flex items-center justify-between">
                    <span className={`text-xs font-medium truncate ${activeChat===c.company_id?"text-foreground":"text-muted-foreground"}`}>{c.company_name}</span>
                    {c.unread>0 && <span className="w-5 h-5 rounded-full text-[9px] font-bold flex items-center justify-center flex-shrink-0 ml-2" style={{background:"hsl(var(--rose))",color:"#fff"}}>{c.unread}</span>}
                  </div>
                  {c.last_msg && <div className="text-[10px] text-muted-foreground mt-0.5">{new Date(c.last_msg).toLocaleDateString("ru",{day:"2-digit",month:"2-digit"})}</div>}
                </button>
              ))
            }
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 rounded-xl border border-border overflow-hidden flex flex-col" style={{background:"hsl(var(--card))"}}>
          {!activeChat ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center text-muted-foreground">
                <Icon name="MessageCircle" size={32} className="mx-auto mb-3 opacity-30" />
                <p className="text-sm">Выберите клиента</p>
              </div>
            </div>
          ) : (
            <>
              <div className="px-5 py-3 border-b border-border flex items-center gap-3 flex-shrink-0">
                <div className="w-7 h-7 rounded-full bg-secondary flex items-center justify-center"><Icon name="Building2" size={13} className="text-muted-foreground" /></div>
                <span className="text-xs font-medium text-foreground">{activeName}</span>
              </div>
              <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
                {msgLoading ? <Loader /> : messages.map(m => (
                  <div key={m.id} className={`flex ${m.from_role==="manager"?"justify-end":"justify-start"}`}>
                    <div className={`max-w-sm rounded-xl px-4 py-2.5 text-xs leading-relaxed ${m.from_role==="manager"?"rounded-br-sm":"rounded-bl-sm"}`}
                      style={m.from_role==="manager"?{background:"hsl(var(--cyan))",color:"hsl(var(--primary-foreground))"}:{background:"hsl(var(--secondary))",color:"hsl(var(--foreground))"}}>
                      {m.text}
                      <div className={`text-[10px] mt-1 ${m.from_role==="manager"?"opacity-80 text-right":"text-muted-foreground"}`}>
                        {new Date(m.created_at).toLocaleTimeString("ru",{hour:"2-digit",minute:"2-digit"})}
                      </div>
                    </div>
                  </div>
                ))}
                <div ref={bottomRef} />
              </div>
              <div className="px-4 py-3 border-t border-border flex items-end gap-3 flex-shrink-0">
                <textarea value={input} onChange={e=>setInput(e.target.value)}
                  onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();send();}}}
                  placeholder="Ответить клиенту... (Enter)" rows={1}
                  className="flex-1 px-3 py-2 text-sm rounded-lg border border-border bg-secondary text-foreground placeholder:text-muted-foreground focus:outline-none resize-none" />
                <button onClick={send} disabled={!input.trim()}
                  className="w-9 h-9 rounded-lg flex items-center justify-center disabled:opacity-40"
                  style={{background:"hsl(var(--cyan))",color:"hsl(var(--primary-foreground))"}}>
                  <Icon name="Send" size={14} />
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
