import React, { useMemo, useState } from "react";
import { RefreshCw, Search, Shield, Users, AlertCircle } from "lucide-react";
import type { AuthorizedUser, TargetGroup } from "../types";

interface GroupsPanelProps {
  user: AuthorizedUser | null;
  groups: TargetGroup[];
  setGroups: (groups: TargetGroup[]) => void;
  selectedGroupIds: string[];
  setSelectedGroupIds: React.Dispatch<React.SetStateAction<string[]>>;
  adminOnly: boolean;
  setAdminOnly: (v: boolean) => void;
  onNavigateConnect: () => void;
  onNavigateNext: () => void;
}

export const GroupsPanel: React.FC<GroupsPanelProps> = ({
  user,
  groups,
  setGroups,
  selectedGroupIds,
  setSelectedGroupIds,
  adminOnly,
  setAdminOnly,
  onNavigateConnect,
  onNavigateNext,
}) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);

  const handleFetchGroups = async (filterAdminOnly: boolean = adminOnly) => {
    setError("");
    setLoading(true);
    try {
      const res = await fetch(`/api/groups?adminOnly=${filterAdminOnly ? "true" : "false"}`);
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "تعذر جلب المجموعات.");
        return;
      }
      const fetched: TargetGroup[] = data.groups ?? [];
      setGroups(fetched);
      setHasLoadedOnce(true);
      // الاحتفاظ فقط بالمجموعات الموجودة في القائمة الجديدة
      const validIds = new Set(fetched.map((g) => g.id));
      setSelectedGroupIds((prev) => prev.filter((id) => validIds.has(id)));
    } catch {
      setError("حدث خطأ أثناء الاتصال بالخادم لفحص المجموعات.");
    } finally {
      setLoading(false);
    }
  };

  const handleToggleFilter = (nextAdminOnly: boolean) => {
    setAdminOnly(nextAdminOnly);
    if (user) {
      void handleFetchGroups(nextAdminOnly);
    }
  };

  const filteredGroups = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return groups;
    return groups.filter(
      (g) =>
        g.title.toLowerCase().includes(q) ||
        g.username.toLowerCase().includes(q) ||
        g.id.includes(q)
    );
  }, [groups, searchQuery]);

  const selectedSet = useMemo(() => new Set(selectedGroupIds), [selectedGroupIds]);

  const toggleGroup = (id: string) => {
    setSelectedGroupIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const selectAllFiltered = () => {
    const next = new Set(selectedGroupIds);
    for (const g of filteredGroups) {
      next.add(g.id);
    }
    setSelectedGroupIds(Array.from(next));
  };

  const clearSelection = () => {
    setSelectedGroupIds([]);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">
            المجموعات المصرح بالنشر فيها
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            افحص حسابك لجلب المجموعات التي تملك فيها صلاحية إدارية أو إذن نشر، ثم حدد المجموعات المستهدفة.
          </p>
        </div>

        <div className="flex items-center gap-3">
          {user && (
            <button
              type="button"
              onClick={() => handleFetchGroups(adminOnly)}
              disabled={loading}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-50 whitespace-nowrap shrink-0"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
              <span>{loading ? "جاري الفحص..." : "تحديث المجموعات"}</span>
            </button>
          )}
          <button
            type="button"
            onClick={onNavigateNext}
            className="rounded-lg bg-sky-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-sky-700 whitespace-nowrap shrink-0"
          >
            الانتقال إلى لوحة النشر
          </button>
        </div>
      </div>

      {!user ? (
        <div className="rounded-xl border border-slate-200 bg-white p-10 text-center">
          <Users className="mx-auto h-9 w-9 text-slate-400" />
          <h2 className="mt-3 text-base font-semibold text-slate-900">
            يجب ربط حساب تيليجرام أولاً
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            سجّل الدخول برقم هاتفك في تبويب الاتصال حتى يتمكن النظام من قراءة مجموعاتك وفحص صلاحياتها.
          </p>
          <button
            type="button"
            onClick={onNavigateConnect}
            className="mt-5 rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-slate-800 whitespace-nowrap"
          >
            الذهاب إلى صفحة الاتصال
          </button>
        </div>
      ) : (
        <section className="rounded-xl border border-slate-200 bg-white">
          {/* شريط الفلترة والبحث */}
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 p-4">
            <div className="flex flex-wrap items-center gap-3">
              {/* أزرار نطاق الصلاحية */}
              <div className="inline-flex items-center gap-1 rounded-lg bg-slate-100 p-1">
                <button
                  type="button"
                  onClick={() => handleToggleFilter(true)}
                  className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                    adminOnly
                      ? "bg-white text-slate-900 shadow-sm"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  المجموعات الإدارية فقط (مالك / مشرف)
                </button>
                <button
                  type="button"
                  onClick={() => handleToggleFilter(false)}
                  className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                    !adminOnly
                      ? "bg-white text-slate-900 shadow-sm"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  جميع المجموعات بصلاحية النشر
                </button>
              </div>

              <div className="relative">
                <Search className="pointer-events-none absolute top-2.5 right-3 h-4 w-4 text-slate-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="بحث باسم المجموعة..."
                  className="w-56 rounded-lg border border-slate-200 bg-slate-50 py-1.5 pr-9 pl-3 text-xs text-slate-900 outline-none focus:border-sky-600 focus:bg-white"
                />
              </div>
            </div>

            <div className="flex items-center gap-3 text-xs">
              <span className="text-slate-600 tabular-nums">
                المحدد:{" "}
                <strong className="font-semibold text-slate-900">
                  {selectedGroupIds.length}
                </strong>{" "}
                من {groups.length}
              </span>
              <button
                type="button"
                onClick={selectAllFiltered}
                disabled={filteredGroups.length === 0}
                className="font-medium text-sky-600 hover:text-sky-700 disabled:opacity-40 whitespace-nowrap"
              >
                تحديد الكل
              </button>
              <span aria-hidden="true" className="text-slate-300">
                ·
              </span>
              <button
                type="button"
                onClick={clearSelection}
                disabled={selectedGroupIds.length === 0}
                className="font-medium text-slate-600 hover:text-slate-900 disabled:opacity-40 whitespace-nowrap"
              >
                إلغاء التحديد
              </button>
            </div>
          </div>

          {error && (
            <div className="m-4 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* حالة التحميل أو الفراغ أو الجدول */}
          {loading ? (
            <div className="divide-y divide-slate-100 p-4">
              {Array.from({ length: 5 }).map((_, idx) => (
                <div key={idx} className="flex items-center justify-between py-3">
                  <div className="h-4 w-56 animate-pulse rounded bg-slate-100" />
                  <div className="h-4 w-28 animate-pulse rounded bg-slate-100" />
                </div>
              ))}
            </div>
          ) : groups.length === 0 ? (
            <div className="p-10 text-center">
              <Shield className="mx-auto h-8 w-8 text-slate-400" />
              <p className="mt-3 text-sm font-medium text-slate-900">
                {hasLoadedOnce
                  ? "لم يتم العثور على مجموعات مطابقة لنطاق الصلاحية المختار."
                  : "اضغط على زر فحص وتحديث المجموعات لعرض المجموعات المتاحة."}
              </p>
              <button
                type="button"
                onClick={() => handleFetchGroups(adminOnly)}
                className="mt-4 rounded-lg bg-slate-900 px-4 py-2 text-xs font-medium text-white hover:bg-slate-800 whitespace-nowrap"
              >
                فحص المجموعات الآن
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-right text-sm">
                <thead className="border-b border-slate-200 bg-slate-50 text-xs font-medium text-slate-500">
                  <tr>
                    <th className="w-12 px-4 py-3 text-center">اختيار</th>
                    <th className="px-4 py-3">اسم المجموعة</th>
                    <th className="px-4 py-3">الصلاحية</th>
                    <th className="px-4 py-3">المعرّف</th>
                    <th className="px-4 py-3 text-left">الأعضاء</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredGroups.map((group) => {
                    const isChecked = selectedSet.has(group.id);
                    return (
                      <tr
                        key={group.id}
                        onClick={() => toggleGroup(group.id)}
                        className={`cursor-pointer transition-colors hover:bg-slate-50 ${
                          isChecked ? "bg-sky-50/40" : ""
                        }`}
                      >
                        <td
                          className="px-4 py-2.5 text-center"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => toggleGroup(group.id)}
                            aria-label={`تحديد ${group.title}`}
                            className="h-4 w-4 accent-sky-600"
                          />
                        </td>
                        <td className="px-4 py-2.5 font-medium text-slate-900">
                          <div className="truncate max-w-xs sm:max-w-md">{group.title}</div>
                        </td>
                        <td className="px-4 py-2.5 text-xs text-slate-600 whitespace-nowrap">
                          {group.roleLabel}
                        </td>
                        <td
                          dir="ltr"
                          className="px-4 py-2.5 text-right font-mono text-xs text-slate-500 tabular-nums"
                        >
                          {group.username ? `@${group.username}` : group.id}
                        </td>
                        <td className="px-4 py-2.5 text-left font-mono text-xs text-slate-600 tabular-nums">
                          {group.membersCount > 0
                            ? group.membersCount.toLocaleString("en-US")
                            : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </div>
  );
};
