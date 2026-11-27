/*
 * Copyright (C) 2026 the MDMesh contributors. Licensed under the Apache License, Version 2.0.
 */
package com.hmdm.util;

import org.junit.Test;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;

public class EnrollmentTokenLimitsTest {

    private static final long HOUR = 60L * 60 * 1000;

    @Test
    public void aTokenLeftAtItsDefaultsIsSingleUseForADay() {
        // What every caller got before tokens could be reused: nothing changes for them.
        assertEquals(1, EnrollmentTokenLimits.uses(null));
        assertEquals(24 * HOUR, EnrollmentTokenLimits.validMillis(null));
        assertNull(EnrollmentTokenLimits.problem(null, null));
    }

    @Test
    public void aTokenMayEnrollSeveralDevicesForSeveralDays() {
        assertEquals(25, EnrollmentTokenLimits.uses(25));
        assertEquals(72 * HOUR, EnrollmentTokenLimits.validMillis(72));
        assertNull(EnrollmentTokenLimits.problem(25, 72));
        assertNull(EnrollmentTokenLimits.problem(EnrollmentTokenLimits.MAX_USES, EnrollmentTokenLimits.MAX_VALID_HOURS));
    }

    @Test
    public void usesOutsideTheLimitsAreRefused() {
        assertNotNull(EnrollmentTokenLimits.problem(0, null));
        assertNotNull(EnrollmentTokenLimits.problem(-1, null));
        assertNotNull(EnrollmentTokenLimits.problem(EnrollmentTokenLimits.MAX_USES + 1, null));
    }

    @Test
    public void validityOutsideTheLimitsIsRefused() {
        assertNotNull(EnrollmentTokenLimits.problem(null, 0));
        assertNotNull(EnrollmentTokenLimits.problem(null, EnrollmentTokenLimits.MAX_VALID_HOURS + 1));
    }

    @Test
    public void aDeviceNameIsTrimmedAndABlankOneIsNone() {
        assertNull(EnrollmentTokenLimits.deviceName(null));
        assertNull(EnrollmentTokenLimits.deviceName(""));
        assertNull(EnrollmentTokenLimits.deviceName("   "));
        assertEquals("Target 3", EnrollmentTokenLimits.deviceName("  Target 3 "));
        assertNull(EnrollmentTokenLimits.deviceNameProblem(null));
        assertNull(EnrollmentTokenLimits.deviceNameProblem("Target 3"));
        assertNull(EnrollmentTokenLimits.deviceNameProblem("Tablette d'accueil \u2013 \u00e9tage 2"));
    }

    @Test
    public void aDeviceNameUpToTheConsolesLimitIsAllowed() {
        String longest = repeat('a', EnrollmentTokenLimits.MAX_DEVICE_NAME_LENGTH);
        assertNull(EnrollmentTokenLimits.deviceNameProblem(longest));
        assertEquals("error.agent.token.deviceName", EnrollmentTokenLimits.deviceNameProblem(longest + "a"));
    }

    @Test
    public void aDeviceNameWithAControlCharacterOrALineBreakIsRefused() {
        for (String name : new String[]{"a\nb", "a\rb", "a\tb", "a\u0000b", "a\u001bb", "a\u007fb", "a\u0085b",
                "a\u2028b", "a\u2029b"}) {
            assertEquals(name, "error.agent.token.deviceName", EnrollmentTokenLimits.deviceNameProblem(name));
        }
    }

    @Test
    public void aSingleUseTokensDeviceGetsTheNameAsItIsAndABatchsAreNumbered() {
        assertEquals("Target 3", EnrollmentTokenLimits.enrolledDeviceName("Target 3", null, 1));
        assertEquals("Target 3", EnrollmentTokenLimits.enrolledDeviceName("Target 3", 1, 1));
        assertEquals("Target 1", EnrollmentTokenLimits.enrolledDeviceName("Target", 3, 1));
        assertEquals("Target 3", EnrollmentTokenLimits.enrolledDeviceName("Target", 3, 3));
        assertNull(EnrollmentTokenLimits.enrolledDeviceName(null, 3, 2));
    }

    private static String repeat(char c, int n) {
        StringBuilder b = new StringBuilder(n);
        for (int i = 0; i < n; i++) {
            b.append(c);
        }
        return b.toString();
    }
}
