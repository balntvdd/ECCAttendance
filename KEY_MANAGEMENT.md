# ECC Attendance System - Key Management Documentation

## Overview
The ECC Attendance System implements a secure key management system where private keys are stored locally on the client device rather than in the backend database.

## Key Management Changes

### Previous Implementation
- Private keys were stored in the backend database alongside student records
- Keys were generated server-side and stored for later retrieval

### Current Implementation
- Private keys are generated server-side during registration
- Both private and public keys are returned to the client
- Private keys are stored locally in browser localStorage
- Only public keys are stored in the backend database
- Private keys are sent from client to server for QR code signing operations

## Security Benefits
1. **Enhanced Security**: Private keys never persist on the server, reducing attack surface
2. **Client Control**: Users maintain control over their private keys
3. **Cross-Browser Recognition**: Students can be recognized across different browsers/devices
4. **Device Binding**: Each registration is tied to a specific device fingerprint

## API Changes

### Registration Endpoint (`/api/register/`)
- **Request**: Includes device fingerprint for binding
- **Response**: Returns both private and public keys to client
- **Storage**: Public key stored in database, private key stored in localStorage

### QR Generation Endpoint (`/api/generate-qr/`)
- **Request**: Now requires private key from client
- **Process**: Uses client-provided private key for signing
- **Security**: Validates private key before generating QR code

### Student Check Endpoint (`/api/check-student/`)
- **Purpose**: Verify if a Student ID is already registered
- **Response**: Returns existence status for cross-browser recognition

## Client-Side Storage
- **localStorage Keys**:
  - `ecc_private_key`: Private key for signing operations
  - `ecc_public_key`: Public key for verification
  - `ecc_device_fingerprint`: Device identifier
  - `ecc_registration_data`: Student registration information

## Cross-Browser Behavior
1. Student registers on one browser/device
2. Registration data and keys are stored locally
3. When accessing from another browser on the same device, entering exact same credentials triggers automatic recognition
4. System validates all credentials (Student ID, Name, Section, Email) against existing registration
5. If exact match found, automatically switches to registered UI state
6. If credentials don't match, shows appropriate error messages
7. QR generation requires the locally stored private key

### Cross-Browser Recognition Features
- **Automatic Detection**: Pre-submission validation checks for exact credential matches
- **Seamless UI Transition**: Switches from registration form to registered state without backend registration call
- **Same Device Support**: Works across different browsers on the same physical device
- **Strict Validation**: Only exact matches trigger recognition; variations are blocked

## Error Handling
- **409 Conflict**: Returned when attempting duplicate registration
- **403 Forbidden**: Returned when device fingerprint doesn't match (device binding)
- **400 Bad Request**: Returned for invalid private key or missing required data

## Migration Notes
- Existing registrations will continue to work
- Private keys from old registrations are no longer accessible
- Users with old registrations will need to re-register to get new keys
- Database migrations remove private_key field from Student model