import { describe, expect, it } from 'vitest';
import { manageableAppPermissions, managedAppPermissionLabel } from './managedAppPermissions';

describe('manageableAppPermissions', () => {
  it('keeps curated runtime-permission candidates and excludes special app access', () => {
    expect(
      manageableAppPermissions(
        'android.permission.ACCESS_COARSE_LOCATION,android.permission.POST_NOTIFICATIONS,android.permission.WRITE_EXTERNAL_STORAGE,android.permission.MANAGE_EXTERNAL_STORAGE',
        [],
      ),
    ).toEqual([
      'android.permission.ACCESS_COARSE_LOCATION',
      'android.permission.POST_NOTIFICATIONS',
      'android.permission.WRITE_EXTERNAL_STORAGE',
    ]);
  });

  it('offers Jellyfin candidates, which the agent resolves independently on each device', () => {
    expect(
      manageableAppPermissions('android.permission.BLUETOOTH_CONNECT,android.permission.POST_NOTIFICATIONS,android.permission.INTERNET', []),
    ).toEqual(['android.permission.BLUETOOTH_CONNECT', 'android.permission.POST_NOTIFICATIONS']);
  });

  it('retains an existing rule so it can be returned to Default', () => {
    expect(manageableAppPermissions(null, ['android.permission.CAMERA'])).toEqual(['android.permission.CAMERA']);
  });
});

describe('a permission name every object inherits', () => {
  it('is not a known permission: not offered from an APK, and shown as its name when a rule has it', () => {
    expect(manageableAppPermissions('constructor,toString,__proto__,android.permission.CAMERA', [])).toEqual(['android.permission.CAMERA']);
    for (const p of ['constructor', 'toString', '__proto__']) expect(managedAppPermissionLabel(p)).toBe(p);
    expect(managedAppPermissionLabel('android.permission.CAMERA')).toBe('Camera');
  });
});
