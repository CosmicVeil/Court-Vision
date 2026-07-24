const API_BASE_URL = '/api';

export const getAuthToken = () => {
  return localStorage.getItem('authToken');
};

export const getUser = () => {
  const userStr = localStorage.getItem('user');
  if (userStr) {
    try {
      return JSON.parse(userStr);
    } catch (e) {
      return null;
    }
  }
  return null;
};

export const isAuthenticated = () => {
  return !!getAuthToken();
};

export const setAuth = (token, user) => {
  localStorage.setItem('authToken', token);
  localStorage.setItem('user', JSON.stringify(user));
};

export const clearAuth = () => {
  localStorage.removeItem('authToken');
  localStorage.removeItem('user');
};

export const login = async (email, password) => {
  try {
    const response = await fetch(`${API_BASE_URL}/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email, password }),
    });

    let data;
    try {
      data = await response.json();
    } catch (jsonError) {
      console.error('JSON parse error:', jsonError);
      return { 
        success: false, 
        message: `Server error (${response.status}). Please check if the backend server is running.` 
      };
    }

    if (!response.ok) {
      return { success: false, message: data.message || `Login failed (${response.status})` };
    }

    if (data.success && data.user && data.token) {
      setAuth(data.token, data.user);
      return { success: true, user: data.user, message: data.message || 'Login successful' };
    }

    return { success: false, message: data.message || 'Login failed' };
  } catch (error) {
    console.error('Login error:', error);
    if (error.message.includes('Failed to fetch') || error.message.includes('NetworkError')) {
      const serverUrl = import.meta.env.VITE_API_URL || (import.meta.env.DEV ? 'http://localhost:5001' : 'https://court-vision-zxuj.onrender.com');
      return { 
        success: false, 
        message: `Cannot connect to server. Please make sure the backend server is running on ${serverUrl}` 
      };
    }
    return { success: false, message: `Network error: ${error.message}` };
  }
};

export const signup = async (firstName, lastName, email, password) => {
  try {
    const response = await fetch(`${API_BASE_URL}/auth/signup`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        first_name: firstName,
        last_name: lastName,
        email,
        password,
      }),
    });

    let data;
    try {
      data = await response.json();
    } catch (jsonError) {
      console.error('JSON parse error:', jsonError);
      return { 
        success: false, 
        message: `Server error (${response.status}). Please check if the backend server is running.` 
      };
    }

    if (!response.ok) {
      return { success: false, message: data.message || `Signup failed (${response.status})` };
    }

    if (data.success) {
      if (data.user && data.token) {
        setAuth(data.token, data.user);
      }
      return { success: true, message: data.message || 'Account created successfully' };
    }

    return { success: false, message: data.message || 'Signup failed' };
  } catch (error) {
    console.error('Signup error:', error);
    if (error.message.includes('Failed to fetch') || error.message.includes('NetworkError')) {
      const serverUrl = import.meta.env.VITE_API_URL || (import.meta.env.DEV ? 'http://localhost:5001' : 'https://court-vision-zxuj.onrender.com');
      return { 
        success: false, 
        message: `Cannot connect to server. Please make sure the backend server is running on ${serverUrl}` 
      };
    }
    return { success: false, message: `Network error: ${error.message}` };
  }
};

export const logout = async () => {
  try {
    const token = getAuthToken();
    if (token) {
      await fetch(`${API_BASE_URL}/auth/logout`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
      });
    }
  } catch (error) {
    console.error('Logout error:', error);
  } finally {
    clearAuth();
  }
};

export const checkAuth = async () => {
  try {
    const token = getAuthToken();
    if (!token) {
      return { authenticated: false };
    }

    const response = await fetch(`${API_BASE_URL}/auth/verify`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });

    const data = await response.json();

    if (response.ok && data.authenticated) {
      if (data.user) {
        setAuth(token, data.user);
      }
      return { authenticated: true, user: data.user || getUser() };
    }

    clearAuth();
    return { authenticated: false };
  } catch (error) {
    console.error('Auth check error:', error);
    return { authenticated: false };
  }
};
