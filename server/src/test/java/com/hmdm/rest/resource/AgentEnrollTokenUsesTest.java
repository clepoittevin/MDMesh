/*
 * Copyright (C) 2026 the MDMesh contributors. Licensed under the Apache License, Version 2.0.
 */
package com.hmdm.rest.resource;

import com.hmdm.persistence.mapper.AgentEnrollmentTokenMapper;
import com.hmdm.rest.json.Response;
import com.hmdm.testsupport.Fakes;
import org.junit.Test;

import java.util.Arrays;
import java.util.Collections;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

/**
 * A token for several devices, through the enroll endpoint and in the SQL that counts its uses. What a refused or
 * failed enrollment keeps (nothing: its transaction rolls back) is AgentEnrollmentTransactionTest's, against PostgreSQL.
 */
public class AgentEnrollTokenUsesTest {

    @Test
    public void a_token_for_two_devices_enrolls_two_and_refuses_a_third() {
        EnrollFixture f = new EnrollFixture();
        f.token.setMaxUses(2);

        assertEquals(Response.ResponseStatus.OK, f.enroll(null).getStatus());
        assertFalse("one use left", f.token.isUsed());
        assertEquals(Response.ResponseStatus.OK, f.enroll(null).getStatus());
        assertTrue("no use left", f.token.isUsed());

        Response third = f.enroll(null);
        assertEquals(Response.ResponseStatus.ERROR, third.getStatus());
        assertEquals("error.agent.token.used", third.getMessage());
        assertEquals(2, f.token.getUseCount());
        assertEquals(2, f.created.size());
    }

    @Test
    public void an_expired_code_says_so() {
        EnrollFixture f = new EnrollFixture();
        f.token.setExpiresAt(System.currentTimeMillis() - 1);

        assertEquals("error.agent.token.expired", f.enroll(null).getMessage());
        assertTrue(f.created.isEmpty());
    }

    @Test
    public void claiming_takes_one_use_only_while_one_is_left_and_marks_the_last() {
        // The guard that keeps concurrent enrolls from creating more devices than the token allows is this one
        // statement (and the token row lock the enrollment transaction takes first); scripts/agent-v1-e2e.sh and
        // AgentEnrollmentTransactionTest run it against PostgreSQL, in parallel.
        String sql = Fakes.sqlOf(AgentEnrollmentTokenMapper.class, "claim").replaceAll("\\s+", " ").toLowerCase();
        assertTrue(sql, sql.contains("set usecount = usecount + 1, used = (usecount + 1 >= maxuses)"));
        String where = Fakes.whereOf(sql);
        assertTrue(where, where.contains("used = false"));
        assertTrue(where, where.contains("usecount < maxuses"));
        assertTrue(where, where.contains("expiresat is null or expiresat > #{now}"));
    }

    @Test
    public void the_enrollment_locks_its_token_row_with_a_bounded_wait() {
        String lock = Fakes.sqlOf(AgentEnrollmentTokenMapper.class, "lockForEnroll").replaceAll("\\s+", " ").toLowerCase();
        assertTrue(lock, lock.contains("from agentenrollmenttoken where id = #{id} for update"));
        String timeout = Fakes.sqlOf(AgentEnrollmentTokenMapper.class, "setEnrollLockTimeout").toLowerCase();
        assertTrue("transaction-local, as set local: " + timeout,
                timeout.contains("set_config('lock_timeout', #{timeout}, true)"));
    }

    @Test
    public void a_single_use_token_with_a_device_name_gives_its_device_that_name() {
        EnrollFixture f = new EnrollFixture();
        f.token.setMaxUses(1);
        f.token.setDeviceName("Target 3");

        assertEquals(Response.ResponseStatus.OK, f.enroll(null).getStatus());
        assertEquals(Collections.singletonList("Target 3"), f.descriptions);
    }

    @Test
    public void a_token_for_several_devices_numbers_them_in_enrollment_order() {
        EnrollFixture f = new EnrollFixture();
        f.token.setMaxUses(3);
        f.token.setDeviceName("Target");

        assertEquals(Response.ResponseStatus.OK, f.enroll(null).getStatus());
        assertEquals(Response.ResponseStatus.OK, f.enroll(null).getStatus());
        assertEquals(Arrays.asList("Target 1", "Target 2"), f.descriptions);
    }

    @Test
    public void a_token_without_a_device_name_leaves_the_device_unnamed() {
        EnrollFixture f = new EnrollFixture();
        f.token.setMaxUses(3);

        assertEquals(Response.ResponseStatus.OK, f.enroll(null).getStatus());
        assertEquals(1, f.descriptions.size());
        assertNull(f.descriptions.get(0));
    }

    @Test
    public void a_retried_or_recovered_enrollment_takes_no_number_and_renames_nothing() {
        EnrollFixture f = new EnrollFixture();
        f.token.setMaxUses(3);
        f.token.setDeviceName("Target");

        assertEquals(Response.ResponseStatus.OK, f.enroll("attempt-0123456789abcdef").getStatus());
        assertEquals("a retry resumes", Response.ResponseStatus.OK, f.enroll("attempt-0123456789abcdef").getStatus());
        assertEquals("a recovery resumes", Response.ResponseStatus.OK, f.resume("attempt-0123456789abcdef").getStatus());
        assertEquals("one device, one use", 1, f.token.getUseCount());

        assertEquals(Response.ResponseStatus.OK, f.enroll("attempt-fedcba9876543210").getStatus());
        assertEquals("the next device gets the next number",
                Arrays.asList("Target 1", "Target 2"), f.descriptions);
    }
}
