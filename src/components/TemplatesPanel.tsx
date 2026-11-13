import React, { useEffect, useState } from "react";
import { Layers, Plus, RefreshCw, Sparkles, Trash2 } from "lucide-react";
import type { TemplateItem } from "../types";

interface TemplatesPanelProps {
  templates: TemplateItem[];
  setTemplates: React.Dispatch<React.SetStateAction<TemplateItem[]>>;
  useVariation: boolean;
  setUseVariation: (v: boolean) => void;
  onNavigateNext: () => void;
}

const SAMPLE_FIVE_TEMPLATES: TemplateItem[] = [
  {
    id: "tpl-sample-1",
    title: "قالب 1: جودة الكود",
    content:
      "{نصيحة هندسية|فائدة برمجية} لأعضاء {group_name}:\n\nقسّم الدوال الطويلة إلى وحدات صغيرة واضحة المسؤولية؛ فكل دالة تقوم بمهمة واحدة فقط تسهل قراءتها واختبارها وصيانتها.\n\nتحديث: {date}",
  },
  {
    id: "tpl-sample-2",
    title: "قالب 2: الأمان وحماية المفاتيح",
    content:
      "{تنبيه تقني مهم|معلومة أمنية} في {group_name}:\n\nلا تضع مفاتيح API أو كلمات المرور داخل الكود المصدري أبداً، واستخدم دائماً متغيرات البيئة (.env) لحماية بيانات تطبيقاتك.\n\nبتاريخ: {date}",
  },
  {
    id: "tpl-sample-3",
    title: "قالب 3: معالجة الأخطاء",
    content:
      "{ملاحظة احترافية|قاعدة ذهبية} لمجتمع {group_name}:\n\nاحرص عند استدعاء أي خدمة خارجية على وجود مهلة زمنية (Timeout) ومعالجة واضحة للأخطاء حتى لا يتجمد النظام عند بطء الشبكة.\n\n{date}",
  },
  {
    id: "tpl-sample-4",
    title: "قالب 4: تحسين الأداء",
    content:
      "{إضاءة تقنية|ملخص سريع} لأصدقاء {group_name}:\n\nاستخدم التخزين المؤقت (Caching) للبيانات المتكررة، وتجنب إرسال استعلامات متتالية داخل الحلقات عندما يمكنك دمجها في طلب واحد.\n\n{date}",
  },
  {
    id: "tpl-sample-5",
    title: "قالب 5: التوثيق والعمل الجماعي",
    content:
      "{توجيه عملي|خبرة ميدانية} في {group_name}:\n\nتوثيق خطوات التشغيل والمتطلبات في ملف README واضح يوفر ساعات من البحث لك ولفريقك عند العودة للمشروع بعد أشهر.\n\nتحديث: {date}",
  },
];

export const TemplatesPanel: React.FC<TemplatesPanelProps> = ({
  templates,
  setTemplates,
  useVariation,
  setUseVariation,
  onNavigateNext,
}) => {
  const [selectedId, setSelectedId] = useState<string>(templates[0]?.id ?? "");
  const [previewHtml, setPreviewHtml] = useState<string>("");
  const [previewGroupName, setPreviewGroupName] = useState("مجتمع المطورين العرب");

  const activeTemplate =
    templates.find((t) => t.id === selectedId) ?? templates[0] ?? null;

  const fetchPreview = async (content: string, groupTitle: string, variation: boolean) => {
    if (!content.trim()) {
      setPreviewHtml("");
      return;
    }
    try {
      const res = await fetch("/api/broadcast/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          template: content,
          groupTitle,
          useVariation: variation,
        }),
      });
      const data = await res.json();
      if (res.ok && data.htmlPreview) {
        setPreviewHtml(data.htmlPreview);
      }
    } catch {
      // تجاهل أخطاء المعاينة العابرة
    }
  };

  useEffect(() => {
    if (activeTemplate) {
      void fetchPreview(activeTemplate.content, previewGroupName, useVariation);
    }
  }, [activeTemplate?.id, activeTemplate?.content, previewGroupName, useVariation]);

  const handleAddTemplate = () => {
    const newItem: TemplateItem = {
      id: `tpl-${Date.now()}`,
      title: `قالب ${templates.length + 1}`,
      content:
        "{معلومة تقنية|نصيحة عملية} اليوم في {group_name}:\n\nاكتب هنا الملخص التعليمي أو الفائدة البرمجية التي ترغب في مشاركتها مع المجتمع.\n\nتاريخ التحديث: {date}",
    };
    setTemplates((prev) => [...prev, newItem]);
    setSelectedId(newItem.id);
  };

  const handleLoadFiveSamples = () => {
    const existingContents = new Set(templates.map((t) => t.content.trim()));
    const extras = SAMPLE_FIVE_TEMPLATES.filter(
      (s) => !existingContents.has(s.content.trim())
    ).map((s, idx) => ({
      ...s,
      id: `tpl-${Date.now()}-${idx}`,
    }));
    if (extras.length === 0) return;
    const needed = Math.max(0, 5 - templates.length);
    const toAdd = needed > 0 ? extras.slice(0, needed) : [extras[0]];
    setTemplates((prev) => [...prev, ...toAdd]);
    setSelectedId(toAdd[0].id);
  };

  const handleDeleteTemplate = (id: string) => {
    if (templates.length <= 1) return;
    const filtered = templates.filter((t) => t.id !== id);
    setTemplates(filtered);
    if (selectedId === id && filtered[0]) {
      setSelectedId(filtered[0].id);
    }
  };

  const updateActiveField = (field: "title" | "content", value: string) => {
    if (!activeTemplate) return;
    setTemplates((prev) =>
      prev.map((item) => (item.id === activeTemplate.id ? { ...item, [field]: value } : item))
    );
  };

  const insertSnippet = (snippet: string) => {
    if (!activeTemplate) return;
    updateActiveField(
      "content",
      `${activeTemplate.content}${activeTemplate.content.endsWith(" ") || !activeTemplate.content ? "" : " "}${snippet}`
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">
            قوالب المحتوى والتدوير الدوري الذكي
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            في كل دورة نشر، تتلقى كل مجموعة قالباً واحداً فقط موزّعاً عشوائياً، ومع الدورة التالية يتم تبديل القوالب وتدويرها تلقائياً على المجموعات.
          </p>
        </div>

        <button
          type="button"
          onClick={onNavigateNext}
          className="rounded-lg bg-sky-600 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-sky-700 whitespace-nowrap shrink-0"
        >
          اختيار المجموعات المستهدفة
        </button>
      </div>

      {/* شريط توضيحي لعدد القوالب في مخزون التدوير */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-5 py-3.5 text-sm">
        <div className="flex items-center gap-2.5 text-slate-700">
          <Layers className="h-4 w-4 text-sky-600 shrink-0" />
          <span>
            مخزون التدوير الحالي:{" "}
            <strong className="font-mono font-semibold text-slate-900 tabular-nums">
              {templates.length}
            </strong>{" "}
            {templates.length === 1 ? "قالب" : "قوالب"} — يوصى بإضافة 5 قوالب أو أكثر لضمان تنوع مستمر بين المجموعات في كل دورة.
          </span>
        </div>
        {templates.length < 5 && (
          <button
            type="button"
            onClick={handleLoadFiveSamples}
            className="rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-1.5 text-xs font-medium text-slate-800 hover:bg-slate-100 whitespace-nowrap shrink-0"
          >
            إكمال إلى 5 قوالب تعليمية جاهزة
          </button>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-12">
        {/* قائمة القوالب والمحرر */}
        <section className="lg:col-span-7 rounded-xl border border-slate-200 bg-white p-6 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
            <div className="flex flex-wrap items-center gap-2">
              {templates.map((tpl) => {
                const isActive = activeTemplate?.id === tpl.id;
                return (
                  <button
                    key={tpl.id}
                    type="button"
                    onClick={() => setSelectedId(tpl.id)}
                    className={`rounded-lg px-3.5 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                      isActive
                        ? "bg-slate-900 text-white"
                        : "border border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100"
                    }`}
                  >
                    {tpl.title || "قالب بدون عنوان"}
                  </button>
                );
              })}
            </div>

            <button
              type="button"
              onClick={handleAddTemplate}
              className="inline-flex items-center gap-1.5 rounded-lg border border-sky-200 bg-sky-50 px-3 py-1.5 text-xs font-medium text-sky-700 hover:bg-sky-100 whitespace-nowrap shrink-0"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>إضافة قالب</span>
            </button>
          </div>

          {activeTemplate && (
            <div className="space-y-4">
              <div className="flex items-end gap-3">
                <div className="flex-1">
                  <label className="mb-1.5 block text-sm font-medium text-slate-700">
                    عنوان القالب (يظهر في سجل التوزيع الدوري)
                  </label>
                  <input
                    type="text"
                    value={activeTemplate.title}
                    onChange={(e) => updateActiveField("title", e.target.value)}
                    className="w-full rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm text-slate-900 outline-none focus:border-sky-600 focus:ring-2 focus:ring-sky-600/15"
                  />
                </div>
                {templates.length > 1 && (
                  <button
                    type="button"
                    onClick={() => handleDeleteTemplate(activeTemplate.id)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-white px-3.5 py-2 text-xs font-medium text-red-600 hover:bg-red-50 whitespace-nowrap shrink-0"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    <span>حذف</span>
                  </button>
                )}
              </div>

              <div>
                <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
                  <label className="text-sm font-medium text-slate-700">
                    نص الرسالة التعليمية
                  </label>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => insertSnippet("{group_name}")}
                      className="rounded border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-mono text-slate-700 hover:bg-slate-100 whitespace-nowrap"
                    >
                      + اسم المجموعة
                    </button>
                    <button
                      type="button"
                      onClick={() => insertSnippet("{date}")}
                      className="rounded border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-mono text-slate-700 hover:bg-slate-100 whitespace-nowrap"
                    >
                      + التاريخ
                    </button>
                    <button
                      type="button"
                      onClick={() => insertSnippet("{نصيحة اليوم|معلومة سريعة|فائدة تقنية}")}
                      className="rounded border border-slate-200 bg-slate-50 px-2 py-1 text-xs text-slate-700 hover:bg-slate-100 whitespace-nowrap"
                    >
                      + صيغة تنويع
                    </button>
                  </div>
                </div>

                <textarea
                  rows={8}
                  value={activeTemplate.content}
                  onChange={(e) => updateActiveField("content", e.target.value)}
                  placeholder="اكتب المحتوى التعليمي هنا..."
                  className="w-full rounded-lg border border-slate-200 bg-white p-3.5 text-sm leading-relaxed text-slate-900 outline-none focus:border-sky-600 focus:ring-2 focus:ring-sky-600/15"
                />
              </div>

              <label className="flex cursor-pointer items-center justify-between gap-4 rounded-lg border border-slate-200 bg-slate-50/70 p-4">
                <div className="flex items-start gap-3">
                  <Sparkles className="mt-0.5 h-4 w-4 text-sky-600 shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-slate-900">
                      تفعيل التنويع الهيكلي التلقائي
                    </p>
                    <p className="text-xs text-slate-600">
                      يضيف تلقائياً مقدمات وخواتيم وفواصل متغيرة بأسلوب طبيعي لكل مجموعة لتجنب التكرار الحرفي.
                    </p>
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={useVariation}
                  onChange={(e) => setUseVariation(e.target.checked)}
                  className="h-4 w-4 accent-sky-600 shrink-0"
                />
              </label>
            </div>
          )}
        </section>

        {/* المعاينة الحية */}
        <section className="lg:col-span-5 rounded-xl border border-slate-200 bg-white p-6 flex flex-col justify-between space-y-4">
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-3 border-b border-slate-100 pb-4">
              <h2 className="text-base font-semibold text-slate-900">
                معاينة شكل المنشور النهائي
              </h2>
              <button
                type="button"
                onClick={() =>
                  activeTemplate &&
                  fetchPreview(activeTemplate.content, previewGroupName, useVariation)
                }
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap shrink-0"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                <span>توليد عينة أخرى</span>
              </button>
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate-500">
                اسم مجموعة افتراضي للمعاينة
              </label>
              <input
                type="text"
                value={previewGroupName}
                onChange={(e) => setPreviewGroupName(e.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-800 outline-none focus:border-sky-600"
              />
            </div>

            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm leading-relaxed text-slate-800 whitespace-pre-wrap">
              {previewHtml ? (
                <div dangerouslySetInnerHTML={{ __html: previewHtml }} />
              ) : (
                <span className="text-slate-400">اكتب نصاً في القالب لعرض المعاينة هنا...</span>
              )}
            </div>
          </div>

          <p className="text-xs text-slate-500">
            في كل دورة، يضمن النظام حصول كل مجموعة على قالب واحد فقط، ثم يُعيد تدوير القوالب وتبديلها في الدورة التالية.
          </p>
        </section>
      </div>
    </div>
  );
};
