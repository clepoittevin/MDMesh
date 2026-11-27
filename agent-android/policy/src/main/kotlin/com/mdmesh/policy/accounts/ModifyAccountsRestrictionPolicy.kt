package com.mdmesh.policy.accounts

import com.mdmesh.policy.PolicyOutcome
import com.mdmesh.policy.UserRestrictions
import com.mdmesh.policy.wifi.DpmHandle

/**
 * Accounts strategy via the `DISALLOW_MODIFY_ACCOUNTS` user restriction.
 *
 * The restriction exists from API 18, below the module floor (API 24), so there is no SDK guard. A Profile Owner
 * could set it too, but MDMesh's other restrictions are Device Owner only and the console says so, so [isSupported]
 * requires Device Owner as well. The restriction key comes from the pure [UserRestrictions] helper, so this file holds
 * no policy knowledge itself.
 *
 * Known limits, by design of the platform API:
 *  - Accounts already on the device stay; the user just can't add or remove any while the block is on.
 *  - It covers the user, not the Device Owner: the agent and the platform's own provisioning are not affected.
 */
internal class ModifyAccountsRestrictionPolicy(
    private val handle: DpmHandle,
) : ModifyAccountsPolicy {

    override val capabilityKey: String = ModifyAccountsPolicy.CAPABILITY_KEY

    private val restrictions: Set<String> =
        UserRestrictions.forKey(ModifyAccountsPolicy.CAPABILITY_KEY).orEmpty()

    override fun isSupported(): Boolean = handle.dpm.isDeviceOwnerApp(handle.admin.packageName)

    override fun setEnabled(enabled: Boolean): PolicyOutcome = runCatching {
        // Feature ON (enabled=true) => accounts may change => restriction cleared; OFF => blocked => added.
        restrictions.forEach { key ->
            if (enabled) {
                handle.dpm.clearUserRestriction(handle.admin, key)
            } else {
                handle.dpm.addUserRestriction(handle.admin, key)
            }
        }
        PolicyOutcome.Applied
    }.getOrElse { PolicyOutcome.Failed(it.message ?: "modifyAccounts setEnabled failed") }
}
