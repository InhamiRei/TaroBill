import { Download, Moon, Sun, Upload, X } from 'lucide-react';
import type { ThemeMode } from '../../shared/types';

type SettingsDialogProps = {
  theme: ThemeMode;
  onClose: () => void;
  onThemeChange: (theme: ThemeMode) => void;
  onExport: () => void;
  onImport: () => void;
};

// 设置弹窗只保留主题与数据备份，符合第一版轻量边界。
export function SettingsDialog({ theme, onClose, onThemeChange, onExport, onImport }: SettingsDialogProps) {
  return (
    <div className="dialog-backdrop no-drag" role="presentation">
      <section className="dialog settings-dialog" role="dialog" aria-modal="true" aria-labelledby="settings-title">
        <header className="dialog-header">
          <h2 id="settings-title">设置</h2>
          <button className="icon-button" title="关闭" onClick={onClose}>
            <X size={18} />
          </button>
        </header>
        <div className="dialog-body settings-body">
          <section className="setting-section">
            <div className="setting-title">
              <strong>外观</strong>
              <span>主题会在下次启动时继续保留</span>
            </div>
            <div className="theme-options">
              <button className={theme === 'light' ? 'theme-option selected' : 'theme-option'} onClick={() => onThemeChange('light')}>
                <strong>浅色</strong>
                <span className="theme-preview light">
                  <Sun size={18} />
                </span>
              </button>
              <button className={theme === 'dark' ? 'theme-option selected' : 'theme-option'} onClick={() => onThemeChange('dark')}>
                <strong>深色</strong>
                <span className="theme-preview dark">
                  <Moon size={18} />
                </span>
              </button>
            </div>
          </section>
          <section className="setting-section">
            <div className="setting-title">
              <strong>数据备份</strong>
              <span>导入会完整替换当前类型、账单和设置</span>
            </div>
            <div className="backup-actions">
              <button className="backup-button" onClick={onExport}>
                <Download size={18} />
                <span>
                  <strong>导出备份</strong>
                  <small>保存为本地备份文件</small>
                </span>
              </button>
              <button className="backup-button" onClick={onImport}>
                <Upload size={18} />
                <span>
                  <strong>导入备份</strong>
                  <small>覆盖当前本地数据</small>
                </span>
              </button>
            </div>
          </section>
        </div>
      </section>
    </div>
  );
}
