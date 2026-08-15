import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import "./Login.css";
import { login } from "../utils/auth";

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
    <div className="login-wrapper">
      <div className="login-container">
        <div className="stats-nav-top" style={{ marginBottom: '1.5rem', justifyContent: 'center' }}>
          <Link to="/" className="back-to-home">← HOME</Link>
          <span className="cv-section-badge">ACCESS PORTAL</span>
        </div>
        <div className="login-header">
          <h1 className="login-title">AUTHENTICATE <span className="text-ember">ACCOUNT</span></h1>
        </div>
        <form className="login-form" onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="email">EMAIL</label>
            <input
              type="email"
              id="email"
              name="email"
              value={formData.email}
              onChange={handleChange}
              required
              placeholder="Enter your email"
              disabled={loading}
            />
          </div>
          <div className="form-group">
            <label htmlFor="password">PASSWORD</label>
            <input
              type="password"
              id="password"
              name="password"
              value={formData.password}
              onChange={handleChange}
              required
              placeholder="Enter your password"
              disabled={loading}
            />
          </div>
          {error && (
            <div className="login-error">
              {error}
            </div>
          )}
          <button type="submit" className="login-submit-btn" disabled={loading}>
            {loading ? "LOGGING IN..." : "LOGIN"}
          </button>
        </form>
        <div className="login-footer">
          <p>
            Don't have an account?{" "}
            <Link to="/create-account" className="login-link">
              Create Account
            </Link>
          </p>
          <Link to="/" className="login-link">
            Back to Home
          </Link>
        </div>
      </div>
    </div>
  );
};

export default Login;

