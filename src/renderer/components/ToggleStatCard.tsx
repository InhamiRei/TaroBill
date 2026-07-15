import { ArrowLeftRight } from 'lucide-react';
import type { ReactNode } from 'react';

type ToggleStatCardProps = {
  icon: ReactNode;
  label: string;
  altLabel: string;
  value: string;
  altValue: string;
  toggled: boolean;
  onToggle: () => void;
};

// 统计卡统一结构：图标 + 标签行（标签与切换按钮同行右对齐）+ 数值，切换时标签与数值同步互换。
export function ToggleStatCard({ icon, label, altLabel, value, altValue, toggled, onToggle }: ToggleStatCardProps) {
  return (
    <article className="stat-card">
      <span className="stat-icon">{icon}</span>
      <div>
        <div className="stat-label-row">
          <small>{toggled ? altLabel : label}</small>
          <button type="button" className="stat-toggle" aria-pressed={toggled} title={`切换为${toggled ? label : altLabel}`} onClick={onToggle}>
            <ArrowLeftRight size={13} />
          </button>
        </div>
        <strong>{toggled ? altValue : value}</strong>
      </div>
    </article>
  );
}
