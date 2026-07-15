import {
  Bot,
  BrainCircuit,
  Car,
  ChartNoAxesCombined,
  CircleDollarSign,
  CircuitBoard,
  Coffee,
  Cpu,
  CreditCard,
  Dumbbell,
  Gamepad2,
  Gift,
  GraduationCap,
  HeartPulse,
  House,
  Landmark,
  MessageSquareCode,
  PawPrint,
  Pill,
  Plane,
  ReceiptText,
  ShoppingBag,
  Smartphone,
  Sparkles,
  Stethoscope,
  Tag,
  Utensils,
  WalletCards,
  WandSparkles,
  Workflow,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { BillRecordIcon } from '../../shared/types';
import { getDefaultBillRecordIcon, isBillRecordIcon } from '../../shared/types';
import { LUCIDE_ICON_NAMES } from '../../shared/lucideIconNames';

export type RecordIconOption = {
  name: BillRecordIcon;
  label: string;
};

// AI、财务和日常生活图标优先展示，并提供中文名称方便快速选择。
export const recommendedRecordIconOptions: RecordIconOption[] = [
  { name: 'bot', label: 'AI 助手' },
  { name: 'brain-circuit', label: '智能模型' },
  { name: 'sparkles', label: '智能灵感' },
  { name: 'wand-sparkles', label: 'AI 创作' },
  { name: 'circuit-board', label: '智能芯片' },
  { name: 'cpu', label: '计算服务' },
  { name: 'workflow', label: '自动化' },
  { name: 'message-square-code', label: '智能对话' },
  { name: 'receipt-text', label: '账单' },
  { name: 'wallet-cards', label: '钱包' },
  { name: 'credit-card', label: '银行卡' },
  { name: 'circle-dollar-sign', label: '金额' },
  { name: 'landmark', label: '账户' },
  { name: 'chart-no-axes-combined', label: '统计' },
  { name: 'tag', label: '分类' },
  { name: 'pill', label: '药品' },
  { name: 'stethoscope', label: '医疗' },
  { name: 'heart-pulse', label: '健康' },
  { name: 'coffee', label: '饮品' },
  { name: 'utensils', label: '餐饮' },
  { name: 'shopping-bag', label: '购物' },
  { name: 'car', label: '出行' },
  { name: 'house', label: '居家' },
  { name: 'gamepad-2', label: '娱乐' },
  { name: 'plane', label: '旅行' },
  { name: 'graduation-cap', label: '学习' },
  { name: 'gift', label: '礼物' },
  { name: 'smartphone', label: '数码' },
  { name: 'dumbbell', label: '运动' },
  { name: 'paw-print', label: '宠物' },
];

const recommendedIconLabels = new Map(recommendedRecordIconOptions.map((option) => [option.name, option.label]));
const recommendedIconComponents: Partial<Record<BillRecordIcon, LucideIcon>> = {
  bot: Bot,
  'brain-circuit': BrainCircuit,
  sparkles: Sparkles,
  'wand-sparkles': WandSparkles,
  'circuit-board': CircuitBoard,
  cpu: Cpu,
  workflow: Workflow,
  'message-square-code': MessageSquareCode,
  'receipt-text': ReceiptText,
  'wallet-cards': WalletCards,
  'credit-card': CreditCard,
  'circle-dollar-sign': CircleDollarSign,
  landmark: Landmark,
  'chart-no-axes-combined': ChartNoAxesCombined,
  tag: Tag,
  pill: Pill,
  stethoscope: Stethoscope,
  'heart-pulse': HeartPulse,
  coffee: Coffee,
  utensils: Utensils,
  'shopping-bag': ShoppingBag,
  car: Car,
  house: House,
  'gamepad-2': Gamepad2,
  plane: Plane,
  'graduation-cap': GraduationCap,
  gift: Gift,
  smartphone: Smartphone,
  dumbbell: Dumbbell,
  'paw-print': PawPrint,
};
type LucideIconLibrary = typeof import('./lucideIconLibrary');
let recordIconLibrary: LucideIconLibrary | undefined;
let recordIconLibraryPromise: Promise<LucideIconLibrary> | undefined;
let recordIconOptionsPromise: Promise<RecordIconOption[]> | undefined;

// 当前选中项优先显示常用中文名称，其他图标显示 Lucide 官方英文名称。
export const getRecordIconLabel = (name: BillRecordIcon): string => {
  return recommendedIconLabels.get(name) ?? getLucideIconLabel(name);
};

// Lucide 官方短横线名称统一转换为空格分词的可读形式。
const getLucideIconLabel = (name: BillRecordIcon): string => {
  return name
    .split('-')
    .map((part) => `${part[0]?.toUpperCase() ?? ''}${part.slice(1)}`)
    .join(' ');
};

// 动态模块只创建一份共享 Promise，多条账单同时请求非常用图标时不会重复加载资源。
const loadRecordIconLibrary = async (): Promise<LucideIconLibrary> => {
  recordIconLibraryPromise ??= import('./lucideIconLibrary').then((library) => {
    recordIconLibrary = library;
    return library;
  });
  return recordIconLibraryPromise;
};

// 常用图标直接同步返回；完整图标模块加载后，非常用图标也可从缓存同步读取。
export const getRecordIconComponent = (name: BillRecordIcon): LucideIcon | undefined => {
  return recommendedIconComponents[name] ?? recordIconLibrary?.getLucideIconComponent(name);
};

// 非常用图标按需读取完整索引，加载失败时由调用方继续使用账单图标兜底。
export const loadRecordIconComponent = async (name: BillRecordIcon): Promise<LucideIcon | undefined> => {
  return getRecordIconComponent(name) ?? (await loadRecordIconLibrary()).getLucideIconComponent(name);
};

// “全部图标”先加载单个本地构建块，再生成英文名称，避免 file 协议下请求上千个动态文件。
export const loadRecordIconOptions = (): Promise<RecordIconOption[]> => {
  recordIconOptionsPromise ??= loadRecordIconLibrary().then(() => LUCIDE_ICON_NAMES.map((name) => ({ name, label: getLucideIconLabel(name) })));
  return recordIconOptionsPromise;
};

type RecordIconProps = {
  name?: BillRecordIcon | string;
  typeId?: string;
  size?: number;
};

// 常用图标首屏直接渲染，非常用图标从本地构建块异步补齐，加载期间使用账单图标兜底。
export function RecordIcon({ name, typeId = '', size = 17 }: RecordIconProps) {
  const safeName = isBillRecordIcon(name) ? name : getDefaultBillRecordIcon(typeId);
  const [loadedIcon, setLoadedIcon] = useState<{ name: BillRecordIcon; Icon: LucideIcon } | null>(null);
  const immediateIcon = getRecordIconComponent(safeName);
  const Icon = immediateIcon ?? (loadedIcon?.name === safeName ? loadedIcon.Icon : undefined);

  useEffect(() => {
    if (getRecordIconComponent(safeName)) return;
    let active = true;
    void loadRecordIconComponent(safeName)
      .then((nextIcon) => {
        if (active && nextIcon) setLoadedIcon({ name: safeName, Icon: nextIcon });
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [safeName]);

  return Icon ? <Icon size={size} /> : <ReceiptText size={size} />;
}
