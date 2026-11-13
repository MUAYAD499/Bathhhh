import React, { useState } from "react";
import {
  Bell,
  CheckCircle2,
  Eye,
  EyeOff,
  HelpCircle,
  KeyRound,
  LogOut,
  Phone,
  RefreshCw,
  ShieldCheck,
  AlertCircle,
} from "lucide-react";
import type { AuthorizedUser } from "../types";

interface ConnectionPanelProps {
  apiId: string;
  setApiId: (v: string) => void;
  apiHash: string;
  setApiHash: (v: string) => void;
  phoneNumber: string;
  setPhoneNumber: (v: string) => void;
  botToken: string;
  setBotToken: (v: string) => void;
  adminChatId: string;
  setAdminChatId: (v: string) => void;
  savedSession: string;
  onSessionSaved: (session: string) => void;
  user: AuthorizedUser | null;
  onUserChanged: (user: AuthorizedUser | null) => void;
  onNavigateNext: () => void;
}

type AuthStep = "credentials" | "code" | "password";

export const ConnectionPanel: React.FC<ConnectionPanelProps> = ({
  apiId,
  setApiId,
  apiHash,
  setApiHash,
  phoneNumber,
  setPhoneNumber,
  botToken,
  setBotToken,
  adminChatId,
  setAdminChatId,
  savedSession,
  onSessionSaved,
  user,
  onUserChanged,
  onNavigateNext,
}) => {
  const [authStep, setAuthStep] = useState<AuthStep>("credentials");
  const [phoneCode, setPhoneCode] = useState("");
  const [twoFaPassword, setTwoFaPassword] = useState("");
  const [passwordHint, setPasswordHint] = useState("");
  const [isCodeViaApp, setIsCodeViaApp] = useState(true);
  const [showSecrets, setShowSecrets] = useState(false);

  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState("");
  const [authNotice, setAuthNotice] = useState("");

  const [botLoading, setBotLoading] = useState(false);
  const [botStatus, setBotStatus] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [showGuide, setShowGuide] = useState(false);

  const handleSendCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError("");
    setAuthNotice("");
    setAuthLoading(true);

    try {
      const res = await fetch("/api/auth/send-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          apiId: Number(apiId),
          apiHash,
          phoneNumber,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setAuthError(data.error || "تعذر إرسال رمز التحقق.");
        return;
      }

      if (data.status === "authorized") {
        onUserChanged(data.user);
        if (data.sessionString) onSessionSaved(data.sessionString);
        setAuthNotice("تم تسجيل الدخول بنجاح.");
      } else if (data.status === "code_required") {
        setIsCodeViaApp(Boolean(data.isCodeViaApp));
        setAuthStep("code");
        setAuthNotice(
          data.isCodeViaApp
            ? "تم إرسال رمز التحقق إلى تطبيق تيليجرام على جهازك."
            : "تم إرسال رمز التحقق عبر رسالة نصية SMS إلى هاتفك."
        );
      } else if (data.status === "password_required") {
        setPasswordHint(data.hint || "");
        setAuthStep("password");
      }
    } catch {
      setAuthError("تعذر الاتصال بالخادم. يرجى المحاولة مرة أخرى.");
    } finally {
      setAuthLoading(false);
    }
  };

  const handleVerifyCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError("");
    setAuthNotice("");
    setAuthLoading(true);

    try {
      const res = await fetch("/api/auth/verify-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phoneCode }),
      });
      const data = await res.json();
      if (!res.ok) {
        setAuthError(data.error || "رمز التحقق غير صحيح.");
        return;
      }

      if (data.status === "password_required") {
        setPasswordHint(data.hint || "");
        setAuthStep("password");
        setAuthNotice("الحساب محمي بالتحقق بخطوتين (2FA). أدخل كلمة المرور للمتابعة.");
      } else if (data.status === "authorized") {
        onUserChanged(data.user);
        if (data.sessionString) onSessionSaved(data.sessionString);
        setAuthStep("credentials");
        setPhoneCode("");
        setAuthNotice("تم تأكيد الحساب وتسجيل الدخول بنجاح.");
      }
    } catch {
      setAuthError("حدث خطأ أثناء التحقق من الرمز.");
    } finally {
      setAuthLoading(false);
    }
  };

  const handleVerifyPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError("");
    setAuthNotice("");
    setAuthLoading(true);

    try {
      const res = await fetch("/api/auth/verify-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: twoFaPassword }),
      });
      const data = await res.json();
      if (!res.ok) {
        setAuthError(data.error || "كلمة المرور غير صحيحة.");
        return;
      }

      if (data.status === "authorized") {
        onUserChanged(data.user);
        if (data.sessionString) onSessionSaved(data.sessionString);
        setAuthStep("credentials");
        setTwoFaPassword("");
        setPhoneCode("");
        setAuthNotice("تم التحقق بنجاح وتسجيل الدخول.");
      }
    } catch {
      setAuthError("تعذر التحقق من كلمة المرور.");
    } finally {
      setAuthLoading(false);
    }
  };

  const handleRestoreSession = async () => {
    if (!savedSession || !apiId || !apiHash) {
      setAuthError("يرجى التأكد من إدخال API ID و API Hash قبل استعادة الجلسة.");
      return;
    }
    setAuthError("");
    setAuthNotice("");
    setAuthLoading(true);

    try {
      const res = await fetch("/api/auth/restore", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          apiId: Number(apiId),
          apiHash,
          sessionString: savedSession,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setAuthError(data.error || "تعذر استعادة الجلسة المحفوظة.");
        return;
      }
      onUserChanged(data.user);
      if (data.sessionString) onSessionSaved(data.sessionString);
      setAuthNotice("تمت استعادة الجلسة السابقة بنجاح.");
    } catch {
      setAuthError("تعذر الاتصال بالخادم لاستعادة الجلسة.");
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLogout = async () => {
    setAuthLoading(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      onUserChanged(null);
      onSessionSaved("");
      setAuthStep("credentials");
      setAuthNotice("تم تسجيل الخروج وإغلاق الجلسة بأمان.");
    } finally {
      setAuthLoading(false);
    }
  };

  const handleTestBot = async () => {
    setBotStatus(null);
    if (!botToken.trim() || !adminChatId.trim()) {
      setBotStatus({ type: "err", text: "يرجى إدخال توكن البوت ومعرّف حسابك أولاً." });
      return;
    }
    setBotLoading(true);
    try {
      const res = await fetch("/api/bot/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ botToken, adminChatId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setBotStatus({
          type: "err",
          text: `فشل الاختبار: ${data.error || "تأكد من صحة التوكن والضغط على Start داخل البوت."}`,
        });
        return;
      }
      setBotStatus({
        type: "ok",
        text: "تم إرسال رسالة اختبارية إلى تيليجرام بنجاح.",
      });
    } catch {
      setBotStatus({ type: "err", text: "تعذر الاتصال بخدمة تيليجرام." });
    } finally {
      setBotLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* رأس القسم */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">
            ربط حساب تيليجرام وبوت الإشعارات
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            أدخل بيانات واجهة تيليجرام الخاصة بك لتسجيل الدخول مباشرة من المتصفح دون الحاجة لتشغيل أي أوامر برمجية.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setShowGuide((v) => !v)}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 whitespace-nowrap shrink-0"
        >
          <HelpCircle className="h-4 w-4 text-sky-600" />
          <span>{showGuide ? "إخفاء شرح استخراج البيانات" : "كيف أحصل على API و BOT TOKEN؟"}</span>
        </button>
      </div>

      {/* دليل مبسط للاستخراج */}
      {showGuide && (
        <div className="rounded-xl border border-slate-200 bg-white p-6">
          <h2 className="text-base font-semibold text-slate-900">
            خطوات سريعة للحصول على بيانات الربط
          </h2>
          <div className="mt-4 grid gap-6 md:grid-cols-3 text-sm text-slate-600 leading-relaxed">
            <div>
              <p className="font-semibold text-slate-900">1. استخراج API ID و API Hash</p>
              <p className="mt-1">
                افتح الموقع الرسمي{" "}
                <span className="font-mono text-slate-800">my.telegram.org</span>{" "}
                وسجّل برقم هاتفك، ثم اختر{" "}
                <span className="font-medium text-slate-800">API development tools</span>{" "}
                وأنشئ تطبيقاً لتنسخ الرقمين.
              </p>
            </div>
            <div>
              <p className="font-semibold text-slate-900">2. إنشاء بوت الإشعارات (BOT_TOKEN)</p>
              <p className="mt-1">
                راسل{" "}
                <span className="font-mono text-slate-800">@BotFather</span>{" "}
                على تيليجرام وأرسل الأمر{" "}
                <span className="font-mono text-slate-800">/newbot</span>{" "}
                ثم انسخ التوكن. لا تنس فتح البوت الجديد والضغط على{" "}
                <span className="font-medium text-slate-800">ابدأ / Start</span>.
              </p>
            </div>
            <div>
              <p className="font-semibold text-slate-900">3. معرفة معرّفك (ADMIN_CHAT_ID)</p>
              <p className="mt-1">
                أرسل أي رسالة إلى{" "}
                <span className="font-mono text-slate-800">@userinfobot</span>{" "}
                وسيرد عليك فوراً برقم <span className="font-mono text-slate-800">Id</span>{" "}
                الخاص بحسابك لاستقبال تقارير النشر.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* الشبكة الرئيسية: بطاقة حساب تيليجرام + بطاقة بوت الإشعارات */}
      <div className="grid gap-6 lg:grid-cols-12">
        {/* حساب تيليجرام (MTProto) */}
        <section className="lg:col-span-7 rounded-xl border border-slate-200 bg-white p-6">
          <div className="flex items-center justify-between gap-4 border-b border-slate-100 pb-4">
            <div className="flex items-center gap-2.5">
              <KeyRound className="h-5 w-5 text-sky-600" />
              <h2 className="text-base font-semibold text-slate-900">
                حساب النشر على تيليجرام
              </h2>
            </div>
            <button
              type="button"
              onClick={() => setShowSecrets((v) => !v)}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-slate-800 whitespace-nowrap shrink-0"
            >
              {showSecrets ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              <span>{showSecrets ? "إخفاء المفاتيح" : "إظهار المفاتيح"}</span>
            </button>
          </div>

          {authError && (
            <div className="mt-4 flex items-start gap-2.5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{authError}</span>
            </div>
          )}

          {authNotice && !authError && (
            <div className="mt-4 flex items-start gap-2.5 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{authNotice}</span>
            </div>
          )}

          {user ? (
            <div className="mt-5 space-y-5">
              <div className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-emerald-200 bg-emerald-50/50 p-4">
                <div className="flex items-center gap-3">
                  <ShieldCheck className="h-6 w-6 text-emerald-600 shrink-0" />
                  <div>
                    <p className="text-sm font-semibold text-slate-900">
                      متصل باسم: {user.firstName} {user.lastName}
                    </p>
                    <p className="mt-0.5 text-xs text-slate-600 tabular-nums">
                      {user.username ? `@${user.username}` : "بدون معرف"} · +{user.phone} · ID:{" "}
                      <span className="font-mono">{user.id}</span>
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleLogout}
                  disabled={authLoading}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50 whitespace-nowrap shrink-0"
                >
                  <LogOut className="h-3.5 w-3.5" />
                  <span>تسجيل الخروج</span>
                </button>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                <p className="text-xs text-slate-500">
                  تم حفظ الجلسة مؤقتاً في متصفحك لتسهيل إعادة الاتصال لاحقاً.
                </p>
                <button
                  type="button"
                  onClick={onNavigateNext}
                  className="rounded-lg bg-sky-600 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-sky-700 whitespace-nowrap shrink-0"
                >
                  المتابعة إلى إعداد القوالب
                </button>
              </div>
            </div>
          ) : (
            <div className="mt-5">
              {savedSession && authStep === "credentials" && (
                <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-sky-200 bg-sky-50/60 p-4">
                  <div>
                    <p className="text-sm font-medium text-slate-900">
                      توجد جلسة سابقة محفوظة في المتصفح
                    </p>
                    <p className="text-xs text-slate-600">
                      يمكنك استعادتها بنقرة واحدة دون طلب رمز تحقق جديد.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleRestoreSession}
                    disabled={authLoading}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-sky-600 px-4 py-2 text-xs font-medium text-white hover:bg-sky-700 disabled:opacity-50 whitespace-nowrap shrink-0"
                  >
                    <RefreshCw className={`h-3.5 w-3.5 ${authLoading ? "animate-spin" : ""}`} />
                    <span>استعادة الجلسة</span>
                  </button>
                </div>
              )}

              {authStep === "credentials" && (
                <form onSubmit={handleSendCode} className="space-y-4">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <label className="mb-1.5 block text-sm font-medium text-slate-700">
                        Telegram API ID
                      </label>
                      <input
                        type="text"
                        inputMode="numeric"
                        dir="ltr"
                        required
                        value={apiId}
                        onChange={(e) => setApiId(e.target.value)}
                        placeholder="12345678"
                        className="w-full rounded-lg border border-slate-200 bg-white px-3.5 py-2.5 text-sm font-mono text-slate-900 outline-none focus:border-sky-600 focus:ring-2 focus:ring-sky-600/15"
                      />
                    </div>
                    <div>
                      <label className="mb-1.5 block text-sm font-medium text-slate-700">
                        Telegram API Hash
                      </label>
                      <input
                        type={showSecrets ? "text" : "password"}
                        dir="ltr"
                        required
                        value={apiHash}
                        onChange={(e) => setApiHash(e.target.value)}
                        placeholder="0123456789abcdef..."
                        className="w-full rounded-lg border border-slate-200 bg-white px-3.5 py-2.5 text-sm font-mono text-slate-900 outline-none focus:border-sky-600 focus:ring-2 focus:ring-sky-600/15"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-slate-700">
                      رقم الهاتف (بالصيغة الدولية)
                    </label>
                    <div className="relative">
                      <Phone className="pointer-events-none absolute top-3 left-3.5 h-4 w-4 text-slate-400" />
                      <input
                        type="tel"
                        dir="ltr"
                        required
                        value={phoneNumber}
                        onChange={(e) => setPhoneNumber(e.target.value)}
                        placeholder="+966501234567"
                        className="w-full rounded-lg border border-slate-200 bg-white py-2.5 pr-3.5 pl-10 text-sm font-mono text-slate-900 outline-none focus:border-sky-600 focus:ring-2 focus:ring-sky-600/15"
                      />
                    </div>
                  </div>

                  <div className="pt-2">
                    <button
                      type="submit"
                      disabled={authLoading}
                      className="inline-flex items-center justify-center gap-2 rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-slate-800 disabled:opacity-50 whitespace-nowrap shrink-0"
                    >
                      {authLoading ? "جاري إرسال الرمز..." : "إرسال رمز التحقق"}
                    </button>
                  </div>
                </form>
              )}

              {authStep === "code" && (
                <form onSubmit={handleVerifyCode} className="space-y-4">
                  <p className="text-sm text-slate-600">
                    {isCodeViaApp
                      ? "أدخل رمز التحقق الذي وصلك داخل محادثة Telegram الرسمية على جهازك:"
                      : "أدخل رمز التحقق المرسل عبر رسالة SMS إلى رقمك:"}
                  </p>
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-slate-700">
                      رمز التحقق (OTP)
                    </label>
                    <input
                      type="text"
                      inputMode="numeric"
                      dir="ltr"
                      required
                      autoFocus
                      value={phoneCode}
                      onChange={(e) => setPhoneCode(e.target.value)}
                      placeholder="12345"
                      className="w-full rounded-lg border border-slate-200 bg-white px-3.5 py-2.5 text-center text-lg font-mono tracking-widest text-slate-900 outline-none focus:border-sky-600 focus:ring-2 focus:ring-sky-600/15"
                    />
                  </div>
                  <div className="flex items-center gap-3">
                    <button
                      type="submit"
                      disabled={authLoading}
                      className="rounded-lg bg-sky-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-sky-700 disabled:opacity-50 whitespace-nowrap shrink-0"
                    >
                      {authLoading ? "جاري التحقق..." : "تأكيد الرمز"}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setAuthStep("credentials");
                        setAuthError("");
                      }}
                      className="rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap shrink-0"
                    >
                      تعديل الرقم
                    </button>
                  </div>
                </form>
              )}

              {authStep === "password" && (
                <form onSubmit={handleVerifyPassword} className="space-y-4">
                  <p className="text-sm text-slate-600">
                    أدخل كلمة مرور التحقق بخطوتين (2FA) لحسابك:
                    {passwordHint ? (
                      <span className="mr-1 font-medium text-slate-800">
                        (تلميح: {passwordHint})
                      </span>
                    ) : null}
                  </p>
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-slate-700">
                      كلمة المرور السحابية
                    </label>
                    <input
                      type="password"
                      dir="ltr"
                      required
                      autoFocus
                      value={twoFaPassword}
                      onChange={(e) => setTwoFaPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full rounded-lg border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 outline-none focus:border-sky-600 focus:ring-2 focus:ring-sky-600/15"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={authLoading}
                    className="rounded-lg bg-sky-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-sky-700 disabled:opacity-50 whitespace-nowrap shrink-0"
                  >
                    {authLoading ? "جاري الدخول..." : "دخول بالحساب"}
                  </button>
                </form>
              )}
            </div>
          )}
        </section>

        {/* بوت الإشعارات الفورية */}
        <section className="lg:col-span-5 rounded-xl border border-slate-200 bg-white p-6">
          <div className="flex items-center gap-2.5 border-b border-slate-100 pb-4">
            <Bell className="h-5 w-5 text-sky-600" />
            <h2 className="text-base font-semibold text-slate-900">
              بوت إشعارات التقدم الفوري
            </h2>
          </div>

          <div className="mt-5 space-y-4">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">
                توكن البوت (BOT_TOKEN)
              </label>
              <input
                type={showSecrets ? "text" : "password"}
                dir="ltr"
                value={botToken}
                onChange={(e) => setBotToken(e.target.value)}
                placeholder="7123456789:AAH..."
                className="w-full rounded-lg border border-slate-200 bg-white px-3.5 py-2.5 text-sm font-mono text-slate-900 outline-none focus:border-sky-600 focus:ring-2 focus:ring-sky-600/15"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">
                معرّف حسابك الشخصي (ADMIN_CHAT_ID)
              </label>
              <input
                type="text"
                dir="ltr"
                value={adminChatId}
                onChange={(e) => setAdminChatId(e.target.value)}
                placeholder="123456789"
                className="w-full rounded-lg border border-slate-200 bg-white px-3.5 py-2.5 text-sm font-mono text-slate-900 outline-none focus:border-sky-600 focus:ring-2 focus:ring-sky-600/15"
              />
            </div>

            {botStatus && (
              <div
                className={`flex items-start gap-2 rounded-lg border px-3.5 py-2.5 text-xs ${
                  botStatus.type === "ok"
                    ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                    : "border-red-200 bg-red-50 text-red-700"
                }`}
              >
                {botStatus.type === "ok" ? (
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                ) : (
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                )}
                <span>{botStatus.text}</span>
              </div>
            )}

            <button
              type="button"
              onClick={handleTestBot}
              disabled={botLoading}
              className="w-full rounded-lg border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm font-medium text-slate-800 transition-colors hover:bg-slate-100 disabled:opacity-50 whitespace-nowrap"
            >
              {botLoading ? "جاري إرسال الاختبار..." : "اختبار إرسال إشعار على تيليجرام"}
            </button>

            <p className="text-xs leading-relaxed text-slate-500">
              يُستخدم هذا البوت لإرسال تنبيهات فورية إليك عند نجاح النشر، أو تخطي مجموعة مقيدة، أو حدوث توقف FloodWait، بالإضافة إلى الملخص الختامي.
            </p>
          </div>
        </section>
      </div>
    </div>
  );
};
