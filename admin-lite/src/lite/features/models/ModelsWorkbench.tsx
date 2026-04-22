import { useCallback, useEffect, useState } from "react";
import { Search } from "lucide-react";
import {
  listModels,
  updateModel,
  type ModelItem,
} from "../../../api/models";
import { ThreeColumn } from "../../components/ThreeColumn";
import { StatusBadge } from "../../components/StatusBadge";
import { SaveBar } from "../../components/SaveBar";
import { AdvancedSection } from "../../components/AdvancedSection";
import { useSaveState } from "../../hooks/useSaveState";
import { LoadingBlock } from "../../../components/LoadingBlock";
import { EmptyBlock } from "../../../components/EmptyBlock";
import { ErrorBlock } from "../../../components/ErrorBlock";

function ModelListColumn({
  models,
  loading,
  error,
  selectedId,
  onSelect,
  search,
  onSearchChange,
}: {
  models: ModelItem[];
  loading: boolean;
  error: string | null;
  selectedId: string | null;
  onSelect: (m: ModelItem) => void;
  search: string;
  onSearchChange: (v: string) => void;
}) {
  const filtered = models.filter(
    (m) =>
      !search ||
      m.name.toLowerCase().includes(search.toLowerCase()) ||
      (m.provider ?? "").toLowerCase().includes(search.toLowerCase())
  );

  return (
    <>
      <div className="lite-list-search">
        <div className="relative">
          <Search size={13} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            className="lite-form-input w-full pl-6 text-xs"
            placeholder="搜索模型..."
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
          />
        </div>
      </div>
      <div className="lite-col-list-inner">
        {loading ? (
          <LoadingBlock />
        ) : error ? (
          <ErrorBlock title="加载失败" detail={error} />
        ) : filtered.length === 0 ? (
          <EmptyBlock title="暂无模型" />
        ) : (
          filtered.map((m) => (
            <div
              key={m.id}
              role="button"
              tabIndex={0}
              className={`lite-list-item ${selectedId === m.id ? "selected" : ""}`}
              onClick={() => onSelect(m)}
              onKeyDown={(e) => e.key === "Enter" && onSelect(m)}
            >
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-gray-800 dark:text-gray-100 truncate">
                  {m.name}
                </div>
                <div className="text-xs text-gray-400 mt-0.5">{m.provider ?? "—"}</div>
              </div>
              <StatusBadge enabled={m.enabled} />
            </div>
          ))
        )}
      </div>
    </>
  );
}

function ModelDetailColumn({
  model,
  onSaved,
}: {
  model: ModelItem | null;
  onSaved: (m: ModelItem) => void;
}) {
  const [form, setForm] = useState<Partial<ModelItem>>({});
  const { status, errorMessage, save } = useSaveState();

  useEffect(() => {
    if (!model) return;
    setForm({ ...model });
  }, [model]);

  const set = <K extends keyof ModelItem>(key: K, value: ModelItem[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const handleSave = () => {
    if (!model) return;
    save(async () => {
      const updated = await updateModel(model.id, form as Record<string, unknown>);
      onSaved(updated);
    });
  };

  if (!model) {
    return (
      <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">
        从左侧选择模型
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="lite-section-header">
        <h2 className="font-semibold text-sm text-gray-800 dark:text-gray-100">{model.name}</h2>
        <StatusBadge enabled={model.enabled} />
      </div>

      <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">
        <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide">元数据</div>
        <div className="lite-form-group">
          <label className="lite-form-label">名称</label>
          <input
            className="lite-form-input"
            value={String(form.name ?? "")}
            onChange={(e) => set("name", e.target.value)}
          />
        </div>
        <div className="lite-form-group">
          <label className="lite-form-label">描述</label>
          <input
            className="lite-form-input"
            value={String(form.description ?? "")}
            onChange={(e) => set("description", e.target.value)}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="lite-form-group">
            <label className="lite-form-label">Provider</label>
            <input
              className="lite-form-input"
              value={String(form.provider ?? "")}
              onChange={(e) => set("provider", e.target.value)}
            />
          </div>
          <div className="lite-form-group">
            <label className="lite-form-label">排序</label>
            <input
              type="number"
              className="lite-form-input"
              value={Number(form.sortOrder ?? 0)}
              onChange={(e) => set("sortOrder", parseInt(e.target.value, 10))}
            />
          </div>
        </div>

        <div className="flex flex-wrap gap-4">
          {[
            { key: "enabled" as const, label: "启用" },
            { key: "defaultSelected" as const, label: "默认选中" },
            { key: "pinned" as const, label: "置顶" },
            { key: "multiChatEnabled" as const, label: "多模型聊天" },
            { key: "billingEnabled" as const, label: "计费" },
          ].map(({ key, label }) => (
            <label key={key} className="lite-toggle-row cursor-pointer select-none">
              <span className="lite-toggle">
                <input
                  type="checkbox"
                  checked={Boolean(form[key])}
                  onChange={(e) => set(key, e.target.checked)}
                />
                <span className="lite-toggle-track" />
                <span className="lite-toggle-thumb" />
              </span>
              <span className="lite-form-label">{label}</span>
            </label>
          ))}
        </div>

        <AdvancedSection label="图像解析">
          <div className="flex items-center gap-3 mt-2">
            <label className="lite-toggle-row cursor-pointer select-none">
              <span className="lite-toggle">
                <input
                  type="checkbox"
                  checked={Boolean(form.supportsImageParsing)}
                  onChange={(e) => set("supportsImageParsing", e.target.checked)}
                />
                <span className="lite-toggle-track" />
                <span className="lite-toggle-thumb" />
              </span>
              <span className="lite-form-label">支持图像解析</span>
            </label>
            <span className="text-xs text-gray-400">
              来源：{form.supportsImageParsingSource ?? "unknown"}
            </span>
          </div>
        </AdvancedSection>

        <AdvancedSection label="价格">
          <div className="grid grid-cols-2 gap-3 mt-2">
            <div className="lite-form-group">
              <label className="lite-form-label">输入价格（每 1M tokens，USD）</label>
              <input
                type="number"
                step="0.01"
                className="lite-form-input"
                value={form.inputPriceUsdPer1M ?? ""}
                onChange={(e) => set("inputPriceUsdPer1M", parseFloat(e.target.value) || null)}
              />
            </div>
            <div className="lite-form-group">
              <label className="lite-form-label">输出价格（每 1M tokens，USD）</label>
              <input
                type="number"
                step="0.01"
                className="lite-form-input"
                value={form.outputPriceUsdPer1M ?? ""}
                onChange={(e) => set("outputPriceUsdPer1M", parseFloat(e.target.value) || null)}
              />
            </div>
          </div>
        </AdvancedSection>

        <div className="lite-info-note">
          模型页是「目录元数据工作台」。连通性测试、排序重排请通过旧后台「渠道与模型」模块操作。
        </div>
      </div>

      <SaveBar status={status} errorMessage={errorMessage} onSave={handleSave} />
    </div>
  );
}

export function ModelsWorkbench() {
  const [models, setModels] = useState<ModelItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<ModelItem | null>(null);
  const [search, setSearch] = useState("");

  const reload = useCallback(() => {
    setLoading(true);
    listModels({ size: 500 })
      .then((res) => setModels(res.items))
      .catch((err) => setError(err instanceof Error ? err.message : "加载失败"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { reload(); }, []);

  const handleSaved = (m: ModelItem) => {
    setModels((prev) => {
      const idx = prev.findIndex((x) => x.id === m.id);
      if (idx >= 0) { const next = [...prev]; next[idx] = m; return next; }
      return prev;
    });
    setSelected(m);
  };

  return (
    <ThreeColumn
      list={
        <ModelListColumn
          models={models}
          loading={loading}
          error={error}
          selectedId={selected?.id ?? null}
          onSelect={setSelected}
          search={search}
          onSearchChange={setSearch}
        />
      }
      detail={<ModelDetailColumn model={selected} onSaved={handleSaved} />}
    />
  );
}
