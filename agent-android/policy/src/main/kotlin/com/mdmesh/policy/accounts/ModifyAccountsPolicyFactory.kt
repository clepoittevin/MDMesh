package com.mdmesh.policy.accounts

import com.mdmesh.policy.wifi.DpmHandle

/**
 * Selects the [ModifyAccountsPolicy] strategy for the current device. Single candidate; factory shape kept for
 * uniformity. Returns `null` when no strategy is supported (not Device Owner), in which case `modifyAccounts` is never
 * advertised and therefore never commanded.
 */
object ModifyAccountsPolicyFactory {

    fun create(handle: DpmHandle): ModifyAccountsPolicy? =
        listOf(ModifyAccountsRestrictionPolicy(handle)).firstOrNull { it.isSupported() }
}
