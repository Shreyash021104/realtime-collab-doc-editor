import { Router } from "express";
import bcrypt from "bcryptjs";
import { query } from "../db.js";
import { signToken } from "../auth/jwt.js";
import { randomColor } from "../auth/color.js";

export const authRouter = Router();

interface UserRow {
  id: string;
  email: string;
  name: string;
  password_hash: string;
  color: string;
}

authRouter.post("/register", async (req, res) => {
  const { email, password, name } = req.body ?? {};
  if (
    typeof email !== "string" ||
    typeof password !== "string" ||
    typeof name !== "string" ||
    password.length < 8
  ) {
    res.status(400).json({
      error: "email, name and password (min 8 chars) are required",
    });
    return;
  }

  const existing = await query<UserRow>(
    "SELECT id FROM users WHERE email = $1",
    [email.toLowerCase()]
  );
  if (existing.rowCount) {
    res.status(409).json({ error: "Email already registered" });
    return;
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const color = randomColor();
  const result = await query<UserRow>(
    `INSERT INTO users (email, name, password_hash, color)
     VALUES ($1, $2, $3, $4)
     RETURNING id, email, name, color`,
    [email.toLowerCase(), name, passwordHash, color]
  );
  const user = result.rows[0];
  const token = signToken({
    sub: user.id,
    email: user.email,
    name: user.name,
    color: user.color,
  });
  res.status(201).json({ token, user });
});

authRouter.post("/login", async (req, res) => {
  const { email, password } = req.body ?? {};
  if (typeof email !== "string" || typeof password !== "string") {
    res.status(400).json({ error: "email and password are required" });
    return;
  }

  const result = await query<UserRow>("SELECT * FROM users WHERE email = $1", [
    email.toLowerCase(),
  ]);
  const user = result.rows[0];
  if (!user || !(await bcrypt.compare(password, user.password_hash))) {
    res.status(401).json({ error: "Invalid email or password" });
    return;
  }

  const token = signToken({
    sub: user.id,
    email: user.email,
    name: user.name,
    color: user.color,
  });
  res.json({
    token,
    user: { id: user.id, email: user.email, name: user.name, color: user.color },
  });
});
