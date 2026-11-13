import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import telegramPkg from "telegram";
import type { TelegramClient as TelegramClientType } from "telegram";

const { TelegramClient, Api, sessions } = telegramPkg;
const { StringSession } = sessions;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ==============================================================================
// أنواع البيانات والحالة الداخلية للخادم
// ==============================================================================
interface AuthorizedUser {
  id: string;
  firstName: string;
  lastName: string;
  username: string;
  phone: string;
}

interface TargetGroup {
  id: string;
  title: string;
  roleLabel: string;
  isAdmin: boolean;
  membersCount: number;
  username: string;
}

interface LogEntry {
  id: string;
  timestamp: string;
  level: "info" | "success" | "warning" | "error";
  message: string;
}

type GroupDeliveryStatus = "pending" | "sending" | "sent" | "skipped" | "error";

interface TemplatePayload {
  title: string;
  content: string;
}

interface GroupStatusRecord {
  groupId: string;
  title: string;
  status: GroupDeliveryStatus;
  detail: string;
  assignedTemplateTitle: string;
  cycleNumber: number;
  updatedAt: string;
}

interface BroadcastState {
  status: "idle" | "running" | "waiting" | "flood_wait" | "completed" | "stopped";
  currentCycle: number;
  totalCyclesCompleted: number;
  totalTargets: number;
  processedCount: number;
  succeededCount: number;
  totalSentAllCycles: number;
  skippedCount: number;
  failedCount: number;
  floodWaitsCount: number;
  newGroupsDiscoveredCount: number;
  currentGroupTitle: string;
  countdownSeconds: number;
  countdownReason: string;
  startedAt: string | null;
  finishedAt: string | null;
  groupStatuses: Record<string, GroupStatusRecord>;
  logs: LogEntry[];
}

// ==============================================================================
// محرك تنويع وتنسيق المحتوى التعليمي
// ==============================================================================
const OPENERS = [
  "💡 <b>إضاءة تعليمية لمجموعة {group_name}:</b>",
  "📘 <b>ملخص معرفي وتقني — {group_name}:</b>",
  "✨ <b>تحديث مجتمعي مفيد لأعضاء {group_name}:</b>",
  "🚀 <b>فائدة سريعة ومشاركة تقنية:</b>",
  "📌 <b>نقطة تعليمية تستحق التأمل:</b>",
];

const CLOSERS = [
  "💬 شاركونا آراءكم وتجاربكم حول هذا الموضوع في التعليقات.",
  "🤝 نتمنى لكم الفائدة والتوفيق الدائم في {group_name}.",
  "🔖 احفظوا هذه الملاحظة للرجوع إليها لاحقاً.",
  "🌟 كل التوفيق للجميع، ونرحب بنقاشاتكم البنّاءة.",
  "📚 استمروا في التعلم والمشاركة، فالمعرفة تنمو بالتبادل.",
];

const DIVIDERS = ["───────────────", "• • • • • • •", "━━━━━━━━━━━━━━━", ""];

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function resolveSpintax(text: string): string {
  let result = text;
  const pattern = /\{([^{}|]+\|[^{}]+)\}/;
  let match = pattern.exec(result);
  let safetyCounter = 0;
  while (match && safetyCounter < 50) {
    safetyCounter += 1;
    const options = match[1].split("|");
    const chosen = options[Math.floor(Math.random() * options.length)] ?? "";
    result = result.slice(0, match.index) + chosen + result.slice(match.index + match[0].length);
    match = pattern.exec(result);
  }
  return result;
}

function formatMessageForGroup(
  template: string,
  groupTitle: string,
  useStructuralVariation: boolean
): string {
  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10);
  const timeStr = now.toTimeString().slice(0, 5);

  let body = resolveSpintax(template).trim();
  body = body
    .replace(/\{group_name\}/g, groupTitle)
    .replace(/\{date\}/g, dateStr)
    .replace(/\{time\}/g, timeStr);

  if (!useStructuralVariation) {
    return escapeHtml(body);
  }

  const opener = OPENERS[Math.floor(Math.random() * OPENERS.length)].replace(
    /\{group_name\}/g,
    escapeHtml(groupTitle)
  );
  const closer = CLOSERS[Math.floor(Math.random() * CLOSERS.length)].replace(
    /\{group_name\}/g,
    escapeHtml(groupTitle)
  );
  const divider = DIVIDERS[Math.floor(Math.random() * DIVIDERS.length)];
  const safeBody = escapeHtml(body);

  const parts = [opener];
  if (divider) parts.push(divider);
  parts.push(safeBody);
  if (divider) parts.push(divider);
  parts.push(closer);

  return parts.join("\n\n");
}

// ==============================================================================
// إرسال إشعارات البوت عبر Telegram Bot API
// ==============================================================================
async function sendBotNotification(
  botToken: string,
  adminChatId: string,
  htmlMessage: string
): Promise<{ ok: boolean; error?: string }> {
  if (!botToken.trim() || !adminChatId.trim()) {
    return { ok: false, error: "بيانات البوت غير مكتملة." };
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);
    const response = await fetch(
      `https://api.telegram.org/bot${botToken.trim()}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: adminChatId.trim(),
          text: htmlMessage,
          parse_mode: "HTML",
          disable_web_page_preview: true,
        }),
        signal: controller.signal,
      }
    );
    clearTimeout(timeoutId);

    const data = (await response.json()) as { ok: boolean; description?: string };
    if (!response.ok || !data.ok) {
      return {
        ok: false,
        error: data.description || `رمز الاستجابة: ${response.status}`,
      };
    }
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "خطأ في الاتصال بخدمة البوت",
    };
  }
}

// ==============================================================================
// إدارة جلسة Telethon/GramJS وحالة البث
// ==============================================================================
let activeClient: TelegramClientType | null = null;
let currentUser: AuthorizedUser | null = null;
let currentSessionString = "";
let cachedGroups: TargetGroup[] = [];
const entityMap = new Map<string, unknown>();

// جسر الوعود لتسجيل الدخول التفاعلي عبر الويب
interface PendingAuthFlow {
  apiId: number;
  apiHash: string;
  phoneNumber: string;
  stage: "starting" | "awaiting_code" | "awaiting_password" | "done" | "error";
  isCodeViaApp: boolean;
  passwordHint?: string;
  resolvePhoneCode?: (code: string) => void;
  resolvePassword?: (pw: string) => void;
  rejectCurrentStep?: (err: Error) => void;
  resolveCurrentStep?: (payload: Record<string, unknown>) => void;
}

let pendingAuth: PendingAuthFlow | null = null;

function translateTelegramError(err: unknown): { message: string; fatal: boolean } {
  const raw = err instanceof Error ? err.message : String(err);
  const upper = raw.toUpperCase();

  if (upper.includes("API_ID_INVALID") || upper.includes("API_ID_PUBLISHED_FLOOD")) {
    return { message: "بيانات API ID أو API Hash غير صالحة. يرجى التحقق منها في my.telegram.org.", fatal: true };
  }
  if (upper.includes("PHONE_NUMBER_INVALID")) {
    return { message: "رقم الهاتف غير صحيح. تأكد من إدخاله بالصيغة الدولية (مثال: +966501234567).", fatal: true };
  }
  if (upper.includes("PHONE_CODE_INVALID")) {
    return { message: "رمز التحقق غير صحيح. يرجى التأكد من الرمز وإعادة المحاولة.", fatal: false };
  }
  if (upper.includes("PHONE_CODE_EXPIRED")) {
    return { message: "انتهت صلاحية رمز التحقق. يرجى طلب رمز جديد.", fatal: true };
  }
  if (upper.includes("PASSWORD_HASH_INVALID")) {
    return { message: "كلمة مرور التحقق بخطوتين (2FA) غير صحيحة. حاول مرة أخرى.", fatal: false };
  }
  if (upper.includes("FLOOD_WAIT")) {
    const match = upper.match(/(\d+)/);
    const secs = match ? match[1] : "بضع";
    return { message: `فرض تيليجرام فترة انتظار مؤقتة (${secs} ثانية) بسبب كثرة المحاولات.`, fatal: true };
  }
  return { message: `حدث خطأ من تيليجرام: ${raw}`, fatal: true };
}

async function disconnectActiveClient(): Promise<void> {
  if (activeClient) {
    try {
      await activeClient.disconnect();
    } catch {
      // تجاهل أخطاء الإغلاق
    }
    activeClient = null;
  }
  currentUser = null;
  currentSessionString = "";
  cachedGroups = [];
  entityMap.clear();
  pendingAuth = null;
}

async function extractAuthorizedUser(client: TelegramClientType): Promise<AuthorizedUser> {
  const me = await client.getMe();
  const userObj = me as unknown as {
    id?: { toString: () => string };
    firstName?: string;
    lastName?: string;
    username?: string;
    phone?: string;
  };
  return {
    id: userObj.id?.toString() ?? "",
    firstName: userObj.firstName ?? "مستخدم",
    lastName: userObj.lastName ?? "",
    username: userObj.username ?? "",
    phone: userObj.phone ?? "",
  };
}

// ==============================================================================
// حالة البث وتدفق الأحداث المباشر (SSE)
// ==============================================================================
const sseClients = new Set<express.Response>();
let broadcastAbortController: AbortController | null = null;

let broadcastState: BroadcastState = {
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

const keepAliveStats = {
  startedAt: new Date().toISOString(),
  pingCount: 0,
  lastPingAt: null as string | null,
};

function emitSSE(event: string, data: unknown): void {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of sseClients) {
    try {
      res.write(payload);
    } catch {
      sseClients.delete(res);
    }
  }
}

function appendLog(level: LogEntry["level"], message: string): void {
  const now = new Date();
  const entry: LogEntry = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    timestamp: now.toTimeString().slice(0, 8),
    level,
    message,
  };
  broadcastState.logs = [...broadcastState.logs.slice(-199), entry];
  console.log(`[${entry.timestamp}] [${level.toUpperCase()}] ${message}`);
  emitSSE("log", entry);
}

function syncBroadcastSnapshot(): void {
  emitSSE("state", broadcastState);
}

function sleepWithCountdown(
  totalSeconds: number,
  reason: string,
  stateMode: "waiting" | "flood_wait",
  signal: AbortSignal
): Promise<boolean> {
  return new Promise((resolve) => {
    if (signal.aborted || totalSeconds <= 0) {
      broadcastState.countdownSeconds = 0;
      broadcastState.countdownReason = "";
      syncBroadcastSnapshot();
      resolve(!signal.aborted);
      return;
    }

    let remaining = Math.ceil(totalSeconds);
    broadcastState.status = stateMode;
    broadcastState.countdownSeconds = remaining;
    broadcastState.countdownReason = reason;
    syncBroadcastSnapshot();

    const interval = setInterval(() => {
      if (signal.aborted) {
        clearInterval(interval);
        broadcastState.countdownSeconds = 0;
        broadcastState.countdownReason = "";
        syncBroadcastSnapshot();
        resolve(false);
        return;
      }

      remaining -= 1;
      broadcastState.countdownSeconds = Math.max(0, remaining);
      syncBroadcastSnapshot();

      if (remaining <= 0) {
        clearInterval(interval);
        broadcastState.countdownReason = "";
        syncBroadcastSnapshot();
        resolve(true);
      }
    }, 1000);

    signal.addEventListener(
      "abort",
      () => {
        clearInterval(interval);
        broadcastState.countdownSeconds = 0;
        broadcastState.countdownReason = "";
        syncBroadcastSnapshot();
        resolve(false);
      },
      { once: true }
    );
  });
}

function extractFloodWaitSeconds(err: unknown): number | null {
  const anyErr = err as { seconds?: number; message?: string; errorMessage?: string };
  if (typeof anyErr?.seconds === "number" && anyErr.seconds > 0) {
    return anyErr.seconds;
  }
  const msg = `${anyErr?.errorMessage ?? ""} ${anyErr?.message ?? ""}`.toUpperCase();
  const match = msg.match(/FLOOD_WAIT[_\s]?(\d+)/);
  if (match) {
    return parseInt(match[1], 10);
  }
  return null;
}

function extractSlowModeSeconds(err: unknown): number | null {
  const anyErr = err as { seconds?: number; message?: string; errorMessage?: string };
  const msg = `${anyErr?.errorMessage ?? ""} ${anyErr?.message ?? ""}`.toUpperCase();
  if (msg.includes("SLOWMODE_WAIT")) {
    if (typeof anyErr?.seconds === "number") return anyErr.seconds;
    const match = msg.match(/SLOWMODE_WAIT[_\s]?(\d+)/);
    return match ? parseInt(match[1], 10) : 0;
  }
  return null;
}

function isRestrictionError(err: unknown): string | null {
  const anyErr = err as { message?: string; errorMessage?: string; constructor?: { name?: string } };
  const msg = `${anyErr?.errorMessage ?? ""} ${anyErr?.message ?? ""} ${anyErr?.constructor?.name ?? ""}`.toUpperCase();

  if (msg.includes("USER_BANNED_IN_CHANNEL")) return "الحساب محظور من النشر في هذه المجموعة";
  if (msg.includes("CHAT_WRITE_FORBIDDEN")) return "صلاحية الكتابة ممنوعة في هذه المجموعة";
  if (msg.includes("CHAT_SEND_PLAIN_FORBIDDEN")) return "إرسال الرسائل النصية مقيد في هذه المجموعة";
  if (msg.includes("CHAT_RESTRICTED")) return "المجموعة مقيدة حالياً";
  if (msg.includes("CHANNEL_PRIVATE")) return "المجموعة خاصة أو لم تعد عضواً فيها";
  if (msg.includes("CHAT_ADMIN_REQUIRED")) return "النشر يتطلب صلاحيات مشرف";
  return null;
}

function shuffleArray<T>(items: T[]): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * توزيع القوالب على المجموعات في الدورة الواحدة:
 * - كل مجموعة تتلقى قالباً واحداً فقط في الدورة.
 * - يتم توزيع القوالب عشوائياً وبأكبر تنوع ممكن داخل الدورة.
 * - في الدورات التالية يتم تدوير القوالب بحيث لا تحصل المجموعة على نفس القالب المتتالي (عند وجود قالبين فأكثر).
 */
function assignTemplatesForCycle(
  activeGroups: TargetGroup[],
  templates: TemplatePayload[],
  lastTemplateIdxByGroup: Map<string, number>
): Map<string, { templateIndex: number; template: TemplatePayload }> {
  const tCount = templates.length;
  const gCount = activeGroups.length;
  const result = new Map<string, { templateIndex: number; template: TemplatePayload }>();

  if (tCount === 0 || gCount === 0) return result;

  // بناء رزمة متوازنة ومخلوطة عشوائياً من مؤشرات القوالب
  const deck: number[] = [];
  while (deck.length < gCount) {
    const indices = shuffleArray(Array.from({ length: tCount }, (_, idx) => idx));
    deck.push(...indices);
  }
  const assignedIndices = shuffleArray(deck.slice(0, gCount));

  // ضمان تبديل القالب عن الدورة السابقة لكل مجموعة عندما يتوفر قالبان فأكثر
  if (tCount >= 2) {
    for (let i = 0; i < gCount; i++) {
      const grpId = activeGroups[i].id;
      const prevIdx = lastTemplateIdxByGroup.get(grpId);
      if (prevIdx !== undefined && assignedIndices[i] === prevIdx) {
        let swapped = false;
        for (let j = 0; j < gCount; j++) {
          if (i === j) continue;
          const otherPrevIdx = lastTemplateIdxByGroup.get(activeGroups[j].id);
          if (assignedIndices[j] !== prevIdx && assignedIndices[i] !== otherPrevIdx) {
            [assignedIndices[i], assignedIndices[j]] = [assignedIndices[j], assignedIndices[i]];
            swapped = true;
            break;
          }
        }
        if (!swapped) {
          const candidates = Array.from({ length: tCount }, (_, idx) => idx).filter(
            (idx) => idx !== prevIdx
          );
          assignedIndices[i] = candidates[Math.floor(Math.random() * candidates.length)];
        }
      }
    }
  }

  for (let i = 0; i < gCount; i++) {
    const tIdx = assignedIndices[i];
    lastTemplateIdxByGroup.set(activeGroups[i].id, tIdx);
    result.set(activeGroups[i].id, {
      templateIndex: tIdx,
      template: templates[tIdx],
    });
  }

  return result;
}

async function scanAuthorizedGroups(
  client: TelegramClientType,
  adminOnly: boolean
): Promise<TargetGroup[]> {
  const dialogs = await client.getDialogs({ limit: 300 });
  const groups: TargetGroup[] = [];
  entityMap.clear();

  for (const dialog of dialogs) {
    if (!dialog.isGroup || !dialog.entity) continue;

    const entity = dialog.entity as unknown as {
      className?: string;
      id?: { toString: () => string };
      title?: string;
      username?: string;
      participantsCount?: number;
      creator?: boolean;
      left?: boolean;
      kicked?: boolean;
      deactivated?: boolean;
      adminRights?: { postMessages?: boolean };
      bannedRights?: { sendMessages?: boolean };
      defaultBannedRights?: { sendMessages?: boolean };
    };

    if (entity.left || entity.kicked || entity.deactivated) continue;

    const isCreator = Boolean(entity.creator);
    const isAdmin = Boolean(entity.adminRights);
    const userSendForbidden = Boolean(entity.bannedRights?.sendMessages);

    if (userSendForbidden && !isCreator) continue;

    let roleLabel = "";
    let allowed = false;

    if (isCreator) {
      roleLabel = "مالك المجموعة";
      allowed = true;
    } else if (isAdmin) {
      roleLabel = "مشرف بصلاحية النشر";
      allowed = true;
    } else if (!adminOnly) {
      const defaultSendForbidden = Boolean(entity.defaultBannedRights?.sendMessages);
      if (!defaultSendForbidden) {
        roleLabel = "عضو بصلاحية النشر";
        allowed = true;
      }
    }

    if (!allowed) continue;

    const idStr = dialog.id?.toString() ?? entity.id?.toString() ?? "";
    if (!idStr) continue;

    const groupInfo: TargetGroup = {
      id: idStr,
      title: dialog.title || entity.title || `مجموعة ${idStr}`,
      roleLabel,
      isAdmin: isCreator || isAdmin,
      membersCount: Number(entity.participantsCount ?? 0),
      username: entity.username ?? "",
    };

    groups.push(groupInfo);
    entityMap.set(idStr, dialog.entity);
  }

  cachedGroups = groups;
  return groups;
}

async function executeBroadcastJob(params: {
  groupIds: string[];
  templates: TemplatePayload[];
  minDelaySec: number;
  maxDelaySec: number;
  useVariation: boolean;
  adminOnly: boolean;
  autoIncludeNewGroups: boolean;
  botToken: string;
  adminChatId: string;
}): Promise<void> {
  const client = activeClient;
  if (!client) return;

  const controller = new AbortController();
  broadcastAbortController = controller;
  const skippedGroupIdsThisSession = new Set<string>();
  const lastTemplateIdxByGroup = new Map<string, number>();

  const knownGroupIds = new Set(cachedGroups.map((g) => g.id));
  const targetGroupIds = new Set(params.groupIds);

  let currentPool = cachedGroups.filter((g) => targetGroupIds.has(g.id));

  broadcastState = {
    status: "running",
    currentCycle: 1,
    totalCyclesCompleted: 0,
    totalTargets: currentPool.length,
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
    startedAt: new Date().toISOString(),
    finishedAt: null,
    groupStatuses: {},
    logs: [],
  };
  syncBroadcastSnapshot();

  const minMinDisplay = (params.minDelaySec / 60).toFixed(1).replace(/\.0$/, "");
  const maxMinDisplay = (params.maxDelaySec / 60).toFixed(1).replace(/\.0$/, "");

  appendLog(
    "info",
    `بدء النظام المستمر في (${currentPool.length}) مجموعة باستخدام (${params.templates.length}) قوالب وبفاصل عشوائي ${minMinDisplay}–${maxMinDisplay} دقيقة.`
  );

  if (params.botToken && params.adminChatId) {
    await sendBotNotification(
      params.botToken,
      params.adminChatId,
      `🚀 <b>بدء نظام البث المجتمعي المستمر</b>\n• عدد المجموعات: <b>${currentPool.length}</b>\n• عدد القوالب المتاحة للتوزيع: <b>${params.templates.length}</b>\n• الفاصل الزمني العشوائي: <b>${minMinDisplay} - ${maxMinDisplay} دقيقة</b>\n• التحديث التلقائي للمجموعات الجديدة: <b>${params.autoIncludeNewGroups ? "مفعّل" : "معطّل"}</b>`
    );
  }

  let cycleNumber = 0;

  while (!controller.signal.aborted) {
    cycleNumber += 1;

    // إعادة فحص المجموعات تلقائياً مع بداية كل دورة لاكتشاف أي مجموعات جديدة انضم إليها الحساب
    if (params.autoIncludeNewGroups && cycleNumber > 1) {
      appendLog("info", `🔍 [الدورة #${cycleNumber}] جاري إعادة فحص المجموعات لاكتشاف أي مجموعات جديدة...`);
      try {
        const latestGroups = await scanAuthorizedGroups(client, params.adminOnly);
        emitSSE("groups", latestGroups);

        const newlyJoined: TargetGroup[] = [];
        for (const grp of latestGroups) {
          if (!knownGroupIds.has(grp.id)) {
            knownGroupIds.add(grp.id);
            if (!skippedGroupIdsThisSession.has(grp.id)) {
              targetGroupIds.add(grp.id);
              newlyJoined.push(grp);
            }
          }
        }

        currentPool = latestGroups.filter((g) => targetGroupIds.has(g.id));

        if (newlyJoined.length > 0) {
          broadcastState.newGroupsDiscoveredCount += newlyJoined.length;
          const names = newlyJoined.map((g) => g.title).join("، ");
          appendLog(
            "success",
            `🆕 تم اكتشاف (${newlyJoined.length}) مجموعة جديدة وإضافتها تلقائياً للدورة #${cycleNumber}: ${names}`
          );
          if (params.botToken && params.adminChatId) {
            await sendBotNotification(
              params.botToken,
              params.adminChatId,
              `🆕 <b>تم اكتشاف مجموعات جديدة وإضافتها تلقائياً</b>\n• الدورة: <b>#${cycleNumber}</b>\n• العدد المضاف: <b>${newlyJoined.length}</b>\n• المجموعات: <b>${escapeHtml(names)}</b>`
            );
          }
        } else {
          appendLog(
            "info",
            `تم تحديث القائمة للدورة #${cycleNumber}: (${currentPool.length}) مجموعة متاحة دون إضافات جديدة.`
          );
        }
      } catch (scanErr) {
        const msg = scanErr instanceof Error ? scanErr.message : String(scanErr);
        appendLog(
          "warning",
          `تعذر تحديث قائمة المجموعات في بداية الدورة #${cycleNumber} (${msg}) — المتابعة بالقائمة الحالية.`
        );
      }
    }

    // ترتيب عشوائي للمجموعات النشطة في كل دورة لمزيد من الطبيعية
    const activeTargets = shuffleArray(
      currentPool.filter((grp) => !skippedGroupIdsThisSession.has(grp.id))
    );

    if (activeTargets.length === 0) {
      appendLog(
        "warning",
        "تم إيقاف الحلقة المستمرة تلقائياً لأن جميع المجموعات المستهدفة أصبحت مقيدة الصلاحية في هذه الجلسة."
      );
      if (params.botToken && params.adminChatId) {
        await sendBotNotification(
          params.botToken,
          params.adminChatId,
          "⚠️ <b>توقف النظام المستمر</b>\nجميع المجموعات المحددة مقيدة الصلاحية في هذه الجلسة، ولا توجد مجموعات متاحة للنشر."
        );
      }
      break;
    }

    // توزيع القوالب على المجموعات لهذه الدورة (قالب واحد لكل مجموعة مع تبديل عن الدورة السابقة)
    const cycleAssignments = assignTemplatesForCycle(
      activeTargets,
      params.templates,
      lastTemplateIdxByGroup
    );

    broadcastState.status = "running";
    broadcastState.currentCycle = cycleNumber;
    broadcastState.totalTargets = activeTargets.length;
    broadcastState.processedCount = 0;
    broadcastState.succeededCount = 0;

    const cycleStatuses: Record<string, GroupStatusRecord> = {};
    for (const grp of currentPool) {
      if (skippedGroupIdsThisSession.has(grp.id)) {
        const prevSkipped = broadcastState.groupStatuses[grp.id];
        cycleStatuses[grp.id] = {
          groupId: grp.id,
          title: grp.title,
          status: "skipped",
          detail: prevSkipped?.detail || "تم التخطي للقيود في دورة سابقة",
          assignedTemplateTitle: "—",
          cycleNumber,
          updatedAt: prevSkipped?.updatedAt || new Date().toTimeString().slice(0, 8),
        };
      } else {
        const assignment = cycleAssignments.get(grp.id);
        cycleStatuses[grp.id] = {
          groupId: grp.id,
          title: grp.title,
          status: "pending",
          detail: "في انتظار دورها في هذه الدورة",
          assignedTemplateTitle: assignment?.template.title || "قالب تعليمي",
          cycleNumber,
          updatedAt: new Date().toTimeString().slice(0, 8),
        };
      }
    }
    broadcastState.groupStatuses = cycleStatuses;
    syncBroadcastSnapshot();

    appendLog(
      "info",
      `🔄 بدء الدورة رقم #${cycleNumber} — تم توزيع (${params.templates.length}) قوالب على (${activeTargets.length}) مجموعة نشطة.`
    );

    if (cycleNumber > 1 && params.botToken && params.adminChatId) {
      await sendBotNotification(
        params.botToken,
        params.adminChatId,
        `🔄 <b>بدء الدورة رقم #${cycleNumber}</b>\n• المجموعات النشطة: <b>${activeTargets.length}</b>\n• تم إعادة تدوير وتبديل القوالب على المجموعات بنجاح.`
      );
    }

    for (let i = 0; i < activeTargets.length; i++) {
      if (controller.signal.aborted) break;

      const group = activeTargets[i];
      const entity = entityMap.get(group.id);
      const assignment = cycleAssignments.get(group.id);
      const assignedTitle = assignment?.template.title || "قالب تعليمي";
      const assignedContent = assignment?.template.content || params.templates[0].content;

      broadcastState.status = "running";
      broadcastState.currentGroupTitle = group.title;

      if (!entity || skippedGroupIdsThisSession.has(group.id)) {
        broadcastState.processedCount += 1;
        broadcastState.skippedCount += 1;
        broadcastState.groupStatuses[group.id] = {
          groupId: group.id,
          title: group.title,
          status: "skipped",
          detail: "تم التخطي مسبقاً في هذه الجلسة",
          assignedTemplateTitle: assignedTitle,
          cycleNumber,
          updatedAt: new Date().toTimeString().slice(0, 8),
        };
        syncBroadcastSnapshot();
        continue;
      }

      broadcastState.groupStatuses[group.id] = {
        groupId: group.id,
        title: group.title,
        status: "sending",
        detail: `جاري إرسال "${assignedTitle}"...`,
        assignedTemplateTitle: assignedTitle,
        cycleNumber,
        updatedAt: new Date().toTimeString().slice(0, 8),
      };
      syncBroadcastSnapshot();

      const formattedMessage = formatMessageForGroup(
        assignedContent,
        group.title,
        params.useVariation
      );

      appendLog(
        "info",
        `[الدورة #${cycleNumber} · ${i + 1}/${activeTargets.length}] جاري إرسال "${assignedTitle}" إلى "${group.title}"...`
      );

      let sent = false;
      while (!sent && !controller.signal.aborted) {
        try {
          await client.sendMessage(entity as never, {
            message: formattedMessage,
            parseMode: "html",
            linkPreview: false,
          });

          sent = true;
          broadcastState.processedCount += 1;
          broadcastState.succeededCount += 1;
          broadcastState.totalSentAllCycles += 1;
          broadcastState.groupStatuses[group.id] = {
            groupId: group.id,
            title: group.title,
            status: "sent",
            detail: `تم نشر "${assignedTitle}" بنجاح`,
            assignedTemplateTitle: assignedTitle,
            cycleNumber,
            updatedAt: new Date().toTimeString().slice(0, 8),
          };
          appendLog(
            "success",
            `[الدورة #${cycleNumber}] تم نشر "${assignedTitle}" بنجاح في "${group.title}".`
          );
          syncBroadcastSnapshot();

          if (params.botToken && params.adminChatId) {
            await sendBotNotification(
              params.botToken,
              params.adminChatId,
              `✅ <b>تم النشر بنجاح (الدورة #${cycleNumber})</b> [${i + 1}/${activeTargets.length}]\n• المجموعة: <b>${escapeHtml(group.title)}</b>\n• القالب المخصص: <b>${escapeHtml(assignedTitle)}</b>`
            );
          }
        } catch (err) {
          const floodSecs = extractFloodWaitSeconds(err);
          if (floodSecs !== null) {
            const waitSeconds = floodSecs + 5;
            broadcastState.floodWaitsCount += 1;
            appendLog(
              "warning",
              `تنبيه FloodWait من تيليجرام: التوقف الإجباري لمدة ${waitSeconds} ثانية قبل استكمال "${group.title}".`
            );
            if (params.botToken && params.adminChatId) {
              await sendBotNotification(
                params.botToken,
                params.adminChatId,
                `⏳ <b>توقف مؤقت (FloodWait)</b>\n• المدة المطلوبة: <b>${waitSeconds} ثانية</b>\n• الدورة: <b>#${cycleNumber}</b> | المجموعة: <b>${escapeHtml(group.title)}</b>`
              );
            }

            const completedWait = await sleepWithCountdown(
              waitSeconds,
              `توقف مؤقت بسبب قيود معدل الطلبات (FloodWait) لـ "${group.title}"`,
              "flood_wait",
              controller.signal
            );
            if (!completedWait) break;
            continue;
          }

          const slowModeSecs = extractSlowModeSeconds(err);
          if (slowModeSecs !== null) {
            const reason = `الوضع البطيء مفعّل (${slowModeSecs} ثانية) — تخطي دون إعادة`;
            skippedGroupIdsThisSession.add(group.id);
            broadcastState.processedCount += 1;
            broadcastState.skippedCount += 1;
            broadcastState.groupStatuses[group.id] = {
              groupId: group.id,
              title: group.title,
              status: "skipped",
              detail: reason,
              assignedTemplateTitle: assignedTitle,
              cycleNumber,
              updatedAt: new Date().toTimeString().slice(0, 8),
            };
            appendLog("warning", `تخطي "${group.title}" (دون إعادة): ${reason}`);
            syncBroadcastSnapshot();

            if (params.botToken && params.adminChatId) {
              await sendBotNotification(
                params.botToken,
                params.adminChatId,
                `⏭️ <b>تم تخطي المجموعة (دون إعادة)</b>\n• المجموعة: <b>${escapeHtml(group.title)}</b>\n• السبب: ${escapeHtml(reason)}`
              );
            }
            break;
          }

          const restrictionReason = isRestrictionError(err);
          if (restrictionReason) {
            skippedGroupIdsThisSession.add(group.id);
            broadcastState.processedCount += 1;
            broadcastState.skippedCount += 1;
            broadcastState.groupStatuses[group.id] = {
              groupId: group.id,
              title: group.title,
              status: "skipped",
              detail: restrictionReason,
              assignedTemplateTitle: assignedTitle,
              cycleNumber,
              updatedAt: new Date().toTimeString().slice(0, 8),
            };
            appendLog(
              "warning",
              `تخطي "${group.title}" بسبب قيود الصلاحية (لن تتم إعادة المحاولة): ${restrictionReason}`
            );
            syncBroadcastSnapshot();

            if (params.botToken && params.adminChatId) {
              await sendBotNotification(
                params.botToken,
                params.adminChatId,
                `🚫 <b>تم تخطي المجموعة بسبب القيود</b>\n• المجموعة: <b>${escapeHtml(group.title)}</b>\n• السبب: ${escapeHtml(restrictionReason)}\n• الإجراء: استبعاد دائم لبقية الجلسة.`
              );
            }
            break;
          }

          // خطأ عام آخر — لا نعيد المحاولة لهذه المجموعة في هذه الدورة
          const errMsg = err instanceof Error ? err.message : String(err);
          broadcastState.processedCount += 1;
          broadcastState.failedCount += 1;
          broadcastState.groupStatuses[group.id] = {
            groupId: group.id,
            title: group.title,
            status: "error",
            detail: errMsg,
            assignedTemplateTitle: assignedTitle,
            cycleNumber,
            updatedAt: new Date().toTimeString().slice(0, 8),
          };
          appendLog("error", `تعذر الإرسال إلى "${group.title}": ${errMsg}`);
          syncBroadcastSnapshot();

          if (params.botToken && params.adminChatId) {
            await sendBotNotification(
              params.botToken,
              params.adminChatId,
              `❌ <b>فشل الإرسال</b>\n• المجموعة: <b>${escapeHtml(group.title)}</b>\n• التفاصيل: ${escapeHtml(errMsg)}`
            );
          }
          break;
        }
      }

      if (controller.signal.aborted) break;

      // فاصل زمني عشوائي متغير (Jitter Pacing) بين كل إرسال وآخر
      // يشمل الانتقال من آخر مجموعة في الدورة الحالية إلى أول مجموعة في الدورة التالية
      const min = Math.min(params.minDelaySec, params.maxDelaySec);
      const max = Math.max(params.minDelaySec, params.maxDelaySec);
      const jitterDelaySec = Math.floor(Math.random() * (max - min + 1)) + min;
      const mins = Math.floor(jitterDelaySec / 60);
      const secs = jitterDelaySec % 60;

      const isLastInCycle = i === activeTargets.length - 1;
      const nextContext = isLastInCycle
        ? `قبل انطلاق الدورة رقم #${cycleNumber + 1}`
        : `قبل المجموعة التالية ("${activeTargets[i + 1].title}")`;

      if (isLastInCycle) {
        broadcastState.totalCyclesCompleted += 1;
        appendLog(
          "success",
          `🏁 اكتملت الدورة رقم #${cycleNumber} بنجاح (${broadcastState.succeededCount}/${activeTargets.length}). جاري التدوير التلقائي للدورة #${cycleNumber + 1}...`
        );
        if (params.botToken && params.adminChatId) {
          await sendBotNotification(
            params.botToken,
            params.adminChatId,
            `🏁 <b>اكتملت الدورة رقم #${cycleNumber}</b>\n• تم النشر في <b>${broadcastState.succeededCount}</b> مجموعة\n• إجمالي المنشورات التراكمي: <b>${broadcastState.totalSentAllCycles}</b>\n• سينتقل النظام تلقائياً للدورة #${cycleNumber + 1} بعد فاصل عشوائي (${mins} د و ${secs} ث).`
          );
        }
      }

      appendLog(
        "info",
        `⏳ فاصل عشوائي (Jitter): انتظار ${mins} دقيقة و ${secs} ثانية ${nextContext}...`
      );
      const completedDelay = await sleepWithCountdown(
        jitterDelaySec,
        `فاصل عشوائي (${mins} د ${secs} ث) ${nextContext}`,
        "waiting",
        controller.signal
      );
      if (!completedDelay) break;
    }
  }

  const wasStopped = controller.signal.aborted;
  broadcastState.status = wasStopped ? "stopped" : "completed";
  broadcastState.currentGroupTitle = "";
  broadcastState.countdownSeconds = 0;
  broadcastState.countdownReason = "";
  broadcastState.finishedAt = new Date().toISOString();
  broadcastAbortController = null;

  const finalLabel = wasStopped
    ? "تم إيقاف الحلقة المستمرة يدوياً."
    : "توقفت الحلقة التشغيلية.";
  appendLog(
    "warning",
    `${finalLabel} الدورات المكتملة: ${broadcastState.totalCyclesCompleted} | إجمالي المنشورات: ${broadcastState.totalSentAllCycles} | مستبعدة للقيود: ${broadcastState.skippedCount}`
  );
  syncBroadcastSnapshot();

  if (params.botToken && params.adminChatId) {
    await sendBotNotification(
      params.botToken,
      params.adminChatId,
      `🛑 <b>${finalLabel}</b>\n\n📊 <b>الملخص التراكمي للجلسة:</b>\n• الدورات المكتملة: <b>${broadcastState.totalCyclesCompleted}</b>\n• إجمالي المنشورات الناجحة: <b>${broadcastState.totalSentAllCycles}</b>\n• مجموعات مستبعدة للقيود: <b>${broadcastState.skippedCount}</b>\n• تنبيهات FloodWait: <b>${broadcastState.floodWaitsCount}</b>`
    );
  }
}

// ==============================================================================
// إعداد تطبيق Express ومسارات API
// ==============================================================================
async function bootstrap() {
  const app = express();
  app.use(express.json({ limit: "2mb" }));

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true });
  });

  // مسارات التنشيط السحابي 24/7 (Render + UptimeRobot) — تدعم GET و HEAD
  const handleKeepAlivePing = (req: express.Request, res: express.Response) => {
    keepAliveStats.pingCount += 1;
    keepAliveStats.lastPingAt = new Date().toISOString();
    emitSSE("keepalive", keepAliveStats);

    if (req.method === "HEAD") {
      res.status(200).end();
      return;
    }

    res.status(200).json({
      ok: true,
      status: "alive",
      uptimeSeconds: Math.floor(process.uptime()),
      broadcastStatus: broadcastState.status,
      currentCycle: broadcastState.currentCycle,
      pingCount: keepAliveStats.pingCount,
      lastPingAt: keepAliveStats.lastPingAt,
    });
  };

  app.all("/ping", handleKeepAlivePing);
  app.all("/healthz", handleKeepAlivePing);
  app.all("/api/ping", handleKeepAlivePing);

  app.get("/api/keepalive", (_req, res) => {
    res.json({
      ...keepAliveStats,
      pingPath: "/ping",
    });
  });

  // تدفق الأحداث المباشر SSE
  app.get("/api/events", (req, res) => {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();

    sseClients.add(res);
    res.write(`event: state\ndata: ${JSON.stringify(broadcastState)}\n\n`);

    req.on("close", () => {
      sseClients.delete(res);
    });
  });

  // حالة المصادقة الحالية
  app.get("/api/auth/status", async (_req, res) => {
    if (!activeClient || !currentUser) {
      res.json({
        authorized: false,
        stage: pendingAuth?.stage ?? "idle",
        passwordHint: pendingAuth?.passwordHint ?? "",
      });
      return;
    }

    res.json({
      authorized: true,
      user: currentUser,
      sessionString: currentSessionString,
    });
  });

  // استعادة جلسة محفوظة (StringSession)
  app.post("/api/auth/restore", async (req, res) => {
    try {
      const apiId = Number(req.body.apiId);
      const apiHash = String(req.body.apiHash ?? "").trim();
      const sessionString = String(req.body.sessionString ?? "").trim();

      if (!apiId || !apiHash || !sessionString) {
        res.status(400).json({ error: "بيانات الجلسة المحفوظة غير مكتملة." });
        return;
      }

      await disconnectActiveClient();
      const client = new TelegramClient(new StringSession(sessionString), apiId, apiHash, {
        connectionRetries: 5,
      });
      await client.connect();
      const isAuth = await client.checkAuthorization();
      if (!isAuth) {
        await client.disconnect();
        res.status(401).json({ error: "انتهت صلاحية الجلسة المحفوظة. يرجى تسجيل الدخول برقم الهاتف." });
        return;
      }

      activeClient = client;
      currentSessionString = String(client.session.save() ?? sessionString);
      currentUser = await extractAuthorizedUser(client);
      res.json({ authorized: true, user: currentUser, sessionString: currentSessionString });
    } catch (err) {
      const parsed = translateTelegramError(err);
      res.status(400).json({ error: parsed.message });
    }
  });

  // الخطوة 1: إرسال رمز التحقق إلى رقم الهاتف
  app.post("/api/auth/send-code", async (req, res) => {
    try {
      const apiId = Number(req.body.apiId);
      const apiHash = String(req.body.apiHash ?? "").trim();
      const phoneNumber = String(req.body.phoneNumber ?? "").trim();

      if (!apiId || Number.isNaN(apiId) || !apiHash || !phoneNumber) {
        res.status(400).json({ error: "يرجى إدخال API ID و API Hash ورقم الهاتف بشكل صحيح." });
        return;
      }

      await disconnectActiveClient();

      const client = new TelegramClient(new StringSession(""), apiId, apiHash, {
        connectionRetries: 5,
      });
      activeClient = client;

      const flow: PendingAuthFlow = {
        apiId,
        apiHash,
        phoneNumber,
        stage: "starting",
        isCodeViaApp: true,
      };
      pendingAuth = flow;

      const stepOutcome = new Promise<Record<string, unknown>>((resolve, reject) => {
        flow.resolveCurrentStep = resolve;
        flow.rejectCurrentStep = reject;
      });

      // تشغيل تدفق client.start في الخلفية وربطه بوعود الويب
      void (async () => {
        try {
          await client.start({
            phoneNumber: async () => phoneNumber,
            phoneCode: async (isCodeViaApp?: boolean) => {
              flow.stage = "awaiting_code";
              flow.isCodeViaApp = Boolean(isCodeViaApp);
              if (flow.resolveCurrentStep) {
                const resFn = flow.resolveCurrentStep;
                flow.resolveCurrentStep = undefined;
                flow.rejectCurrentStep = undefined;
                resFn({ status: "code_required", isCodeViaApp: flow.isCodeViaApp });
              }
              return await new Promise<string>((resolveCode) => {
                flow.resolvePhoneCode = resolveCode;
              });
            },
            password: async (hint?: string) => {
              flow.stage = "awaiting_password";
              flow.passwordHint = hint ?? "";
              if (flow.resolveCurrentStep) {
                const resFn = flow.resolveCurrentStep;
                flow.resolveCurrentStep = undefined;
                flow.rejectCurrentStep = undefined;
                resFn({ status: "password_required", hint: flow.passwordHint });
              }
              return await new Promise<string>((resolvePw) => {
                flow.resolvePassword = resolvePw;
              });
            },
            onError: async (err: Error) => {
              const translated = translateTelegramError(err);
              if (flow.rejectCurrentStep) {
                const rejFn = flow.rejectCurrentStep;
                flow.resolveCurrentStep = undefined;
                flow.rejectCurrentStep = undefined;
                rejFn(new Error(translated.message));
              }
              if (translated.fatal) {
                flow.stage = "error";
                return true;
              }
              return false;
            },
          });

          flow.stage = "done";
          currentSessionString = String(client.session.save() ?? "");
          currentUser = await extractAuthorizedUser(client);

          if (flow.resolveCurrentStep) {
            const resFn = flow.resolveCurrentStep;
            flow.resolveCurrentStep = undefined;
            flow.rejectCurrentStep = undefined;
            resFn({
              status: "authorized",
              user: currentUser,
              sessionString: currentSessionString,
            });
          }
        } catch (err) {
          flow.stage = "error";
          const translated = translateTelegramError(err);
          if (flow.rejectCurrentStep) {
            const rejFn = flow.rejectCurrentStep;
            flow.resolveCurrentStep = undefined;
            flow.rejectCurrentStep = undefined;
            rejFn(new Error(translated.message));
          }
        }
      })();

      const result = await stepOutcome;
      res.json(result);
    } catch (err) {
      res.status(400).json({
        error: err instanceof Error ? err.message : "تعذر بدء عملية التحقق.",
      });
    }
  });

  // الخطوة 2: التحقق من رمز OTP
  app.post("/api/auth/verify-code", async (req, res) => {
    try {
      const code = String(req.body.phoneCode ?? "").trim();
      if (!code) {
        res.status(400).json({ error: "يرجى إدخال رمز التحقق." });
        return;
      }
      const resolveCode = pendingAuth?.resolvePhoneCode;
      if (!pendingAuth || !resolveCode) {
        res.status(400).json({ error: "لا توجد عملية تسجيل دخول نشطة بانتظار الرمز." });
        return;
      }

      const flow = pendingAuth;
      const stepOutcome = new Promise<Record<string, unknown>>((resolve, reject) => {
        flow.resolveCurrentStep = resolve;
        flow.rejectCurrentStep = reject;
      });

      flow.resolvePhoneCode = undefined;
      resolveCode(code);

      const result = await stepOutcome;
      res.json(result);
    } catch (err) {
      res.status(400).json({
        error: err instanceof Error ? err.message : "رمز التحقق غير صحيح.",
      });
    }
  });

  // الخطوة 3: التحقق من كلمة مرور 2FA
  app.post("/api/auth/verify-password", async (req, res) => {
    try {
      const password = String(req.body.password ?? "");
      if (!password) {
        res.status(400).json({ error: "يرجى إدخال كلمة مرور التحقق بخطوتين." });
        return;
      }
      const resolvePw = pendingAuth?.resolvePassword;
      if (!pendingAuth || !resolvePw) {
        res.status(400).json({ error: "لا توجد جلسة بانتظار كلمة المرور." });
        return;
      }

      const flow = pendingAuth;
      const stepOutcome = new Promise<Record<string, unknown>>((resolve, reject) => {
        flow.resolveCurrentStep = resolve;
        flow.rejectCurrentStep = reject;
      });

      flow.resolvePassword = undefined;
      resolvePw(password);

      const result = await stepOutcome;
      res.json(result);
    } catch (err) {
      res.status(400).json({
        error: err instanceof Error ? err.message : "كلمة المرور غير صحيحة.",
      });
    }
  });

  // تسجيل الخروج وإغلاق الجلسة
  app.post("/api/auth/logout", async (_req, res) => {
    if (broadcastAbortController) {
      broadcastAbortController.abort();
    }
    await disconnectActiveClient();
    res.json({ ok: true });
  });

  // اختبار بوت الإشعارات
  app.post("/api/bot/test", async (req, res) => {
    const botToken = String(req.body.botToken ?? "").trim();
    const adminChatId = String(req.body.adminChatId ?? "").trim();
    const result = await sendBotNotification(
      botToken,
      adminChatId,
      "🤖 <b>تم ربط بوت الإشعارات بنجاح!</b>\nسيصلك هنا تقرير فوري عند كل عملية نشر أو تخطي أو إكمال للحملة."
    );
    if (!result.ok) {
      res.status(400).json({ error: result.error || "فشل إرسال الرسالة التجريبية للبوت." });
      return;
    }
    res.json({ ok: true });
  });

  // جلب المجموعات المصرح بها
  app.get("/api/groups", async (req, res) => {
    if (!activeClient || !currentUser) {
      res.status(401).json({ error: "يرجى تسجيل الدخول بحساب تيليجرام أولاً." });
      return;
    }

    const adminOnly = req.query.adminOnly !== "false";

    try {
      const groups = await scanAuthorizedGroups(activeClient, adminOnly);
      res.json({ groups });
    } catch (err) {
      const parsed = translateTelegramError(err);
      res.status(500).json({ error: parsed.message });
    }
  });

  // معاينة صياغة منشور تجريبي
  app.post("/api/broadcast/preview", (req, res) => {
    const template = String(req.body.template ?? "").trim();
    const groupTitle = String(req.body.groupTitle ?? "مجتمع المطورين العرب").trim();
    const useVariation = Boolean(req.body.useVariation);

    if (!template) {
      res.status(400).json({ error: "القالب فارغ." });
      return;
    }

    const htmlPreview = formatMessageForGroup(template, groupTitle, useVariation);
    res.json({ htmlPreview });
  });

  // حالة البث الحالية
  app.get("/api/broadcast/state", (_req, res) => {
    res.json(broadcastState);
  });

  // بدء حملة البث
  app.post("/api/broadcast/start", async (req, res) => {
    if (!activeClient || !currentUser) {
      res.status(401).json({ error: "يرجى تسجيل الدخول بحساب تيليجرام أولاً." });
      return;
    }
    if (
      broadcastState.status === "running" ||
      broadcastState.status === "waiting" ||
      broadcastState.status === "flood_wait"
    ) {
      res.status(409).json({ error: "توجد حملة نشر قيد التشغيل حالياً." });
      return;
    }

    const groupIds = Array.isArray(req.body.groupIds)
      ? (req.body.groupIds as string[])
      : [];
    const rawTemplates: unknown[] = Array.isArray(req.body.templates)
      ? req.body.templates
      : [];
    const templates: TemplatePayload[] = rawTemplates
      .map((item: unknown, idx: number): TemplatePayload => {
        if (typeof item === "string") {
          return { title: `قالب ${idx + 1}`, content: item.trim() };
        }
        if (item && typeof item === "object") {
          const obj = item as { title?: unknown; content?: unknown };
          const content = String(obj.content ?? "").trim();
          const title = String(obj.title ?? `قالب ${idx + 1}`).trim() || `قالب ${idx + 1}`;
          return { title, content };
        }
        return { title: "", content: "" };
      })
      .filter((t: TemplatePayload) => t.content.length > 0);

    const minDelaySec = Math.max(30, Number(req.body.minDelaySec ?? 300));
    const maxDelaySec = Math.max(minDelaySec, Number(req.body.maxDelaySec ?? 600));
    const useVariation = Boolean(req.body.useVariation);
    const adminOnly = req.body.adminOnly !== false;
    const autoIncludeNewGroups = req.body.autoIncludeNewGroups !== false;
    const botToken = String(req.body.botToken ?? "").trim();
    const adminChatId = String(req.body.adminChatId ?? "").trim();

    if (groupIds.length === 0) {
      res.status(400).json({ error: "يرجى اختيار مجموعة واحدة على الأقل." });
      return;
    }
    if (templates.length === 0) {
      res.status(400).json({ error: "يرجى إضافة قالب تعليمي واحد على الأقل." });
      return;
    }

    // التأكد من وجود المجموعات في الذاكرة
    if (cachedGroups.length === 0) {
      res.status(400).json({ error: "يرجى تحديث قائمة المجموعات أولاً." });
      return;
    }

    void executeBroadcastJob({
      groupIds,
      templates,
      minDelaySec,
      maxDelaySec,
      useVariation,
      adminOnly,
      autoIncludeNewGroups,
      botToken,
      adminChatId,
    });

    res.json({ ok: true });
  });

  // إيقاف الحملة بأمان
  app.post("/api/broadcast/stop", (_req, res) => {
    if (broadcastAbortController) {
      broadcastAbortController.abort();
      res.json({ ok: true });
      return;
    }
    res.json({ ok: false, message: "لا توجد حملة نشطة لإيقافها." });
  });

  // توصيل Vite في بيئة التطوير أو الملفات المبنية في الإنتاج
  if (process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, "dist");
    app.use(express.static(distPath));
    app.get("/{*splat}", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  const port = Number(process.env.PORT) || 3000;
  app.listen(port, "0.0.0.0", () => {
    console.log(`Server listening on http://0.0.0.0:${port}`);
  });
}

void bootstrap();
