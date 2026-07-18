import jwt from "jsonwebtoken";
import { env } from "../env.js";

export interface TokenPayload {
  sub: string; // user id
  email: string;
  name: string;
  color: string;
}

export function signToken(payload: TokenPayload): string {
  return jwt.sign(payload, env.jwtSecret, { expiresIn: "7d" });
}

export function verifyToken(token: string): TokenPayload {
  return jwt.verify(token, env.jwtSecret) as TokenPayload;
}
