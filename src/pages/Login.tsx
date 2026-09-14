import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const { signIn } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const { error: err } = await signIn(email, password);
    if (err) {
      setError("Invalid email or password.");
      setLoading(false);
    } else {
      navigate("/lucidblocks/admin");
    }
  };

  return (
    <div className="login-page">
      <h1>Admin Sign In</h1>
      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label>Email</label>
          <input
            className="form-input"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoFocus
          />
        </div>
        <div className="form-group">
          <label>Password</label>
          <input
            type="password"
            className="form-input password-input"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>
        {error && <p className="form-error">{error}</p>}
        <div className="form-actions">
          <button className="btn btn-accent" type="submit" disabled={loading}>
            {loading ? "Signing in…" : "Sign in"}
          </button>
        </div>
      </form>
    </div>
  );
}
