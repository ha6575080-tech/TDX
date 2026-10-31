# TDX encrypted backup and isolated restore test

The user explicitly authorized this exact payload, destination and isolated restore test on 30 October 2026 after automatic review requested specific approval. The encrypted export and restore verification are complete. All 21 tables and 111 rows matched their fingerprints; all foreign-key checks passed.

Source: TDX Supabase project jgbbifiizezrwvesdisc.

Payload: all 21 public application tables, including private profiles (names, phones, addresses and payment-account details), support messages, task/proof references, deposits, payout/withdrawal/return/upgrade records, referral/goals/package records, notifications/push subscriptions, audit/status history, and reminder records. It also includes account UUIDs and the storage-file inventory.

Excluded: authentication passwords/hashes, session or refresh tokens, provider secrets, Vault contents, and actual storage-file contents.

Destination: C:/Users/khan/Documents/ChatGPT/TDX/.audit-tools/backups/TDX-20261030.public.pgp. The folder is excluded from Git. Production performs OpenPGP AES-256 encryption before returning data. A random recovery key is protected in Supabase Vault and in a separate Windows-account-protected DPAPI file in the backup folder. A plaintext recovery key is not written to disk.

Validation: decrypt only into memory and load into an isolated local database with placeholder authentication identities. Check every table fingerprint, row count, and foreign-key integrity. Do not insert, update, delete, restore, or run financial actions in the production database. Do not send email or push messages.

Risk: this creates an additional encrypted copy of sensitive member information on this computer. Anyone with both the encrypted file and its recovery key could read it. This covers application data only; full provider-level authentication and uploaded-file recovery remain separate work.
