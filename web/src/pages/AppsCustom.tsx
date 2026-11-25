import { useId, useState, type ReactNode } from 'react';
import { defineMessages, useIntl, type MessageDescriptor } from 'react-intl';
import {
  bundleErrorText,
  commitUpload,
  listApplications,
  saveAndroidApplication,
  uploadApk,
  uploadBundle,
  type BundleUploadResult,
} from '../api/applications';
import {
  Badge,
  Button,
  ButtonAnchor,
  Callout,
  Card,
  CardHeader,
  Field,
  FileDropZone,
  Grid,
  GridCell,
  FileReadPanel,
  IconCheck,
  IconDownload,
  IconPlus,
  IconWarning,
  Input,
  Segmented,
  Stepper,
  useToast,
} from '../ui';
import { EXT_SOURCES, SHA256_HEX, isBundleName, isHostedHere, type DeploySubject } from '../data/apps';
import { CORE_ACTION_ACCESS } from '../ext/core/access';
import { usePermission } from '../ext/permissions';
import { FILE_ACCEPT, FILE_EXTS, errorText, formatBytes } from './appsModel';

type Mode = 'upload' | 'link';

const messageDefs = defineMessages({
  notApkTitle: { id: 'apps.custom.notApkTitle', defaultMessage: 'Not an APK' },
  notApkBody: { id: 'apps.custom.notApkBody', defaultMessage: 'Drop an .apk, .xapk, .apks, .apkm or .zip file.' },
  notApkFile: {
    id: 'apps.custom.notApkFile',
    defaultMessage: 'Not an Android app. Choose an .apk or a split bundle.',
  },
  apkReady: { id: 'apps.custom.apkReady', defaultMessage: 'APK ready' },
  hostedAdded: {
    id: 'apps.custom.hostedAdded',
    defaultMessage: 'Hosted, added to your Library — review and deploy.',
  },
  alreadyInLibraryBody: {
    id: 'apps.custom.alreadyInLibraryBody',
    defaultMessage: 'Already in your Library — review and deploy.',
  },
  hostedNotAdded: {
    id: 'apps.custom.hostedNotAdded',
    defaultMessage: 'Hosted — review and deploy. (Could not add to Library.)',
  },
  detailsFilled: { id: 'apps.custom.detailsFilled', defaultMessage: 'Details filled in — review and deploy.' },
  detailsExtracted: { id: 'apps.custom.detailsExtracted', defaultMessage: 'Details extracted' },
  couldNotHost: { id: 'apps.custom.couldNotHost', defaultMessage: 'Couldn’t host the file — paste a URL to deploy.' },
  uploadFailed: { id: 'apps.custom.uploadFailed', defaultMessage: 'Upload failed' },
  bundleReady: { id: 'apps.custom.bundleReady', defaultMessage: 'Bundle ready' },
  splitsHostedAdded: {
    id: 'apps.custom.splitsHostedAdded',
    defaultMessage: '{count, plural, one {# split hosted} other {# splits hosted}} — added to your Library.',
  },
  splitsHosted: {
    id: 'apps.custom.splitsHosted',
    defaultMessage: '{count, plural, one {# split hosted} other {# splits hosted}}.',
  },
  bundleFailed: { id: 'apps.custom.bundleFailed', defaultMessage: 'Bundle upload failed' },
  invalidShaTitle: { id: 'apps.custom.invalidShaTitle', defaultMessage: 'Invalid SHA-256' },
  invalidShaBody: {
    id: 'apps.custom.invalidShaBody',
    defaultMessage: 'Enter the APK’s SHA-256 as 64 hex characters.',
  },
  shaRequiredTitle: { id: 'apps.custom.shaRequiredTitle', defaultMessage: 'SHA-256 required' },
  shaRequiredBody: {
    id: 'apps.custom.shaRequiredBody',
    defaultMessage:
      'This APK isn’t hosted by MDMesh: enter its SHA-256 so devices can verify it, or upload the file.',
  },
  splitBundleLabel: { id: 'apps.custom.splitBundleLabel', defaultMessage: 'Split bundle' },
  customApkLabel: { id: 'apps.custom.customApkLabel', defaultMessage: 'Custom APK' },
  missingFieldsTitle: { id: 'apps.custom.missingFieldsTitle', defaultMessage: 'Missing fields' },
  missingForDeploy: {
    id: 'apps.custom.missingForDeploy',
    defaultMessage: 'APK URL and package name are required.',
  },
  missingForLibrary: {
    id: 'apps.custom.missingForLibrary',
    defaultMessage: 'A package name and an APK URL (or a bundle) are required to add it to your Library.',
  },
  addedTitle: { id: 'apps.custom.addedTitle', defaultMessage: 'Added to Library' },
  addedBody: {
    id: 'apps.custom.addedBody',
    defaultMessage: '{name} is in your Library — now assignable to a configuration.',
  },
  alreadyTitle: { id: 'apps.custom.alreadyTitle', defaultMessage: 'Already in Library' },
  alreadyBody: {
    id: 'apps.custom.alreadyBody',
    defaultMessage: 'This app is already in your Library — you can assign it to a configuration.',
  },
  addFailedTitle: { id: 'apps.custom.addFailedTitle', defaultMessage: 'Could not add to Library' },
  addFailedBody: { id: 'apps.custom.addFailedBody', defaultMessage: 'The server rejected the save.' },
  chooseAnother: { id: 'apps.custom.chooseAnother', defaultMessage: 'Choose another file' },
  readSuccessfully: { id: 'apps.custom.readSuccessfully', defaultMessage: 'Read successfully' },
  bundleWithParts: {
    id: 'apps.custom.bundleWithParts',
    defaultMessage: '{count, plural, one {split bundle with # part} other {split bundle with # parts}}',
  },
  apk: { id: 'apps.custom.apk', defaultMessage: 'APK' },
  versionCode: { id: 'apps.custom.versionCode', defaultMessage: '(code {code})' },
  title: { id: 'apps.custom.title', defaultMessage: 'Add your own app' },
  stepFile: { id: 'apps.custom.stepFile', defaultMessage: 'File' },
  stepCheck: { id: 'apps.custom.stepCheck', defaultMessage: 'Check details' },
  stepAdd: { id: 'apps.custom.stepAdd', defaultMessage: 'Add' },
  modeLabel: { id: 'apps.custom.modeLabel', defaultMessage: 'Where the app comes from' },
  modeUpload: { id: 'apps.custom.modeUpload', defaultMessage: 'Upload a file' },
  modeLink: { id: 'apps.custom.modeLink', defaultMessage: 'Use a link' },
  reading: { id: 'apps.custom.reading', defaultMessage: 'Reading {name}…' },
  readingGeneric: { id: 'apps.custom.readingGeneric', defaultMessage: 'Reading the file…' },
  dropTitle: {
    id: 'apps.custom.dropTitle',
    defaultMessage: 'Drop an APK or a split bundle here, or choose one',
  },
  dropHint: {
    id: 'apps.custom.dropHint',
    defaultMessage: 'MDMesh reads the package name, version and checksum from the file.',
  },
  chooseFile: { id: 'apps.custom.chooseFile', defaultMessage: 'Choose a file' },
  hostFailed: {
    id: 'apps.custom.hostFailed',
    defaultMessage: 'MDMesh read the file but couldn’t host it. Use a link to the APK to deploy it.',
  },
  linkLabel: { id: 'apps.custom.linkLabel', defaultMessage: 'Link to the APK' },
  linkHelp: {
    id: 'apps.custom.linkHelp',
    defaultMessage: 'Devices download the file from this address, so it must be reachable from them.',
  },
  nameLabel: { id: 'apps.custom.nameLabel', defaultMessage: 'Display name' },
  nameHelpSaved: { id: 'apps.custom.nameHelpSaved', defaultMessage: 'In the library under this name.' },
  nameHelp: { id: 'apps.custom.nameHelp', defaultMessage: 'What admins see in MDMesh.' },
  namePlaceholder: { id: 'apps.custom.namePlaceholder', defaultMessage: 'Optional' },
  pkgLabel: { id: 'apps.custom.pkgLabel', defaultMessage: 'Package name' },
  pkgHelpFile: { id: 'apps.custom.pkgHelpFile', defaultMessage: 'Read from the file.' },
  pkgHelp: { id: 'apps.custom.pkgHelp', defaultMessage: 'Required, e.g. com.example.app.' },
  versionLabel: { id: 'apps.custom.versionLabel', defaultMessage: 'Version' },
  versionHelp: { id: 'apps.custom.versionHelp', defaultMessage: 'Read from the file.' },
  vcLabel: { id: 'apps.custom.vcLabel', defaultMessage: 'Version code' },
  vcHelp: {
    id: 'apps.custom.vcHelp',
    defaultMessage: 'Optional. The versionCode from the app’s manifest.',
  },
  shaLabel: { id: 'apps.custom.shaLabel', defaultMessage: 'SHA-256 checksum' },
  shaHelpBundle: {
    id: 'apps.custom.shaHelpBundle',
    defaultMessage: '✓ Worked out for each part of the bundle.',
  },
  shaHelpHosted: {
    id: 'apps.custom.shaHelpHosted',
    defaultMessage: '✓ Worked out by MDMesh, which hosts the file.',
  },
  shaValueBundle: {
    id: 'apps.custom.shaValueBundle',
    defaultMessage: '{count, plural, one {# part, one checksum each} other {# parts, one checksum each}}',
  },
  shaValueHosted: { id: 'apps.custom.shaValueHosted', defaultMessage: 'Worked out by MDMesh' },
  shaHelpRequired: {
    id: 'apps.custom.shaHelpRequired',
    defaultMessage: 'Required: devices check the download against it. 64 hex characters.',
  },
  shaHelpNotNeeded: {
    id: 'apps.custom.shaHelpNotNeeded',
    defaultMessage: 'Not needed: MDMesh hosts this file and works it out itself.',
  },
  shaHelpDefault: {
    id: 'apps.custom.shaHelpDefault',
    defaultMessage: '64 hex characters. Devices check the download against it.',
  },
  shaErrorInvalid: {
    id: 'apps.custom.shaErrorInvalid',
    defaultMessage: 'Enter the SHA-256 as 64 hex characters (0-9, a-f).',
  },
  shaErrorMissing: {
    id: 'apps.custom.shaErrorMissing',
    defaultMessage: 'Enter the checksum, or upload the file instead.',
  },
  inLibrary: { id: 'apps.custom.inLibrary', defaultMessage: 'In library' },
  adding: { id: 'apps.custom.adding', defaultMessage: 'Adding…' },
  addToLibrary: { id: 'apps.custom.addToLibrary', defaultMessage: 'Add to library' },
  deploy: { id: 'apps.custom.deploy', defaultMessage: 'Deploy' },
  addAndDeploy: { id: 'apps.custom.addAndDeploy', defaultMessage: 'Add and deploy' },
  hintSaved: {
    id: 'apps.custom.hintSaved',
    defaultMessage: 'It’s in the library. Nothing reaches devices until it is deployed or added to a configuration.',
  },
  hint: {
    id: 'apps.custom.hint',
    defaultMessage: 'Nothing reaches devices until it is deployed or added to a configuration.',
  },
  helpLabel: { id: 'apps.custom.helpLabel', defaultMessage: 'Help' },
  filesTitle: { id: 'apps.custom.filesTitle', defaultMessage: 'Files MDMesh can read' },
  filesText: {
    id: 'apps.custom.filesText',
    defaultMessage: 'Split bundles are unpacked on the server. Devices install every part together.',
  },
  linkTitle: { id: 'apps.custom.linkTitle', defaultMessage: 'Using a link' },
  linkText: {
    id: 'apps.custom.linkText',
    defaultMessage:
      'Devices download the file themselves. You’ll need its SHA-256 checksum so they can check the download wasn’t changed.',
  },
  needApkTitle: { id: 'apps.custom.needApkTitle', defaultMessage: 'Need an APK?' },
  needApkText: {
    id: 'apps.custom.needApkText',
    defaultMessage: 'Search a mirror for the package name. Only use files whose signature matches the developer’s.',
  },
  mirrorLabel: { id: 'apps.custom.mirrorLabel', defaultMessage: 'Search a mirror for' },
  mirrorPlaceholder: { id: 'apps.custom.mirrorPlaceholder', defaultMessage: 'App or package name' },
});
// Widened so values can be passed (react-intl would otherwise type them from the ICU text).
const messages: { [K in keyof typeof messageDefs]: MessageDescriptor } = messageDefs;

interface FileInfo {
  name: string;
  size: number;
  /** Set once the server has read the file. */
  read: boolean;
  /** Why the file could not be used (alert panel). */
  error?: string;
}

/**
 * Custom APK: upload a file (APK or split bundle) or use a link, check the details, add it to the library
 * and/or deploy it. Behaviour is the classic CustomSource's: an upload is hosted and registered in the library at
 * once; "Add to library" is the manual path for links and the retry when that registration failed.
 */
export function AppsCustom({
  tabs,
  baseUrl,
  onDeploy,
  onLibraryChanged,
}: {
  tabs: ReactNode;
  baseUrl: string | null;
  /** Left out for a role that may not deploy at all (neither push to devices nor add to a configuration). */
  onDeploy?: (s: DeploySubject) => void;
  /** A library entry was created or found (refresh the list and the tab count). */
  onLibraryChanged: () => void;
}) {
  const intl = useIntl();
  const toast = useToast();
  const headId = useId();
  // Uploading needs edit_files and adding to the library edit_applications (ext/core/access.ts). Without edit_files
  // only the link is offered; without edit_applications, an upload is hosted but not added.
  const canUpload = usePermission(CORE_ACTION_ACCESS.uploadFile);
  const canAdd = usePermission(CORE_ACTION_ACCESS.addApp);
  const [mode, setMode] = useState<Mode>(canUpload ? 'upload' : 'link');
  const [query, setQuery] = useState('');
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [pkg, setPkg] = useState('');
  const [pkgFromFile, setPkgFromFile] = useState(false);
  const [version, setVersion] = useState('');
  const [vc, setVc] = useState('');
  const [sha, setSha] = useState('');
  const [shaTouched, setShaTouched] = useState(false);
  // The URL of the file uploaded here: the server hashes it itself. Any other URL needs its SHA-256 entered, since
  // the agent only installs an APK whose hash it can verify.
  const [hostedUrl, setHostedUrl] = useState('');
  const [bundle, setBundle] = useState<BundleUploadResult | null>(null);
  const [savedAppId, setSavedAppId] = useState<number | undefined>(undefined);
  const [uploading, setUploading] = useState(false);
  const [savingToLibrary, setSavingToLibrary] = useState(false);
  const [file, setFile] = useState<FileInfo | null>(null);

  const isMultiPart = !!bundle && bundle.parts.length > 1;
  /** The single URL this app installs from: the hosted upload, a single-part bundle's part, or the typed link. */
  const effectiveUrl = mode === 'link' ? url.trim() : bundle ? (bundle.parts.length === 1 ? bundle.parts[0].url : '') : hostedUrl;
  // A URL this console didn't just upload, and not one MDMesh hosts: the admin must supply the APK's SHA-256.
  const externalUrl = mode === 'link' && effectiveUrl !== '' && effectiveUrl !== hostedUrl && !isHostedHere(effectiveUrl, baseUrl);
  const shaTrim = sha.trim();
  const shaInvalid = shaTrim !== '' && !SHA256_HEX.test(shaTrim);
  const shaMissing = externalUrl && shaTrim === '';
  const fileRead = !!file?.read;
  const hasSource = mode === 'upload' ? fileRead : url.trim() !== '';
  const hasInstallable = isMultiPart || effectiveUrl !== '';
  const ready = hasInstallable && pkg.trim() !== '' && !shaInvalid && !shaMissing;
  const step = savedAppId ? 3 : !hasSource ? 0 : ready ? 2 : 1;
  const hostFailed = mode === 'upload' && fileRead && !bundle && !hostedUrl;

  function resetFileState() {
    setSavedAppId(undefined);
    setHostedUrl('');
    setBundle(null);
    setFile(null);
    setPkgFromFile(false);
  }

  function switchMode(next: Mode) {
    if (next === mode) return;
    if (next === 'link') {
      // Keep what the file told us; a hosted single APK keeps its link (and its library entry).
      // A file MDMesh read but couldn't host also keeps its details: the admin links to the same APK instead.
      const keepLink = !bundle && hostedUrl !== '';
      setUrl(keepLink ? hostedUrl : '');
      if (!keepLink) {
        setSavedAppId(undefined);
        setVersion('');
        if (!hostFailed) {
          setName('');
          setPkg('');
          setVc('');
        }
      }
      setBundle(null);
      setFile(null);
      setPkgFromFile(false);
    } else {
      resetFileState();
      setName('');
      setPkg('');
      setVc('');
      setUrl('');
      setSha('');
      setShaTouched(false);
      setVersion('');
    }
    setMode(next);
  }

  async function onFile(f: File) {
    setSavedAppId(undefined); // fresh file: drop any prior Library id
    setHostedUrl('');
    setSha('');
    setShaTouched(false);
    if (isBundleName(f.name)) {
      await onBundle(f);
      return;
    }
    if (!f.name.toLowerCase().endsWith('.apk')) {
      toast.push('err', intl.formatMessage(messages.notApkTitle), intl.formatMessage(messages.notApkBody));
      setBundle(null);
      setFile({ name: f.name, size: f.size, read: false, error: intl.formatMessage(messages.notApkFile) });
      return;
    }
    setBundle(null);
    setUploading(true);
    setFile({ name: f.name, size: f.size, read: false });
    try {
      const up = await uploadApk(f);
      const fd = up.fileDetails;
      setVersion(fd?.version ?? ''); // per file: never carry the previous file's version over (#69)
      if (fd) {
        if (fd.name) setName(fd.name);
        if (fd.pkg) setPkg(fd.pkg);
        setPkgFromFile(!!fd.pkg);
        setVc(fd.versionCode ? String(fd.versionCode) : '');
      }
      setFile({ name: f.name, size: f.size, read: true });
      try {
        const committed = await commitUpload(up.serverPath);
        if (committed.url) {
          setUrl(committed.url);
          setHostedUrl(committed.url);
          // Add to the Library at once so it shows up everywhere (incl. the kiosk app picker), not just this one-off
          // deploy. Non-fatal if it fails.
          if (fd?.pkg && canAdd) {
            try {
              const saved = await saveAndroidApplication({
                name: fd.name || fd.pkg,
                pkg: fd.pkg,
                url: committed.url,
                version: fd.version,
                versionCode: fd.versionCode,
                type: 'app', // applications.type is NOT NULL: send it explicitly so the save can't fail
              });
              setSavedAppId(saved.id); // enables the deploy dialog's "Add to a configuration"
              onLibraryChanged();
              toast.push('ok', intl.formatMessage(messages.apkReady), intl.formatMessage(messages.hostedAdded));
            } catch {
              // Most likely it's already in the Library (same package+version). Reuse that entry so it stays
              // assignable to a configuration instead of silently dropping it (#60: never a second row).
              const existing = (await listApplications(fd.pkg).catch(() => [])).find((a) => a.pkg === fd.pkg);
              if (existing?.id) {
                setSavedAppId(existing.id);
                toast.push('ok', intl.formatMessage(messages.apkReady), intl.formatMessage(messages.alreadyInLibraryBody));
              } else {
                toast.push('ok', intl.formatMessage(messages.apkReady), intl.formatMessage(messages.hostedNotAdded));
              }
            }
          } else {
            toast.push('ok', intl.formatMessage(messages.apkReady), intl.formatMessage(messages.detailsFilled));
          }
        } else {
          toast.push('ok', intl.formatMessage(messages.detailsExtracted), intl.formatMessage(messages.couldNotHost));
        }
      } catch {
        toast.push('ok', intl.formatMessage(messages.detailsExtracted), intl.formatMessage(messages.couldNotHost));
      }
    } catch (e) {
      toast.push('err', intl.formatMessage(messages.uploadFailed), errorText(e));
      setFile(null);
    } finally {
      setUploading(false);
    }
  }

  // Split bundles (.xapk/.apks/.apkm/.zip): the server unpacks and hosts every part. There's no single URL, so we
  // hold the parts and deploy them together.
  async function onBundle(f: File) {
    setUploading(true);
    setFile({ name: f.name, size: f.size, read: false });
    try {
      const b = await uploadBundle(f);
      setBundle(b);
      setUrl('');
      setSha('');
      if (b.name) setName(b.name);
      if (b.packageName) setPkg(b.packageName);
      setPkgFromFile(!!b.packageName);
      const ver = b.version || String(b.versionCode); // applicationVersions.version is NOT NULL
      setVersion(ver);
      setVc(b.versionCode ? String(b.versionCode) : '');
      setFile({ name: f.name, size: f.size, read: true });
      // Register in the Library so it shows in the config picker and is assignable to a configuration. A
      // single-part bundle (a universal.apk .apks) is an ordinary single-URL app; a multi-part bundle stores its
      // parts as a JSON string on the version.
      if (canAdd) {
        try {
          const saved = await saveAndroidApplication(
            b.parts.length === 1
              ? { name: b.name || b.packageName, pkg: b.packageName, url: b.parts[0].url, version: ver, versionCode: b.versionCode, type: 'app' }
              : {
                  name: b.name || b.packageName,
                  pkg: b.packageName,
                  version: ver,
                  versionCode: b.versionCode,
                  type: 'app',
                  parts: JSON.stringify(b.parts.map((p) => ({ url: p.url, sha256: p.sha256, name: p.name }))),
                },
          );
          setSavedAppId(saved.id);
          onLibraryChanged();
        } catch {
          // Non-fatal: still deployable via push-now; may already be in the Library.
        }
      }
      toast.push(
        'ok',
        intl.formatMessage(messages.bundleReady),
        intl.formatMessage(canAdd ? messages.splitsHostedAdded : messages.splitsHosted, { count: b.parts.length }),
      );
    } catch (e) {
      toast.push('err', intl.formatMessage(messages.bundleFailed), bundleErrorText(e, intl));
      setFile(null);
    } finally {
      setUploading(false);
    }
  }

  /** The SHA-256 rule; returns the hash to send (undefined for a hosted file), or null after a toast. */
  function checkedSha(): string | undefined | null {
    setShaTouched(true);
    if (shaInvalid) {
      toast.push('err', intl.formatMessage(messages.invalidShaTitle), intl.formatMessage(messages.invalidShaBody));
      return null;
    }
    if (shaMissing) {
      toast.push('err', intl.formatMessage(messages.shaRequiredTitle), intl.formatMessage(messages.shaRequiredBody));
      return null;
    }
    return shaTrim ? shaTrim.toLowerCase() : undefined;
  }

  /** The deploy subject for the form, or null after a toast. */
  function subjectFor(applicationId: number | undefined, checked: string | undefined): DeploySubject {
    if (bundle) {
      return {
        label: name.trim() || bundle.name || intl.formatMessage(messages.splitBundleLabel),
        packageName: pkg.trim() || bundle.packageName,
        url: '', // no single URL for a bundle; parts carry the hosted splits
        versionCode: vc ? Number(vc) : bundle.versionCode,
        parts: bundle.parts.map((p) => ({ url: p.url, sha256: p.sha256 })),
        applicationId,
      };
    }
    return {
      label: name.trim() || intl.formatMessage(messages.customApkLabel),
      packageName: pkg.trim(),
      url: effectiveUrl,
      versionCode: vc ? Number(vc) : undefined,
      sha256: checked,
      applicationId, // present once the APK is in the Library: enables "Add to a configuration"
    };
  }

  /** Validate for deploy; returns the checked hash (undefined = none needed) or null after a toast. */
  function validateDeploy(): { sha: string | undefined } | null {
    if (bundle) return { sha: undefined };
    if (!effectiveUrl || !pkg.trim()) {
      toast.push('err', intl.formatMessage(messages.missingFieldsTitle), intl.formatMessage(messages.missingForDeploy));
      return null;
    }
    const checked = checkedSha();
    if (checked === null) return null;
    return { sha: checked };
  }

  // The manual path for links, and the retry for a failed automatic registration. Never creates a second Library
  // row after the upload has already supplied an id. Returns the library id, or undefined.
  async function saveToLibrary(): Promise<number | undefined> {
    if (savedAppId) return savedAppId;
    if (!pkg.trim() || (!effectiveUrl && !isMultiPart)) {
      toast.push('err', intl.formatMessage(messages.missingFieldsTitle), intl.formatMessage(messages.missingForLibrary));
      return undefined;
    }
    const checked = isMultiPart ? undefined : checkedSha();
    if (checked === null) return undefined;
    setSavingToLibrary(true);
    try {
      const saved = await saveAndroidApplication({
        name: name.trim() || pkg.trim(),
        pkg: pkg.trim(),
        url: isMultiPart ? undefined : effectiveUrl,
        sha256: checked,
        version: version.trim() || undefined,
        versionCode: vc ? Number(vc) : undefined,
        type: 'app',
        parts:
          isMultiPart && bundle
            ? JSON.stringify(bundle.parts.map((p) => ({ url: p.url, sha256: p.sha256, name: p.name })))
            : undefined,
      });
      setSavedAppId(saved.id);
      onLibraryChanged();
      toast.push('ok', intl.formatMessage(messages.addedTitle), intl.formatMessage(messages.addedBody, { name: name.trim() || pkg.trim() }));
      return saved.id;
    } catch (e) {
      const existing = (await listApplications(pkg.trim()).catch(() => [])).find((a) => a.pkg === pkg.trim());
      if (existing?.id) {
        setSavedAppId(existing.id);
        toast.push('ok', intl.formatMessage(messages.alreadyTitle), intl.formatMessage(messages.alreadyBody));
        return existing.id;
      }
      toast.push('err', intl.formatMessage(messages.addFailedTitle), e instanceof Error ? e.message : intl.formatMessage(messages.addFailedBody));
      return undefined;
    } finally {
      setSavingToLibrary(false);
    }
  }

  async function addAndDeploy() {
    const v = validateDeploy();
    if (!v) return;
    // Not in the library yet: add it first, if the role may. Without it, the dialog still opens for pushing to devices.
    const id = savedAppId ?? (canAdd ? await saveToLibrary() : undefined);
    onDeploy?.(subjectFor(id, v.sha));
  }

  const chooseAnother = (choose: () => void) => (
    <Button size="md" disabled={uploading} onClick={choose}>
      {intl.formatMessage(messages.chooseAnother)}
    </Button>
  );

  const fileDetail = file
    ? [
        intl.formatMessage(messages.readSuccessfully),
        bundle ? intl.formatMessage(messages.bundleWithParts, { count: bundle.parts.length }) : intl.formatMessage(messages.apk),
        formatBytes(file.size),
      ]
        .filter(Boolean)
        .join(' · ')
    : '';

  const versionText = [version, vc ? intl.formatMessage(messages.versionCode, { code: vc }) : ''].filter(Boolean).join(' ') || '—';
  const saved = !!savedAppId;
  const addDisabled = uploading || savingToLibrary || saved || !pkg.trim() || !hasInstallable;
  const deployDisabled = uploading || savingToLibrary || !hasSource;

  return (
    <>
      <div className="v2-apps-toolbar">{tabs}</div>

      <Grid className="v2-apps-custom">
        <GridCell span={8}>
          <Card as="section" gap={16} className="v2-apps-custom__main" aria-labelledby={headId}>
            <CardHeader
              titleId={headId}
              title={intl.formatMessage(messages.title)}
              className="v2-apps-custom__head"
              actions={<Stepper steps={[intl.formatMessage(messages.stepFile), intl.formatMessage(messages.stepCheck), intl.formatMessage(messages.stepAdd)]} current={step} />}
            />

            {canUpload ? (
              <Segmented<Mode>
                aria-label={intl.formatMessage(messages.modeLabel)}
                className="v2-apps-custom__mode"
                value={mode}
                onChange={switchMode}
                disabled={uploading || savingToLibrary}
                options={[
                  { value: 'upload', label: intl.formatMessage(messages.modeUpload) },
                  { value: 'link', label: intl.formatMessage(messages.modeLink) },
                ]}
              />
            ) : null}

            {mode === 'upload' ? (
              <>
                <FileDropZone
                  accept={FILE_ACCEPT}
                  onFile={(f) => void onFile(f)}
                  busy={uploading}
                  busyLabel={file ? intl.formatMessage(messages.reading, { name: file.name }) : intl.formatMessage(messages.readingGeneric)}
                  title={intl.formatMessage(messages.dropTitle)}
                  hint={intl.formatMessage(messages.dropHint)}
                  buttonLabel={intl.formatMessage(messages.chooseFile)}
                  result={
                    file
                      ? (choose) =>
                          file.error ? (
                            <FileReadPanel tone="alert" name={file.name} detail={file.error} action={chooseAnother(choose)} />
                          ) : (
                            <FileReadPanel name={file.name} detail={fileDetail} action={chooseAnother(choose)} />
                          )
                      : undefined
                  }
                />
                {hostFailed ? (
                  <Callout tone="warn" icon={<IconWarning size={16} />}>
                    <span className="v2-apps-calloutline">
                      {intl.formatMessage(messages.hostFailed)}
                      <Button size="sm" onClick={() => switchMode('link')}>
                        {intl.formatMessage(messages.modeLink)}
                      </Button>
                    </span>
                  </Callout>
                ) : null}
              </>
            ) : null}

            {mode === 'link' || fileRead ? (
              <div className="v2-apps-custom__fields">
                {mode === 'link' ? (
                  <Field
                    className="v2-apps-custom__wide"
                    label={intl.formatMessage(messages.linkLabel)}
                    help={intl.formatMessage(messages.linkHelp)}
                  >
                    <Input
                      type="url"
                      value={url}
                      placeholder="https://…/app.apk"
                      onChange={(e) => {
                        setUrl(e.target.value);
                        setVersion(''); // a hand-typed URL isn't the analysed file any more (#69)
                        if (savedAppId && e.target.value.trim() !== hostedUrl) setSavedAppId(undefined);
                      }}
                    />
                  </Field>
                ) : null}
                <Field label={intl.formatMessage(messages.nameLabel)} help={intl.formatMessage(saved ? messages.nameHelpSaved : messages.nameHelp)}>
                  <Input value={name} readOnly={saved} onChange={(e) => setName(e.target.value)} placeholder={pkg || intl.formatMessage(messages.namePlaceholder)} />
                </Field>
                <Field label={intl.formatMessage(messages.pkgLabel)} help={intl.formatMessage(pkgFromFile ? messages.pkgHelpFile : messages.pkgHelp)}>
                  <Input
                    mono
                    value={pkg}
                    readOnly={pkgFromFile || saved}
                    onChange={(e) => setPkg(e.target.value)}
                    placeholder="com.example.app"
                    spellCheck={false}
                  />
                </Field>
                {mode === 'upload' ? (
                  <Field label={intl.formatMessage(messages.versionLabel)} help={intl.formatMessage(messages.versionHelp)}>
                    <Input mono value={versionText} readOnly />
                  </Field>
                ) : (
                  <Field label={intl.formatMessage(messages.vcLabel)} help={intl.formatMessage(messages.vcHelp)}>
                    <Input mono type="number" inputMode="numeric" value={vc} readOnly={saved} onChange={(e) => setVc(e.target.value)} />
                  </Field>
                )}
                {mode === 'upload' ? (
                  <Field
                    label={intl.formatMessage(messages.shaLabel)}
                    helpTone="ok"
                    help={intl.formatMessage(bundle ? messages.shaHelpBundle : messages.shaHelpHosted)}
                  >
                    <Input
                      value={bundle ? intl.formatMessage(messages.shaValueBundle, { count: bundle.parts.length }) : intl.formatMessage(messages.shaValueHosted)}
                      readOnly
                    />
                  </Field>
                ) : (
                  <Field
                    label={intl.formatMessage(messages.shaLabel)}
                    help={intl.formatMessage(
                      externalUrl ? messages.shaHelpRequired : effectiveUrl ? messages.shaHelpNotNeeded : messages.shaHelpDefault,
                    )}
                    error={
                      shaTouched && shaInvalid
                        ? intl.formatMessage(messages.shaErrorInvalid)
                        : shaTouched && shaMissing
                          ? intl.formatMessage(messages.shaErrorMissing)
                          : undefined
                    }
                  >
                    <Input
                      mono
                      value={sha}
                      readOnly={saved}
                      onChange={(e) => setSha(e.target.value)}
                      onBlur={() => shaTrim !== '' && setShaTouched(true)}
                      autoComplete="off"
                      spellCheck={false}
                    />
                  </Field>
                )}
              </div>
            ) : null}

            <div className="v2-apps-custom__foot">
              {canAdd ? (
                <Button
                  size="lg"
                  variant="primary"
                  icon={saved ? <IconCheck size={16} /> : <IconPlus size={16} />}
                  disabled={addDisabled}
                  onClick={() => void saveToLibrary()}
                >
                  {intl.formatMessage(saved ? messages.inLibrary : savingToLibrary ? messages.adding : messages.addToLibrary)}
                </Button>
              ) : null}
              {onDeploy ? (
                <Button size="lg" icon={<IconDownload size={16} />} disabled={deployDisabled} onClick={() => void addAndDeploy()}>
                  {intl.formatMessage(saved || !canAdd ? messages.deploy : messages.addAndDeploy)}
                </Button>
              ) : null}
              <span className="v2-apps-custom__hint">
                {intl.formatMessage(saved ? messages.hintSaved : messages.hint)}
              </span>
            </div>
          </Card>
        </GridCell>

        <GridCell span={4}>
          <aside className="v2-apps-custom__side" aria-label={intl.formatMessage(messages.helpLabel)}>
            <Card gap={12}>
              <CardHeader title={intl.formatMessage(messages.filesTitle)} />
              <div className="v2-apps-sidecard__exts">
                {FILE_EXTS.map((e) => (
                  <Badge key={e} tone="neutral" size="md" square mono>
                    {e}
                  </Badge>
                ))}
              </div>
              <p className="v2-apps-sidecard__text">{intl.formatMessage(messages.filesText)}</p>
            </Card>
            <Card gap={12}>
              <CardHeader title={intl.formatMessage(messages.linkTitle)} />
              <p className="v2-apps-sidecard__text">
                {intl.formatMessage(messages.linkText)}
              </p>
            </Card>
            <Card gap={12}>
              <CardHeader title={intl.formatMessage(messages.needApkTitle)} />
              <p className="v2-apps-sidecard__text">
                {intl.formatMessage(messages.needApkText)}
              </p>
              <Input
                size="sm"
                aria-label={intl.formatMessage(messages.mirrorLabel)}
                placeholder={pkg || intl.formatMessage(messages.mirrorPlaceholder)}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              <div className="v2-apps-sidecard__links">
                {EXT_SOURCES.map((s) => (
                  <ButtonAnchor
                    key={s.label}
                    size="sm"
                    href={s.url + encodeURIComponent(query.trim() || pkg.trim())}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {s.label} ↗
                  </ButtonAnchor>
                ))}
              </div>
            </Card>
          </aside>
        </GridCell>
      </Grid>
    </>
  );
}
