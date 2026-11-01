import React, { useEffect, useRef, useState } from 'react';
import {
  Button as RButton,
  IconButton as RIconButton,
  Tooltip as RTooltip,
} from '@radix-ui/themes';
import { Check, Crop, PenLine, RotateCcw, Undo2, X } from 'lucide-react';

export function ImageMarkup({
  image,
  onSave,
  onClose,
}: {
  image: string;
  onSave: (image: string) => void;
  onClose: () => void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null),
    history = useRef<string[]>([]),
    drag = useRef<{
      x: number;
      y: number;
      lastX: number;
      lastY: number;
      before: ImageData;
    }>();
  const [tool, setTool] = useState<'pen' | 'crop'>('pen'),
    [color, setColor] = useState('#e05258'),
    [area, setArea] = useState<{ x: number; y: number; w: number; h: number }>(),
    [version, setVersion] = useState(0);

  function load(source: string, reset = false) {
    const img = new Image();
    img.onload = () => {
      const node = canvas.current;
      if (!node) return;
      node.width = img.width;
      node.height = img.height;
      node.getContext('2d')!.drawImage(img, 0, 0);
      if (reset) history.current = [source];
      setVersion((v) => v + 1);
    };
    img.src = source;
  }

  useEffect(() => {
    load(image, true);
  }, [image]);

  function point(e: React.PointerEvent) {
    const node = canvas.current!,
      box = node.getBoundingClientRect();
    return {
      x: Math.min(node.width, Math.max(0, ((e.clientX - box.left) * node.width) / box.width)),
      y: Math.min(node.height, Math.max(0, ((e.clientY - box.top) * node.height) / box.height)),
    };
  }

  function start(e: React.PointerEvent<HTMLCanvasElement>) {
    const node = canvas.current!,
      p = point(e);
    e.preventDefault();
    node.setPointerCapture(e.pointerId);
    drag.current = {
      x: p.x,
      y: p.y,
      lastX: p.x,
      lastY: p.y,
      before: node.getContext('2d')!.getImageData(0, 0, node.width, node.height),
    };
    setArea(undefined);
  }

  function move(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drag.current) return;
    const node = canvas.current!,
      ctx = node.getContext('2d')!,
      p = point(e),
      d = drag.current;
    if (tool === 'pen') {
      ctx.strokeStyle = color;
      ctx.lineWidth = Math.max(3, node.width / 300);
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(d.lastX, d.lastY);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
      d.lastX = p.x;
      d.lastY = p.y;
    } else {
      ctx.putImageData(d.before, 0, 0);
      const next = {
        x: Math.min(d.x, p.x),
        y: Math.min(d.y, p.y),
        w: Math.abs(d.x - p.x),
        h: Math.abs(d.y - p.y),
      };
      ctx.strokeStyle = '#4f46e5';
      ctx.lineWidth = 3;
      ctx.strokeRect(next.x, next.y, next.w, next.h);
      setArea(next);
    }
  }

  function end() {
    if (!drag.current) return;
    const node = canvas.current!;
    if (tool === 'pen') {
      history.current = [...history.current, node.toDataURL()].slice(-12);
      setVersion((v) => v + 1);
    } else node.getContext('2d')!.putImageData(drag.current.before, 0, 0);
    drag.current = undefined;
  }

  function crop() {
    if (!area || area.w < 10 || area.h < 10) return;
    const node = canvas.current!,
      temp = document.createElement('canvas');
    temp.width = Math.round(area.w);
    temp.height = Math.round(area.h);
    temp.getContext('2d')!.drawImage(
      node,
      area.x,
      area.y,
      area.w,
      area.h,
      0,
      0,
      temp.width,
      temp.height
    );
    const source = temp.toDataURL();
    history.current = [...history.current, source].slice(-12);
    load(source);
    setArea(undefined);
    setTool('pen');
  }

  void version;

  return (
    <div className="overlay">
      <section
        className="markup-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="截图标记与裁切"
      >
        <header>
          <div>
            <h3>标记你想问的地方</h3>
            <p>在图上划线圈出重点，也可以裁掉无关区域。</p>
          </div>
          <RIconButton
            size="2"
            variant="ghost"
            color="gray"
            aria-label="关闭截图编辑"
            onClick={onClose}
          >
            <X size={18} />
          </RIconButton>
        </header>

        <div className="markup-toolbar">
          <RButton
            size="2"
            variant={tool === 'pen' ? 'solid' : 'soft'}
            color="indigo"
            onClick={() => {
              setTool('pen');
              setArea(undefined);
            }}
          >
            <PenLine size={15} />
            <span>画笔</span>
          </RButton>
          <RButton
            size="2"
            variant={tool === 'crop' ? 'solid' : 'soft'}
            color="indigo"
            onClick={() => setTool('crop')}
          >
            <Crop size={15} />
            <span>裁切</span>
          </RButton>

          <div className="markup-colors">
            {['#e05258', '#ebac42', '#4f46e5', '#10b981'].map((c) => (
              <button
                key={c}
                type="button"
                aria-label={`画笔颜色 ${c}`}
                className={color === c ? 'selected' : ''}
                style={{ background: c }}
                onClick={() => setColor(c)}
              />
            ))}
          </div>

          <RTooltip content="撤销上一步">
            <RIconButton
              size="2"
              variant="soft"
              color="gray"
              aria-label="撤销标记"
              disabled={history.current.length < 2}
              onClick={() => {
                history.current.pop();
                load(history.current.at(-1)!);
                setArea(undefined);
              }}
            >
              <Undo2 size={16} />
            </RIconButton>
          </RTooltip>

          <RTooltip content="恢复原图">
            <RIconButton
              size="2"
              variant="soft"
              color="gray"
              aria-label="恢复原图"
              onClick={() => {
                load(image, true);
                setArea(undefined);
              }}
            >
              <RotateCcw size={16} />
            </RIconButton>
          </RTooltip>

          {tool === 'crop' && area && (
            <RButton size="2" variant="soft" color="indigo" onClick={crop}>
              <span>裁切选区</span>
            </RButton>
          )}
        </div>

        <div className="markup-stage">
          <div className="markup-canvas-wrap">
            <canvas
              ref={canvas}
              onPointerDown={start}
              onPointerMove={move}
              onPointerUp={end}
              onPointerCancel={end}
            />
            {area && tool === 'crop' && canvas.current && (
              <div
                className="markup-selection"
                style={{
                  left: `${(area.x / canvas.current.width) * 100}%`,
                  top: `${(area.y / canvas.current.height) * 100}%`,
                  width: `${(area.w / canvas.current.width) * 100}%`,
                  height: `${(area.h / canvas.current.height) * 100}%`,
                }}
              />
            )}
          </div>
        </div>

        <footer>
          <RButton size="2" variant="soft" color="gray" onClick={onClose}>
            取消
          </RButton>
          <RButton
            size="2"
            variant="solid"
            color="indigo"
            onClick={() => onSave(canvas.current!.toDataURL('image/jpeg', 0.88))}
          >
            <Check size={16} />
            <span>完成标记</span>
          </RButton>
        </footer>
      </section>
    </div>
  );
}
