import {
  useState,
  useRef,
  useLayoutEffect,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';

interface Props {
  content: ReactNode;
  children: ReactNode;
  className?: string;
  onClick?: () => void;
}

type Placement = 'top' | 'bottom';

export function HoverTooltip({ content, children, className, onClick }: Props) {
  const [open, setOpen] = useState(false);
  const anchorRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{
    x: number;
    y: number;
    placement: Placement;
  } | null>(null);

  const handleEnter = () => setOpen(true);
  const handleLeave = () => {
    setOpen(false);
    setPos(null);
  };

  useLayoutEffect(() => {
    if (!open || !anchorRef.current || !tooltipRef.current) return;
    const a = anchorRef.current.getBoundingClientRect();
    const t = tooltipRef.current.getBoundingClientRect();
    const margin = 8;

    let x = a.left + a.width / 2;
    const halfW = t.width / 2;
    x = Math.max(halfW + margin, Math.min(window.innerWidth - halfW - margin, x));

    let placement: Placement = 'top';
    let y = a.top - margin;
    if (y - t.height < margin) {
      placement = 'bottom';
      y = a.bottom + margin;
    }

    setPos({ x, y, placement });
  }, [open]);

  return (
    <>
      <div
        ref={anchorRef}
        className={className}
        onMouseEnter={handleEnter}
        onMouseLeave={handleLeave}
        onClick={onClick}
      >
        {children}
      </div>
      {open &&
        createPortal(
          <div
            ref={tooltipRef}
            className="tooltip-fixed"
            style={{
              position: 'fixed',
              left: pos?.x ?? -9999,
              top: pos?.y ?? -9999,
              transform:
                pos?.placement === 'bottom'
                  ? 'translate(-50%, 0)'
                  : 'translate(-50%, -100%)',
              visibility: pos ? 'visible' : 'hidden',
              zIndex: 9999,
            }}
          >
            {content}
          </div>,
          document.body,
        )}
    </>
  );
}