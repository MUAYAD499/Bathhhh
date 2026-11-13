import { useEffect, useState } from "react";
import {
  FileText,
  KeyRound,
  Send,
  Users,
  CheckCircle2,
  Circle,
} from "lucide-react";
import { ConnectionPanel } from "./components/ConnectionPanel";
import { TemplatesPanel } from "./components/TemplatesPanel";
import { GroupsPanel } from "./components/GroupsPanel";
import { BroadcastPanel } from "./components/BroadcastPanel";
import type {
  AuthorizedUser,
  BroadcastState,
  KeepAliveStats,
  TargetGroup,
  TemplateItem,
} from "./types";

type TabId = "connection" | "templates" | "groups" | "broadcast";

const DEFAULT_TEMPLATES: TemplateItem[] = [
  {
    id: "tpl-default-1",
    title: "نصيحة تقنية مجتمعية",
    content:
      "{معلومة تقنية|فائدة برمجية} اليوم لأعضاء {group_name}:\n\nاحرص دائماً على كتابة رسائل خطأ واضحة وتسجيل الأحداث المهمة أثناء بناء الأنظمة البرمجية؛ فذلك يختصر نصف وقت الصيانة والتطوير مستقبلاً.\n\nتحديث بتاريخ: {date}",
  },
];

const INITIAL_BROADCAST_STATE: BroadcastState = {
  status: "idle",
  currentCycle: 0,
  totalCyclesCompleted: 0,
  totalTargets: 0,
  processedCount: 0,
  succeededCount: 0,
  totalSentAllCycles: 0,
  skippedCount: 0,
  failedCount: 0,
  floodWaitsCount: 0,
  newGroupsDiscoveredCount: 0,
  currentGroupTitle: "",
  countdownSeconds: 0,
  countdownReason: "",
  startedAt: null,
  finishedAt: null,
  groupStatuses: {},
  logs: [],
};

function readStorage(key: string, fallback: string): string {
  try {
    return localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
}

export default function App() {
  const [activeTab, setActiveTab] = useState<TabId>("connection");

  // إعدادات الاتصال المحفوظة محلياً لتسهيل إعادة الاستخدام
  const [apiId, setApiId] = useState(() => readStorage("tg_api_id", ""));
  const [apiHash, setApiHash] = useState(() => readStorage("tg_api_hash", ""));
  const [phoneNumber, setPhoneNumber] = useState(() => readStorage("tg_phone", ""));
  const [botToken, setBotToken] = useState(() => readStorage("tg_bot_token", ""));
  const [adminChatId, setAdminChatId] = useState(() => readStorage("tg_admin_chat_id", ""));
  const [savedSession, setSavedSession] = useState(() => readStorage("tg_session_string", ""));

  const [user, setUser] = useState<AuthorizedUser | null>(null);
  const [groups, setGroups] = useState<TargetGroup[]>([]);
  const [selectedGroupIds, setSelectedGroupIds] = useState<string[]>([]);
  const [adminOnly, setAdminOnly] = useState(true);

  const [templates, setTemplates] = useState<TemplateItem[]>(() => {
    try {
      const raw = localStorage.getItem("tg_templates");
      if (raw) {
        const parsed = JSON.parse(raw) as TemplateItem[];
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {
      // تجاهل أخطاء قراءة التخزين المحلي
    }
    return DEFAULT_TEMPLATES;
  });
  const [useVariation, setUseVariation] = useState(true);
  const [broadcastState, setBroadcastState] = useState<BroadcastState>(
    INITIAL_BROADCAST_STATE
  );
  const [keepAlive, setKeepAlive] = useState<KeepAliveStats>({
    startedAt: new Date().toISOString(),
    pingCount: 0,
    lastPingAt: null,
    pingPath: "/ping",
  });

  // مزامنة الإعدادات مع التخزين المحلي
  useEffect(() => {
    try {
      localStorage.setItem("tg_api_id", apiId);
      localStorage.setItem("tg_api_hash", apiHash);
      localStorage.setItem("tg_phone", phoneNumber);
      localStorage.setItem("tg_bot_token", botToken);
      localStorage.setItem("tg_admin_chat_id", adminChatId);
      localStorage.setItem("tg_session_string", savedSession);
      localStorage.setItem("tg_templates", JSON.stringify(templates));
    } catch {
      // تجاهل أخطاء الكتابة في التخزين المحلي
    }
  }, [apiId, apiHash, phoneNumber, botToken, adminChatId, savedSession, templates]);

  // استرجاع حالة الاتصال والبث عند تحميل الصفحة والاشتراك في SSE
  useEffect(() => {
    void (async () => {
      try {
        const [authRes, stateRes, keepAliveRes] = await Promise.all([
          fetch("/api/auth/status"),
          fetch("/api/broadcast/state"),
          fetch("/api/keepalive"),
        ]);
        if (authRes.ok) {
          const authData = await authRes.json();
          if (authData.authorized && authData.user) {
            setUser(authData.user);
            if (authData.sessionString) setSavedSession(authData.sessionString);
          }
        }
        if (stateRes.ok) {
          const stateData = (await stateRes.json()) as BroadcastState;
          setBroadcastState(stateData);
        }
        if (keepAliveRes.ok) {
          const keepAliveData = (await keepAliveRes.json()) as KeepAliveStats;
          setKeepAlive(keepAliveData);
        }
      } catch {
        // تجاهل خطأ التهيئة الأولية
      }
    })();

    const eventSource = new EventSource("/api/events");
    eventSource.addEventListener("state", (event) => {
      try {
        const nextState = JSON.parse((event as MessageEvent).data) as BroadcastState;
        setBroadcastState(nextState);
      } catch {
        // تجاهل
      }
    });
    eventSource.addEventListener("log", (event) => {
      try {
        const logEntry = JSON.parse((event as MessageEvent).data);
        setBroadcastState((prev) => {
          if (prev.logs.some((l) => l.id === logEntry.id)) return prev;
          return {
            ...prev,
            logs: [...prev.logs.slice(-199), logEntry],
          };
        });
      } catch {
        // تجاهل
      }
    });
    eventSource.addEventListener("groups", (event) => {
      try {
        const latestGroups = JSON.parse((event as MessageEvent).data) as TargetGroup[];
        setGroups(latestGroups);
      } catch {
        // تجاهل
      }
    });
    eventSource.addEventListener("keepalive", (event) => {
      try {
        const stats = JSON.parse((event as MessageEvent).data) as {
          startedAt: string;
          pingCount: number;
          lastPingAt: string | null;
        };
        setKeepAlive((prev) => ({
          ...prev,
          startedAt: stats.startedAt,
          pingCount: stats.pingCount,
          lastPingAt: stats.lastPingAt,
        }));
      } catch {
        // تجاهل
      }
    });

    return () => {
      eventSource.close();
    };
  }, []);

  const navItems: {
    id: TabId;
    label: string;
    icon: typeof KeyRound;
    done: boolean;
  }[] = [
    {
      id: "connection",
      label: "1. الربط والإعدادات",
      icon: KeyRound,
      done: Boolean(user),
    },
    {
      id: "templates",
      label: "2. القوالب والتنويع",
      icon: FileText,
      done: templates.some((t) => t.content.trim().length > 0),
    },
    {
      id: "groups",
      label: "3. المجموعات المستهدفة",
      icon: Users,
      done: selectedGroupIds.length > 0,
    },
    {
      id: "broadcast",
      label: "4. لوحة النشر والسجل",
      icon: Send,
      done: broadcastState.status === "completed",
    },
  ];

  const currentTabLabel =
    navItems.find((item) => item.id === activeTab)?.label ?? "";

  const isBroadcasting =
    broadcastState.status === "running" ||
    broadcastState.status === "waiting" ||
    broadcastState.status === "flood_wait";

  return (
    <div dir="rtl" className="min-h-screen bg-slate-50 text-slate-900 flex flex-col lg:flex-row">
      {/* الشريط الجانبي (Desktop) */}
      <aside className="w-full lg:w-64 shrink-0 border-b lg:border-b-0 lg:border-l border-slate-200 bg-white flex flex-col justify-between">
        <div>
          <div className="border-b border-slate-200 px-5 py-4">
            <span className="text-base font-bold tracking-tight text-slate-900 whitespace-nowrap">
              بث المجتمعات
            </span>
          </div>

          <nav className="p-3 flex lg:flex-col gap-1 overflow-x-auto">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveTab(item.id)}
                  className={`flex items-center justify-between gap-2.5 rounded-lg px-3.5 py-2.5 text-sm font-medium transition-colors whitespace-nowrap shrink-0 lg:w-full ${
                    isActive
                      ? "bg-slate-900 text-white"
                      : "text-slate-700 hover:bg-slate-100 hover:text-slate-900"
                  }`}
                >
                  <span className="flex items-center gap-2.5">
                    <Icon className="h-4 w-4 shrink-0" />
                    <span>{item.label}</span>
                  </span>
                  {item.done ? (
                    <CheckCircle2
                      className={`h-4 w-4 shrink-0 ${
                        isActive ? "text-emerald-300" : "text-emerald-600"
                      }`}
                    />
                  ) : (
                    <Circle
                      className={`h-3.5 w-3.5 shrink-0 ${
                        isActive ? "text-slate-500" : "text-slate-300"
                      }`}
                    />
                  )}
                </button>
              );
            })}
          </nav>
        </div>

        {/* ملخص الحساب أسفل الشريط الجانبي */}
        <div className="hidden lg:block border-t border-slate-200 p-4 text-xs text-slate-600 space-y-1.5">
          <div className="flex items-center justify-between">
            <span>حالة الحساب</span>
            <span className={user ? "font-medium text-emerald-700" : "text-slate-500"}>
              {user ? "متصل" : "غير متصل"}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span>المجموعات المحددة</span>
            <span className="font-mono font-semibold text-slate-900 tabular-nums">
              {selectedGroupIds.length}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span>حالة البث</span>
            <span className="font-medium text-slate-900">
              {isBroadcasting ? "قيد التشغيل" : "جاهز"}
            </span>
          </div>
        </div>
      </aside>

      {/* منطقة العمل الرئيسية */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* الشريط العلوي */}
        <header className="border-b border-slate-200 bg-white px-6 py-3.5 flex items-center justify-between gap-8">
          <div className="flex items-center gap-2 text-sm text-slate-600 min-w-0">
            <span className="text-slate-400 whitespace-nowrap">مساحة العمل</span>
            <span aria-hidden="true" className="text-slate-300">
              /
            </span>
            <span className="font-semibold text-slate-900 truncate">
              {currentTabLabel}
            </span>
          </div>

          <div className="shrink-0">
            <button
              type="button"
              onClick={() => setActiveTab("broadcast")}
              className="rounded-lg bg-sky-600 px-4 py-2 text-xs font-medium text-white transition-colors hover:bg-sky-700 whitespace-nowrap shrink-0"
            >
              {isBroadcasting ? "مراقبة البث المباشر" : "الانتقال إلى النشر"}
            </button>
          </div>
        </header>

        {/* المحتوى النشط */}
        <main className="flex-1 p-6 lg:p-8 max-w-6xl w-full mx-auto">
          {activeTab === "connection" && (
            <ConnectionPanel
              apiId={apiId}
              setApiId={setApiId}
              apiHash={apiHash}
              setApiHash={setApiHash}
              phoneNumber={phoneNumber}
              setPhoneNumber={setPhoneNumber}
              botToken={botToken}
              setBotToken={setBotToken}
              adminChatId={adminChatId}
              setAdminChatId={setAdminChatId}
              savedSession={savedSession}
              onSessionSaved={setSavedSession}
              user={user}
              onUserChanged={setUser}
              onNavigateNext={() => setActiveTab("templates")}
            />
          )}

          {activeTab === "templates" && (
            <TemplatesPanel
              templates={templates}
              setTemplates={setTemplates}
              useVariation={useVariation}
              setUseVariation={setUseVariation}
              onNavigateNext={() => setActiveTab("groups")}
            />
          )}

          {activeTab === "groups" && (
            <GroupsPanel
              user={user}
              groups={groups}
              setGroups={setGroups}
              selectedGroupIds={selectedGroupIds}
              setSelectedGroupIds={setSelectedGroupIds}
              adminOnly={adminOnly}
              setAdminOnly={setAdminOnly}
              onNavigateConnect={() => setActiveTab("connection")}
              onNavigateNext={() => setActiveTab("broadcast")}
            />
          )}

          {activeTab === "broadcast" && (
            <BroadcastPanel
              user={user}
              templates={templates}
              selectedGroupIds={selectedGroupIds}
              useVariation={useVariation}
              adminOnly={adminOnly}
              botToken={botToken}
              adminChatId={adminChatId}
              broadcastState={broadcastState}
              keepAlive={keepAlive}
            />
          )}
        </main>
      </div>
    </div>
  );
}
