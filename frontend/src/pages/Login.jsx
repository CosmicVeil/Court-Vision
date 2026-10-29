import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import "./Auth.css";
import { enterDelay } from "../utils/scrollReveal";
import { isAuthenticated, login } from "../utils/auth";

const Login = () => {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    email: "",
    password: "",
  });

  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
    setError("");
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    const result = await login(formData.email, formData.password);

    setLoading(false);

    if (result.success) {
      navigate("/");
      window.location.reload();
    } else {
      setError(result.message || "Login failed. Please try again.");
    }
  };

  return (
    <main className="auth-page">
      <div className="auth-card">
        <header className="auth-head">
          <span className="cv-section-badge" data-slot="eyebrow" data-enter>ACCESS PORTAL</span>
          <h1 className="auth-title" data-slot="display-heading" data-enter style={enterDelay(1)}>
            AUTHENTICATE <span className="text-ember">ACCOUNT</span>
          </h1>
          <p className="auth-lead" data-slot="lead" data-enter style={enterDelay(2)}>
            Sign in to keep your saved players in sync.
          </p>
        </header>
        <form className="auth-form" data-enter style={enterDelay(3)} onSubmit={handleSubmit}>
          <div className="auth-field">
            <label htmlFor="email">EMAIL</label>
            <input
              type="email"
              id="email"
              name="email"
              autoComplete="email"
              value={formData.email}
              onChange={handleChange}
              required
              placeholder="Enter your email"
              disabled={loading}
            />
          </div>
          <div className="auth-field">
            <label htmlFor="password">PASSWORD</label>
            <input
              type="password"
              id="password"
              name="password"
              autoComplete="current-password"
              value={formData.password}
              onChange={handleChange}
              required
              placeholder="Enter your password"
              disabled={loading}
            />
          </div>
          {error && (
            <div className="auth-error" role="alert">
              {error}
            </div>
          )}
          <button type="submit" className="auth-submit" disabled={loading}>
            {loading ? "LOGGING IN..." : "LOGIN"}
          </button>
        </form>
        <div className="auth-footer" data-enter style={enterDelay(4)}>
          {!isAuthenticated() && <p>
            Don't have an account?{" "}
            <Link to="/create-account" className="auth-link">
              Create Account
            </Link>
          </p>}
          <Link to="/" className="auth-link">
            Back to Home
          </Link>
        </div>
      </div>
    </main>
  );
};

export default Login;
