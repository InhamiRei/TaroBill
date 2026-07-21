import {
  CalendarDays,
  ChartNoAxesCombined,
  ChevronLeft,
  ChevronRight,
  Minus,
  MoveDiagonal2,
  Pencil,
  Plus,
  Receipt,
  ReceiptText,
  Search,
  Settings,
  Tag,
  Trash2,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { formatCny, filterRecordsByPeriod, summarizeAllTime, summarizeMonth, summarizeYear } from '../shared/billUtils';
import type { AppData, BillRecord, BillRecordInput, BillType, ThemeMode } from '../shared/types';
import { BillList } from './components/BillList';
import { CalendarGrid } from './components/CalendarGrid';
import { ConfirmDialog } from './components/ConfirmDialog';
import type { ConfirmDialogState } from './components/ConfirmDialog';
import { ExpenseChart, ExpenseWeeklyChart } from './components/ExpenseChart';
import { RecordEditor } from './components/RecordEditor';
import { ResizeHandles } from './components/ResizeHandles';
import { SearchDialog } from './components/SearchDialog';
import { SettingsDialog } from './components/SettingsDialog';
import { ToggleStatCard } from './components/ToggleStatCard';
import { TypeEditorDialog } from './components/TypeEditorDialog';
import { WindowControls } from './components/WindowControls';
import { getTaroBillApi } from './previewApi';

const api = getTaroBillApi();

// 浏览器 UA 只提供首帧平台猜测，随后仍以主进程返回值为准。
const getInitialPlatform = (): string => (navigator.userAgent.includes('Windows') ? 'win32' : '');

// 任意异常统一提取可读信息，避免把 [object Object] 显示给用户。
const getErrorMessage = (error: unknown): string => (error instanceof Error ? error.message : String(error));

function App() {
  const now = new Date();
  const [data, setData] = useState<AppData | null>(null);
  const [loadError, setLoadError] = useState('');
  const [activeTypeId, setActiveTypeId] = useState('');
  const [selectedYear, setSelectedYear] = useState(now.getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [platform, setPlatform] = useState(getInitialPlatform);
  const [maximized, setMaximized] = useState(false);
  const [recordEditor, setRecordEditor] = useState<BillRecord | null | undefined>(undefined);
  const [typeEditor, setTypeEditor] = useState<BillType | null | undefined>(undefined);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogState | null>(null);
  const [toast, setToast] = useState('');
  const [showTotalCount, setShowTotalCount] = useState(false);
  const [showAllTimeExpense, setShowAllTimeExpense] = useState(false);
  const toastTimerRef = useRef<number | undefined>(undefined);
  const isWindows = platform === 'win32';

  // Toast 自动替换上一条计时，快速连续操作时始终完整展示最后结果。
  const showToast = (message: string) => {
    setToast(message);
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => setToast(''), 2600);
  };

  useEffect(
    () => () => {
      if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    },
    [],
  );

  // 首次读取本地状态，并默认选中排序第一的账单类型。
  useEffect(() => {
    let disposed = false;
    void api
      .getState()
      .then((nextData) => {
        if (disposed) return;
        setData(nextData);
        setActiveTypeId(nextData.billTypes[0]?.id ?? '');
      })
      .catch((error) => {
        if (!disposed) setLoadError(getErrorMessage(error));
      });
    return () => {
      disposed = true;
    };
  }, []);

  // 平台决定窗控和缩放边条，最大化状态决定透明窗口是否保留圆角留白。
  useEffect(() => {
    void api
      .getPlatform()
      .then(setPlatform)
      .catch(() => undefined);
    void api
      .isMaximized()
      .then(setMaximized)
      .catch(() => undefined);
    const removeListener = api.onWindowState((state) => setMaximized(state.maximized));
    return () => removeListener();
  }, []);

  const theme = data?.settings.theme ?? 'light';
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.dataset.platform = isWindows ? 'win' : 'mac';
    document.documentElement.dataset.maximized = maximized ? 'true' : 'false';
  }, [isWindows, maximized, theme]);

  // 导入或删除类型后若当前 ID 失效，自动回到第一项，避免出现空白工作区。
  useEffect(() => {
    if (!data?.billTypes.length) return;
    if (!data.billTypes.some((billType) => billType.id === activeTypeId)) setActiveTypeId(data.billTypes[0].id);
  }, [activeTypeId, data?.billTypes]);

  const activeType = data?.billTypes.find((billType) => billType.id === activeTypeId) ?? data?.billTypes[0];
  const activeRecords = useMemo(() => (data?.records ?? []).filter((record) => record.typeId === activeType?.id), [activeType?.id, data?.records]);
  const monthSummary = useMemo(() => summarizeMonth(activeRecords, selectedYear, selectedMonth), [activeRecords, selectedMonth, selectedYear]);
  const yearSummary = useMemo(() => summarizeYear(activeRecords, selectedYear), [activeRecords, selectedYear]);
  const allTimeTotal = useMemo(() => summarizeAllTime(activeRecords), [activeRecords]);
  const visibleRecords = useMemo(
    () => filterRecordsByPeriod(activeRecords, selectedYear, selectedMonth, selectedDate),
    [activeRecords, selectedDate, selectedMonth, selectedYear],
  );
  const typeCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const record of data?.records ?? []) counts.set(record.typeId, (counts.get(record.typeId) ?? 0) + 1);
    return counts;
  }, [data?.records]);

  // 所有业务写入统一捕获异常并刷新 AppData，弹窗可以据返回值决定是否关闭。
  const runMutation = async (operation: () => Promise<AppData>, successMessage: string): Promise<boolean> => {
    try {
      const nextData = await operation();
      setData(nextData);
      showToast(successMessage);
      return true;
    } catch (error) {
      showToast(getErrorMessage(error));
      return false;
    }
  };

  // 记录保存根据是否存在 ID 分发到新建或编辑通道。
  const saveRecord = async (recordId: string | null, input: BillRecordInput): Promise<boolean> => {
    return recordId
      ? runMutation(() => api.updateBillRecord(recordId, input), '账单已更新')
      : runMutation(() => api.createBillRecord(input), '账单已保存');
  };

  // 新建或重命名类型后保留当前选择；新建成功则自动切换到新类型。
  const saveType = async (name: string): Promise<boolean> => {
    if (typeEditor) return runMutation(() => api.renameBillType(typeEditor.id, name), '类型名称已更新');
    try {
      const previousIds = new Set(data?.billTypes.map((billType) => billType.id) ?? []);
      const nextData = await api.createBillType(name);
      setData(nextData);
      const created = nextData.billTypes.find((billType) => !previousIds.has(billType.id));
      if (created) setActiveTypeId(created.id);
      showToast('账单类型已新增');
      return true;
    } catch (error) {
      showToast(getErrorMessage(error));
      return false;
    }
  };

  // 删除类型确认文案明确包含级联账单数量，执行后自动选择剩余第一项。
  const requestTypeDelete = (billType: BillType) => {
    if (!data || data.billTypes.length <= 1) {
      showToast('至少需要保留一个账单类型。');
      return;
    }
    const recordCount = typeCounts.get(billType.id) ?? 0;
    setConfirmDialog({
      title: `删除“${billType.name}”？`,
      message: recordCount ? `此操作将同时永久删除该类型下的 ${recordCount} 条账单，无法撤销。` : '该类型目前没有账单，删除后无法撤销。',
      confirmLabel: recordCount ? `删除类型和 ${recordCount} 条账单` : '删除类型',
      danger: true,
      onConfirm: async () => {
        const success = await runMutation(() => api.deleteBillType(billType.id), '账单类型已删除');
        if (success && activeTypeId === billType.id) {
          const fallback = data.billTypes.find((item) => item.id !== billType.id);
          if (fallback) setActiveTypeId(fallback.id);
        }
      },
    });
  };

  // 单条账单删除也使用统一危险确认，防止误点卡片操作区。
  const requestRecordDelete = (record: BillRecord) => {
    setConfirmDialog({
      title: '删除这笔账单？',
      message: `“${record.content}”及其金额和时间将被永久删除。`,
      confirmLabel: '删除账单',
      danger: true,
      onConfirm: () => runMutation(() => api.deleteBillRecord(record.id), '账单已删除').then(() => undefined),
    });
  };

  // 月份前后切换通过 Date 自动处理跨年，并同步清除单日筛选。
  const shiftPeriod = (offset: number) => {
    setSelectedDate(null);
    const target = new Date(selectedYear, selectedMonth + offset, 1);
    setSelectedYear(target.getFullYear());
    setSelectedMonth(target.getMonth());
  };

  // “本月”重置当前年月，并清除单日筛选。
  const resetPeriod = () => {
    const current = new Date();
    setSelectedYear(current.getFullYear());
    setSelectedMonth(current.getMonth());
    setSelectedDate(null);
  };

  // 点击相邻月份日期会先导航，点击当前已选日期则取消单日筛选。
  const selectCalendarDate = (dateKey: string, inCurrentMonth: boolean) => {
    if (selectedDate === dateKey) {
      setSelectedDate(null);
      return;
    }
    if (!inCurrentMonth) {
      setSelectedYear(Number(dateKey.slice(0, 4)));
      setSelectedMonth(Number(dateKey.slice(5, 7)) - 1);
    }
    setSelectedDate(dateKey);
  };

  // 主题保存成功后 AppData 会触发根节点 data-theme 更新。
  const updateTheme = (nextTheme: ThemeMode) => {
    if (nextTheme === theme) return;
    void runMutation(() => api.updateSettings({ theme: nextTheme }), '主题已更新');
  };

  // 导出结果包含实际路径，取消选择文件时不显示误导性的成功提示。
  const exportData = async () => {
    try {
      const result = await api.exportData();
      if (result.message) showToast(result.message);
      else if (!result.canceled) showToast('备份已导出');
    } catch (error) {
      showToast(getErrorMessage(error));
    }
  };

  // 导入前先关闭设置并二次确认，导入成功后重置到可用类型和当前年月。
  const requestImport = () => {
    setSettingsOpen(false);
    setConfirmDialog({
      title: '导入并覆盖当前数据？',
      message: '导入文件会完整替换现有账单类型、记录和主题。建议先导出一份备份。',
      confirmLabel: '选择备份文件',
      onConfirm: async () => {
        try {
          const response = await api.importData();
          if (response.result.message) {
            showToast(response.result.message);
            return;
          }
          if (!response.result.canceled && response.data) {
            setData(response.data);
            setActiveTypeId(response.data.billTypes[0]?.id ?? '');
            resetPeriod();
            showToast('备份已导入');
          }
        } catch (error) {
          showToast(getErrorMessage(error));
        }
      },
    });
  };

  if (!data || !activeType) {
    return (
      <div className="boot-screen">
        {loadError ? (
          `加载失败：${loadError}`
        ) : (
          <>
            <span className="boot-mark">
              <ReceiptText />
            </span>
            TaroBill
          </>
        )}
      </div>
    );
  }

  return (
    <>
      {isWindows && <ResizeHandles />}
      <main className="app-shell">
        <aside className="sidebar">
          {!isWindows && (
            <div className="traffic-lights">
              <button className="traffic red" title="关闭" onClick={() => void api.closeWindow()}>
                <X size={8} />
              </button>
              <button className="traffic yellow" title="最小化" onClick={() => void api.minimizeWindow()}>
                <Minus size={8} />
              </button>
              <button className="traffic green" title="最大化" onClick={() => void api.toggleMaximize()}>
                <MoveDiagonal2 size={7} />
              </button>
            </div>
          )}
          <div className="brand-title">
            <strong>TaroBill</strong>
            <span className="brand-version">v{__APP_VERSION__}</span>
          </div>
          <div className="sidebar-heading">
            <Tag size={18} />
            <span>账单类型</span>
            <button title="新增类型" onClick={() => setTypeEditor(null)}>
              <Plus size={16} />
            </button>
          </div>
          <nav className="type-list no-drag">
            {data.billTypes.map((billType) => {
              const active = billType.id === activeType.id;
              return (
                <div className={active ? 'type-row active' : 'type-row'} key={billType.id}>
                  <button className="type-select" onClick={() => setActiveTypeId(billType.id)}>
                    <span className="type-name">{billType.name}</span>
                    <em>{typeCounts.get(billType.id) ?? 0}</em>
                  </button>
                  <div className="type-actions">
                    <button title="重命名" onClick={() => setTypeEditor(billType)}>
                      <Pencil size={14} />
                    </button>
                    <button title="删除" onClick={() => requestTypeDelete(billType)}>
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              );
            })}
          </nav>
          <nav className="sidebar-bottom no-drag">
            <button className={settingsOpen ? 'sidebar-settings active' : 'sidebar-settings'} onClick={() => setSettingsOpen(true)}>
              <Settings size={18} />
              <span>设置</span>
            </button>
          </nav>
        </aside>

        <section className="workspace">
          <header className="topbar">
            <div className="page-title">
              <h1>{activeType.name}</h1>
              <button className="icon-button page-search" title="搜索账单标题" onClick={() => setSearchOpen(true)}>
                <Search size={16} />
              </button>
            </div>
            <div className="topbar-actions no-drag">
              <div className="period-navigator">
                <button className="icon-button" title="上个月" onClick={() => shiftPeriod(-1)}>
                  <ChevronLeft size={17} />
                </button>
                <strong>
                  {selectedYear}年{selectedMonth + 1}月
                </strong>
                <button className="icon-button" title="下个月" onClick={() => shiftPeriod(1)}>
                  <ChevronRight size={17} />
                </button>
                <button className="today-button" onClick={resetPeriod}>
                  本月
                </button>
              </div>
              {isWindows && <WindowControls maximized={maximized} />}
            </div>
          </header>

          <div className="dashboard">
            <section className="analytics-pane">
              {/* 三张统计卡统一使用带边框的图标容器，保证信息层级和视觉样式一致。 */}
              <div className="stats-grid">
                <article className="stat-card">
                  <span className="stat-icon">
                    <CalendarDays size={18} />
                  </span>
                  <div>
                    <small>月支出</small>
                    <strong>{formatCny(monthSummary.totalCents)}</strong>
                  </div>
                </article>
                <ToggleStatCard
                  icon={<ChartNoAxesCombined size={18} />}
                  label="年支出"
                  altLabel="总支出"
                  value={formatCny(yearSummary.totalCents)}
                  altValue={formatCny(allTimeTotal)}
                  toggled={showAllTimeExpense}
                  onToggle={() => setShowAllTimeExpense((prev) => !prev)}
                />
                <ToggleStatCard
                  icon={<Receipt size={18} />}
                  label="账单数"
                  altLabel="账单总数"
                  value={String(visibleRecords.length)}
                  altValue={String(activeRecords.length)}
                  toggled={showTotalCount}
                  onToggle={() => setShowTotalCount((prev) => !prev)}
                />
              </div>
              <div className="charts-row">
                <ExpenseChart values={monthSummary.dailyTotals} />
                <ExpenseWeeklyChart records={activeRecords} year={selectedYear} monthIndex={selectedMonth} selectedDate={selectedDate} />
              </div>
              <CalendarGrid
                year={selectedYear}
                monthIndex={selectedMonth}
                summary={monthSummary}
                selectedDate={selectedDate}
                onSelectDate={selectCalendarDate}
              />
            </section>
            <BillList
              records={visibleRecords}
              onAdd={() => setRecordEditor(null)}
              onEdit={(record) => setRecordEditor(record)}
              onDelete={requestRecordDelete}
            />
          </div>
        </section>

        {/* 搜索弹窗在编辑弹窗之前渲染，点击结果后编辑弹窗叠在上层，关闭后回到原搜索结果。 */}
        {searchOpen && (
          <SearchDialog
            typeName={activeType.name}
            records={activeRecords}
            suspended={recordEditor !== undefined}
            onClose={() => setSearchOpen(false)}
            onSelect={(record) => setRecordEditor(record)}
          />
        )}
        {recordEditor !== undefined && (
          <RecordEditor
            key={recordEditor?.id ?? `new-${activeType.id}`}
            typeId={activeType.id}
            typeName={activeType.name}
            record={recordEditor}
            onClose={() => setRecordEditor(undefined)}
            onSave={saveRecord}
          />
        )}
        {typeEditor !== undefined && (
          <TypeEditorDialog
            key={typeEditor?.id ?? 'new-type'}
            initialName={typeEditor?.name}
            onClose={() => setTypeEditor(undefined)}
            onSave={saveType}
          />
        )}
        {settingsOpen && (
          <SettingsDialog
            theme={theme}
            onClose={() => setSettingsOpen(false)}
            onThemeChange={updateTheme}
            onExport={() => void exportData()}
            onImport={requestImport}
          />
        )}
        {confirmDialog && <ConfirmDialog {...confirmDialog} onClose={() => setConfirmDialog(null)} />}
        {toast && <div className="toast no-drag">{toast}</div>}
      </main>
    </>
  );
}

export default App;
