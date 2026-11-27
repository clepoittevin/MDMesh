package com.mdmesh.policy.accounts

import com.mdmesh.policy.PolicyOutcome
import com.mdmesh.policy.TogglePolicy

/**
 * Capability-abstracted control over adding and removing accounts (Settings > Accounts, and every app's own
 * "add account" flow). Without it, anyone holding the phone can add a second Google account that the Play Store
 * restrictions of the first don't cover, or remove the account a managed app depends on.
 *
 * Polarity follows [TogglePolicy] and the `config.apply` contract (`true = allowed`): `setEnabled(false)` **blocks**
 * adding and removing accounts, `setEnabled(true)` lifts the block. Accounts already on the device stay either way.
 *
 * Selected by [ModifyAccountsPolicyFactory].
 */
interface ModifyAccountsPolicy : TogglePolicy {

    override fun setEnabled(enabled: Boolean): PolicyOutcome

    companion object {
        const val CAPABILITY_KEY = "modifyAccounts"
    }
}
