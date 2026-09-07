import assert from "node:assert/strict";
import test from "node:test";
import jwt, { type JwtPayload } from "jsonwebtoken";

import HttpError from "../src/errors";
import TokenService from "../src/token";

const secret = "test-only-jwt-secret-not-for-deployment";
const tokens = new TokenService(secret);

test("tokens carry the shared API claims and expire after one hour", () => {
  for (const role of ["member", "admin"] as const) {
    const token = tokens.create({ id: 42, role });
    const payload = jwt.verify(token, secret) as JwtPayload;
    assert.deepEqual(Object.keys(payload).sort(), ["aud", "exp", "iat", "iss", "role", "sub"]);
    assert.equal(payload.sub, "42");
    assert.equal(payload.role, role);
    assert.equal(payload.iss, "staj-user-service");
    assert.equal(payload.aud, "staj-apis");
    assert.equal(payload.exp! - payload.iat!, 3600);
    assert.deepEqual(tokens.verify(token), { id: 42, role });
  }
});

test("verification rejects invalid signatures, algorithms, times and claims", () => {
  const now = Math.floor(Date.now() / 1000);
  const valid = { sub: "42", role: "member", iss: "staj-user-service", aud: "staj-apis", iat: now, exp: now + 3600 };
  const sign = (payload: object) => jwt.sign(
    Object.fromEntries(Object.entries(payload).filter(([, value]) => value !== undefined)),
    secret,
    { algorithm: "HS256" }
  );
  const invalid: [string, string][] = [
    ["malformed", "not-a-token"],
    ["wrong key", jwt.sign(valid, "different-test-only-signing-secret")],
    ["wrong algorithm", jwt.sign(valid, secret, { algorithm: "HS384" })],
    ["unsigned", jwt.sign(valid, "", { algorithm: "none" })],
    ["expired", sign({ ...valid, iat: now - 3601, exp: now - 1 })],
    ["not active", sign({ ...valid, nbf: now + 60 })],
    ["future issue time", sign({ ...valid, iat: now + 60 })],
    ["fractional issue time", sign({ ...valid, iat: now - 0.5 })],
    ["fractional expiration", sign({ ...valid, exp: now + 3599.5 })],
    ["extended lifetime", sign({ ...valid, exp: now + 7200 })],
    ["missing expiration", sign({ ...valid, exp: undefined })],
    ["missing issue time", jwt.sign(valid, secret, { noTimestamp: true })],
    ["wrong issuer", sign({ ...valid, iss: "another-service" })],
    ["missing issuer", sign({ ...valid, iss: undefined })],
    ["wrong audience", sign({ ...valid, aud: "another-api" })],
    ["missing audience", sign({ ...valid, aud: undefined })],
    ["missing role", sign({ ...valid, role: undefined })],
    ["invalid role", sign({ ...valid, role: "owner" })],
    ["string payload", jwt.sign("text", secret)],
  ];

  for (const sub of [undefined, "0", "-1", "1.5", "01", "1e2", " 42", "2147483648", "9007199254740992"]) {
    invalid.push(["invalid subject " + String(sub), sign({ ...valid, sub })]);
  }

  const parts = tokens.create({ id: 42, role: "member" }).split(".");
  parts[1] = Buffer.from(JSON.stringify({ ...valid, role: "admin" })).toString("base64url");
  invalid.push(["tampered payload", parts.join(".")]);

  for (const [label, token] of invalid) {
    assert.throws(() => tokens.verify(token), (error: unknown) => {
      return error instanceof HttpError && error.statusCode === 401;
    }, label);
  }
});
