# Check the encryption

Rapier Sync keeps a copy of your notes in a bucket you own. The editor seals each note before it leaves the page, so the bucket holds ciphertext and names that are hashes. There is no Rapier account in the middle, and no Rapier server that can read the notes. This page is the format. The script beside it opens one object from your own bucket on your own machine, so you can see that the bytes are your note and nobody else's.

The page does not ask for a recovery code. The script does not contact the bucket and does not send the code anywhere. You copy two files out of the bucket yourself, then run the script where you keep the code.

## What a sealed note is

A sealed object is a version byte (`1`), then a fresh `12`-byte nonce, then the ciphertext and its `16`-byte authentication tag. The cipher is AES-256-GCM. One changed byte, in the ciphertext or the tag, and the object does not open.

The additional data on a note or file object is the fixed string `object`, not the object's name. The name is the SHA-256 of the sealed bytes, and that hash cannot be known until the seal exists, so it cannot be mixed into the seal. Every seal draws a new nonce. The same note sealed twice is not the same bytes, and not the same name.

An object's name in the bucket is `objects/` followed by that hash, written in hex.

## The key

The vault key is `32` bytes. The recovery code is that key, written so it can be typed: Crockford's base32, `52` symbols, in groups of four. It is not stored in the bucket. Anyone who has it can open the vault, so it belongs with you, not in the bucket and not on this page.

A passphrase is not the vault key. The header records how a wrapping key is derived from the passphrase: `PBKDF2-HMAC-SHA-256`, `600000` iterations, a `16`-byte salt. That wrapping key seals the vault key with AES-256-GCM. A new passphrase wraps the same vault key again. It does not reseal the notes.

The header itself is not sealed. It is JSON: format version `1`, the derivation's name and iteration count, the salt, the wrapped vault key, and a verifier. Its name in the bucket is `keys/` followed by the SHA-256 of those header bytes. Nothing in it is a secret by itself. The salt and the iteration count are public, and the wrapped key does nothing without the passphrase or the recovery code.

The verifier is a small seal of the text `rapier-notes-vault-v1`, with additional data `vault.json`. Opening it is how a recovery code proves it belongs to this header. A code that does not open it is refused, and nothing else is decrypted.

## What the bucket holds

| Name | What it is |
| --- | --- |
| `keys/` and the header's SHA-256 | The header. Not sealed. |
| `objects/` and the sealed bytes' SHA-256 | One sealed note or file. |
| `heads/`, then a device, then a generation | A sealed list of names, parents and history. Not the text of a note. |

## What the bucket never holds

Your passphrase. The unwrapped vault key. A note's name in the clear. A note's words in the clear.

An OAuth bearer token is not a bucket credential. Rapier does not accept one as the key to R2 or S3. The editor is where the vault key is unwrapped for sync, and it stays there. This script is the other place the key is unwrapped, and only on a machine you choose, with a code you type there.

## Open one object

The script is [tools/check-vault.mjs](../src/tools/check-vault.mjs). It uses Node's own crypto and nothing else. From a copy of the Rapier source, with the header file and one object file you downloaded from your bucket:

```
node tools/check-vault.mjs <header> <object> <recovery-code>
```

It prints the note on its standard output. A recovery code that does not open the header is refused in words, and it prints nothing.

The numbers on this page are the ones `notes/vault.mjs` and `notes/sync.mjs` seal with. They are not a second copy kept beside the code.
