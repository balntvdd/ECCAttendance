# Utility functions for cryptographic operations using ECDSA for secure QR code generation and verification.

from ecdsa import SigningKey, VerifyingKey, NIST256p
import base64
import logging

logger = logging.getLogger(__name__)


def generate_keys():
    """
    Generate a new ECDSA key pair using NIST256p curve.
    Returns the private key and public key as hex strings.
    """
    sk = SigningKey.generate(curve=NIST256p)
    vk = sk.verifying_key

    return sk.to_string().hex(), vk.to_string().hex()


def sign_message(private_key_hex, message):
    """
    Sign a message using the provided private key.
    Args:
        private_key_hex: The private key as a hex string.
        message: The message to sign as a string.
    Returns:
        The signature as a base64-encoded string.
    """
    sk = SigningKey.from_string(bytes.fromhex(private_key_hex), curve=NIST256p)
    signature = sk.sign(message.encode())

    return base64.b64encode(signature).decode()


def verify_signature(public_key_hex, message, signature):
    """
    Verify a signature against a message using the provided public key.
    Args:
        public_key_hex: The public key as a hex string.
        message: The original message as a string.
        signature: The signature as a base64-encoded string.
    Returns:
        True if the signature is valid, False otherwise.
    """
    try:
        vk = VerifyingKey.from_string(bytes.fromhex(public_key_hex), curve=NIST256p)
        return vk.verify(base64.b64decode(signature), message.encode())
    except Exception:
        return False
