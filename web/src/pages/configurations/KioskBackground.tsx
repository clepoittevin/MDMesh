// The kiosk background image in the console: the configuration editor's viewer (what is set, with Replace and
// Remove) and the device page's line naming the image the device's configuration specifies. The preview of how the
// launcher will look is KioskPreview.
import { useEffect, useId, useRef, useState } from 'react';
import { defineMessages, FormattedMessage, useIntl } from 'react-intl';
import { untyped } from '../../data/configIntl';
import { Link } from 'react-router';
import { getKioskBackgroundImage, type KioskBackgroundImageInfo } from '../../api/configurations';
import { KIOSK_IMAGE_TYPES } from '../../data/kioskBackground';
import { paths } from '../../routes';
import { Button, Card, IconInfo, KeyValueList } from '../../ui';
import { fmtDateTime } from '../../ui/format';
import { fmtBytes } from '../deviceDetailFormat';
import './KioskBackground.css';
import { apiErrorText } from '../../api/apiErrorText';

const messages = untyped(defineMessages({
  couldNotRead: { id: 'configEditor.background.couldNotRead', defaultMessage: 'The image could not be read.' },
  reading: { id: 'configEditor.background.reading', defaultMessage: 'Reading the image…' },
  legacyUrl: {
    id: 'configEditor.background.legacyUrl',
    defaultMessage: 'Legacy wallpaper URL <url>{value}</url>. Agents ignore it; choose an image to show one.',
  },
  noImage: { id: 'configEditor.background.noImage', defaultMessage: 'No image: the kiosk shows its background color.' },
  uploading: { id: 'configEditor.background.uploading', defaultMessage: 'Uploading…' },
  replace: { id: 'configEditor.background.replace', defaultMessage: 'Replace image' },
  choose: { id: 'configEditor.background.choose', defaultMessage: 'Choose image' },
  chooseUploaded: { id: 'configEditor.background.chooseUploaded', defaultMessage: 'Choose from uploaded' },
  remove: { id: 'configEditor.background.remove', defaultMessage: 'Remove' },
  howItWorks: { id: 'configEditor.background.howItWorks', defaultMessage: 'How it works' },
  howLimits: {
    id: 'configEditor.background.howLimits',
    defaultMessage: 'At most 10 MB and 16 megapixels. The console scales larger photos to 3840 px before uploading.',
  },
  howMetadata: {
    id: 'configEditor.background.howMetadata',
    defaultMessage: 'The server removes location, camera and other details before devices get the image.',
  },
  howHttps: {
    id: 'configEditor.background.howHttps',
    defaultMessage: 'Devices download it only over HTTPS and check it by its SHA-256; on any problem they keep the color.',
  },
  howPlate: {
    id: 'configEditor.background.howPlate',
    defaultMessage: 'Text gets a plate of the background color where the image behind it is busy, so it stays readable.',
  },
  howHosted: {
    id: 'configEditor.background.howHosted',
    defaultMessage: "It is hosted in Files, where anyone with its link can open it: don't use a confidential image.",
  },
  howRemove: {
    id: 'configEditor.background.howRemove',
    defaultMessage: 'Remove also clears the legacy Background image URL.',
  },
  previewUnavailable: { id: 'configEditor.background.previewUnavailable', defaultMessage: 'Preview unavailable' },
  thumbAlt: {
    id: 'configEditor.background.thumbAlt',
    defaultMessage: 'Current kiosk background: {name}, {dims} pixels',
  },
  factFile: { id: 'configEditor.background.factFile', defaultMessage: 'File' },
  factSize: { id: 'configEditor.background.factSize', defaultMessage: 'Size' },
  factUploaded: { id: 'configEditor.background.factUploaded', defaultMessage: 'Uploaded' },
  factSha: { id: 'configEditor.background.factSha', defaultMessage: 'SHA-256' },
  sizeValue: { id: 'configEditor.background.sizeValue', defaultMessage: '{dims} px · {bytes} · {format}' },
  shaLabel: { id: 'configEditor.background.shaLabel', defaultMessage: 'SHA-256 starting {sha}' },
  anotherAccount: {
    id: 'configEditor.background.anotherAccount',
    defaultMessage:
      'An image of the main account, which this configuration was copied from. Replace it to use one of this account’s images.',
  },
  metadataRemoved: {
    id: 'configEditor.background.metadataRemoved',
    defaultMessage: 'Its location and camera details are removed when you save.',
  },
  itsConfiguration: { id: 'configEditor.background.itsConfiguration', defaultMessage: 'Its configuration' },
  deviceAlt: { id: 'configEditor.background.deviceAlt', defaultMessage: 'Kiosk background image' },
  deviceTitle: { id: 'configEditor.background.deviceTitle', defaultMessage: 'Kiosk background' },
  deviceText: {
    id: 'configEditor.background.deviceText',
    defaultMessage:
      '{configuration} sets the image <code>{sha}</code>. Whether the device shows it isn’t reported yet.',
  },
}));

/** The same-origin path of a hosted file's URL: the browser loads it from the console's own server (no CORS taint). */
export function hostedPath(url: string): string {
  try {
    const u = new URL(url, window.location.href);
    return `${u.pathname}${u.search}`;
  } catch {
    return url;
  }
}

/** The SHA-256 as people compare it: its first 12 hex characters. */
export const shortSha = (sha: string) => sha.slice(0, 12);


/* ---------------------------------------------------------------------------------------------------------------
   Configuration editor: the field
   --------------------------------------------------------------------------------------------------------------- */

/** The facts of the draft's image file, read from the server (null while there is none or it is loading). */
export function useKioskBackgroundInfo(fileId: number | null | undefined): {
  info: KioskBackgroundImageInfo | null;
  error: string | null;
} {
  const intl = useIntl();
  const [state, setState] = useState<{ fileId: number; info: KioskBackgroundImageInfo | null; error: string | null } | null>(null);
  useEffect(() => {
    if (fileId == null) return;
    let cancelled = false;
    getKioskBackgroundImage(fileId)
      .then((info) => !cancelled && setState({ fileId, info, error: null }))
      .catch((e: unknown) => {
        if (cancelled) return;
        const sent = apiErrorText(intl, e);
        const msg = sent && !/^error\./.test(sent) ? sent : intl.formatMessage(messages.couldNotRead);
        setState({ fileId, info: null, error: msg });
      });
    return () => {
      cancelled = true;
    };
  }, [fileId, intl]);
  return fileId != null && state?.fileId === fileId ? { info: state.info, error: state.error } : { info: null, error: null };
}

/** What is set (thumbnail and facts, or the legacy URL, or nothing) with Choose/Replace and Remove. */
export function KioskBackgroundField({
  fileId,
  info,
  error,
  legacyUrl,
  readOnly,
  uploading,
  onFile,
  onRemove,
  onBrowse,
  labelId,
}: {
  /** The managed image (draft): an uploaded file id. */
  fileId: number | null | undefined;
  info: KioskBackgroundImageInfo | null;
  error: string | null;
  /** A legacy launcher wallpaper URL, shown when there is no managed image. */
  legacyUrl?: string | null;
  readOnly: boolean;
  uploading: boolean;
  onFile: (file: File) => void;
  onRemove: () => void;
  /** Opens "Uploaded images"; left out, the button isn't shown. */
  onBrowse?: () => void;
  labelId?: string;
}) {
  const intl = useIntl();
  const inputRef = useRef<HTMLInputElement>(null);
  const has = fileId != null || !!legacyUrl;

  return (
    <div className="v2-kbg">
      <input
        ref={inputRef}
        type="file"
        accept={KIOSK_IMAGE_TYPES.join(',')}
        hidden
        aria-hidden="true"
        tabIndex={-1}
        onChange={(e) => {
          const file = e.currentTarget.files?.[0];
          e.currentTarget.value = '';
          if (file) onFile(file);
        }}
      />
      {info ? (
        <KioskBackgroundSummary info={info} />
      ) : fileId != null ? (
        <p className="v2-kbg__state" role={error ? 'alert' : 'status'}>
          {error ?? intl.formatMessage(messages.reading)}
        </p>
      ) : legacyUrl ? (
        <p className="v2-kbg__state">
          <FormattedMessage
            {...messages.legacyUrl}
            values={{ value: legacyUrl, url: (chunks) => <span className="v2-mono v2-kbg__url">{chunks}</span> }}
          />
        </p>
      ) : (
        <p className="v2-kbg__state">{intl.formatMessage(messages.noImage)}</p>
      )}
      <div className="v2-kbg__actions" role="group" aria-labelledby={labelId}>
        <Button size="sm" onClick={() => inputRef.current?.click()} disabled={readOnly || uploading}>
          {intl.formatMessage(uploading ? messages.uploading : has ? messages.replace : messages.choose)}
        </Button>
        {onBrowse ? (
          <Button size="sm" onClick={onBrowse} disabled={readOnly || uploading}>
            {intl.formatMessage(messages.chooseUploaded)}
          </Button>
        ) : null}
        {has ? (
          <Button size="sm" onClick={onRemove} disabled={readOnly || uploading}>
            {intl.formatMessage(messages.remove)}
          </Button>
        ) : null}
      </div>
      <details className="v2-kbg__how">
        <summary>{intl.formatMessage(messages.howItWorks)}</summary>
        <ul>
          <li>{intl.formatMessage(messages.howLimits)}</li>
          <li>{intl.formatMessage(messages.howMetadata)}</li>
          <li>{intl.formatMessage(messages.howHttps)}</li>
          <li>{intl.formatMessage(messages.howPlate)}</li>
          <li>{intl.formatMessage(messages.howHosted)}</li>
          <li>{intl.formatMessage(messages.howRemove)}</li>
        </ul>
      </details>
    </div>
  );
}

/**
 * Whether the thumbnail at `url` failed to load. Tied to the URL that failed, so another image (a replace, or a
 * gallery pick) gets its own thumbnail instead of "Preview unavailable" from the one before.
 */
function useBrokenImage(url: string): [boolean, () => void] {
  const [brokenUrl, setBrokenUrl] = useState<string | null>(null);
  return [brokenUrl === url, () => setBrokenUrl(url)];
}

/** Thumbnail and facts of the current image. */
export function KioskBackgroundSummary({ info }: { info: KioskBackgroundImageInfo }) {
  const intl = useIntl();
  const [broken, setBroken] = useBrokenImage(info.url);
  const dims = `${info.width} × ${info.height}`;
  return (
    <div className="v2-kbg__summary">
      {broken ? (
        <div className="v2-kbg__thumb v2-kbg__thumb--missing">{intl.formatMessage(messages.previewUnavailable)}</div>
      ) : (
        <img
          className="v2-kbg__thumb"
          src={hostedPath(info.url)}
          alt={intl.formatMessage(messages.thumbAlt, { name: info.name, dims })}
          width={160}
          height={100}
          loading="lazy"
          onError={setBroken}
        />
      )}
      <div className="v2-kbg__facts">
        <KeyValueList
          variant="rail"
          items={[
            { key: 'name', label: intl.formatMessage(messages.factFile), value: <span className="v2-kbg__name">{info.name}</span> },
            { key: 'size', label: intl.formatMessage(messages.factSize), value: intl.formatMessage(messages.sizeValue, { dims, bytes: fmtBytes(info.size, intl), format: info.format }) },
            { key: 'uploaded', label: intl.formatMessage(messages.factUploaded), value: fmtDateTime(info.uploadTime ?? undefined) },
            {
              key: 'sha',
              label: intl.formatMessage(messages.factSha),
              mono: true,
              value: (
                <span title={info.sha256} aria-label={intl.formatMessage(messages.shaLabel, { sha: shortSha(info.sha256) })}>
                  {shortSha(info.sha256)}
                </span>
              ),
            },
          ]}
        />
        {info.fromAnotherAccount ? (
          <p className="v2-kbg__note">
            <IconInfo size={14} /> {intl.formatMessage(messages.anotherAccount)}
          </p>
        ) : info.hasMetadata ? (
          <p className="v2-kbg__note">
            <IconInfo size={14} /> {intl.formatMessage(messages.metadataRemoved)}
          </p>
        ) : null}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------------------------------------------------
   Device page
   --------------------------------------------------------------------------------------------------------------- */

/** The background image the device's configuration specifies (what the device shows isn't reported yet). */
export function DeviceKioskBackground({
  image,
  configurationId,
  configName,
}: {
  image: { url: string; sha256: string };
  configurationId: number | null | undefined;
  configName: string | undefined;
}) {
  const intl = useIntl();
  const titleId = useId();
  const [broken, setBroken] = useBrokenImage(image.url);
  const name = configName ?? intl.formatMessage(messages.itsConfiguration);
  return (
    <Card aria-labelledby={titleId} className="v2-kbg-device">
      {broken ? null : (
        <img
          className="v2-kbg-device__thumb"
          src={hostedPath(image.url)}
          alt={intl.formatMessage(messages.deviceAlt)}
          width={72}
          height={48}
          loading="lazy"
          onError={setBroken}
        />
      )}
      <div className="v2-kbg-device__body">
        <h2 id={titleId} className="v2-kbg-device__title">
          {intl.formatMessage(messages.deviceTitle)}
        </h2>
        <p className="v2-kbg-device__text">
          <FormattedMessage
            {...messages.deviceText}
            values={{
              configuration: configurationId != null ? <Link to={paths.configuration(configurationId)}>{name}</Link> : name,
              sha: shortSha(image.sha256),
              code: (chunks) => (
                <span className="v2-mono" title={image.sha256}>
                  {chunks}
                </span>
              ),
            }}
          />
        </p>
      </div>
    </Card>
  );
}
