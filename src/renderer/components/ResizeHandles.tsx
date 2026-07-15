import { useEffect, useRef } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import type { ResizeEdges } from '../../shared/types';
import { getTaroBillApi } from '../previewApi';

const api = getTaroBillApi();
type ResizeEdge = 'left' | 'right' | 'top' | 'bottom' | 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';

const edgeMap: Record<ResizeEdge, ResizeEdges> = {
  left: { left: true },
  right: { right: true },
  top: { top: true },
  bottom: { bottom: true },
  'top-left': { top: true, left: true },
  'top-right': { top: true, right: true },
  'bottom-left': { bottom: true, left: true },
  'bottom-right': { bottom: true, right: true },
};

const cursorMap: Record<ResizeEdge, string> = {
  left: 'ew-resize',
  right: 'ew-resize',
  top: 'ns-resize',
  bottom: 'ns-resize',
  'top-left': 'nwse-resize',
  'bottom-right': 'nwse-resize',
  'top-right': 'nesw-resize',
  'bottom-left': 'nesw-resize',
};

const edges = Object.keys(edgeMap) as ResizeEdge[];

// Windows 无边框窗口用八个透明拖拽区模拟四边和四角缩放。
export function ResizeHandles() {
  const frameRef = useRef(0);
  const pointerRef = useRef<{ x: number; y: number } | null>(null);

  useEffect(
    () => () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
    },
    [],
  );

  // pointermove 合并到每个动画帧一次 IPC，避免高频拖动挤占主进程。
  const flush = () => {
    frameRef.current = 0;
    if (pointerRef.current) void api.resize(pointerRef.current.x, pointerRef.current.y);
  };

  // 按下边缘时记录屏幕坐标，并由主进程保存起始 Bounds。
  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    const edge = event.currentTarget.dataset.edge as ResizeEdge;
    void api.startResize(edgeMap[edge], event.screenX, event.screenY);
    pointerRef.current = { x: event.screenX, y: event.screenY };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  // 移动过程中只保留最新坐标，下一帧统一发送。
  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!pointerRef.current) return;
    pointerRef.current = { x: event.screenX, y: event.screenY };
    if (!frameRef.current) frameRef.current = requestAnimationFrame(flush);
  };

  // 指针结束、取消或失去捕获时都走相同清理逻辑。
  const finishResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!pointerRef.current) return;
    const finalPointer = { x: event.screenX, y: event.screenY };
    pointerRef.current = null;
    if (frameRef.current) cancelAnimationFrame(frameRef.current);
    frameRef.current = 0;
    // 先提交 pointerup 的最终坐标再结束会话，避免丢掉尚未执行的最后一个动画帧。
    void api.resize(finalPointer.x, finalPointer.y).finally(() => api.endResize());
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };

  return (
    <div className="resize-handles" aria-hidden="true">
      {edges.map((edge) => (
        <div
          key={edge}
          className={`resize-handle resize-${edge}`}
          data-edge={edge}
          style={{ cursor: cursorMap[edge] }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={finishResize}
          onPointerCancel={finishResize}
          onLostPointerCapture={finishResize}
        />
      ))}
    </div>
  );
}
