import { describe, expect, it } from 'vitest';
import type { BillRecordIcon } from '../../shared/types';
import { LUCIDE_ICON_NAMES } from '../../shared/lucideIconNames';
import { getRecordIconComponent, loadRecordIconOptions } from './RecordIcon';

describe('账单图标静态索引', () => {
  // 完整遍历 Lucide 官方名称，防止某个名称在桌面构建中再次落入统一账单图标兜底。
  it('能解析全部 Lucide 图标名称', async () => {
    // 测试先显式加载延迟构建块，再验证缓存中的完整组件索引。
    await loadRecordIconOptions();
    expect(LUCIDE_ICON_NAMES).toHaveLength(1544);
    for (const iconName of LUCIDE_ICON_NAMES) {
      expect(getRecordIconComponent(iconName), iconName).toBeDefined();
    }
  });

  // 抽查原截图中的首批图标，确保它们不会错误映射成同一个组件。
  it('不同图标名称返回不同组件', () => {
    const components = ['a-arrow-down', 'accessibility', 'activity', 'air-vent', 'alarm-clock'].map((name) =>
      getRecordIconComponent(name as BillRecordIcon),
    );
    expect(new Set(components).size).toBe(components.length);
  });
});
