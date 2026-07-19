import { useState } from "react";
import type { FormEvent } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { ApiError } from "../api/client";
import { Eye, EyeOff } from "lucide-react";

export function AuthPage() {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const { login, register } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const redirect = searchParams.get("redirect") ?? "/documents";

  const getPasswordStrength = (password: string) => {
    let score = 0;

    if (password.length >= 8) score++;
    if (/[A-Z]/.test(password)) score++;
    if (/[a-z]/.test(password)) score++;
    if (/\d/.test(password)) score++;
    if (/[^A-Za-z0-9]/.test(password)) score++;

    if (score <= 2)
      return {
        text: "Weak",
        color: "#ef4444",
      };

    if (score <= 4)
      return {
        text: "Medium",
        color: "#f59e0b",
      };

    return {
      text: "Strong",
      color: "#22c55e",
    };
  };

  const strength = getPasswordStrength(password);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (mode === "register" && password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);

    try {
      if (mode === "login") {
        await login(email, password);
      } else {
        await register(email, password, name);
      }

      navigate(redirect);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-page">
      <form className="auth-card" onSubmit={handleSubmit}>
        <h1>{mode === "login" ? "Log in" : "Create an account"}</h1>

        {mode === "register" && (
          <label>
            Name
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </label>
        )}

        <label>
          Email
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </label>

       <label>
  Password
  <div
    style={{
      position: "relative",
      display: "flex",
      alignItems: "center",
    }}
  >
    <input
      type={showPassword ? "text" : "password"}
      value={password}
      onChange={(e) => setPassword(e.target.value)}
      minLength={8}
      required
      style={{
        width: "100%",
        paddingRight: "40px",
      }}
    />

    <button
      type="button"
      onClick={() => setShowPassword(!showPassword)}
      style={{
        position: "absolute",
        right: "10px",
        border: "none",
        background: "transparent",
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        color: "#9CA3AF",
      }}
    >
      {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
    </button>
  </div>
</label>

       {mode === "register" && (
  <p
    style={{
      color: strength.color,
      fontWeight: "bold",
      marginTop: "6px",
      marginBottom: "12px",
    }}
  >
    Password Strength: {strength.text}
  </p>
)}

        {mode === "register" && (
          <>
          <label>
  Confirm Password
  <div
    style={{
      position: "relative",
      display: "flex",
      alignItems: "center",
    }}
  >
    <input
      type={showPassword ? "text" : "password"}
      value={confirmPassword}
      onChange={(e) => setConfirmPassword(e.target.value)}
      minLength={8}
      required
      style={{
        width: "100%",
        paddingRight: "40px",
      }}
    />

    <button
      type="button"
      onClick={() => setShowPassword(!showPassword)}
      style={{
        position: "absolute",
        right: "10px",
        border: "none",
        background: "transparent",
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        color: "#9CA3AF",
      }}
    >
      {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
    </button>
  </div>
</label>

            {confirmPassword.length > 0 && (
              <p
                style={{
                  color:
                    password === confirmPassword ? "#22c55e" : "#ef4444",
                  fontWeight: "bold",
                  marginTop: "6px",
                }}
              >
                {password === confirmPassword
                  ? "✅ Passwords Match"
                  : "❌ Passwords Do Not Match"}
              </p>
            )}
          </>
        )}

        {error && <p className="error">{error}</p>}

        <button type="submit" disabled={loading}>
          {loading
            ? "Please wait..."
            : mode === "login"
            ? "Log in"
            : "Sign up"}
        </button>

        <button
          type="button"
          className="link-button"
          onClick={() => {
            setMode(mode === "login" ? "register" : "login");
            setError(null);
            setConfirmPassword("");
            setPassword("");
          }}
        >
          {mode === "login"
            ? "Need an account? Sign up"
            : "Have an account? Log in"}
        </button>
      </form>
    </div>
  );
}