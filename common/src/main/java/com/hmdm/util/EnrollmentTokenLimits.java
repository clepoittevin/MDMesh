/*
 * Copyright (C) 2026 the MDMesh contributors. Licensed under the Apache License, Version 2.0.
 */
package com.hmdm.util;

/**
 * <p>How many devices an agent enrollment token may enroll, and for how long it is valid.</p>
 *
 * <p>Left at their defaults, a token enrolls one device within a day, as every token did before tokens could be
 * reused: a code sent to one customer for one tablet. Raised, one code serves a batch of devices set up together,
 * the way Android Management API enrollment tokens and Intune's dedicated-device tokens work. Both are bounded, so a
 * code that is shared further than meant stops working on its own.</p>
 */
public final class EnrollmentTokenLimits {

    /** The most devices one token may enroll. */
    public static final int MAX_USES = 1000;

    /** How long a token is valid when the request does not say. */
    public static final int DEFAULT_VALID_HOURS = 24;

    /** The longest a token may be valid: 30 days. */
    public static final int MAX_VALID_HOURS = 30 * 24;

    /** The longest device name a token may carry: the console's own limit for a device's name. */
    public static final int MAX_DEVICE_NAME_LENGTH = 200;

    private static final long HOUR_MILLIS = 60L * 60L * 1000L;

    private EnrollmentTokenLimits() {
    }

    /** The devices a token may enroll: [maxUses], or 1 when the request does not say. */
    public static int uses(Integer maxUses) {
        return maxUses == null ? 1 : maxUses;
    }

    /** How long a token is valid, in milliseconds: [validHours], or {@link #DEFAULT_VALID_HOURS}. */
    public static long validMillis(Integer validHours) {
        return (validHours == null ? DEFAULT_VALID_HOURS : validHours) * HOUR_MILLIS;
    }

    /** Why a token cannot be minted with these limits (an error key), or null when they are allowed. */
    public static String problem(Integer maxUses, Integer validHours) {
        int uses = uses(maxUses);
        if (uses < 1 || uses > MAX_USES) {
            return "error.agent.token.maxUses";
        }
        if (validHours != null && (validHours < 1 || validHours > MAX_VALID_HOURS)) {
            return "error.agent.token.validHours";
        }
        return null;
    }

    /** The device name a token carries for [deviceName]: trimmed, and null when there is none or it is blank. */
    public static String deviceName(String deviceName) {
        if (deviceName == null) {
            return null;
        }
        String trimmed = deviceName.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }

    /**
     * Why a token cannot carry this device name (an error key), or null when it may: longer than
     * {@link #MAX_DEVICE_NAME_LENGTH}, or with a control character or a line break in it. [deviceName] is the
     * {@link #deviceName trimmed} value.
     */
    public static String deviceNameProblem(String deviceName) {
        if (deviceName == null) {
            return null;
        }
        if (deviceName.length() > MAX_DEVICE_NAME_LENGTH) {
            return "error.agent.token.deviceName";
        }
        for (int i = 0; i < deviceName.length(); i++) {
            char c = deviceName.charAt(i);
            int type = Character.getType(c);
            if (Character.isISOControl(c) || type == Character.LINE_SEPARATOR || type == Character.PARAGRAPH_SEPARATOR) {
                return "error.agent.token.deviceName";
            }
        }
        return null;
    }

    /**
     * The name of the device a token enrolls with use number [useNumber] (1 for its first device): the token's
     * [deviceName] as it is for a single-use token, numbered ("Tablet 1", "Tablet 2", ...) for a token that enrolls
     * several devices. Null when the token carries no name.
     */
    public static String enrolledDeviceName(String deviceName, Integer maxUses, int useNumber) {
        if (deviceName == null) {
            return null;
        }
        return uses(maxUses) == 1 ? deviceName : deviceName + " " + useNumber;
    }
}
