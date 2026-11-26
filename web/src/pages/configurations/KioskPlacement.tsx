// How the kiosk background image fills the screen: Fill (cropped around a focal point) or Fit (whole, letterboxed),
// and the focal point itself, set by clicking or dragging on the image or with the arrow keys.
import { defineMessages, useIntl } from 'react-intl';
import { untyped } from '../../data/configIntl';
import { useId, useRef, type CSSProperties, type KeyboardEvent, type PointerEvent } from 'react';
import { DEFAULT_FOCAL, type FitMode, type FocalPoint } from '../../data/kioskScrim';
import { Button, Segmented } from '../../ui';
import './KioskPlacement.css';

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
/** Two decimals: what the configuration stores and the agent gets. */
const round2 = (v: number) => Math.round(v * 100) / 100;
const messages = untyped(defineMessages({
  fit: { id: 'configEditor.placement.fit', defaultMessage: 'Fit' },
  fill: { id: 'configEditor.placement.fill', defaultMessage: 'Fill' },
  fitHint: { id: 'configEditor.placement.fitHint', defaultMessage: 'The whole image, with bars of the background color.' },
  fillHint: { id: 'configEditor.placement.fillHint', defaultMessage: 'Fills the screen; the edges may be cropped.' },
  focalPoint: { id: 'configEditor.placement.focalPoint', defaultMessage: 'Focal point' },
  valueText: { id: 'configEditor.placement.valueText', defaultMessage: '{x} across, {y} down' },
  fitFocalHint: { id: 'configEditor.placement.fitFocalHint', defaultMessage: 'Fit shows the whole image, so the focal point is not used.' },
  focalHint: {
    id: 'configEditor.placement.focalHint',
    defaultMessage:
      '{x} across, {y} down. Click or drag on the image, or use the arrow keys (Shift for bigger steps); what is around it stays in view when the image is cropped.',
  },
  centre: { id: 'configEditor.placement.centre', defaultMessage: 'Centre' },
}));

/**
 * The focal point ring sits on the photo, not on a console surface, so it has its own fixed colours: light with a dark
 * edge reads on any image, in either theme. Not console tokens.
 */
const ON_PHOTO = {
  '--kbp-ring': '#ffffff',
  '--kbp-ring-edge': '0 0 0 1px rgba(0, 0, 0, 0.6), inset 0 0 0 1px rgba(0, 0, 0, 0.6)',
} as CSSProperties;

export function KioskPlacement({
  src,
  width,
  height,
  fit,
  focal,
  onFit,
  onFocal,
  disabled,
}: {
  src: string;
  width: number;
  height: number;
  fit: FitMode;
  focal: FocalPoint;
  onFit: (fit: FitMode) => void;
  onFocal: (focal: FocalPoint) => void;
  disabled?: boolean;
}) {
  const intl = useIntl();
  const ids = useId();
  const area = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const focalOff = disabled || fit === 'fit';

  const fromPointer = (e: PointerEvent<HTMLDivElement>) => {
    const r = area.current!.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) return;
    onFocal({ x: round2(clamp01((e.clientX - r.left) / r.width)), y: round2(clamp01((e.clientY - r.top) / r.height)) });
  };

  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const step = e.shiftKey ? 0.1 : 0.01;
    const move: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
    };
    if (e.key === 'Home') {
      e.preventDefault();
      onFocal(DEFAULT_FOCAL);
      return;
    }
    const d = move[e.key];
    if (!d) return;
    e.preventDefault();
    onFocal({ x: round2(clamp01(focal.x + d[0])), y: round2(clamp01(focal.y + d[1])) });
  };

  const pct = (v: number) => intl.formatNumber(Math.round(v * 100) / 100, { style: 'percent', maximumFractionDigits: 0 });
  const point = { x: pct(focal.x), y: pct(focal.y) };
  const valueText = intl.formatMessage(messages.valueText, point);
  // The picker is at most 280 px wide and 200 px tall, in the image's proportions, and narrower when its column is
  // (a 320 px window): the CSS caps it at the column's width and the aspect ratio keeps the proportions.
  const scale = Math.min(280 / width, 200 / height);

  return (
    <div className="v2-kbp">
      <div className="v2-kbp__row">
        <span id={`${ids}-fit`} className="v2-kbp__label">
          {intl.formatMessage(messages.fit)}
        </span>
        <Segmented
          aria-labelledby={`${ids}-fit`}
          size="sm"
          disabled={disabled}
          options={[
            { value: 'fill', label: intl.formatMessage(messages.fill) },
            { value: 'fit', label: intl.formatMessage(messages.fit) },
          ]}
          value={fit}
          onChange={(v) => onFit(v as FitMode)}
        />
        <span className="v2-kbp__hint">
          {intl.formatMessage(fit === 'fit' ? messages.fitHint : messages.fillHint)}
        </span>
      </div>
      <div className="v2-kbp__row v2-kbp__row--top">
        <span id={`${ids}-focal`} className="v2-kbp__label">
          {intl.formatMessage(messages.focalPoint)}
        </span>
        <div className="v2-kbp__focal">
          <div
            ref={area}
            className={`v2-kbp__area${focalOff ? ' is-off' : ''}`}
            style={{ width: Math.round(width * scale), aspectRatio: `${width} / ${height}` }}
            role="slider"
            tabIndex={focalOff ? -1 : 0}
            aria-labelledby={`${ids}-focal`}
            aria-describedby={`${ids}-focal-help`}
            aria-valuemin={0}
            aria-valuemax={100}
            // One slider for a 2D point: valuenow is the horizontal part; valuetext says both (Up/Down move the other).
            aria-valuenow={Math.round(focal.x * 100)}
            aria-valuetext={valueText}
            aria-disabled={focalOff}
            onKeyDown={focalOff ? undefined : onKey}
            onPointerDown={
              focalOff
                ? undefined
                : (e) => {
                    dragging.current = true;
                    e.currentTarget.setPointerCapture?.(e.pointerId);
                    fromPointer(e);
                  }
            }
            onPointerMove={focalOff ? undefined : (e) => dragging.current && fromPointer(e)}
            onPointerUp={() => {
              dragging.current = false;
            }}
            onPointerCancel={() => {
              dragging.current = false;
            }}
            onLostPointerCapture={() => {
              dragging.current = false;
            }}
          >
            <img src={src} alt="" draggable={false} />
            <span className="v2-kbp__marker" style={{ ...ON_PHOTO, left: `${focal.x * 100}%`, top: `${focal.y * 100}%` }} aria-hidden="true" />
          </div>
          <p id={`${ids}-focal-help`} className="v2-kbp__hint">
            {fit === 'fit' ? intl.formatMessage(messages.fitFocalHint) : intl.formatMessage(messages.focalHint, point)}
          </p>
          <div>
            <Button size="sm" onClick={() => onFocal(DEFAULT_FOCAL)} disabled={focalOff || (focal.x === 0.5 && focal.y === 0.5)}>
              {intl.formatMessage(messages.centre)}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
