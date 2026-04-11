# Utility functions for cryptographic operations using ECDSA for secure QR code generation and verification.
# This module demonstrates Elliptic Curve Digital Signature Algorithm (ECDSA) with NIST P-256 curve,
# which is part of Elliptic Curve Cryptography (ECC). ECDSA provides digital signatures for
# authentication and integrity, ensuring QR codes cannot be forged or tampered with.

from ecdsa import SigningKey, VerifyingKey, NIST256p
import base64
import logging
import secrets

logger = logging.getLogger(__name__)


def generate_keys():
    """
    Generate a new ECDSA key pair using NIST256p curve.
    This function creates a private key for signing and a corresponding public key for verification.
    Returns the private key and public key as hex strings.
    """
    # Generate a new private key using the NIST P-256 elliptic curve.
    # The SigningKey class handles the elliptic curve mathematics for key generation.
    sk = SigningKey.generate(curve=NIST256p)

    # Derive the public key (verifying key) from the private key.
    # In ECC, the public key is a point on the curve derived from the private key.
    vk = sk.verifying_key

    # Convert keys to hex strings for storage and transmission.
    # This allows easy serialization without binary data issues.
    return sk.to_string().hex(), vk.to_string().hex()


def public_key_hex_from_private(private_key_hex):
    """Derive the P-256 verifying key hex (64-byte X||Y) from a private key hex string."""
    sk = SigningKey.from_string(bytes.fromhex(private_key_hex), curve=NIST256p)
    return sk.get_verifying_key().to_string().hex()


def private_key_matches_public_hex(private_key_hex, public_key_hex):
    """True if the private key corresponds to the stored public key (constant-time on hex)."""
    try:
        pub = public_key_hex.strip().lower()
        derived = public_key_hex_from_private(private_key_hex.strip().lower())
        return secrets.compare_digest(derived, pub)
    except Exception:
        return False


def is_valid_public_key_hex(public_key_hex):
    """Return True if provided public key hex can be parsed as a P-256 verifying key."""
    try:
        public_key_bytes = bytes.fromhex(public_key_hex.strip())
        VerifyingKey.from_string(public_key_bytes, curve=NIST256p)
        return True
    except Exception:
        return False


def sign_message(private_key_hex, message):
    """
    Sign a message using the provided private key.
    This demonstrates the signing operation in ECDSA, which creates a digital signature
    to prove authenticity and integrity of the message.
    Args:
        private_key_hex: The private key as a hex string.
        message: The message to sign as a string.
    Returns:
        The signature as a base64-encoded string.
    """
    # Reconstruct the private key from the hex string.
    # This converts the stored key back to a SigningKey object for cryptographic operations.
    sk = SigningKey.from_string(bytes.fromhex(private_key_hex), curve=NIST256p)

    # Sign the message using ECDSA.
    # The algorithm uses the private key and a hash of the message to generate a signature
    # consisting of two integers (r, s) that satisfy the elliptic curve equation.
    signature = sk.sign(message.encode())

    # Encode the binary signature in base64 for safe transmission over text-based protocols.
    # This is necessary because signatures contain binary data that could be corrupted in text.
    return base64.b64encode(signature).decode()


def verify_signature(public_key_hex, message, signature):
    """
    Verify a signature against a message using the provided public key.
    This demonstrates the verification operation in ECDSA, which checks if a signature
    was created by the corresponding private key, ensuring message integrity.
    Args:
        public_key_hex: The public key as a hex string.
        message: The original message as a string.
        signature: The signature as a base64-encoded string.
    Returns:
        True if the signature is valid, False otherwise.
    """
    try:
        # Reconstruct the public key from the hex string.
        # This converts the stored key back to a VerifyingKey object for verification.
        vk = VerifyingKey.from_string(bytes.fromhex(public_key_hex), curve=NIST256p)

        # Verify the signature using ECDSA.
        # The algorithm checks if the signature satisfies the elliptic curve verification equation
        # using the public key and the message hash. If valid, the signature was created by
        # the corresponding private key and the message hasn't been tampered with.
        return vk.verify(base64.b64decode(signature), message.encode())
    except Exception:
        # If verification fails (e.g., invalid key, signature, or message), return False.
        # This handles cases like corrupted data or mismatched key pairs.
        return False
