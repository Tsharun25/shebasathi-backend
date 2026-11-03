# Phone login and password recovery

The login page links to `/otp` (passwordless login) and `/forgot-password` (password reset). Both require possession of a Bangladesh mobile number. OTP login creates a regular user if the number is new; existing accounts keep their ID, bookings, and role. No admin number is hardcoded or promoted.

The recovery page offers SMS OTP and email reset links for users and admins. SMS uses the phone attached to the account; email uses the registered email, including email-only accounts. Resetting a password invalidates existing JWT sessions through `authVersion`.

## Enable email reset links

Set `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, and `SMTP_FROM` on the backend using your email provider's SMTP settings. Port 465 uses TLS immediately; other ports require STARTTLS. Set `FRONTEND_URL` to the trusted frontend origin (HTTPS in production; `http://localhost:3000` for local development). Links never use the incoming Host header. Restart/redeploy the backend and deploy the frontend.

`POST /api/forgot-password/email` accepts `{ email }`. For a registered email, it sends a `/reset-password#token=...` link. `POST /api/reset-password/email` accepts `{ token, password }`. Tokens contain 32 cryptographically random bytes, are stored only as SHA-256 hashes on the user, expire after 15 minutes, and are atomically consumed when changing the password. Only the latest link works. SMS resets also clear outstanding email reset tokens. The role stays unchanged.

Email requests are limited per source IP and hashed email address, with a one-minute resend cooldown. Unknown emails receive the same response. SMTP failures clear the failed token and log a generic delivery error without exposing account existence, tokens, or credentials. Without SMTP configuration, the endpoint returns service unavailable. Test actual delivery, expiry, replay rejection, and old-session rejection after configuring SMTP. Automated tests use a fake mailer and do not send real email.

SMTP implementation follows https://nodemailer.com/smtp . No email or SMS service is activated by merely adding these code changes.

## Enable real SMS

There is no SMS provider configured in the existing environment. The implementation includes a Twilio Verify adapter. There is no fake OTP, console OTP, or production bypass.

1. Create a Twilio account and a Verify service configured for six-digit SMS codes. Check Bangladesh delivery availability and enable the required geographic permissions in that account. Trial accounts may restrict recipient numbers.
2. Add `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, and `TWILIO_VERIFY_SERVICE_SID` from `.env.example` to the backend environment, along with the existing `MONGO_URI` and `JWT_SECRET`. Never put these in frontend `NEXT_PUBLIC_` variables or commit `.env`.
3. Deploy/restart the backend and deploy the frontend. Check `NEXT_PUBLIC_API_URL` points to that backend. If using another frontend domain, add its exact origin to the backend CORS allowlist.
4. Test delivery to a number you own, then verify login, resend, wrong code, expiry, reset, and rejection of old sessions. No production SMS or database was used in automated tests.

A local SMS gateway requires replacing the adapter with that provider's documented send/check integration; do not put its key in the browser. Until a provider is configured, SMS-dependent flows return a service-unavailable error; password login remains usable.

## API and safeguards

- `POST /api/send-otp`: `{ phone, purpose: "login" | "reset" }`; returns a random `challengeId` and resend delay.
- `POST /api/verify-otp`: `{ challengeId, otp }`; returns the normal user/token login response.
- `POST /api/reset-password`: `{ challengeId, otp, password }`; requires a reset-purpose challenge and at least eight password characters (maximum 72 UTF-8 bytes).
- Challenges expire after five minutes; at most five checks per challenge. Successful verification atomically consumes the challenge. Provider validation stays server-side.
- MongoDB-backed limits cover sending per phone/IP and verification per IP across backend instances. Sending is limited to five per phone/hour, twenty per source IP/hour, and one per phone/minute. Verification is limited to forty per source IP/hour. Fixed windows can allow bursts at boundaries.
- MongoDB TTL indexes clean up challenges and rate counters; queries enforce expiry even before TTL cleanup. Ensure the `PhoneChallenge` and `PhoneAuthLimit` TTL indexes are present if automatic index creation is disabled.
- The app uses the direct connection IP. For proxy deployments, configure Express `trust proxy` only for the actual trusted proxy topology, otherwise users may share the proxy IP limit. Do not blindly trust arbitrary forwarded IP headers.
- Unknown reset numbers receive the same success-shaped response and cannot create an account. Codes, secrets, and provider bodies are not logged or returned.

Run `npm test` in this backend directory. Tests use an in-memory persistence substitute and injected SMS provider to check route behavior; actual MongoDB indexes, network delivery, and provider credentials require the deployment smoke test above.

Provider references: https://www.twilio.com/docs/verify/api/verification and https://www.twilio.com/docs/verify/api/verification-check
