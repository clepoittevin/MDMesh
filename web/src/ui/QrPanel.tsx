// Not exported from the ui barrel: it pulls in the `qrcode` library, which should stay in the Enroll page's chunk.
// Import it directly: `import { QrPanel } from './QrPanel'`.
import { useState, type ReactNode } from 'react';
import { defineMessages, useIntl } from 'react-intl';
import { QrCode } from './QrCode';
import { Button } from './Button';
import { Modal } from './Modal';
import { IconSync } from './icons';
import { cx } from './cx';
import './QrPanel.css';

const messages = defineMessages({
  scanToEnroll: { id: 'enroll.qrPanel.scanToEnroll', defaultMessage: 'Scan to enroll' },
  makingCode: { id: 'enroll.qrPanel.makingCode', defaultMessage: 'Making a code…' },
  newCode: { id: 'enroll.qrPanel.newCode', defaultMessage: 'New code' },
  fullScreen: { id: 'enroll.qrPanel.fullScreen', defaultMessage: 'Full screen' },
});

export interface QrPanelProps {
  /** QR payload (the provisioning JSON). */
  value: string;
  /** Accessible description of the code ("Enrollment QR code for Field Phones"). */
  label: string;
  /** "New code" (mint a fresh token). Omit to hide the button. */
  onNewCode?: () => void;
  newCodeBusy?: boolean;
  /** Title of the full-screen view. */
  fullScreenTitle?: ReactNode;
  /** Shown under the full-screen code ("Expires 14 Oct, 16:20"). */
  fullScreenNote?: ReactNode;
  className?: string;
}

/**
 * Enroll's QR column: a square bordered frame holding the code, with "New code" and "Full screen"
 * underneath. The frame stays white in dark mode: scanners need dark modules on a light ground. Full screen opens
 * a viewport-sized Modal with the code as large as fits.
 */
export function QrPanel({ value, label, onNewCode, newCodeBusy, fullScreenTitle, fullScreenNote, className }: QrPanelProps) {
  const intl = useIntl();
  const [full, setFull] = useState(false);
  return (
    <div className={cx('v2-qr', className)}>
      <div role="img" aria-label={label} className="v2-qr__frame">
        <QrCode text={value} />
      </div>
      <div className="v2-qr__actions">
        {onNewCode ? (
          <Button icon={<IconSync size={14} />} onClick={onNewCode} disabled={newCodeBusy}>
            {intl.formatMessage(newCodeBusy ? messages.makingCode : messages.newCode)}
          </Button>
        ) : null}
        <Button onClick={() => setFull(true)}>{intl.formatMessage(messages.fullScreen)}</Button>
      </div>
      <Modal open={full} onClose={() => setFull(false)} size="full" title={fullScreenTitle ?? intl.formatMessage(messages.scanToEnroll)}>
        <div role="img" aria-label={label} className="v2-qr__frame v2-qr__frame--full">
          <QrCode text={value} />
        </div>
        {fullScreenNote ? <p className="v2-qr__note">{fullScreenNote}</p> : null}
      </Modal>
    </div>
  );
}
