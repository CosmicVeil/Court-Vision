import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import "./Auth.css";
import { enterDelay } from "../utils/scrollReveal";
import { signup } from "../utils/auth";

// One entry per input; validateForm() below holds the rules, keyed by the same names.
const FIELDS = [
  { name: "firstName", label: "FIRST NAME", type: "text", placeholder: "Enter your first name", autoComplete: "given-name" },
  { name: "lastName", label: "LAST NAME", type: "text", placeholder: "Enter your last name", autoComplete: "family-name" },
  { name: "email", label: "EMAIL", type: "email", placeholder: "Enter your email", autoComplete: "email" },
  { name: "password", label: "PASSWORD", type: "password", placeholder: "Enter your password", autoComplete: "new-password" },
  { name: "confirmPassword", label: "CONFIRM PASSWORD", type: "password", placeholder: "Confirm your password", autoComplete: "new-password" },
];

const SignUp = () => {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    firstName: "",
    lastName: "",
    email: "",
    password: "",
    confirmPassword: "",
  });

  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [submitError, setSubmitError] = useState("");

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
    // Clear error when user starts typing
    if (errors[e.target.name]) {
      setErrors({
        ...errors,
        [e.target.name]: "",
      });
    }
  };

  const validateForm = () => {
    const newErrors = {};

    if (!formData.firstName.trim()) {
      newErrors.firstName = "First name is required";
    }

    if (!formData.lastName.trim()) {
      newErrors.lastName = "Last name is required";
    }

    if (!formData.email.trim()) {
      newErrors.email = "Email is required";
    } else if (!/\S+@\S+\.\S+/.test(formData.email)) {
      newErrors.email = "Email is invalid";
    }

    if (!formData.password) {
      newErrors.password = "Password is required";
    } else if (formData.password.length < 6) {
      newErrors.password = "Password must be at least 6 characters";
    }

    if (!formData.confirmPassword) {
      newErrors.confirmPassword = "Please confirm your password";
    } else if (formData.password !== formData.confirmPassword) {
      newErrors.confirmPassword = "Passwords do not match";
    }

    setErrors(newErrors);
    setSubmitError("");
    // Send keyboard and screen-reader users to the first field that needs fixing.
    const firstInvalid = FIELDS.find(({ name }) => newErrors[name]);
    if (firstInvalid) document.getElementById(firstInvalid.name)?.focus();
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validateForm()) {
      return;
    }

    setLoading(true);
    setSubmitError("");

    const result = await signup(
      formData.firstName,
      formData.lastName,
      formData.email,
      formData.password
    );

    setLoading(false);

    if (result.success) {
      navigate("/");
      window.location.reload();
    } else {
      setSubmitError(result.message || "Failed to create account. Please try again.");
    }
  };

  return (
    <main className="auth-page">
      <div className="auth-card">
        <header className="auth-head">
          <span className="cv-section-badge" data-slot="eyebrow" data-enter>JOIN THE PLATFORM</span>
          <h1 className="auth-title" data-slot="display-heading" data-enter style={enterDelay(1)}>
            CREATE <span className="text-ember">ACCOUNT</span>
          </h1>
          <p className="auth-lead" data-slot="lead" data-enter style={enterDelay(2)}>
            Save players to your watchlist and keep them on every device.
          </p>
        </header>
        <form className="auth-form" data-enter style={enterDelay(3)} onSubmit={handleSubmit} noValidate>
          {FIELDS.map(({ name, label, type, placeholder, autoComplete }) => (
            <div className="auth-field" key={name}>
              <label htmlFor={name}>{label}</label>
              <input
                type={type}
                id={name}
                name={name}
                autoComplete={autoComplete}
                value={formData[name]}
                onChange={handleChange}
                required
                placeholder={placeholder}
                aria-invalid={Boolean(errors[name])}
                aria-describedby={errors[name] ? `${name}-error` : undefined}
                disabled={loading}
              />
              {errors[name] && <span className="auth-field-error" id={`${name}-error`}>{errors[name]}</span>}
            </div>
          ))}
          {submitError && (
            <div className="auth-error" role="alert">
              {submitError}
            </div>
          )}
          <button type="submit" className="auth-submit" disabled={loading}>
            {loading ? "CREATING ACCOUNT..." : "CREATE ACCOUNT"}
          </button>
        </form>
        <div className="auth-footer" data-enter style={enterDelay(4)}>
          <p>
            Already have an account?{" "}
            <Link to="/login" className="auth-link">
              Login
            </Link>
          </p>
          <Link to="/" className="auth-link">
            Back to Home
          </Link>
        </div>
      </div>
    </main>
  );
};

export default SignUp;


