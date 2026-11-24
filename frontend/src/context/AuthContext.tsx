import React, { createContext, useContext, useState, useEffect } from 'react';
import { User } from '../types';
import { authApi, OtpResponse, VerifyResponse } from '../services/api';

interface AuthContextType {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  requestOtp: (identifier: string) => Promise<OtpResponse>;
  verifyOtp: (identifier: string, otp: string) => Promise<VerifyResponse>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  useEffect(() => {
    // Check persisted auth
    const savedToken = localStorage.getItem('auracall_jwt');
    const savedUser = localStorage.getItem('auracall_user');

    if (savedToken && savedUser) {
      try {
        setToken(savedToken);
        setUser(JSON.parse(savedUser));
      } catch (err) {
        console.error('Failed to parse cached user data', err);
        localStorage.removeItem('auracall_jwt');
        localStorage.removeItem('auracall_user');
      }
    }
    setIsLoading(false);
  }, []);

  const requestOtp = async (identifier: string): Promise<OtpResponse> => {
    return await authApi.requestOtp(identifier);
  };

  const verifyOtp = async (identifier: string, otp: string): Promise<VerifyResponse> => {
    const res = await authApi.verifyOtp(identifier, otp);
    if (res.success && res.token && res.user) {
      setToken(res.token);
      setUser(res.user);
      localStorage.setItem('auracall_jwt', res.token);
      localStorage.setItem('auracall_user', JSON.stringify(res.user));
    }
    return res;
  };

  const logout = () => {
    setUser(null);
    setToken(null);
    localStorage.removeItem('auracall_jwt');
    localStorage.removeItem('auracall_user');
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isAuthenticated: !!token && !!user,
        isLoading,
        requestOtp,
        verifyOtp,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
