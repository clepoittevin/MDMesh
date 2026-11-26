import { defineMessage, type IntlShape, type MessageDescriptor } from 'react-intl';
import { EN_INTL } from './configIntl';

/**
 * Curated Android runtime permissions that the Device Owner agent can attempt
 * to apply. An APK manifest is only a candidate list: the installed version
 * and Android release decide whether a specific device can actually apply it.
 */
export const MANAGED_APP_PERMISSION_LABELS: Record<string, MessageDescriptor> = {
  'android.permission.ACCESS_COARSE_LOCATION': defineMessage({ id: 'appPermissions.label.accessCoarseLocation', defaultMessage: 'Approximate location' }),
  'android.permission.ACCESS_FINE_LOCATION': defineMessage({ id: 'appPermissions.label.accessFineLocation', defaultMessage: 'Precise location' }),
  'android.permission.CAMERA': defineMessage({ id: 'appPermissions.label.camera', defaultMessage: 'Camera' }),
  'android.permission.RECORD_AUDIO': defineMessage({ id: 'appPermissions.label.recordAudio', defaultMessage: 'Microphone' }),
  'android.permission.READ_CONTACTS': defineMessage({ id: 'appPermissions.label.readContacts', defaultMessage: 'Read contacts' }),
  'android.permission.WRITE_CONTACTS': defineMessage({ id: 'appPermissions.label.writeContacts', defaultMessage: 'Edit contacts' }),
  'android.permission.READ_CALENDAR': defineMessage({ id: 'appPermissions.label.readCalendar', defaultMessage: 'Read calendar' }),
  'android.permission.WRITE_CALENDAR': defineMessage({ id: 'appPermissions.label.writeCalendar', defaultMessage: 'Edit calendar' }),
  'android.permission.READ_PHONE_STATE': defineMessage({ id: 'appPermissions.label.readPhoneState', defaultMessage: 'Phone state' }),
  'android.permission.READ_PHONE_NUMBERS': defineMessage({ id: 'appPermissions.label.readPhoneNumbers', defaultMessage: 'Read phone numbers' }),
  'android.permission.CALL_PHONE': defineMessage({ id: 'appPermissions.label.callPhone', defaultMessage: 'Make calls' }),
  'android.permission.READ_CALL_LOG': defineMessage({ id: 'appPermissions.label.readCallLog', defaultMessage: 'Read call log' }),
  'android.permission.WRITE_CALL_LOG': defineMessage({ id: 'appPermissions.label.writeCallLog', defaultMessage: 'Edit call log' }),
  'android.permission.ADD_VOICEMAIL': defineMessage({ id: 'appPermissions.label.addVoicemail', defaultMessage: 'Add voicemail' }),
  'android.permission.ANSWER_PHONE_CALLS': defineMessage({ id: 'appPermissions.label.answerPhoneCalls', defaultMessage: 'Answer calls' }),
  'android.permission.READ_SMS': defineMessage({ id: 'appPermissions.label.readSms', defaultMessage: 'Read SMS' }),
  'android.permission.RECEIVE_SMS': defineMessage({ id: 'appPermissions.label.receiveSms', defaultMessage: 'Receive SMS' }),
  'android.permission.SEND_SMS': defineMessage({ id: 'appPermissions.label.sendSms', defaultMessage: 'Send SMS' }),
  'android.permission.RECEIVE_WAP_PUSH': defineMessage({ id: 'appPermissions.label.receiveWapPush', defaultMessage: 'Receive WAP push' }),
  'android.permission.RECEIVE_MMS': defineMessage({ id: 'appPermissions.label.receiveMms', defaultMessage: 'Receive MMS' }),
  'android.permission.READ_EXTERNAL_STORAGE': defineMessage({ id: 'appPermissions.label.readExternalStorage', defaultMessage: 'Read files and media' }),
  'android.permission.WRITE_EXTERNAL_STORAGE': defineMessage({ id: 'appPermissions.label.writeExternalStorage', defaultMessage: 'Edit files and media' }),
  'android.permission.READ_MEDIA_IMAGES': defineMessage({ id: 'appPermissions.label.readMediaImages', defaultMessage: 'Photos and images' }),
  'android.permission.READ_MEDIA_VIDEO': defineMessage({ id: 'appPermissions.label.readMediaVideo', defaultMessage: 'Videos' }),
  'android.permission.READ_MEDIA_AUDIO': defineMessage({ id: 'appPermissions.label.readMediaAudio', defaultMessage: 'Music and audio' }),
  'android.permission.READ_MEDIA_VISUAL_USER_SELECTED': defineMessage({ id: 'appPermissions.label.readMediaVisualUserSelected', defaultMessage: 'Selected photos and videos' }),
  'android.permission.ACCESS_MEDIA_LOCATION': defineMessage({ id: 'appPermissions.label.accessMediaLocation', defaultMessage: 'Photo location' }),
  'android.permission.ACTIVITY_RECOGNITION': defineMessage({ id: 'appPermissions.label.activityRecognition', defaultMessage: 'Physical activity' }),
  'android.permission.BODY_SENSORS': defineMessage({ id: 'appPermissions.label.bodySensors', defaultMessage: 'Body sensors' }),
  'android.permission.BODY_SENSORS_BACKGROUND': defineMessage({ id: 'appPermissions.label.bodySensorsBackground', defaultMessage: 'Background body sensors' }),
  'android.permission.POST_NOTIFICATIONS': defineMessage({ id: 'appPermissions.label.postNotifications', defaultMessage: 'Notifications' }),
  'android.permission.BLUETOOTH_SCAN': defineMessage({ id: 'appPermissions.label.bluetoothScan', defaultMessage: 'Find nearby devices' }),
  'android.permission.BLUETOOTH_CONNECT': defineMessage({ id: 'appPermissions.label.bluetoothConnect', defaultMessage: 'Connect nearby devices' }),
  'android.permission.BLUETOOTH_ADVERTISE': defineMessage({ id: 'appPermissions.label.bluetoothAdvertise', defaultMessage: 'Advertise nearby devices' }),
  'android.permission.NEARBY_WIFI_DEVICES': defineMessage({ id: 'appPermissions.label.nearbyWifiDevices', defaultMessage: 'Nearby Wi-Fi devices' }),
};

const declared = (requestedPermissions: string | null | undefined): string[] =>
  typeof requestedPermissions === 'string'
    ? requestedPermissions.split(',').map((permission) => permission.trim()).filter((permission) => permission in MANAGED_APP_PERMISSION_LABELS)
    : [];

/**
 * Permission controls inferred from a locally stored APK, plus an existing
 * rule so an administrator can always remove a previously saved override.
 */
export function manageableAppPermissions(
  requestedPermissions: string | null | undefined,
  configuredPermissions: readonly string[],
): string[] {
  return [...new Set([...declared(requestedPermissions), ...configuredPermissions])];
}

/** The permission's name in the console's language; one the console doesn't know shows as its Android name. */
export const managedAppPermissionLabel = (permission: string, intl: IntlShape = EN_INTL): string => {
  const label = MANAGED_APP_PERMISSION_LABELS[permission];
  return label ? intl.formatMessage(label) : permission;
};
