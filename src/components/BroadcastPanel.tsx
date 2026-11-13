import React, { useState } from "react";
import {
  Activity,
  AlertTriangle,
  Ban,
  CheckCircle2,
  Clock,
  Copy,
  Infinity as InfinityIcon,
  Play,
  RefreshCw,
  Square,
  XCircle,
} from "lucide-react";
import type {
  AuthorizedUser,
  BroadcastState,
  GroupDeliveryStatus,
  KeepAliveStats,
  TemplateItem,
} from "../types";

interface BroadcastPanelProps {
  user: AuthorizedUser | null;
  templates: TemplateItem[];
  selectedGroupIds: string[];
  useVariation: boolean;
  adminOnly: boolean;
  botToken: string;
  adminChatId: string;
  broadcastState: BroadcastState;
  keepAlive: KeepAliveStats;
}

function formatCountdown(totalSeconds: number): string {
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

function renderStatusLabel(status: GroupDeliveryStatus): {
  label: string;
  colorClass: string;
  icon: React.ReactNode;
} {
  switch (status) {
    case "sent":
      return {
        label: "تم النشر",
        colorClass: "text-emerald-700",
        icon: <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />,
      };
    case "sending":
      return {
        label: "جاري الإرسال",
        colorClass: "text-sky-700",
        icon: <Clock className="h-4 w-4 text-sky-600 shrink-0" />,
      };
    case "skipped":
      return {
        label: "مستبعدة للقيود",
        colorClass: "text-amber-700",
        icon: <Ban className="h-4 w-4 text-amber-600 shrink-0" />,
      };
    case "error":
      return {
        label: "فشل",
        colorClass: "text-red-700",
        icon: <XCircle className="h-4 w-4 text-red-600 shrink-0" />,
      };
    default:
      return {
        label: "في الانتظار",
        colorClass: "text-slate-500",
        icon: <Clock className="h-4 w-4 text-slate-400 shrink-0" />,
      };
  }
}

export const BroadcastPanel: React.FC<BroadcastPanelProps> = ({
  user,
  templates,
  selectedGroupIds,
  useVariation,
  adminOnly,
  botToken,
  adminChatId,
  broadcastState,
  keepAlive,
}) => {
  const [minDelayMin, setMinDelayMin] = useState(5);
  const [maxDelayMin, setMaxDelayMin] = useState(10);
  const [autoIncludeNewGroups, setAutoIncludeNewGroups] = useState(true);
  const [actionError, setActionError] = useState("");
  const [copiedLogs, setCopiedLogs] = useState(false);
  const [copiedPingUrl, setCopiedPingUrl] = useState(false);

  const isActive =
    broadcastState.status === "running" ||
    broadcastState.status === "waiting" ||
    broadcastState.status === "flood_wait";

  const validTemplates = templates
    .map((t, idx) => ({
      title: t.title.trim() || `قالب ${idx + 1}`,
      content: t.content.trim(),
    }))
    .filter((t) => t.content.length > 0);

  const canStart =
    Boolean(user) &&
    selectedGroupIds.length > 0 &&
    validTemplates.length > 0 &&
    !isActive;

  const pingUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}${keepAlive.pingPath || "/ping"}`
      : "/ping";

  const handleStart = async () => {
    setActionError("");
    const safeMin = Math.max(1, minDelayMin);
    const safeMax = Math.max(safeMin, maxDelayMin);

    try {
      const res = await fetch("/api/broadcast/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          groupIds: selectedGroupIds,
          templates: validTemplates,
          minDelaySec: Math.round(safeMin * 60),
          maxDelaySec: Math.round(safeMax * 60),
          useVariation,
          adminOnly,
          autoIncludeNewGroups,
          botToken,
          adminChatId,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setActionError(data.error || "تعذر بدء النظام المستمر.");
      }
    } catch {
      setActionError("تعذر الاتصال بالخادم لبدء النظام.");
    }
  };

  const handleStop = async () => {
    try {
      await fetch("/api/broadcast/stop", { method: "POST" });
    } catch {
      setActionError("تعذر إرسال طلب الإيقاف.");
    }
  };

  const handleCopyLogs = async () => {
    const text = broadcastState.logs
      .map((l) => `[${l.timestamp}] [${l.level.toUpperCase()}] ${l.message}`)
      .join("\n");
    try {
      await navigator.clipboard.writeText(text);
      setCopiedLogs(true);
      setTimeout(() => setCopiedLogs(false), 2000);
    } catch {
      // تجاهل
    }
  };

  const handleCopyPingUrl = async () => {
    try {
      await navigator.clipboard.writeText(pingUrl);
      setCopiedPingUrl(true);
      setTimeout(() => setCopiedPingUrl(false), 2000);
    } catch {
      // تجاهل
    }
  };

  const handleTestPing = async () => {
    try {
      await fetch("/ping");
    } catch {
      // تجاهل
    }
  };

  const statusRecords = Object.values(broadcastState.groupStatuses);

  return (
    <div className="space-y-6">
      {/* رأس اللوحة */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">
            تشغيل ومراقبة النظام الدوري المستمر
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            تدوير متواصل للقوالب مع فحص تلقائي للمجموعات الجديدة في بداية كل دورة وفواصل عشوائية آمنة.
          </p>
        </div>

        <div className="flex items-center gap-3">
          {isActive ? (
            <button
              type="button"
              onClick={handleStop}
              className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-red-700 whitespace-nowrap shrink-0"
            >
              <Square className="h-4 w-4" />
              <span>إيقاف الحلقة المستمرة</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={handleStart}
              disabled={!canStart}
              className="inline-flex items-center gap-2 rounded-lg bg-sky-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-45 whitespace-nowrap shrink-0"
            >
              <Play className="h-4 w-4" />
              <span>تشغيل البث الدوري المستمر</span>
            </button>
          )}
        </div>
      </div>

      {actionError && (
        <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>{actionError}</span>
        </div>
      )}

      {/* إعدادات الجيتر والحلقة التشغيلية */}
      <section className="grid gap-6 lg:grid-cols-12">
        <div className="lg:col-span-5 rounded-xl border border-slate-200 bg-white p-6 space-y-4">
          <h2 className="text-base font-semibold text-slate-900">
            توقيت الفواصل العشوائية (Jitter Pacing)
          </h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate-600">
                الحد الأدنى (دقائق)
              </label>
              <input
                type="number"
                min={1}
                max={120}
                step="0.5"
                disabled={isActive}
                value={minDelayMin}
                onChange={(e) => setMinDelayMin(Math.max(1, Number(e.target.value)))}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 font-mono text-sm text-slate-900 tabular-nums outline-none focus:border-sky-600 disabled:bg-slate-50"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate-600">
                الحد الأقصى (دقائق)
              </label>
              <input
                type="number"
                min={minDelayMin}
                max={240}
                step="0.5"
                disabled={isActive}
                value={maxDelayMin}
                onChange={(e) =>
                  setMaxDelayMin(Math.max(minDelayMin, Number(e.target.value)))
                }
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 font-mono text-sm text-slate-900 tabular-nums outline-none focus:border-sky-600 disabled:bg-slate-50"
              />
            </div>
          </div>

          <label className="flex cursor-pointer items-start justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50/70 p-3.5">
            <div className="flex items-start gap-2.5">
              <RefreshCw className="mt-0.5 h-4 w-4 text-sky-600 shrink-0" />
              <div>
                <p className="text-xs font-semibold text-slate-900">
                  التحديث الديناميكي للمجموعات الجديدة في كل دورة
                </p>
                <p className="mt-0.5 text-xs text-slate-600">
                  إعادة فحص الحساب تلقائياً عند بداية كل دورة وتضمين أي مجموعات جديدة انضممت إليها فوراً.
                </p>
              </div>
            </div>
            <input
              type="checkbox"
              disabled={isActive}
              checked={autoIncludeNewGroups}
              onChange={(e) => setAutoIncludeNewGroups(e.target.checked)}
              className="mt-0.5 h-4 w-4 accent-sky-600 shrink-0"
            />
          </label>
        </div>

        <div className="lg:col-span-7 rounded-xl border border-slate-200 bg-white p-6 space-y-4">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-base font-semibold text-slate-900">
              هندسة التشغيل والتحقق المسبق
            </h2>
            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-sky-700">
              <InfinityIcon className="h-4 w-4" />
              <span>تدوير مستمر للدورات</span>
            </span>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 text-sm">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
              <span className="text-slate-600">حساب تيليجرام</span>
              <span
                className={`font-medium ${
                  user ? "text-emerald-700" : "text-red-600"
                }`}
              >
                {user ? `متصل (${user.firstName})` : "غير متصل"}
              </span>
            </div>
            <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
              <span className="text-slate-600">بوت الإشعارات</span>
              <span
                className={`font-medium ${
                  botToken && adminChatId ? "text-emerald-700" : "text-amber-700"
                }`}
              >
                {botToken && adminChatId ? "مهيأ وجاهز" : "اختياري (غير مضاف)"}
              </span>
            </div>
            <div className="flex items-center justify-between border-b border-slate-100 pb-2.5 sm:border-b-0 sm:pb-0">
              <span className="text-slate-600">قوالب التدوير المتاحة</span>
              <span className="font-mono font-semibold text-slate-900 tabular-nums">
                {validTemplates.length} قوالب
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-600">المجموعات في الدورة</span>
              <span
                className={`font-mono font-semibold tabular-nums ${
                  selectedGroupIds.length > 0 ? "text-slate-900" : "text-red-600"
                }`}
              >
                {selectedGroupIds.length} مجموعة
              </span>
            </div>
          </div>

          {/* بطاقة التشغيل السحابي 24/7 Render + UptimeRobot */}
          <div className="border-t border-slate-100 pt-4 space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Activity className="h-4 w-4 text-emerald-600 shrink-0" />
                <span className="text-xs font-semibold text-slate-900">
                  رابط التنشيط السحابي 24/7 (Render + UptimeRobot)
                </span>
              </div>
              <span className="text-xs text-slate-500 tabular-nums">
                طلبات التنشيط المستلمة:{" "}
                <strong className="font-mono text-slate-900">{keepAlive.pingCount}</strong>
                {keepAlive.lastPingAt
                  ? ` · آخر تنشيط: ${new Date(keepAlive.lastPingAt).toLocaleTimeString("en-GB")}`
                  : ""}
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <input
                type="text"
                readOnly
                dir="ltr"
                value={pingUrl}
                className="flex-1 min-w-[200px] rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 font-mono text-xs text-slate-700 outline-none"
              />
              <button
                type="button"
                onClick={handleCopyPingUrl}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap shrink-0"
              >
                <Copy className="h-3.5 w-3.5" />
                <span>{copiedPingUrl ? "تم النسخ" : "نسخ الرابط"}</span>
              </button>
              <button
                type="button"
                onClick={handleTestPing}
                className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-700 hover:bg-emerald-100 whitespace-nowrap shrink-0"
              >
                اختبار Ping
              </button>
            </div>
            <p className="text-xs text-slate-500">
              أضف هذا الرابط في موقع UptimeRobot بفاصل فحص كل 5 دقائق (HTTP/HEAD) لمنع السبات عند الاستضافة على Render.
            </p>
          </div>
        </div>
      </section>

      {/* شريط العداد التنازلي أثناء الفاصل العشوائي أو FloodWait */}
      {(broadcastState.status === "waiting" ||
        broadcastState.status === "flood_wait") && (
        <div
          className={`flex flex-wrap items-center justify-between gap-4 rounded-xl border p-5 ${
            broadcastState.status === "flood_wait"
              ? "border-amber-300 bg-amber-50"
              : "border-sky-200 bg-sky-50"
          }`}
        >
          <div className="flex items-center gap-3">
            <Clock
              className={`h-5 w-5 shrink-0 ${
                broadcastState.status === "flood_wait"
                  ? "text-amber-600"
                  : "text-sky-600"
              }`}
            />
            <div>
              <p className="text-sm font-semibold text-slate-900">
                {broadcastState.status === "flood_wait"
                  ? "توقف تلقائي بسبب قيود FloodWait"
                  : `الدورة #${broadcastState.currentCycle} · فاصل عشوائي قيد العد التنازلي`}
              </p>
              <p className="text-xs text-slate-600">
                {broadcastState.countdownReason}
              </p>
            </div>
          </div>
          <div className="font-mono text-2xl font-semibold text-slate-900 tabular-nums">
            {formatCountdown(broadcastState.countdownSeconds)}
          </div>
        </div>
      )}

      {/* شريط المؤشرات المباشر */}
      <section className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-xs text-slate-500">الدورة الحالية</p>
          <p className="mt-1 font-mono text-2xl font-semibold text-sky-700 tabular-nums">
            {broadcastState.currentCycle > 0 ? `#${broadcastState.currentCycle}` : "—"}
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-xs text-slate-500">تقدم الدورة</p>
          <p className="mt-1 font-mono text-2xl font-semibold text-slate-900 tabular-nums">
            {broadcastState.succeededCount}/{broadcastState.totalTargets}
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-xs text-slate-500">الدورات المكتملة</p>
          <p className="mt-1 font-mono text-2xl font-semibold text-slate-900 tabular-nums">
            {broadcastState.totalCyclesCompleted}
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-xs text-slate-500">إجمالي المنشورات</p>
          <p className="mt-1 font-mono text-2xl font-semibold text-emerald-700 tabular-nums">
            {broadcastState.totalSentAllCycles}
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-xs text-slate-500">مجموعات مكتشفة</p>
          <p className="mt-1 font-mono text-2xl font-semibold text-sky-700 tabular-nums">
            {broadcastState.newGroupsDiscoveredCount}
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-xs text-slate-500">مستبعدة للقيود</p>
          <p className="mt-1 font-mono text-2xl font-semibold text-amber-700 tabular-nums">
            {broadcastState.skippedCount}
          </p>
        </div>
      </section>

      {/* جدول توزيع القوالب للدورة الحالية + سجل الأحداث */}
      <div className="grid gap-6 lg:grid-cols-12">
        <section className="lg:col-span-6 rounded-xl border border-slate-200 bg-white overflow-hidden">
          <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3.5">
            <h2 className="text-sm font-semibold text-slate-900">
              توزيع القوالب وحالة التسليم{" "}
              {broadcastState.currentCycle > 0
                ? `(الدورة #${broadcastState.currentCycle})`
                : ""}
            </h2>
          </div>

          {statusRecords.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-500">
              ستظهر هنا خطة توزيع القوالب وحالة كل مجموعة بمجرد بدء التشغيل المستمر.
            </div>
          ) : (
            <div className="max-h-96 overflow-y-auto divide-y divide-slate-100">
              {statusRecords.map((rec) => {
                const st = renderStatusLabel(rec.status);
                return (
                  <div
                    key={rec.groupId}
                    className="flex items-center justify-between gap-4 px-5 py-3 text-sm"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-medium text-slate-900">{rec.title}</p>
                      <p className="truncate text-xs text-slate-500">
                        القالب:{" "}
                        <span className="font-medium text-slate-700">
                          {rec.assignedTemplateTitle}
                        </span>{" "}
                        · {rec.detail}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5 whitespace-nowrap shrink-0">
                      {st.icon}
                      <span className={`text-xs font-medium ${st.colorClass}`}>
                        {st.label}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <section className="lg:col-span-6 rounded-xl border border-slate-200 bg-slate-900 text-slate-100 overflow-hidden flex flex-col">
          <div className="flex items-center justify-between border-b border-slate-800 px-5 py-3.5">
            <h2 className="text-sm font-semibold text-white">
              سجل العمليات المباشر
            </h2>
            <button
              type="button"
              onClick={handleCopyLogs}
              disabled={broadcastState.logs.length === 0}
              className="inline-flex items-center gap-1.5 rounded border border-slate-700 bg-slate-800 px-2.5 py-1 text-xs text-slate-200 hover:bg-slate-700 disabled:opacity-40 whitespace-nowrap"
            >
              <Copy className="h-3.5 w-3.5" />
              <span>{copiedLogs ? "تم النسخ" : "نسخ السجل"}</span>
            </button>
          </div>

          <div className="h-96 overflow-y-auto p-4 space-y-2 text-xs leading-relaxed">
            {broadcastState.logs.length === 0 ? (
              <p className="text-slate-400">
                لا توجد أحداث مسجلة بعد. ابدأ النظام لمراقبة الدورات المتواصلة والفواصل العشوائية هنا.
              </p>
            ) : (
              broadcastState.logs.map((entry) => {
                const color =
                  entry.level === "success"
                    ? "text-emerald-400"
                    : entry.level === "warning"
                    ? "text-amber-300"
                    : entry.level === "error"
                    ? "text-red-400"
                    : "text-slate-300";
                return (
                  <div key={entry.id} className="flex items-start gap-2.5">
                    <span
                      dir="ltr"
                      className="font-mono text-slate-500 tabular-nums shrink-0"
                    >
                      [{entry.timestamp}]
                    </span>
                    <span className={color}>{entry.message}</span>
                  </div>
                );
              })
            )}
          </div>
        </section>
      </div>
    </div>
  );
};
