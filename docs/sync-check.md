# Check the encryption

Rapier Sync keeps a copy of your notes in a bucket you own, sealed in the editor before it leaves the page. No Rapier account is involved and no Rapier server can read the notes.

A script opens one object from your bucket on your machine. It does not contact the bucket or send the code anywhere.

## What a sealed note is

A sealed object is a version byte (`1`), a `12`-byte nonce, then the ciphertext and its `16`-byte authentication tag. The cipher is AES-256-GCM. Every seal draws a new nonce. One changed byte in the ciphertext or the tag and the object does not open.

The additional data on a note or file object is the fixed string `object`, never the object's name.

## The key

The vault key is `32` bytes. The recovery code is that key in Crockford's base32: `52` symbols in groups of four. It is not in the bucket, and anyone who has it can open the vault.

The header records how a wrapping key is derived from the passphrase: `scrypt` with N=`32768`, r=`8`, p=`1` and a `16`-byte salt. That key seals the vault key with AES-256-GCM. A new passphrase wraps the same vault key again and does not reseal the notes.

The header is unsealed JSON: format version `1`, the derivation's name and iteration count, the salt, the wrapped vault key and a verifier. The salt and iteration count are public, and the wrapped key does nothing without the passphrase or the recovery code.

The verifier is a seal of the text `rapier-notes-vault-v1` with additional data `vault.json`. A recovery code that does not open it is refused and nothing else is decrypted.

## What the bucket holds

Each name is its prefix followed by the SHA-256 of the object's bytes, in hex.

| Name | What it is |
| --- | --- |
| `keys/` and the header's SHA-256 | The header. Not sealed. |
| `objects/` and the sealed bytes' SHA-256 | One sealed note or file. |
| `heads/`, then a device, then a generation | A sealed list of names, parents and history. Not the text of a note. |

## What the bucket never holds

Your passphrase. The unwrapped vault key. A note's name in the clear. A note's words in the clear.

An OAuth bearer token is not a bucket credential; Rapier does not accept one as the key to R2 or S3. The vault key is unwrapped in two places only: the editor, for sync, and this script, on a machine you choose, with a code you type there.

## Open one object

The script is [tools/check-vault.mjs](../src/tools/check-vault.mjs). It uses Node's own crypto and nothing else. Run it from a copy of the Rapier source with the header and one object copied from your bucket:

```
node tools/check-vault.mjs <header> <object> <recovery-code>
```

It prints the note to standard output. A code that does not open the header is refused with a message and prints nothing.

The numbers on this page come from `notes/vault.mjs` and `notes/sync.mjs`.
